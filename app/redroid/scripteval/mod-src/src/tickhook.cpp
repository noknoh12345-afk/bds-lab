#include "tickhook.h"

#include <sys/mman.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <map>
#include <mutex>

#include "common.h"
#include "game.h"
#include "memory.h"
#include "platform.h"

extern "C" {
extern const char se_count_stub_begin[], se_count_stub_counter[], se_count_stub_thread[], se_count_stub_orig[],
    se_count_stub_target[], se_count_stub_end[];
extern const char se_pre_stub_begin[], se_pre_stub_fn[], se_pre_stub_cookie[], se_pre_stub_orig[],
    se_pre_stub_end[];
void se_tick_entry(void* self, void* cookie);
#if defined(__aarch64__)
extern char se_static_count_data[], se_static_pre_data[];
extern const char se_static_count_stubs[], se_static_count_stubs_end[], se_static_pre_stub[];
#endif
}

namespace se::tick {

namespace {
std::mutex g_mu;
uint8_t* g_exec = nullptr;
size_t g_execUsed = 0, g_execSize = 0;

std::atomic<int> g_slot{-1};
std::atomic<uintptr_t> g_vtable{0};
std::atomic<uint64_t> g_ticks{0};
std::atomic<uint64_t> g_lastTickMs{0};
std::atomic<uintptr_t> g_mainThread{0};
std::atomic<uintptr_t> g_renderThread{0};
std::atomic<uintptr_t> g_inTick{0};
std::atomic<uintptr_t> g_owner{0};
std::atomic<TickFn> g_cb{nullptr};

uint8_t* allocExec(size_t n) {
    n = (n + 15) & ~(size_t)15;
    if (!g_exec || g_execUsed + n > g_execSize) {
        size_t sz = std::max<size_t>(65536, (n + 4095) & ~(size_t)4095);
        void* p = mmap(nullptr, sz, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (p == MAP_FAILED) return nullptr;
        g_exec = (uint8_t*)p;
        g_execSize = sz;
        g_execUsed = 0;
    }
    uint8_t* r = g_exec + g_execUsed;
    g_execUsed += n;
    return r;
}

bool makeWritable(uintptr_t addr, size_t len) {
    // macOS on Apple Silicon uses 16 KiB pages even if sysconf reports 4 KiB through the shim
    size_t sizes[2] = {(size_t)sysconf(_SC_PAGESIZE), 16384};
    for (size_t ps : sizes) {
        if (ps < 4096 || (ps & (ps - 1))) continue;
        uintptr_t s = addr & ~(uintptr_t)(ps - 1);
        uintptr_t e = (addr + len + ps - 1) & ~(uintptr_t)(ps - 1);
        if (mprotect((void*)s, e - s, PROT_READ | PROT_WRITE) == 0) return true;
    }
    return false;
}

#if defined(__aarch64__)
constexpr uint32_t kStaticStubs = 1024;
size_t staticStride() { return (size_t)(se_static_count_stubs_end - se_static_count_stubs) / kStaticStubs; }
bool g_usedStaticPre = false;
#endif

void storeSlot(uintptr_t vptr, int slot, uintptr_t value) {
    __atomic_store_n(reinterpret_cast<uintptr_t*>(vptr + (uintptr_t)slot * 8), value, __ATOMIC_SEQ_CST);
}

uintptr_t loadSlot(uintptr_t vptr, int slot) {
    return __atomic_load_n(reinterpret_cast<uintptr_t*>(vptr + (uintptr_t)slot * 8), __ATOMIC_SEQ_CST);
}

bool installPre(uintptr_t vptr, int slot, uintptr_t orig) {
    const size_t len = (size_t)(se_pre_stub_end - se_pre_stub_begin);
    uintptr_t fn = (uintptr_t)&se_tick_entry;
    uintptr_t cookie = (uintptr_t)slot;
    uintptr_t target = 0;
    if (uint8_t* stub = allocExec(len)) {
        memcpy(stub, se_pre_stub_begin, len);
        memcpy(stub + (se_pre_stub_fn - se_pre_stub_begin), &fn, 8);
        memcpy(stub + (se_pre_stub_cookie - se_pre_stub_begin), &cookie, 8);
        memcpy(stub + (se_pre_stub_orig - se_pre_stub_begin), &orig, 8);
        __builtin___clear_cache((char*)stub, (char*)stub + len);
        target = (uintptr_t)stub;
    }
#if defined(__aarch64__)
    else if (!g_usedStaticPre) {
        memcpy(se_static_pre_data + 0, &fn, 8);
        memcpy(se_static_pre_data + 8, &cookie, 8);
        memcpy(se_static_pre_data + 16, &orig, 8);
        __atomic_thread_fence(__ATOMIC_SEQ_CST);
        g_usedStaticPre = true;
        target = (uintptr_t)se_static_pre_stub;
        SE_LOGI("tick hook: using the static pre stub (no executable memory available)");
    }
#endif
    if (!target) return false;
    if (!makeWritable(vptr + (uintptr_t)slot * 8, 8)) return false;
    storeSlot(vptr, slot, target);
    g_slot = slot;
    g_vtable = vptr;
    return true;
}
}  // namespace

ProfileResult installOnVtable(uintptr_t vptr, uint32_t slots, unsigned sampleMs, uintptr_t excludeThread,
                              uintptr_t target) {
    std::lock_guard<std::mutex> lk(g_mu);
    ProfileResult res;
    if (g_slot >= 0) {
        res.ok = true;
        res.chosen = g_slot;
        res.report = "tick hook already installed";
        return res;
    }
    slots = std::min<uint32_t>(slots, 1024);
    if (slots == 0) {
        res.report = "empty vtable";
        return res;
    }
    std::vector<uintptr_t> orig(slots);
    if (!mem::read(vptr, orig.data(), slots * 8)) {
        res.report = "vtable not readable";
        return res;
    }
    for (auto f : orig)
        if (!mem::isExecutable(f)) {
            res.report = "vtable contains non-code entries";
            return res;
        }
    const size_t len = (size_t)(se_count_stub_end - se_count_stub_begin);
    const size_t cntOff = (size_t)(se_count_stub_counter - se_count_stub_begin);
    const size_t thrOff = (size_t)(se_count_stub_thread - se_count_stub_begin);
    const size_t origOff = (size_t)(se_count_stub_orig - se_count_stub_begin);
    const size_t targetOff = (size_t)(se_count_stub_target - se_count_stub_begin);
    const size_t stride = (len + 15) & ~(size_t)15;
    // code address of stub i, and where its counter block lives
    std::vector<uintptr_t> code(slots);
    std::vector<uint8_t*> data(slots);
    if (uint8_t* stubs = allocExec(stride * slots)) {
        for (uint32_t i = 0; i < slots; i++) {
            uint8_t* s = stubs + i * stride;
            memcpy(s, se_count_stub_begin, len);
            code[i] = (uintptr_t)s;
            data[i] = s + cntOff;  // counter, thread, orig, target are consecutive
        }
        __builtin___clear_cache((char*)stubs, (char*)stubs + stride * slots);
    } else {
#if defined(__aarch64__)
        if (staticStride() != 64) {
            res.report = "mmap(PROT_EXEC) failed and the static stubs are malformed";
            return res;
        }
        slots = std::min<uint32_t>(slots, kStaticStubs);
        for (uint32_t i = 0; i < slots; i++) {
            code[i] = (uintptr_t)se_static_count_stubs + i * 64;
            data[i] = (uint8_t*)se_static_count_data + i * 32;
        }
        SE_LOGI("tick hook: using static counting stubs (no executable memory available)");
#else
        res.report = "mmap(PROT_EXEC) failed";
        return res;
#endif
    }
    static_assert(true, "");
    (void)thrOff;
    (void)origOff;
    (void)targetOff;
    for (uint32_t i = 0; i < slots; i++) {
        uint64_t zero = 0;
        memcpy(data[i] + 0, &zero, 8);
        memcpy(data[i] + 8, &zero, 8);
        memcpy(data[i] + 16, &orig[i], 8);
        memcpy(data[i] + 24, &target, 8);
    }
    __atomic_thread_fence(__ATOMIC_SEQ_CST);
    if (!makeWritable(vptr, slots * 8)) {
        res.report = "mprotect on the vtable failed";
        return res;
    }
    uint64_t t0 = nowUs();
    for (uint32_t i = 0; i < slots; i++) storeSlot(vptr, (int)i, code[i]);
    sleepMs(sampleMs);
    for (uint32_t i = 0; i < slots; i++) storeSlot(vptr, (int)i, orig[i]);
    res.seconds = (double)(nowUs() - t0) / 1e6;

    std::map<uintptr_t, int> threadVotes;
    for (uint32_t i = 0; i < slots; i++) {
        uint64_t calls, thr;
        memcpy(&calls, data[i] + 0, 8);
        memcpy(&thr, data[i] + 8, 8);
        if (!calls) continue;
        SlotStat st{(int)i, calls, (uintptr_t)thr, calls / res.seconds};
        res.busy.push_back(st);
        if (st.hz >= 8 && st.hz <= 30 && thr != excludeThread) threadVotes[thr]++;
    }
    uintptr_t mainThr = 0;
    int best = 0;
    for (auto& [t, v] : threadVotes)
        if (v > best) {
            best = v;
            mainThr = t;
        }
    double bestScore = 1e9;
    for (auto& st : res.busy) {
        if (st.thread != mainThr || st.thread == excludeThread) continue;
        if (st.hz < 8 || st.hz > 30) continue;
        double score = std::fabs(st.hz - 20.0) + st.slot * 0.0001;
        if (score < bestScore) {
            bestScore = score;
            res.chosen = st.slot;
        }
    }
    std::string rep = strprintf("sampled %u slots for %.2fs:", slots, res.seconds);
    std::vector<SlotStat> sorted = res.busy;
    std::sort(sorted.begin(), sorted.end(), [](auto& a, auto& b) { return std::fabs(a.hz - 20) < std::fabs(b.hz - 20); });
    for (size_t i = 0; i < sorted.size() && i < 8; i++)
        rep += strprintf(" [%d: %.1fHz%s]", sorted[i].slot, sorted[i].hz, sorted[i].thread == mainThr ? "" : " other-thread");
    if (res.chosen >= 0) {
        res.ok = installPre(vptr, res.chosen, orig[(size_t)res.chosen]);
        rep += strprintf(" -> hooked slot %d", res.chosen);
        if (!res.ok) rep += " (install failed)";
    } else {
        rep += " -> no ~20Hz slot found";
    }
    res.report = rep;
    return res;
}

bool installOnSlot(uintptr_t vptr, int slot) {
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_slot >= 0) return g_slot == slot;
    uintptr_t orig = loadSlot(vptr, slot);
    if (!mem::isExecutable(orig)) return false;
    return installPre(vptr, slot, orig);
}

bool installed() { return g_slot >= 0; }
int installedSlot() { return g_slot; }
bool tickingRecently(unsigned ms) {
    uint64_t last = g_lastTickMs;
    return last && nowMs() - last <= ms;
}
uint64_t ticks() { return g_ticks; }
uintptr_t mainThread() { return g_mainThread; }
bool onMainThread() {
    uintptr_t m = g_mainThread;
    return m && m == platform::threadTag();
}
void setTickCallback(TickFn fn) { g_cb = fn; }
void noteRenderThread(uintptr_t tag) { g_renderThread = tag; }
uintptr_t renderThread() { return g_renderThread; }

}  // namespace se::tick

extern "C" void se_tick_entry(void* self, void*) {
    using namespace se::tick;
    uintptr_t tag = se::platform::threadTag();
    uintptr_t owner = g_owner.load();
    uint64_t now = se::nowMs();
    // only tick for the in-world local player (ignore preview/split screen instances)
    uintptr_t hint = se::game::game().localPlayerHint();
    if (hint && hint != (uintptr_t)self && se::mem::readPtr(hint) == se::mem::readPtr((uintptr_t)self) &&
        now - g_lastTickMs.load() < 1000)
        return;
    if (!hint && owner && owner != (uintptr_t)self && now - g_lastTickMs.load() < 1000) return;
    uintptr_t expected = 0;
    if (!g_inTick.compare_exchange_strong(expected, tag)) return;  // re-entrant or concurrent
    g_owner = (uintptr_t)self;
    g_lastTickMs = now;
    g_ticks++;
    g_mainThread = tag;
    try {
        se::game::game().noteLocalPlayerCandidate((uintptr_t)self);
        if (auto cb = g_cb.load()) cb(self);
    } catch (...) {
        // never let an exception escape into the game's frames
    }
    g_inTick = 0;
}

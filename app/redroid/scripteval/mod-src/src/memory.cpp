#include "memory.h"

#include <fcntl.h>
#include <sys/uio.h>
#include <unistd.h>

#include <algorithm>
#include <cstring>
#include <mutex>

#include "common.h"
#include "platform.h"

namespace se::mem {

namespace {
using pvr_t = ssize_t (*)(int, const struct iovec*, unsigned long, const struct iovec*, unsigned long,
                          unsigned long);
using mincore_t = int (*)(void*, size_t, unsigned char*);

enum class Backend { None, ProcessVmReadv, Pipe };
Backend g_backend = Backend::None;
pvr_t g_pvr = nullptr;
mincore_t g_mincore = nullptr;
int g_pid = 0;
int g_pipe[2] = {-1, -1};
std::mutex g_pipeMutex;

std::mutex g_regionsMutex;
std::shared_ptr<const RegionList> g_regions;
uint64_t g_regionsTime = 0;
size_t g_pageSize = 4096;

constexpr uintptr_t kMinAddr = 0x10000;
#if defined(__aarch64__)
constexpr uintptr_t kMaxAddr = 0x1000000000000ULL;  // 48 bit
#else
constexpr uintptr_t kMaxAddr = 0x800000000000ULL;  // 47 bit
#endif

size_t pvrRead(uintptr_t addr, void* out, size_t len) {
    struct iovec local {
        out, len
    };
    struct iovec remote {
        reinterpret_cast<void*>(addr), len
    };
    ssize_t r = g_pvr(g_pid, &local, 1, &remote, 1, 0);
    return r > 0 ? (size_t)r : 0;
}

size_t pipeRead(uintptr_t addr, void* out, size_t len) {
    std::lock_guard<std::mutex> lk(g_pipeMutex);
    size_t done = 0;
    while (done < len) {
        size_t chunk = std::min<size_t>(len - done, 4096);
        ssize_t w = ::write(g_pipe[1], reinterpret_cast<const void*>(addr + done), chunk);
        if (w <= 0) break;
        ssize_t got = 0;
        while (got < w) {
            ssize_t r = ::read(g_pipe[0], (char*)out + done + got, (size_t)(w - got));
            if (r <= 0) return done + (size_t)got;
            got += r;
        }
        done += (size_t)w;
        if ((size_t)w < chunk) break;
    }
    return done;
}

// macOS host (mcpelauncher on Apple Silicon / Intel Mac): no /proc/self/maps.
// Enumerate the address space with mach_vm_region() from the host libSystem.
using mach_vm_region_t = int (*)(uint32_t task, uint64_t* addr, uint64_t* size, int flavor, int* info,
                                 uint32_t* count, uint32_t* objectName);
using proc_regionfilename_t = int (*)(int pid, uint64_t address, void* buffer, uint32_t bufferSize);
using host_getpid_t = int (*)();

std::shared_ptr<const RegionList> machRegions() {
    auto list = std::make_shared<RegionList>();
    static auto p_region = reinterpret_cast<mach_vm_region_t>(platform::hostLibcSymbol("mach_vm_region"));
    static auto p_task = reinterpret_cast<const uint32_t*>(platform::hostLibcSymbol("mach_task_self_"));
    static auto p_fname = reinterpret_cast<proc_regionfilename_t>(platform::hostLibcSymbol("proc_regionfilename"));
    static auto p_getpid = reinterpret_cast<host_getpid_t>(platform::hostLibcSymbol("getpid"));
    if (!p_region || !p_task) return list;
    const uint32_t task = *p_task;
    const int hostPid = p_getpid ? p_getpid() : 0;
    constexpr int kVmRegionBasicInfo64 = 9;  // VM_REGION_BASIC_INFO_64
    constexpr int kVmProtRead = 1, kVmProtWrite = 2, kVmProtExec = 4;
    uint64_t addr = 0;
    for (int guard = 0; guard < 200000; guard++) {
        uint64_t size = 0;
        // vm_region_basic_info_data_64_t is #pragma pack(4), 36 bytes:
        // protection@0 max_protection@4 inheritance@8 shared@12 reserved@16 offset@20(u64) behavior@28 wired@32
        alignas(8) unsigned char info[64] = {0};
        uint32_t count = 9;  // VM_REGION_BASIC_INFO_COUNT_64
        uint32_t objName = 0;
        if (p_region(task, &addr, &size, kVmRegionBasicInfo64, reinterpret_cast<int*>(info), &count, &objName) != 0)
            break;
        if (size == 0) break;
        int prot, shared;
        uint64_t off;
        memcpy(&prot, info + 0, 4);
        memcpy(&shared, info + 12, 4);
        memcpy(&off, info + 20, 8);
        Region r;
        r.start = (uintptr_t)addr;
        r.end = (uintptr_t)(addr + size);
        r.r = prot & kVmProtRead;
        r.w = prot & kVmProtWrite;
        r.x = prot & kVmProtExec;
        r.priv = !shared;
        r.offset = off;
        if (p_fname && hostPid > 0) {
            char path[1024] = {0};
            int n = p_fname(hostPid, addr, path, sizeof(path) - 1);
            if (n > 0) r.path.assign(path, (size_t)n);
        }
        if (r.end > kMinAddr) list->push_back(std::move(r));
        if (addr + size < addr) break;
        addr += size;
    }
    std::sort(list->begin(), list->end(), [](const Region& a, const Region& b) { return a.start < b.start; });
    return list;
}

std::shared_ptr<const RegionList> parseMaps() {
    auto list = std::make_shared<RegionList>();
    int fd = ::open("/proc/self/maps", O_RDONLY);
    if (fd < 0) return machRegions();
    std::string data;
    char buf[65536];
    ssize_t n;
    while ((n = ::read(fd, buf, sizeof(buf))) > 0) data.append(buf, (size_t)n);
    ::close(fd);
    size_t pos = 0;
    while (pos < data.size()) {
        size_t eol = data.find('\n', pos);
        if (eol == std::string::npos) eol = data.size();
        std::string_view line(data.data() + pos, eol - pos);
        pos = eol + 1;
        // start-end perms offset dev inode path
        Region r;
        unsigned long long s = 0, e = 0, off = 0;
        char perms[8] = {0};
        int consumed = 0;
        std::string l(line);
        if (sscanf(l.c_str(), "%llx-%llx %7s %llx %*s %*s %n", &s, &e, perms, &off, &consumed) < 4) continue;
        r.start = (uintptr_t)s;
        r.end = (uintptr_t)e;
        r.r = perms[0] == 'r';
        r.w = perms[1] == 'w';
        r.x = perms[2] == 'x';
        r.priv = perms[3] == 'p';
        r.offset = off;
        if (consumed > 0 && (size_t)consumed < l.size()) {
            r.path = l.substr((size_t)consumed);
            while (!r.path.empty() && (r.path.back() == ' ' || r.path.back() == '\n')) r.path.pop_back();
            size_t f = r.path.find_first_not_of(' ');
            r.path = f == std::string::npos ? "" : r.path.substr(f);
        }
        list->push_back(std::move(r));
    }
    std::sort(list->begin(), list->end(), [](const Region& a, const Region& b) { return a.start < b.start; });
    return list;
}
}  // namespace

void init() {
    static std::once_flag once;
    std::call_once(once, [] {
        g_pid = getpid();
        long ps = sysconf(_SC_PAGESIZE);
        if (ps > 0) g_pageSize = (size_t)ps;
        g_pvr = reinterpret_cast<pvr_t>(platform::hostLibcSymbol("process_vm_readv"));
        g_mincore = reinterpret_cast<mincore_t>(platform::hostLibcSymbol("mincore"));
        if (g_pvr) {
            uint64_t probe = 0x1122334455667788ULL, out = 0;
            bool okGood = pvrRead((uintptr_t)&probe, &out, 8) == 8 && out == probe;
            bool okBad = pvrRead(0x10, &out, 8) == 0;
            if (okGood && okBad) g_backend = Backend::ProcessVmReadv;
        }
        if (g_backend == Backend::None && ::pipe(g_pipe) == 0) {
            uint64_t probe = 0x5566778899aabbccULL, out = 0;
            if (pipeRead((uintptr_t)&probe, &out, 8) == 8 && out == probe) g_backend = Backend::Pipe;
        }
        regions(true);
        SE_LOGI("memory backend: %s, %zu regions", backendName(), regions()->size());
    });
}

const char* backendName() {
    switch (g_backend) {
        case Backend::ProcessVmReadv:
            return "process_vm_readv";
        case Backend::Pipe:
            return "pipe";
        default:
            return "unchecked";
    }
}

size_t readPartial(uintptr_t addr, void* out, size_t len) {
    if (len == 0) return 0;
    if (addr < kMinAddr || addr >= kMaxAddr) return 0;
    switch (g_backend) {
        case Backend::ProcessVmReadv: {
            size_t got = pvrRead(addr, out, len);
            if (got < len && got > 0) {
                // process_vm_readv may stop at a page boundary; retry the rest once.
                got += pvrRead(addr + got, (char*)out + got, len - got);
            }
            return got;
        }
        case Backend::Pipe:
            return pipeRead(addr, out, len);
        default: {
            // last resort: check the maps snapshot, then copy directly
            auto list = regions();
            const Region* r = findRegion(*list, addr);
            if (!r || !r->r) return 0;
            size_t avail = std::min<size_t>(len, r->end - addr);
            memcpy(out, reinterpret_cast<const void*>(addr), avail);
            return avail;
        }
    }
}

bool read(uintptr_t addr, void* out, size_t len) { return readPartial(addr, out, len) == len; }

std::shared_ptr<const RegionList> regions(bool refresh) {
    std::lock_guard<std::mutex> lk(g_regionsMutex);
    if (refresh || !g_regions) {
        g_regions = parseMaps();
        g_regionsTime = nowMs();
    }
    return g_regions;
}

void refreshRegionsIfOlder(unsigned maxAgeMs) {
    bool need;
    {
        std::lock_guard<std::mutex> lk(g_regionsMutex);
        need = !g_regions || nowMs() - g_regionsTime > maxAgeMs;
    }
    if (need) regions(true);
}

const Region* findRegion(const RegionList& list, uintptr_t addr) {
    auto it = std::upper_bound(list.begin(), list.end(), addr,
                               [](uintptr_t a, const Region& r) { return a < r.start; });
    if (it == list.begin()) return nullptr;
    --it;
    if (addr >= it->start && addr < it->end) return &*it;
    return nullptr;
}

bool isReadable(uintptr_t addr, size_t len) {
    auto list = regions();
    const Region* r = findRegion(*list, addr);
    return r && r->r && addr + len <= r->end;
}

bool isWritableData(uintptr_t addr) {
    auto list = regions();
    const Region* r = findRegion(*list, addr);
    return r && r->r && r->w;
}

bool isExecutable(uintptr_t addr) {
    auto list = regions();
    const Region* r = findRegion(*list, addr);
    return r && r->x;
}

bool isPlausiblePtr(uintptr_t p) {
    if (p < kMinAddr || p >= kMaxAddr || (p & 7)) return false;
    return isReadable(p, 8);
}

bool isPlausibleHeapPtr(uintptr_t p) {
    if (p < kMinAddr || p >= kMaxAddr || (p & 7)) return false;
    auto list = regions();
    const Region* r = findRegion(*list, p);
    return r && r->r && r->w;
}

bool residency(uintptr_t start, size_t len, std::vector<unsigned char>& vec) {
    if (!g_mincore) return false;
    size_t pages = (len + g_pageSize - 1) / g_pageSize;
    vec.assign(pages, 0);
    return g_mincore(reinterpret_cast<void*>(start), len, vec.data()) == 0;
}

size_t pageSize() { return g_pageSize; }

std::string hexdump(uintptr_t addr, size_t len) {
    std::string out;
    std::vector<unsigned char> buf(len);
    size_t got = readPartial(addr, buf.data(), len);
    for (size_t off = 0; off < len; off += 16) {
        out += strprintf("%012llx  ", (unsigned long long)(addr + off));
        for (size_t i = 0; i < 16; i++) {
            if (off + i < got)
                out += strprintf("%02x ", buf[off + i]);
            else if (off + i < len)
                out += "?? ";
            else
                out += "   ";
            if (i == 7) out += ' ';
        }
        out += " |";
        for (size_t i = 0; i < 16 && off + i < len; i++) {
            unsigned char c = off + i < got ? buf[off + i] : '?';
            out += (c >= 0x20 && c < 0x7f) ? (char)c : '.';
        }
        out += "|\n";
    }
    return out;
}

}  // namespace se::mem

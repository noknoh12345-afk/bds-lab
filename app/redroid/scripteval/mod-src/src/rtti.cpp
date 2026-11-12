#include "rtti.h"

#include <cxxabi.h>
#include <dlfcn.h>

#include <algorithm>
#include <cstdlib>
#include <deque>
#include <unordered_set>

#include "common.h"
#include "memory.h"

namespace se {

namespace {
Rtti g_rtti;
std::mutex g_buildMutex;
bool g_buildAttempted = false;
bool g_buildOk = false;
std::string g_buildError;

bool plausibleMangled(const char* s, size_t maxLen) {
    if (maxLen < 2) return false;
    char c = s[0];
    if (!((c >= '1' && c <= '9') || c == 'N' || c == 'S' || c == 'Z')) return false;
    size_t i = 0;
    size_t lim = std::min<size_t>(maxLen, 4096);
    for (; i < lim; i++) {
        unsigned char ch = (unsigned char)s[i];
        if (ch == 0) break;
        if (ch < 0x21 || ch > 0x7e) return false;
    }
    if (i >= lim || i < 2) return false;
    if (c >= '1' && c <= '9') {
        size_t n = 0, k = 0;
        while (k < i && s[k] >= '0' && s[k] <= '9') {
            n = n * 10 + (size_t)(s[k] - '0');
            k++;
            if (n > 4096) return false;
        }
        if (n == 0 || k + n > i) return false;
    }
    return true;
}

// type_info object possibly living in another library (e.g. libc++_shared.so)
bool looksLikeTypeInfo(uintptr_t a) {
    uintptr_t w[2];
    if (!mem::read(a, w, sizeof(w)) || !w[0]) return false;
    char name[64];
    size_t got = mem::readPartial(w[1], name, sizeof(name));
    return got >= 2 && plausibleMangled(name, got);
}

template <class T>
inline T rd(uintptr_t a) {
    T v;
    memcpy(&v, reinterpret_cast<const void*>(a), sizeof(T));
    return v;
}
}  // namespace

std::string demangle(const std::string& mangled) {
    int status = 0;
    char* out = abi::__cxa_demangle(mangled.c_str(), nullptr, nullptr, &status);
    if (status == 0 && out) {
        std::string s(out);
        free(out);
        return s;
    }
    if (out) free(out);
    return mangled;
}

Rtti& rtti() { return g_rtti; }

bool ensureRtti(std::string* error) {
    std::lock_guard<std::mutex> lk(g_buildMutex);
    if (!g_buildAttempted) {
        g_buildAttempted = true;
        Module m;
        if (!findModule("libminecraftpe.so", m)) {
            g_buildError = "libminecraftpe.so not found";
        } else {
            uint64_t t0 = nowMs();
            g_buildOk = g_rtti.build(m);
            if (!g_buildOk) g_buildError = "RTTI index could not be built (no type_info records found)";
            SE_LOGI("RTTI index: %s (%llu ms)", g_rtti.summary().c_str(), (unsigned long long)(nowMs() - t0));
        }
    }
    if (!g_buildOk && error) *error = g_buildError;
    return g_buildOk;
}

bool Rtti::build(const Module& m) {
    mod_ = m;
    SE_LOGI("module: %s", m.describe().c_str());
    if (!scanTypeInfos()) return false;
    scanVtables();
    linkHierarchy();
    ready_ = true;
    return true;
}

bool Rtti::scanTypeInfos() {
    struct Cand {
        uintptr_t ti, name;
    };
    std::vector<Cand> cands;
    std::unordered_map<uintptr_t, uint32_t> vcount;
    for (auto& r : mod_.relro) {
        uintptr_t start = (r.start + 7) & ~(uintptr_t)7;
        for (uintptr_t p = start + 8; p + 8 <= r.end; p += 8) {
            uintptr_t w = rd<uintptr_t>(p);
            if (!mod_.inRodata(w)) continue;
            // find the rodata range for the bound
            size_t maxLen = 0;
            for (auto& ro : mod_.rodata)
                if (ro.contains(w)) maxLen = ro.end - w;
            if (!plausibleMangled(reinterpret_cast<const char*>(w), maxLen)) continue;
            uintptr_t v = rd<uintptr_t>(p - 8);
            if (v == 0) continue;
            cands.push_back({p - 8, w});
            vcount[v]++;
        }
    }
    if (cands.empty()) return false;

    // 1) exact addresses from the C++ runtime, when they match
    const char* syms[3] = {"_ZTVN10__cxxabiv117__class_type_infoE", "_ZTVN10__cxxabiv120__si_class_type_infoE",
                           "_ZTVN10__cxxabiv121__vmi_class_type_infoE"};
    void* libs[3] = {nullptr, nullptr, nullptr};
#if defined(__ANDROID__)
    libs[0] = dlopen("libc++_shared.so", RTLD_NOW | RTLD_NOLOAD);
    libs[1] = dlopen("libminecraftpe.so", RTLD_NOW | RTLD_NOLOAD);
#else
    libs[0] = RTLD_DEFAULT;
#endif
    for (int k = 0; k < 3; k++) {
        for (void* lib : libs) {
            if (!lib) continue;
            void* s = dlsym(lib, syms[k]);
            if (s) {
                uintptr_t ap = (uintptr_t)s + 16;
                if (vcount.count(ap) && vcount[ap] >= 2) {
                    tiVptr_[k] = ap;
                    break;
                }
            }
        }
    }

    // 2) voting for whatever is still unknown
    std::unordered_set<uintptr_t> candTi;
    candTi.reserve(cands.size() * 2);
    for (auto& c : cands) candTi.insert(c.ti);
    std::vector<std::pair<uintptr_t, uint32_t>> ranked(vcount.begin(), vcount.end());
    std::sort(ranked.begin(), ranked.end(), [](auto& a, auto& b) { return a.second > b.second; });
    if (ranked.size() > 12) ranked.resize(12);
    struct Score {
        uintptr_t v;
        uint32_t count;
        double si, vmi;
    };
    std::vector<Score> scores;
    for (auto& [v, count] : ranked) {
        uint32_t n = 0, si = 0, vmi = 0;
        for (auto& c : cands) {
            if (rd<uintptr_t>(c.ti) != v) continue;
            if (++n > 64) break;
            uintptr_t after = c.ti + 16;
            if (!mod_.inRelro(after) || !mod_.inRelro(after + 15)) continue;
            uintptr_t w16 = rd<uintptr_t>(after);
            if (candTi.count(w16) || (w16 && looksLikeTypeInfo(w16))) si++;
            uint32_t flags = rd<uint32_t>(after), bc = rd<uint32_t>(after + 4);
            uintptr_t w24 = rd<uintptr_t>(after + 8);
            if (flags <= 3 && bc >= 1 && bc <= 64 && (candTi.count(w24) || (w24 && looksLikeTypeInfo(w24)))) vmi++;
        }
        if (n == 0) continue;
        SE_LOGD("type_info vptr candidate %s: count=%u sampled=%u si=%u vmi=%u", hex(v).c_str(), count, n, si, vmi);
        scores.push_back({v, count, (double)si / n, (double)vmi / n});
    }
    auto taken = [&](uintptr_t v) { return v == tiVptr_[0] || v == tiVptr_[1] || v == tiVptr_[2]; };
    if (!tiVptr_[1]) {
        double best = 0.5;
        for (auto& s : scores)
            if (!taken(s.v) && s.si > best) {
                best = s.si;
                tiVptr_[1] = s.v;
            }
    }
    if (!tiVptr_[2]) {
        double best = 0.5;
        for (auto& s : scores)
            if (!taken(s.v) && s.vmi > best) {
                best = s.vmi;
                tiVptr_[2] = s.v;
            }
    }
    if (!tiVptr_[0]) {
        for (auto& s : scores)
            if (!taken(s.v) && s.count >= 3 && s.si < 0.2 && s.vmi < 0.2) {
                tiVptr_[0] = s.v;  // most frequent remaining one
                break;
            }
    }
    SE_LOGI("type_info vptrs: class=%s si=%s vmi=%s (%zu candidates)", hex(tiVptr_[0]).c_str(),
            hex(tiVptr_[1]).c_str(), hex(tiVptr_[2]).c_str(), cands.size());
    if (!tiVptr_[0] && !tiVptr_[1]) return false;

    // 3) materialize records
    for (auto& c : cands) {
        uintptr_t v = rd<uintptr_t>(c.ti);
        int kind = -1;
        for (int k = 0; k < 3; k++)
            if (tiVptr_[k] && v == tiVptr_[k]) kind = k;
        if (kind < 0) continue;
        if (tiIndex_.count(c.ti)) continue;
        TypeInfoRec rec;
        rec.addr = c.ti;
        rec.nameAddr = c.name;
        rec.mangled = reinterpret_cast<const char*>(c.name);
        rec.kind = (TiKind)kind;
        if (rec.kind == TiKind::Si && mod_.inRelro(c.ti + 16)) {
            rec.bases.push_back(rd<uintptr_t>(c.ti + 16));
            rec.baseFlags.push_back(0);
        } else if (rec.kind == TiKind::Vmi && mod_.inRelro(c.ti + 23)) {
            uint32_t bc = rd<uint32_t>(c.ti + 20);
            if (bc <= 256) {
                for (uint32_t i = 0; i < bc; i++) {
                    uintptr_t e = c.ti + 24 + i * 16;
                    if (!mod_.inRelro(e + 15)) break;
                    rec.bases.push_back(rd<uintptr_t>(e));
                    rec.baseFlags.push_back(rd<long>(e + 8));
                }
            }
        }
        tiIndex_[c.ti] = (uint32_t)types_.size();
        types_.push_back(std::move(rec));
    }
    for (uint32_t i = 0; i < types_.size(); i++) {
        auto& t = types_[i];
        t.name = demangle(t.mangled);
        mangledIndex_.emplace(t.mangled, i);
        nameIndex_.emplace(t.name, i);
    }
    return !types_.empty();
}

void Rtti::scanVtables() {
    for (auto& r : mod_.relro) {
        uintptr_t start = (r.start + 7) & ~(uintptr_t)7;
        for (uintptr_t p = start + 8; p + 16 <= r.end; p += 8) {
            uintptr_t w = rd<uintptr_t>(p);
            auto it = tiIndex_.find(w);
            if (it == tiIndex_.end()) continue;
            int64_t ott = rd<int64_t>(p - 8);
            if (ott > 0 || ott < -0x100000 || (ott & 7)) continue;
            uintptr_t first = rd<uintptr_t>(p + 8);
            if (!(mod_.inExec(first) || mem::isExecutable(first))) continue;
            VTableRec vt;
            vt.apEnc = (p + 8) ^ kPtrKey;
            vt.typeInfo = w;
            vt.offsetToTop = ott;
            uint32_t slots = 0;
            for (uintptr_t q = p + 8; q + 8 <= r.end && slots < 8192; q += 8) {
                uintptr_t f = rd<uintptr_t>(q);
                if (tiIndex_.count(rd<uintptr_t>(q)) && slots > 0) break;
                if (!(mod_.inExec(f) || (f && mem::isExecutable(f)))) break;
                slots++;
            }
            vt.slots = slots;
            uint32_t idx = (uint32_t)vtables_.size();
            vtIndex_[vt.apEnc] = idx;
            vtByType_[w].push_back(idx);
            uintptr_t mn = vtMinEnc_ ? (vtMinEnc_ ^ kPtrKey) : ~(uintptr_t)0;
            uintptr_t mx = vtMaxEnc_ ? (vtMaxEnc_ ^ kPtrKey) : 0;
            vtMinEnc_ = std::min(mn, p + 8) ^ kPtrKey;
            vtMaxEnc_ = std::max(mx, p + 8) ^ kPtrKey;
            vtables_.push_back(vt);
        }
    }
    // A slot count that runs into the next vtable's offset_to_top would be wrong;
    // trim slot counts so that consecutive vtables never overlap.
    std::vector<uint32_t> order(vtables_.size());
    for (uint32_t i = 0; i < order.size(); i++) order[i] = i;
    std::sort(order.begin(), order.end(),
              [&](uint32_t a, uint32_t b) { return vtables_[a].addressPoint() < vtables_[b].addressPoint(); });
    for (size_t i = 0; i + 1 < order.size(); i++) {
        auto& a = vtables_[order[i]];
        auto& b = vtables_[order[i + 1]];
        // b's header (offset_to_top, typeinfo) occupies the 16 bytes before b's address point
        if (b.addressPoint() - 16 > a.addressPoint()) {
            uint32_t maxSlots = (uint32_t)((b.addressPoint() - 16 - a.addressPoint()) / 8);
            if (a.slots > maxSlots) a.slots = maxSlots;
        }
    }
}

void Rtti::linkHierarchy() {
    for (uint32_t i = 0; i < types_.size(); i++) {
        for (auto b : types_[i].bases) {
            auto it = tiIndex_.find(b);
            if (it != tiIndex_.end()) types_[it->second].children.push_back(i);
        }
    }
}

const TypeInfoRec* Rtti::byAddr(uintptr_t ti) const {
    auto it = tiIndex_.find(ti);
    return it == tiIndex_.end() ? nullptr : &types_[it->second];
}

const TypeInfoRec* Rtti::byMangled(std::string_view mangled) const {
    auto it = mangledIndex_.find(std::string(mangled));
    return it == mangledIndex_.end() ? nullptr : &types_[it->second];
}

const TypeInfoRec* Rtti::byName(std::string_view name) const {
    auto it = nameIndex_.find(std::string(name));
    return it == nameIndex_.end() ? nullptr : &types_[it->second];
}

const TypeInfoRec* Rtti::find(std::string_view n) const {
    if (auto t = byName(n)) return t;
    if (auto t = byMangled(n)) return t;
    // plain identifiers can be mangled as <len><name>
    std::string m = std::to_string(n.size()) + std::string(n);
    return byMangled(m);
}

std::vector<const TypeInfoRec*> Rtti::search(std::string_view substr, size_t limit) const {
    std::vector<const TypeInfoRec*> out;
    std::string needle = toLower(substr);
    for (auto& t : types_) {
        if (toLower(t.name).find(needle) != std::string::npos) {
            out.push_back(&t);
            if (out.size() >= limit) break;
        }
    }
    std::sort(out.begin(), out.end(), [](auto* a, auto* b) { return a->name.size() < b->name.size(); });
    return out;
}

const VTableRec* Rtti::vtableAt(uintptr_t vptr) const {
    if (!vtMinEnc_ || vptr < (vtMinEnc_ ^ kPtrKey) || vptr > (vtMaxEnc_ ^ kPtrKey)) return nullptr;
    auto it = vtIndex_.find(vptr ^ kPtrKey);
    return it == vtIndex_.end() ? nullptr : &vtables_[it->second];
}

bool Rtti::isVptr(uintptr_t v) const { return vtableAt(v) != nullptr; }

std::vector<const VTableRec*> Rtti::vtablesOf(uintptr_t ti) const {
    std::vector<const VTableRec*> out;
    auto it = vtByType_.find(ti);
    if (it != vtByType_.end())
        for (auto i : it->second) out.push_back(&vtables_[i]);
    return out;
}

const VTableRec* Rtti::primaryVtable(uintptr_t ti) const {
    const VTableRec* best = nullptr;
    for (auto* v : vtablesOf(ti)) {
        if (v->offsetToTop != 0) continue;
        if (!best || v->slots > best->slots) best = v;  // construction vtables are usually shorter
    }
    return best;
}

bool Rtti::derivesFrom(uintptr_t ti, uintptr_t baseTi) const {
    if (ti == baseTi) return true;
    // iterative DFS over bases
    std::vector<uintptr_t> stack{ti};
    std::unordered_set<uintptr_t> seen;
    while (!stack.empty()) {
        uintptr_t cur = stack.back();
        stack.pop_back();
        if (cur == baseTi) return true;
        if (!seen.insert(cur).second) continue;
        auto* t = byAddr(cur);
        if (!t) continue;
        for (auto b : t->bases) stack.push_back(b);
    }
    return false;
}

bool Rtti::derivesFrom(uintptr_t ti, std::string_view baseName) const {
    auto* b = find(baseName);
    return b && derivesFrom(ti, b->addr);
}

std::vector<uintptr_t> Rtti::withDerived(uintptr_t baseTi) const {
    std::vector<uintptr_t> out;
    auto it = tiIndex_.find(baseTi);
    if (it == tiIndex_.end()) return out;
    std::deque<uint32_t> q{it->second};
    std::unordered_set<uint32_t> seen;
    while (!q.empty()) {
        uint32_t i = q.front();
        q.pop_front();
        if (!seen.insert(i).second) continue;
        out.push_back(types_[i].addr);
        for (auto c : types_[i].children) q.push_back(c);
    }
    return out;
}

std::vector<std::string> Rtti::baseChain(uintptr_t ti) const {
    std::vector<std::string> out;
    std::unordered_set<uintptr_t> seen;
    const TypeInfoRec* t = byAddr(ti);
    while (t && seen.insert(t->addr).second && out.size() < 64) {
        out.push_back(t->name);
        if (t->bases.empty()) break;
        t = byAddr(t->bases[0]);
    }
    return out;
}

bool Rtti::classify(uintptr_t addr, Classified& out) const {
    if (!ready_) return false;
    uintptr_t vptr;
    if (!mem::read(addr, vptr)) return false;
    const VTableRec* vt = vtableAt(vptr);
    if (!vt) return false;
    out.vt = vt;
    out.ti = byAddr(vt->typeInfo);
    out.object = (uintptr_t)((int64_t)addr + vt->offsetToTop);
    return out.ti != nullptr;
}

std::string Rtti::summary() const {
    return strprintf("%zu classes, %zu vtables", types_.size(), vtables_.size());
}

}  // namespace se

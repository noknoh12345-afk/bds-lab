#include "game.h"

#include <algorithm>
#include <cmath>
#include <unordered_map>
#include <unordered_set>

#include "common.h"
#include "config.h"
#include "heapscan.h"
#include "memory.h"
#include "rtti.h"

namespace se::game {

namespace {
Game g_game;

constexpr int kMaxActorScan = 0x1000;   // bytes of an Actor scanned for pointer fields
constexpr int kMaxPlayerScan = 0x4000;  // Player objects are large

bool readBlock(uintptr_t addr, std::vector<uint8_t>& buf, size_t len) {
    buf.assign(len, 0);
    size_t got = mem::readPartial(addr, buf.data(), len);
    buf.resize(got);
    return got > 0;
}

template <class T>
T at(const std::vector<uint8_t>& b, size_t off) {
    T v{};
    if (off + sizeof(T) <= b.size()) memcpy(&v, b.data() + off, sizeof(T));
    return v;
}

std::string uuidString(const uint8_t* p) {
    uint64_t a, b;
    memcpy(&a, p, 8);
    memcpy(&b, p + 8, 8);
    return strprintf("%08llx-%04llx-%04llx-%04llx-%012llx", (unsigned long long)(a >> 32),
                     (unsigned long long)((a >> 16) & 0xffff), (unsigned long long)(a & 0xffff),
                     (unsigned long long)(b >> 48), (unsigned long long)(b & 0xffffffffffffULL));
}

struct TiSets {
    std::unordered_set<uintptr_t> actor, player, level, dimension, item, container;
    bool built = false;
};
TiSets g_ti;

void buildTiSets() {
    if (g_ti.built) return;
    auto& rt = rtti();
    auto fill = [&](std::unordered_set<uintptr_t>& set, std::initializer_list<const char*> names) {
        for (auto n : names)
            if (auto* t = rt.find(n))
                for (auto d : rt.withDerived(t->addr)) set.insert(d);
    };
    fill(g_ti.actor, {"Actor"});
    fill(g_ti.player, {"Player"});
    fill(g_ti.level, {"Level", "ILevel"});
    fill(g_ti.dimension, {"Dimension"});
    fill(g_ti.item, {"Item"});
    fill(g_ti.container, {"Container"});
    g_ti.built = true;
}

bool classifyIn(uintptr_t p, const std::unordered_set<uintptr_t>& set, Rtti::Classified* out = nullptr) {
    Rtti::Classified c;
    if (!rtti().classify(p, c)) return false;
    if (!set.count(c.ti->addr)) return false;
    if (out) *out = c;
    return true;
}
}  // namespace

Game& game() { return g_game; }

const std::map<std::string, uint32_t>& knownComponentSizes() {
    static const std::map<std::string, uint32_t> m = {
        {"ActorOwnerComponent", 8},
        {"StateVectorComponent", 36},
        {"ActorRotationComponent", 16},
        {"AABBShapeComponent", 32},
        {"ActorDefinitionIdentifierComponent", 136},
        {"RuntimeIDComponent", 8},
        {"ActorUniqueIDComponent", 8},
        {"DimensionTypeComponent", 4},
        {"ActorGameTypeComponent", 4},
        {"ActorTypeComponent", 4},
        {"OffsetsComponent", 68},
        {"MobBodyRotationComponent", 8},
        {"ActorHeadRotationComponent", 8},
        {"SynchedActorDataComponent", 72},
        {"ActorDataFlagComponent", 16},
        {"AttributesComponent", 88},
        {"ActorEquipmentComponent", 16},
        {"FallDistanceComponent", 4},
        {"BlockSourceComponent", 16},
        {"ActorWalkAnimationComponent", 32},
    };
    return m;
}

std::string Offsets::toJson() const {
    return strprintf(
        "{\"entityContext\":%d,\"registryPtr\":%d,\"entityId\":%d,\"level\":%d,\"dimension\":%d,"
        "\"stateVectorPtr\":%d,\"playerName\":%d,\"pleUuidVal\":%d,\"playerListMapPath0\":%d,"
        "\"playerListMapPath1\":%d}",
        entityContext, registryPtr, entityId, level, dimension, stateVectorPtr, playerName, pleUuidVal,
        playerListMapPath0, playerListMapPath1);
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

bool Game::validateLocalPlayer(uintptr_t obj, uintptr_t& registry, uint32_t& entity, int& regOff, int& idOff) {
    Rtti::Classified c;
    if (!rtti().classify(obj, c) || c.object != obj) return false;
    constexpr int kScan = 0x100;
    uint8_t blk[kScan];
    if (mem::readPartial(obj, blk, kScan) < 64) return false;
    auto word = [&](int o) {
        uintptr_t v = 0;
        if (o >= 0 && o + 8 <= kScan) memcpy(&v, blk + o, 8);
        return v;
    };
    auto u32at = [&](int o) {
        uint32_t v = 0xffffffffu;
        if (o >= 0 && o + 4 <= kScan) memcpy(&v, blk + o, 4);
        return v;
    };
    // registry pointer candidates: the known/expected one first (EntityContext at +8 -> registry at +16)
    std::vector<int> order;
    if (off_.registryPtr > 0) order.push_back(off_.registryPtr);
    if (off_.entityContext > 0) order.push_back(off_.entityContext + 8);
    order.push_back(16);
    for (int o = 8; o + 8 <= kScan; o += 8) order.push_back(o);
    std::unordered_set<uintptr_t> tried;
    for (int o : order) {
        uintptr_t p = word(o);
        if (!mem::isPlausibleHeapPtr(p) || !tried.insert(p).second) continue;
        if (tried.size() > 24) break;
        ecs::Registry r;
        if (!r.load(p)) continue;
        if (!r.find("ActorOwnerComponent")) {
            SE_LOGD("validate %s: +%#x -> registry with %zu pools but no ActorOwnerComponent", hex(obj).c_str(), o,
                    r.storages.size());
            continue;
        }
        r.setElemSize("ActorOwnerComponent", 8);
        auto* owner = r.find("ActorOwnerComponent");
        for (int k : {o + 8, o + 12, o - 8, o + 16, o - 4, o + 24}) {
            uint32_t id = u32at(k);
            if (id == 0xffffffffu) continue;
            int64_t idx = r.indexOf(*owner, id);
            if (idx < 0 || mem::readPtr(r.componentAt(*owner, (size_t)idx)) != obj) continue;
            reg_ = std::move(r);
            registry = p;
            entity = id;
            regOff = o;
            idOff = k;
            return true;
        }
    }
    return false;
}

void Game::noteLocalPlayerCandidate(uintptr_t obj) {
    // called from the game thread; only remember it
    candidate_ = obj;
}

void Game::invalidate() {
    std::lock_guard<std::recursive_mutex> lk(mu_);
    localPlayer_ = 0;
    localPlayerAtomic_ = 0;
    scoreboard_ = 0;
    level_ = 0;
    playerListMap_ = 0;
}

bool Game::quickValid() {
    if (!localPlayer_ || off_.registryPtr < 0 || off_.entityId < 0) return false;
    uintptr_t vptr = mem::readPtr(localPlayer_);
    auto* vt = rtti().vtableAt(vptr);
    if (!vt || vt->typeInfo != localPlayerTi_) return false;
    uint32_t id = mem::readOr<uint32_t>(localPlayer_ + off_.entityId, 0xffffffffu);
    if (id != localEntity_) return false;
    return mem::readPtr(localPlayer_ + off_.registryPtr) == reg_.addr;
}

bool Game::ensure(std::string* err, bool allowScan) {
    std::lock_guard<std::recursive_mutex> lk(mu_);
    if (quickValid()) return true;
    bool ok = discover(err, allowScan);
    if (!ok && err && err->empty()) *err = lastError_;
    return ok;
}

bool Game::discover(std::string* err, bool allowScan) {
    uint64_t t0 = nowMs();
    std::string e;
    if (!ensureRtti(&e)) {
        lastError_ = e;
        if (err) *err = e;
        return false;
    }
    buildTiSets();
    auto& rt = rtti();
    localPlayer_ = 0;
    level_ = 0;
    playerListMap_ = 0;
    if (auto* a = rt.find("Actor")) actorTi_ = a->addr;
    if (auto* p = rt.find("Player")) playerTi_ = p->addr;

    // Which classes count as "the local player"?
    std::vector<uintptr_t> lpTis;
    if (auto* lp = rt.find("LocalPlayer")) lpTis = rt.withDerived(lp->addr);
    if (lpTis.empty()) {
        for (auto ti : g_ti.player) {
            auto* t = rt.byAddr(ti);
            if (t && contains(t->name, "Local")) lpTis.push_back(ti);
        }
    }
    if (lpTis.empty()) {
        lastError_ = "no LocalPlayer class in RTTI (unsupported game build?)";
        if (err) *err = lastError_;
        return false;
    }
    std::unordered_set<uintptr_t> lpSet(lpTis.begin(), lpTis.end());

    uintptr_t registry = 0;
    uint32_t entity = 0;
    int regOff = -1, idOff = -1;
    uintptr_t found = 0;
    // manual overrides from config.json ("offsets": {...})
    auto& co = config().offsets;
    auto override = [&](const char* k, int& field) {
        auto it = co.find(k);
        if (it == co.end()) return false;
        field = it->second;
        return true;
    };
    override("entityContext", off_.entityContext);
    override("registryPtr", off_.registryPtr);
    override("entityId", off_.entityId);

    // 1) candidate reported by the tick hook
    uintptr_t cand = candidate_;
    if (cand && classifyIn(cand, lpSet) && validateLocalPlayer(cand, registry, entity, regOff, idOff)) {
        // a lone player in its own registry is probably a UI preview: let the scan decide
        auto* owner = reg_.find("ActorOwnerComponent");
        if (owner && reg_.size(*owner) > 1) found = cand;
    }

    // 2) heap scan for the LocalPlayer vtable
    if (!found) {
        if (!allowScan) {
            lastError_ = "world not discovered yet";
            if (err) *err = lastError_;
            return false;
        }
        if (lastScanFail_ && nowMs() - lastScanFail_ < 2500) {
            lastError_ = "not in a world (no LocalPlayer found)";
            if (err) *err = lastError_;
            return false;
        }
        std::vector<uint64_t> vptrs;
        for (auto ti : lpTis)
            for (auto* vt : rt.vtablesOf(ti))
                if (vt->offsetToTop == 0) vptrs.push_back(vt->addressPoint());
        heap::ScanStats st;
        heap::ScanOptions opt;
        opt.maxHits = 256;
        auto hits = heap::scanValues(std::move(vptrs), opt, &st);
        scanStats_ = st.toString();
        SE_LOGI("LocalPlayer scan: %s", scanStats_.c_str());
        // Several LocalPlayer objects can exist (e.g. a UI preview player living in its own
        // registry). Validate a few and keep the one whose registry holds the most actors.
        size_t bestActors = 0;
        ecs::Registry bestReg;
        int bestRegOff = -1, bestIdOff = -1;
        uintptr_t bestRegistry = 0;
        uint32_t bestEntity = 0;
        int validated = 0;
        for (auto h : hits) {
            if (validated >= 6) break;
            if (!validateLocalPlayer(h, registry, entity, regOff, idOff)) continue;
            validated++;
            size_t n = 0;
            if (auto* owner = reg_.find("ActorOwnerComponent")) n = reg_.size(*owner);
            if (!found || n > bestActors) {
                found = h;
                bestActors = n;
                bestReg = reg_;
                bestRegOff = regOff;
                bestIdOff = idOff;
                bestRegistry = registry;
                bestEntity = entity;
            }
        }
        if (found) {
            reg_ = std::move(bestReg);
            regOff = bestRegOff;
            idOff = bestIdOff;
            registry = bestRegistry;
            entity = bestEntity;
            if (validated > 1) SE_LOGI("%d LocalPlayer objects validated; using the one with %zu actors", validated, bestActors);
        }
        if (!found) {
            lastScanFail_ = nowMs();
            lastError_ = hits.empty() ? "not in a world (no LocalPlayer object found)"
                                      : strprintf("found %zu LocalPlayer-like objects but none validated", hits.size());
            if (err) *err = lastError_;
            return false;
        }
    }
    lastScanFail_ = 0;
    localPlayer_ = found;
    localPlayerAtomic_ = found;
    Rtti::Classified c;
    rt.classify(found, c);
    localPlayerTi_ = c.ti->addr;
    localEntity_ = entity;
    off_.registryPtr = regOff;
    off_.entityId = idOff;
    off_.entityContext = regOff - 8;
    SE_LOGI("LocalPlayer %s (%s) entity=%u registry=%s (%zu pools)", hex(found).c_str(), c.ti->name.c_str(), entity,
            hex(registry).c_str(), reg_.storages.size());

    calibrateComponents();
    for (auto& [name, size] : config().componentSizes) reg_.setElemSize(name, (uint32_t)size);
    override("stateVectorPtr", off_.stateVectorPtr);
    if (!override("level", off_.level) || !level_) findLevel();
    if (override("level", off_.level)) {
        uintptr_t p = mem::readPtr(localPlayer_ + off_.level);
        Rtti::Classified lc;
        if (p && rt.classify(p, lc)) {
            level_ = lc.object;
            levelClass_ = lc.ti->name;
        }
    }
    override("pleUuidVal", off_.pleUuidVal);
    override("playerListMapPath0", off_.playerListMapPath0);
    override("playerListMapPath1", off_.playerListMapPath1);
    findPlayerList();
    if (!override("dimension", off_.dimension)) findDimensionOffset();
    if (!override("playerName", off_.playerName)) findPlayerNameOffset();
    generation_++;
    discoveryMs_ = nowMs() - t0;
    lastError_.clear();
    return true;
}

void Game::calibrateComponents() {
    auto& known = knownComponentSizes();
    for (auto& s : reg_.storages) {
        if (s.empty) continue;
        auto it = known.find(s.component);
        if (it != known.end()) {
            s.elemSize = it->second;
            s.sizeKnown = true;
        }
    }
    // Packed page size + allocator header check using the owner pool (unique_ptr<Actor>, 8 bytes)
    if (auto* owner = reg_.find("ActorOwnerComponent")) {
        size_t n = reg_.size(*owner);
        static const uint32_t pages[] = {128, 1024, 4096, 256, 512, 2048, 64};
        for (uint32_t P : pages) {
            reg_.traits.packedPage = P;
            size_t ok = 0, checked = 0;
            for (size_t i = 0; i < n && checked < 64; i += std::max<size_t>(1, n / 64)) {
                uint32_t e;
                if (!reg_.entityAt(*owner, i, e) || reg_.isTombstone(e)) continue;
                checked++;
                uintptr_t a = mem::readPtr(reg_.componentAt(*owner, i));
                if (a && classifyIn(a, g_ti.actor)) ok++;
            }
            if (checked == 0 || ok * 10 >= checked * 9) break;
        }
        cxx::Vec payload;
        if (cxx::readVector(owner->addr + owner->payloadOff, payload, 8) && payload.count(8)) {
            uintptr_t page0 = mem::readPtr(payload.begin);
            uint64_t hdr = mem::readOr<uint64_t>(page0 - 8, 0);
            uint64_t want = (8ull * reg_.traits.packedPage + 8 + 15) & ~15ull;
            reg_.allocatorHeadersUsable = (hdr & ~7ull) == want;
        }
    }
    // Calibrate the cached BuiltInActorComponents pointers (exact element sizes).
    // A field qualifies when, for every sampled actor, it points exactly at that
    // actor's component inside the pool page: page + (index % P) * size.
    struct Builtin {
        const char* name;
        int* offOut;
    };
    int dummyAabb = -1, dummyRot = -1;
    Builtin builtins[] = {{"StateVectorComponent", &off_.stateVectorPtr},
                          {"AABBShapeComponent", &dummyAabb},
                          {"ActorRotationComponent", &dummyRot}};
    std::vector<uint8_t> blk;
    readBlock(localPlayer_, blk, kMaxActorScan);
    auto actorsList = actors();
    const uint32_t P = reg_.traits.packedPage;
    for (auto& b : builtins) {
        auto* s = reg_.find(b.name);
        if (!s || s->empty) continue;
        cxx::Vec payload;
        if (!cxx::readVector(s->addr + s->payloadOff, payload, 8)) continue;
        std::vector<uintptr_t> pageList(payload.count(8));
        if (pageList.empty()) continue;
        mem::readPartial(payload.begin, pageList.data(), pageList.size() * 8);
        int64_t li = reg_.indexOf(*s, localEntity_);
        if (li < 0 || (size_t)li / P >= pageList.size()) continue;
        uintptr_t lpPage = pageList[(size_t)li / P];
        size_t lpIn = (size_t)li % P;
        for (size_t o = 8; o + 8 <= blk.size(); o += 8) {
            uintptr_t p = at<uintptr_t>(blk, o);
            if (p < lpPage || p >= lpPage + (size_t)P * 512) continue;
            if (lpIn == 0 ? p != lpPage : ((p - lpPage) % lpIn) != 0) continue;
            uint32_t size = lpIn ? (uint32_t)((p - lpPage) / lpIn) : 0;  // 0 = unknown yet
            int agree = 0, disagree = 0;
            for (auto& a : actorsList) {
                if (a.addr == localPlayer_) continue;
                int64_t idx = reg_.indexOf(*s, a.entity);
                if (idx < 0 || (size_t)idx / P >= pageList.size()) continue;
                uintptr_t page = pageList[(size_t)idx / P];
                size_t in = (size_t)idx % P;
                uintptr_t q = mem::readPtr(a.addr + o);
                if (in == 0) {
                    (q == page ? agree : disagree)++;
                    continue;
                }
                if (q < page || (q - page) % in) {
                    disagree++;
                    continue;
                }
                uint32_t sz = (uint32_t)((q - page) / in);
                if (!size) size = sz;
                (sz == size ? agree : disagree)++;
                if (agree + disagree >= 48) break;
            }
            if (agree < 2 || disagree * 10 > agree) continue;
            if (size && size < 4096) {
                if (size != s->elemSize)
                    SE_LOGI("component %s: element size %u (table said %u)", b.name, size, s->elemSize);
                reg_.setElemSize(b.name, size);
            }
            *b.offOut = (int)o;
            break;
        }
    }
    calibrateSizes();
    // Infer the remaining sizes from malloc chunk headers
    size_t inferred = 0;
    for (auto& s : reg_.storages) {
        if (s.empty || s.sizeKnown) continue;
        if (reg_.inferElemSize(s)) inferred++;
    }
    SE_LOGI("components: %zu pools, packedPage=%u, allocatorHeaders=%d, inferred sizes=%zu, stateVectorPtr=%d",
            reg_.storages.size(), reg_.traits.packedPage, reg_.allocatorHeadersUsable, inferred, off_.stateVectorPtr);
}

// Verifies (and if needed corrects) the element size of well known components
// by checking that every sampled element "looks right" at the computed address.
void Game::calibrateSizes() {
    using Pred = bool (*)(uintptr_t);
    struct Check {
        const char* name;
        Pred ok;
        bool unique = false;  // the first 8 bytes must differ between entities
    };
    static const Check checks[] = {
        {"ActorDefinitionIdentifierComponent",
         [](uintptr_t a) {
             // {namespace, identifier, initEvent, fullName, canonicalName}: anchored at the element start
             std::string ns, id, full;
             if (!cxx::readString(a, ns) || !cxx::readString(a + 24, id) || ns.empty() || id.empty()) return false;
             if (!looksLikeNamespacedId(ns + ":" + id)) return false;
             return !cxx::readString(a + 72, full) || full.empty() || full == ns + ":" + id;
         }},
        {"RuntimeIDComponent",
         [](uintptr_t a) {
             uint64_t v;
             return mem::read(a, v) && v > 0 && v < (1ull << 48);
         },
         true},
        {"ActorUniqueIDComponent",
         [](uintptr_t a) {
             int64_t v;
             return mem::read(a, v) && v != 0 && v != -1;
         },
         true},
        {"DimensionTypeComponent",
         [](uintptr_t a) {
             int v;
             return mem::read(a, v) && v >= 0 && v < 16;
         }},
        {"ActorGameTypeComponent",
         [](uintptr_t a) {
             int v;
             return mem::read(a, v) && v >= -1 && v <= 6;
         }},
        {"OffsetsComponent",
         [](uintptr_t a) {
             float h;
             return mem::read(a, h) && std::isfinite(h) && h >= -0.01f && h < 8.f;
         }},
        {"ActorRotationComponent",
         [](uintptr_t a) {
             float v[4];
             return mem::read(a, v, sizeof(v)) && std::isfinite(v[0]) && std::fabs(v[0]) <= 90.5f &&
                    std::isfinite(v[1]) && std::fabs(v[1]) < 1e6f;
         }},
        {"AABBShapeComponent",
         [](uintptr_t a) {
             float v[8];
             if (!mem::read(a, v, sizeof(v))) return false;
             for (float f : v)
                 if (!std::isfinite(f)) return false;
             return v[3] >= v[0] && v[4] >= v[1] && v[5] >= v[2] && v[6] >= 0 && v[7] >= 0 && v[6] < 64 && v[7] < 64;
         }},
        {"SynchedActorDataComponent",
         [](uintptr_t a) {
             cxx::Vec v;
             if (!cxx::readVector(a, v, 8, 1 << 16)) return false;
             for (size_t i = 0; i < v.count(8) && i < 16; i++) {
                 uintptr_t it = mem::readPtr(v.begin + i * 8);
                 if (!it) continue;
                 Rtti::Classified c;
                 return rtti().classify(it, c) && contains(c.ti->name, "DataItem");
             }
             return v.begin == 0;
         }},
        {"AttributesComponent",
         [](uintptr_t a) {
             for (int o : {24, 0, 48}) {
                 cxx::Vec v;
                 if (!cxx::readVector(a + o, v, 8, 1 << 20) || !v.begin) continue;
                 Rtti::Classified c;
                 if (rtti().classify(v.begin, c) && contains(c.ti->name, "AttributeInstance")) return true;
             }
             return false;
         }},
        {"BlockSourceComponent",
         [](uintptr_t a) {
             uintptr_t p = mem::readPtr(a);
             if (!p) return true;
             Rtti::Classified c;
             return rtti().classify(p, c) && (rtti().derivesFrom(c.ti->addr, "BlockSource") ||
                                              rtti().derivesFrom(c.ti->addr, "IConstBlockSource"));
         }},
        {"ActorEquipmentComponent",
         [](uintptr_t a) {
             uintptr_t p[2];
             if (!mem::read(a, p, sizeof(p))) return false;
             for (auto q : p) {
                 if (!q) continue;
                 Rtti::Classified c;
                 if (!rtti().classify(q, c) || !rtti().derivesFrom(c.ti->addr, "Container")) return false;
             }
             return p[0] || p[1];
         }},
    };
    const uint32_t P = reg_.traits.packedPage;
    for (auto& ck : checks) {
        auto* sc = reg_.find(ck.name);
        if (!sc || sc->empty) continue;
        ecs::Storage& s = const_cast<ecs::Storage&>(*sc);
        size_t n = reg_.size(s);
        if (n < 2) continue;
        cxx::Vec payload;
        if (!cxx::readVector(s.addr + s.payloadOff, payload, 8)) continue;
        std::vector<uintptr_t> pages(payload.count(8));
        if (pages.empty()) continue;
        mem::readPartial(payload.begin, pages.data(), pages.size() * 8);
        std::vector<size_t> sample;
        for (size_t i = 1; i < n && sample.size() < 24; i++) {
            uint32_t e;
            if (reg_.entityAt(s, i, e) && !reg_.isTombstone(e) && i % P != 0) sample.push_back(i);
        }
        if (sample.empty()) continue;
        auto score = [&](uint32_t size) {
            size_t good = 0;
            std::unordered_set<uint64_t> values;
            for (size_t i : sample) {
                size_t pg = i / P;
                if (pg >= pages.size() || !pages[pg]) continue;
                uintptr_t a = pages[pg] + (i % P) * size;
                if (!ck.ok(a)) continue;
                if (ck.unique && !values.insert(mem::readOr<uint64_t>(a, 0)).second) continue;
                good++;
            }
            return (double)good / (double)sample.size();
        };
        std::vector<uint32_t> cands;
        // the allocator's chunk size is exact when available, so it goes first
        ecs::Storage tmp = s;
        tmp.sizeKnown = false;
        if (reg_.inferElemSize(tmp) && tmp.elemSize) cands.push_back(tmp.elemSize);
        if (s.elemSize) cands.push_back(s.elemSize);
        // then sizes ordered by distance from the expected one
        std::vector<uint32_t> rest;
        for (uint32_t z = 4; z <= 512; z += 4) rest.push_back(z);
        uint32_t ref = s.elemSize ? s.elemSize : 64;
        std::stable_sort(rest.begin(), rest.end(), [ref](uint32_t x, uint32_t y) {
            return (x > ref ? x - ref : ref - x) < (y > ref ? y - ref : ref - y);
        });
        cands.insert(cands.end(), rest.begin(), rest.end());
        if (sample.size() < 3) continue;
        uint32_t best = 0;
        double bestScore = 0;
        for (uint32_t z : cands) {
            double sc2 = score(z);
            if (sc2 > bestScore + 1e-9) {
                bestScore = sc2;
                best = z;
            }
            if (sc2 >= 0.999) break;
        }
        if (best && bestScore >= 0.9) {
            if (best != s.elemSize) SE_LOGI("component %s: element size %u -> %u (validated %.0f%%)", ck.name,
                                           s.elemSize, best, bestScore * 100);
            s.elemSize = best;
            s.sizeKnown = true;
        } else {
            SE_LOGW("component %s: could not validate element size (best %u, %.0f%%)", ck.name, best, bestScore * 100);
        }
    }
}

void Game::findLevel() {
    level_ = 0;
    std::vector<uint8_t> blk;
    readBlock(localPlayer_, blk, kMaxPlayerScan);
    std::vector<int> order;
    if (off_.level > 0) order.push_back(off_.level);
    for (size_t o = 8; o + 8 <= blk.size(); o += 8) order.push_back((int)o);
    for (int o : order) {
        uintptr_t p = at<uintptr_t>(blk, (size_t)o);
        if (!mem::isPlausibleHeapPtr(p)) continue;
        Rtti::Classified c;
        if (!classifyIn(p, g_ti.level, &c)) continue;
        level_ = c.object;
        levelClass_ = c.ti->name;
        off_.level = o;
        SE_LOGI("level: %s @%s (actor+%#x)", levelClass_.c_str(), hex(level_).c_str(), o);
        return;
    }
    SE_LOGW("level object not found from the local player");
}

void Game::findPlayerList() {
    playerListMap_ = 0;
    if (!level_) return;
    auto checkMap = [&](uintptr_t mapAddr) -> int {
        cxx::UMap m;
        if (!cxx::readUnorderedMap(mapAddr, m) || m.size == 0 || m.size > 100000) return -1;
        uint8_t node[160];
        if (!mem::read(m.first, node, sizeof(node))) return -1;
        static const uint8_t zero[16] = {0};
        if (memcmp(node + 16, zero, 16) == 0) return -1;
        for (int valOff : {40, 32, 48, 56}) {
            if (memcmp(node + 16, node + valOff, 16) != 0) continue;
            std::string name;
            if (!cxx::readString(m.first + valOff + 16, name) || name.empty() || name.size() > 64) continue;
            return valOff;
        }
        return -1;
    };
    auto tryAt = [&](uintptr_t mapAddr, int p0, int p1) -> bool {
        int v = checkMap(mapAddr);
        if (v < 0) return false;
        playerListMap_ = mapAddr;
        off_.pleUuidVal = v;
        off_.playerListMapPath0 = p0;
        off_.playerListMapPath1 = p1;
        SE_LOGI("player list map @%s (level path %d/%d)", hex(mapAddr).c_str(), p0, p1);
        return true;
    };
    // cached path first
    if (off_.playerListMapPath0 == -2 && tryAt(level_ + off_.playerListMapPath1, -2, off_.playerListMapPath1)) return;
    if (off_.playerListMapPath0 >= 0) {
        uintptr_t p = mem::readPtr(level_ + off_.playerListMapPath0);
        if (p && tryAt(p + off_.playerListMapPath1, off_.playerListMapPath0, off_.playerListMapPath1)) return;
    }
    std::vector<uint8_t> blk;
    readBlock(level_, blk, 0x3000);
    auto quick = [](const std::vector<uint8_t>& b, size_t o) {
        float mlf = at<float>(b, o + 32);
        uint64_t size = at<uint64_t>(b, o + 24);
        uintptr_t first = at<uintptr_t>(b, o + 16);
        return mlf > 0.01f && mlf <= 64.f && size >= 1 && size < 100000 && first > 0x10000;
    };
    // inline maps
    for (size_t o = 0; o + 40 <= blk.size(); o += 8)
        if (quick(blk, o) && tryAt(level_ + o, -2, (int)o)) return;
    // one pointer deep
    std::vector<uint8_t> sub;
    std::vector<uintptr_t> second;
    for (size_t o = 0; o + 8 <= blk.size(); o += 8) {
        uintptr_t p = at<uintptr_t>(blk, o);
        if (!mem::isPlausibleHeapPtr(p)) continue;
        if (!readBlock(p, sub, 0x200)) continue;
        for (size_t k = 0; k + 40 <= sub.size(); k += 8)
            if (quick(sub, k) && tryAt(p + k, (int)o, (int)k)) return;
        for (size_t k = 0; k + 8 <= sub.size() && second.size() < 20000; k += 8) {
            uintptr_t q = at<uintptr_t>(sub, k);
            if (mem::isPlausibleHeapPtr(q)) second.push_back(q);
        }
    }
    // two pointers deep (no fixed path is cached for this case)
    std::unordered_set<uintptr_t> seen;
    for (uintptr_t q : second) {
        if (!seen.insert(q).second) continue;
        if (!readBlock(q, sub, 0x100)) continue;
        for (size_t k = 0; k + 40 <= sub.size(); k += 8)
            if (quick(sub, k) && tryAt(q + k, -3, (int)k)) return;
    }
    SE_LOGW("player list not found");
}

void Game::findDimensionOffset() {
    std::vector<uint8_t> blk;
    readBlock(localPlayer_, blk, kMaxActorScan);
    for (size_t o = 8; o + 8 <= blk.size(); o += 8) {
        uintptr_t p = at<uintptr_t>(blk, o);
        if (!mem::isPlausibleHeapPtr(p)) continue;
        Rtti::Classified c;
        if (classifyIn(p, g_ti.dimension, &c) && c.object == p) {
            off_.dimension = (int)o;
            SE_LOGI("dimension pointer at actor+%#zx (%s)", o, c.ti->name.c_str());
            return;
        }
    }
}

void Game::findPlayerNameOffset() {
    std::vector<PlayerListEntry> list;
    if (!playerList(list) || list.empty()) {
        // no player list: look for the local player's name tag inside the player object
        std::string tag;
        ActorRef lp{localPlayer_, localEntity_};
        if (!nameTag(lp, tag) || tag.empty() || tag.size() > 22) return;
        std::vector<uint8_t> blk;
        readBlock(localPlayer_, blk, kMaxPlayerScan);
        for (size_t o = 8; o + 24 <= blk.size(); o += 8) {
            if (blk[o] != tag.size() * 2 || memcmp(blk.data() + o + 1, tag.data(), tag.size()) != 0) continue;
            if (blk[o + 1 + tag.size()] != 0) continue;
            off_.playerName = (int)o;
            SE_LOGI("player name field at actor+%#zx (from the name tag, no player list)", o);
            return;
        }
        return;
    }
    std::unordered_map<int64_t, std::string> names;
    for (auto& e : list) names[e.uniqueId] = e.name;
    std::map<int, int> votes;
    int players = 0;
    for (auto& a : actors()) {
        if (!isPlayer(a)) continue;
        int64_t uid;
        if (!uniqueId(a, uid)) continue;
        auto it = names.find(uid);
        if (it == names.end() || it->second.empty() || it->second.size() > 22) continue;
        const std::string& nm = it->second;
        std::vector<uint8_t> blk;
        readBlock(a.addr, blk, kMaxPlayerScan);
        players++;
        for (size_t o = 8; o + 24 <= blk.size(); o += 8) {
            if (blk[o] != nm.size() * 2) continue;
            if (memcmp(blk.data() + o + 1, nm.data(), nm.size()) == 0 && blk[o + 1 + nm.size()] == 0) votes[(int)o]++;
        }
        if (players >= 8) break;
    }
    int best = -1, bestV = 0;
    for (auto& [o, v] : votes)
        if (v > bestV || (v == bestV && o > best)) {
            best = o;
            bestV = v;
        }
    if (best > 0) {
        off_.playerName = best;
        SE_LOGI("player name field at actor+%#x (%d/%d players)", best, bestV, players);
    }
}

Status Game::status() {
    std::lock_guard<std::recursive_mutex> lk(mu_);
    Status s;
    s.rttiReady = rtti().ready();
    s.inWorld = quickValid();
    s.error = lastError_;
    s.localPlayer = localPlayer_;
    s.localEntity = localEntity_;
    if (localPlayerTi_)
        if (auto* t = rtti().byAddr(localPlayerTi_)) s.localPlayerClass = t->name;
    s.registry = reg_.addr;
    s.storages = reg_.storages.size();
    if (s.inWorld)
        if (auto* owner = reg_.find("ActorOwnerComponent")) s.actors = reg_.size(*owner);
    s.level = level_;
    s.levelClass = levelClass_;
    s.playerList = playerListMap_ != 0;
    s.scanStats = scanStats_;
    s.discoveryMs = discoveryMs_;
    return s;
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

std::vector<ActorRef> Game::actors() {
    std::vector<ActorRef> out;
    auto* owner = reg_.find("ActorOwnerComponent");
    if (!owner) return out;
    cxx::Vec packed;
    if (!cxx::readVector(owner->addr + owner->packedOff, packed, 4)) return out;
    size_t n = std::min<size_t>(packed.count(4), 1u << 20);
    std::vector<uint32_t> ids(n);
    if (mem::readPartial(packed.begin, ids.data(), n * 4) != n * 4) return out;
    cxx::Vec payload;
    if (!cxx::readVector(owner->addr + owner->payloadOff, payload, 8)) return out;
    std::vector<uintptr_t> pages(payload.count(8));
    mem::readPartial(payload.begin, pages.data(), pages.size() * 8);
    const uint32_t P = reg_.traits.packedPage;
    std::vector<uintptr_t> pageData;
    size_t cachedPage = (size_t)-1;
    for (size_t i = 0; i < n; i++) {
        if (reg_.isTombstone(ids[i])) continue;
        size_t pg = i / P;
        if (pg >= pages.size() || !pages[pg]) continue;
        if (pg != cachedPage) {
            pageData.assign(P, 0);
            mem::readPartial(pages[pg], pageData.data(), P * 8);
            cachedPage = pg;
        }
        uintptr_t a = pageData[i % P];
        if (!a) continue;
        if (!classifyIn(a, g_ti.actor)) continue;
        out.push_back({a, ids[i]});
    }
    return out;
}

bool Game::refValid(const ActorRef& r) {
    if (!r.addr || off_.registryPtr < 0 || off_.entityId < 0) return false;
    if (mem::readOr<uint32_t>(r.addr + off_.entityId, ~0u) != r.entity) return false;
    if (mem::readPtr(r.addr + off_.registryPtr) != reg_.addr) return false;
    return classifyIn(r.addr, g_ti.actor);
}

bool Game::refFromAddr(uintptr_t addr, ActorRef& out) {
    if (off_.entityId < 0) return false;
    out.addr = addr;
    out.entity = mem::readOr<uint32_t>(addr + off_.entityId, ~0u);
    return refValid(out);
}

uintptr_t Game::comp(const ActorRef& r, const char* name) {
    auto* s = reg_.find(name);
    if (!s) return 0;
    return reg_.get(*s, r.entity);
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

std::string Game::className(const ActorRef& r) {
    Rtti::Classified c;
    return rtti().classify(r.addr, c) ? c.ti->name : std::string();
}

bool Game::isPlayer(const ActorRef& r) { return classifyIn(r.addr, g_ti.player); }

bool Game::position(const ActorRef& r, cxx::Vec3& raw, cxx::Vec3& prev, cxx::Vec3& delta) {
    uintptr_t c = comp(r, "StateVectorComponent");
    if (!c && off_.stateVectorPtr > 0) c = mem::readPtr(r.addr + off_.stateVectorPtr);
    if (!c) return false;
    float v[9];
    if (!mem::read(c, v, sizeof(v))) return false;
    for (float f : v)
        if (!std::isfinite(f)) return false;
    raw = {v[0], v[1], v[2]};
    prev = {v[3], v[4], v[5]};
    delta = {v[6], v[7], v[8]};
    return true;
}

bool Game::heightOffset(const ActorRef& r, float& h) {
    uintptr_t c = comp(r, "OffsetsComponent");
    if (!c || !mem::read(c, h)) return false;
    return std::isfinite(h) && h >= -8 && h <= 32;
}

bool Game::aabb(const ActorRef& r, cxx::Vec3& mn, cxx::Vec3& mx, float& w, float& h) {
    uintptr_t c = comp(r, "AABBShapeComponent");
    if (!c) return false;
    float v[8];
    if (!mem::read(c, v, sizeof(v))) return false;
    mn = {v[0], v[1], v[2]};
    mx = {v[3], v[4], v[5]};
    w = v[6];
    h = v[7];
    return std::isfinite(v[0]) && std::isfinite(v[4]) && mx.y >= mn.y;
}

bool Game::feetPosition(const ActorRef& r, cxx::Vec3& feet) {
    cxx::Vec3 raw, prev, delta;
    if (!position(r, raw, prev, delta)) return false;
    feet = raw;
    float h;
    if (heightOffset(r, h)) {
        feet.y = raw.y - h;
        return true;
    }
    cxx::Vec3 mn, mx;
    float w, ht;
    if (aabb(r, mn, mx, w, ht) && std::fabs(mn.y - raw.y) < 3.f) {
        feet.y = mn.y;
        return true;
    }
    if (isPlayer(r)) feet.y = raw.y - 1.62001f;
    return true;
}

bool Game::rotation(const ActorRef& r, float& pitch, float& yaw) {
    uintptr_t c = comp(r, "ActorRotationComponent");
    if (!c) return false;
    float v[2];
    if (!mem::read(c, v, sizeof(v)) || !std::isfinite(v[0]) || !std::isfinite(v[1])) return false;
    pitch = v[0];
    yaw = v[1];
    return true;
}

bool Game::headYaw(const ActorRef& r, float& yaw) {
    uintptr_t c = comp(r, "ActorHeadRotationComponent");
    return c && mem::read(c, yaw) && std::isfinite(yaw);
}

bool Game::bodyYaw(const ActorRef& r, float& yaw) {
    uintptr_t c = comp(r, "MobBodyRotationComponent");
    return c && mem::read(c, yaw) && std::isfinite(yaw);
}

bool Game::typeId(const ActorRef& r, std::string& out) {
    uintptr_t c = comp(r, "ActorDefinitionIdentifierComponent");
    if (c) {
        if (cxx::readString(c + 72, out) && looksLikeNamespacedId(out)) return true;
        if (cxx::readHashedString(c + 96, out) && looksLikeNamespacedId(out)) return true;
        // layout drift: look for "namespace" + "identifier" strings
        std::string ns, id;
        if (cxx::readString(c, ns) && cxx::readString(c + 24, id) && !ns.empty() && !id.empty()) {
            out = ns + ":" + id;
            if (looksLikeNamespacedId(out)) return true;
        }
        for (int o = 0; o <= 160; o += 8) {
            if (cxx::readString(c + o, out) && looksLikeNamespacedId(out)) return true;
        }
    }
    return false;
}

bool Game::uniqueId(const ActorRef& r, int64_t& out) {
    uintptr_t c = comp(r, "ActorUniqueIDComponent");
    return c && mem::read(c, out);
}

bool Game::runtimeId(const ActorRef& r, uint64_t& out) {
    uintptr_t c = comp(r, "RuntimeIDComponent");
    return c && mem::read(c, out);
}

bool Game::dimensionId(const ActorRef& r, int& out) {
    uintptr_t c = comp(r, "DimensionTypeComponent");
    if (c && mem::read(c, out) && out >= 0 && out < 64) return true;
    uintptr_t d = dimensionObject(r);
    if (!d) return false;
    std::string cls = toLower(className(ActorRef{d, 0}));
    if (contains(cls, "nether")) out = 1;
    else if (contains(cls, "end")) out = 2;
    else out = 0;
    return true;
}

uintptr_t Game::dimensionObject(const ActorRef& r) {
    if (off_.dimension < 0) return 0;
    uintptr_t p = mem::readPtr(r.addr + off_.dimension);
    return p && classifyIn(p, g_ti.dimension) ? p : 0;
}

bool Game::gameMode(const ActorRef& r, int& out) {
    uintptr_t c = comp(r, "ActorGameTypeComponent");
    return c && mem::read(c, out) && out >= -1 && out <= 6;
}

bool Game::actorType(const ActorRef& r, uint32_t& out) {
    uintptr_t c = comp(r, "ActorTypeComponent");
    return c && mem::read(c, out);
}

bool Game::synchedData(const ActorRef& r, std::vector<std::pair<int, std::string>>& out) {
    uintptr_t c = comp(r, "SynchedActorDataComponent");
    if (!c) return false;
    cxx::Vec v;
    if (!cxx::readVector(c, v, 8, 1 << 16)) return false;
    size_t n = std::min<size_t>(v.count(8), 512);
    std::vector<uintptr_t> items(n);
    mem::readPartial(v.begin, items.data(), n * 8);
    for (auto it : items) {
        if (!it) continue;
        Rtti::Classified cl;
        if (!rtti().classify(it, cl) || !contains(cl.ti->name, "DataItem")) continue;
        uint8_t type = mem::readOr<uint8_t>(it + 8, 255);
        uint16_t id = mem::readOr<uint16_t>(it + 10, 0xffff);
        std::string val;
        switch (type) {
            case 0: val = std::to_string((int)mem::readOr<int8_t>(it + 12, 0)); break;
            case 1: val = std::to_string(mem::readOr<int16_t>(it + 12, 0)); break;
            case 2: val = std::to_string(mem::readOr<int32_t>(it + 12, 0)); break;
            case 3: val = strprintf("%g", mem::readOr<float>(it + 12, 0)); break;
            case 4: {
                std::string s;
                val = cxx::readString(it + 16, s) ? "\"" + s + "\"" : "<string?>";
                break;
            }
            case 5: val = "<CompoundTag>"; break;
            case 6: {
                int p[3] = {0, 0, 0};
                mem::read(it + 12, p, sizeof(p));
                val = strprintf("(%d, %d, %d)", p[0], p[1], p[2]);
                break;
            }
            case 7: val = std::to_string((long long)mem::readOr<int64_t>(it + 16, 0)); break;
            case 8: {
                float p[3] = {0, 0, 0};
                mem::read(it + 12, p, sizeof(p));
                val = strprintf("(%g, %g, %g)", p[0], p[1], p[2]);
                break;
            }
            default: val = "<type " + std::to_string(type) + ">";
        }
        out.emplace_back((int)id, val);
    }
    return true;
}

bool Game::nameTag(const ActorRef& r, std::string& out) {
    uintptr_t c = comp(r, "SynchedActorDataComponent");
    if (!c) return false;
    cxx::Vec v;
    if (!cxx::readVector(c, v, 8, 1 << 16)) return false;
    size_t n = std::min<size_t>(v.count(8), 512);
    std::vector<uintptr_t> items(n);
    mem::readPartial(v.begin, items.data(), n * 8);
    // items are usually indexed by id; check slot 4 first
    auto tryItem = [&](uintptr_t it) -> bool {
        if (!it) return false;
        if (mem::readOr<uint8_t>(it + 8, 255) != 4 || mem::readOr<uint16_t>(it + 10, 0xffff) != 4) return false;
        return cxx::readString(it + 16, out);
    };
    if (n > 4 && tryItem(items[4])) return true;
    for (auto it : items)
        if (tryItem(it)) return true;
    return false;
}

bool Game::playerName(const ActorRef& r, std::string& out) {
    if (!isPlayer(r)) return false;
    int64_t uid;
    if (playerListMap_ && uniqueId(r, uid)) {
        std::vector<PlayerListEntry> list;
        if (playerList(list))
            for (auto& e : list)
                if (e.uniqueId == uid && !e.name.empty()) {
                    out = e.name;
                    return true;
                }
    }
    if (off_.playerName > 0 && cxx::readString(r.addr + off_.playerName, out) && !out.empty()) return true;
    return nameTag(r, out) && !out.empty();
}

bool Game::flags(const ActorRef& r, uint64_t out[2]) {
    uintptr_t c = comp(r, "ActorDataFlagComponent");
    return c && mem::read(c, out, 16);
}

bool Game::hasComponent(const ActorRef& r, const std::string& name) { return reg_.has(name, r.entity); }

bool Game::attributes(const ActorRef& r, std::vector<Attribute>& out) {
    uintptr_t c = comp(r, "AttributesComponent");
    if (!c) return false;
    // flat_map: keys vector, values vector (AttributeInstance, polymorphic)
    for (int vecOff : {24, 0, 48}) {
        cxx::Vec v;
        if (!cxx::readVector(c + vecOff, v, 8, 1 << 20) || !v.begin || v.bytes() < 16) continue;
        Rtti::Classified cl;
        if (!rtti().classify(v.begin, cl) || !contains(cl.ti->name, "AttributeInstance")) continue;
        uintptr_t vptr = mem::readPtr(v.begin);
        size_t stride = 0;
        for (size_t k = 16; k <= 1024 && v.begin + k < v.end; k += 8)
            if (mem::readPtr(v.begin + k) == vptr) {
                stride = k;
                break;
            }
        if (!stride) stride = v.bytes();
        size_t n = std::min<size_t>(v.bytes() / stride, 256);
        for (size_t i = 0; i < n; i++) {
            uintptr_t inst = v.begin + i * stride;
            Attribute a;
            uintptr_t attr = mem::readPtr(inst + 8);
            if (!attr || !cxx::readHashedString(attr + 8, a.name)) {
                // search the Attribute object for its HashedString name
                for (int o = 0; attr && o <= 64 && a.name.empty(); o += 8) {
                    std::string s;
                    if (cxx::readHashedString(attr + o, s)) a.name = s;
                }
            }
            // default {min,max,value}, current {min,max,value}
            float f[6];
            bool okVals = false;
            auto sane = [](const float* t) {
                return std::isfinite(t[0]) && std::isfinite(t[1]) && std::isfinite(t[2]) && t[0] <= t[1] &&
                       t[2] >= t[0] - 1e-3f && t[2] <= t[1] + 1e-3f;
            };
            for (size_t o : {104u, 96u, 112u, 88u, 120u}) {
                if (o + 24 > stride) continue;
                if (mem::read(inst + o, f, sizeof(f)) && sane(f) && sane(f + 3)) {
                    okVals = true;
                    break;
                }
            }
            if (!okVals) {
                for (size_t o = 16; o + 24 <= stride; o += 4)
                    if (mem::read(inst + o, f, sizeof(f)) && sane(f) && sane(f + 3) && (f[1] != 0 || f[4] != 0)) {
                        okVals = true;
                        break;
                    }
            }
            if (okVals) {
                a.min = f[3];
                a.max = f[4];
                a.current = f[5];
                a.defaultValue = f[2];
            }
            if (!a.name.empty() || okVals) out.push_back(a);
        }
        return true;
    }
    return false;
}

bool Game::readItemStack(uintptr_t stack, ItemInfo& out) {
    static std::unordered_map<uintptr_t, std::string> itemNames;
    out.addr = stack;
    uintptr_t pc = mem::readPtr(stack + 8);
    uintptr_t item = pc ? mem::readPtr(pc) : 0;
    out.count = mem::readOr<uint8_t>(stack + 34, 0);
    out.aux = mem::readOr<int16_t>(stack + 32, 0);
    if (!item) {
        out.typeId.clear();
        out.count = 0;
        return true;
    }
    auto it = itemNames.find(item);
    if (it != itemNames.end()) {
        out.typeId = it->second;
        return true;
    }
    if (!classifyIn(item, g_ti.item)) return false;
    std::vector<uint8_t> blk;
    readBlock(item, blk, 0x400);
    std::string best;
    for (size_t o = 8; o + 40 <= blk.size(); o += 8) {
        uint64_t h = at<uint64_t>(blk, o);
        if (!h) continue;
        std::string s;
        if (cxx::readHashedString(item + o, s) && looksLikeNamespacedId(s)) {
            best = s;
            break;
        }
    }
    if (best.empty()) {
        // fall back to the raw name id (no namespace)
        for (size_t o = 8; o + 40 <= blk.size(); o += 8) {
            std::string s;
            if (cxx::readHashedString(item + o, s) && !s.empty() && s.find(' ') == std::string::npos) {
                best = "minecraft:" + s;
                break;
            }
        }
    }
    out.typeId = best;
    itemNames[item] = best;
    return true;
}

bool Game::readContainerItems(uintptr_t container, std::vector<ItemInfo>& out) {
    std::vector<uint8_t> blk;
    if (!readBlock(container, blk, 0x400)) return false;
    for (size_t o = 8; o + 24 <= blk.size(); o += 8) {
        cxx::Vec v;
        if (!cxx::readVector(container + o, v, 8, 1 << 20) || !v.begin || v.bytes() < 16) continue;
        Rtti::Classified cl;
        if (!rtti().classify(v.begin, cl) || cl.object != v.begin) continue;
        if (!contains(cl.ti->name, "ItemStack") && !contains(cl.ti->name, "ItemInstance")) continue;
        uintptr_t vptr = mem::readPtr(v.begin);
        size_t stride = 0;
        for (size_t k = 16; k <= 1024 && v.begin + k < v.end; k += 8)
            if (mem::readPtr(v.begin + k) == vptr) {
                stride = k;
                break;
            }
        if (!stride) stride = v.bytes();
        size_t n = std::min<size_t>(v.bytes() / stride, 512);
        for (size_t i = 0; i < n; i++) {
            ItemInfo info;
            info.slot = (int)i;
            readItemStack(v.begin + i * stride, info);
            out.push_back(info);
        }
        return true;
    }
    return false;
}

bool Game::equipment(const ActorRef& r, std::vector<ItemInfo>& hand, std::vector<ItemInfo>& armor) {
    uintptr_t c = comp(r, "ActorEquipmentComponent");
    if (!c) return false;
    uintptr_t h = mem::readPtr(c), a = mem::readPtr(c + 8);
    bool ok = false;
    if (h) ok |= readContainerItems(h, hand);
    if (a) ok |= readContainerItems(a, armor);
    return ok;
}

bool Game::inventory(const ActorRef& r, std::vector<ItemInfo>& items, int& selected) {
    selected = -1;
    std::vector<uint8_t> blk;
    readBlock(r.addr, blk, kMaxPlayerScan);
    auto& rt = rtti();
    for (size_t o = 8; o + 8 <= blk.size(); o += 8) {
        uintptr_t p = at<uintptr_t>(blk, o);
        if (!mem::isPlausibleHeapPtr(p)) continue;
        Rtti::Classified c;
        if (!rt.classify(p, c) || c.object != p || c.ti->name != "PlayerInventory") continue;
        int sel = mem::readOr<int>(p + 16, -1);
        if (sel >= 0 && sel <= 8) selected = sel;
        std::vector<uint8_t> inv;
        readBlock(p, inv, 0x400);
        for (size_t k = 8; k + 8 <= inv.size(); k += 8) {
            uintptr_t q = at<uintptr_t>(inv, k);
            if (!mem::isPlausibleHeapPtr(q)) continue;
            if (!classifyIn(q, g_ti.container)) continue;
            if (readContainerItems(q, items)) return true;
        }
    }
    return false;
}

bool Game::playerList(std::vector<PlayerListEntry>& out) {
    if (!playerListMap_ || off_.pleUuidVal < 0) return false;
    cxx::UMap m;
    if (!cxx::readUnorderedMap(playerListMap_, m)) return false;
    const int v = off_.pleUuidVal;
    cxx::forEachNode(m, [&](uintptr_t node) {
        uint8_t buf[128];
        if (!mem::read(node, buf, sizeof(buf))) return false;
        PlayerListEntry e;
        e.node = node;
        memcpy(&e.uniqueId, buf + v - 8, 8);
        e.uuid = uuidString(buf + v);
        cxx::readString(node + v + 16, e.name);
        cxx::readString(node + v + 40, e.xuid);
        cxx::readString(node + v + 64, e.platformOnlineId);
        e.buildPlatform = mem::readOr<int>(node + v + 88, -1);
        out.push_back(std::move(e));
        return true;
    });
    return true;
}


// ---------------------------------------------------------------------------
// Scoreboard (client side: only what the server sent - displayed objectives)
// ---------------------------------------------------------------------------
namespace {
bool quickMap(const uint8_t* b, size_t avail, size_t o) {
    if (o + 40 > avail) return false;
    float mlf;
    uint64_t size;
    uintptr_t first;
    memcpy(&mlf, b + o + 32, 4);
    memcpy(&size, b + o + 24, 8);
    memcpy(&first, b + o + 16, 8);
    if (!(mlf > 0.01f && mlf <= 64.f) || size > 1000000) return false;
    return size == 0 ? first == 0 : first > 0x10000;
}

bool derivesNamed(uintptr_t p, const char* base) {
    Rtti::Classified c;
    return mem::isPlausiblePtr(p) && rtti().classify(p, c) && rtti().derivesFrom(c.ti->addr, base);
}
}  // namespace

bool Game::scoreboard(ScoreboardInfo& out, std::string* err) {
    auto fail = [&](const char* m) {
        if (err) *err = m;
        return false;
    };
    uintptr_t sb = scoreboard_;
    if (!sb || !derivesNamed(sb, "Scoreboard")) {
        sb = 0;
        std::vector<uint8_t> blk;
        if (level_) readBlock(level_, blk, 0x3000);
        for (size_t o = 0; o + 8 <= blk.size() && !sb; o += 8) {
            uintptr_t p = at<uintptr_t>(blk, o);
            if (derivesNamed(p, "Scoreboard")) sb = p;
        }
        if (!sb) return fail("scoreboard object not found from the level");
        scoreboard_ = sb;
    }
    out.addr = sb;
    Rtti::Classified c;
    if (rtti().classify(sb, c)) out.cls = c.ti->name;
    static const char* slots[] = {"sidebar", "list", "belowname"};
    std::vector<uint8_t> blk;
    readBlock(sb, blk, 0x600);
    std::vector<std::pair<std::string, uintptr_t>> objectives;  // name -> Objective*
    for (size_t o = 8; o + 40 <= blk.size(); o += 8) {
        if (!quickMap(blk.data(), blk.size(), o)) continue;
        cxx::UMap m;
        if (!cxx::readUnorderedMap(sb + o, m) || m.size == 0) continue;
        std::string key;
        if (!cxx::readString(m.first + 16, key) || key.empty()) continue;
        uintptr_t val = mem::readPtr(m.first + 40);
        if (!derivesNamed(val, "Objective")) continue;
        bool isDisplay = true;
        std::vector<std::pair<std::string, uintptr_t>> entries;
        std::vector<int> orders;
        cxx::forEachNode(m, [&](uintptr_t node) {
            std::string k;
            if (!cxx::readString(node + 16, k)) return true;
            bool slot = false;
            for (auto sl : slots)
                if (k == sl) slot = true;
            isDisplay = isDisplay && slot;
            entries.emplace_back(k, mem::readPtr(node + 40));
            orders.push_back(mem::readOr<uint8_t>(node + 48, 0));
            return true;
        });
        if (isDisplay) {
            for (size_t i = 0; i < entries.size(); i++) {
                DisplayInfo d;
                d.slot = entries[i].first;
                d.sortOrder = orders[i];
                // resolve the objective name later
                d.objective = hex(entries[i].second);
                out.displays.push_back(d);
            }
        } else if (objectives.empty()) {
            objectives = entries;
        }
    }
    std::vector<PlayerListEntry> plist;
    playerList(plist);
    for (auto& [name, obj] : objectives) {
        if (!derivesNamed(obj, "Objective")) continue;
        ObjectiveInfo oi;
        oi.addr = obj;
        oi.name = name;
        std::vector<uint8_t> ob;
        readBlock(obj, ob, 0x100);
        // strings: the name, then the display name
        for (size_t o = 8; o + 24 <= ob.size(); o += 8) {
            std::string sv;
            if (!cxx::readString(obj + o, sv) || sv != name) continue;
            std::string disp;
            if (cxx::readString(obj + o + 24, disp)) oi.displayName = disp;
            uintptr_t crit = mem::readPtr(obj + o + 48);
            if (derivesNamed(crit, "ObjectiveCriteria")) {
                for (int k = 8; k <= 32 && oi.criteria.empty(); k += 8) cxx::readString(crit + k, oi.criteria);
            }
            break;
        }
        // scores: unordered_map<ScoreboardId{int64 id, IdentityDefinition*}, int>
        for (size_t o = 8; o + 40 <= ob.size(); o += 8) {
            if (!quickMap(ob.data(), ob.size(), o)) continue;
            cxx::UMap m;
            if (!cxx::readUnorderedMap(obj + o, m)) continue;
            if (m.size == 0) break;
            int64_t rid = mem::readOr<int64_t>(m.first + 16, -1);
            if (rid < 0 || rid > (1ll << 40)) continue;
            cxx::forEachNode(m, [&](uintptr_t node) {
                ScoreEntry e;
                e.scoreboardId = mem::readOr<int64_t>(node + 16, -1);
                uintptr_t def = mem::readPtr(node + 24);
                e.score = mem::readOr<int32_t>(node + 32, 0);
                if (def && mem::isPlausiblePtr(def)) {
                    e.type = mem::readOr<uint8_t>(def + 64, 0);
                    e.entityId = mem::readOr<int64_t>(def + 32, 0);
                    int64_t playerId = mem::readOr<int64_t>(def + 24, 0);
                    if (!cxx::readString(def + 40, e.participant)) {
                        for (int k = 16; k <= 96 && e.participant.empty(); k += 8) cxx::readString(def + k, e.participant);
                    }
                    if (e.participant.empty() && e.type == 1) {
                        for (auto& pl : plist)
                            if (pl.uniqueId == playerId || pl.uniqueId == e.entityId) e.participant = pl.name;
                        if (!e.entityId) e.entityId = playerId;
                    }
                    if (e.type == 0) e.type = e.participant.empty() ? 2 : 3;
                }
                oi.scores.push_back(e);
                return true;
            });
            break;
        }
        out.objectives.push_back(std::move(oi));
    }
    for (auto& d : out.displays)
        for (auto& o : out.objectives)
            if (hex(o.addr) == d.objective) d.objective = o.name;
    return true;
}

std::string Game::dimensionName(int id) {
    switch (id) {
        case 0: return "minecraft:overworld";
        case 1: return "minecraft:nether";
        case 2: return "minecraft:the_end";
        default: return "minecraft:dimension_" + std::to_string(id);
    }
}

}  // namespace se::game

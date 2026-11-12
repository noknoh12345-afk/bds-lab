#include "blocks.h"

#include <mutex>
#include <unordered_map>

#include "common.h"
#include "config.h"
#include "cxxtypes.h"
#include "game.h"
#include "memory.h"
#include "rtti.h"
#include "tickhook.h"

namespace se::blocks {

namespace {
int g_slot = 2;
std::unordered_map<uintptr_t, BlockInfo> g_cache;
std::mutex g_mu;

struct BlockPos {
    int x, y, z;
};
using GetBlockFn = const void* (*)(const void* self, const BlockPos* pos);

bool derives(uintptr_t obj, std::initializer_list<const char*> bases, Rtti::Classified* out = nullptr) {
    Rtti::Classified c;
    if (!rtti().classify(obj, c)) return false;
    for (auto b : bases)
        if (rtti().derivesFrom(c.ti->addr, b)) {
            if (out) *out = c;
            return true;
        }
    return false;
}

bool describeBlock(uintptr_t block, BlockInfo& info) {
    info.block = block;
    // Block -> BlockType (BlockLegacy in older versions) -> HashedString full name
    uint8_t buf[0x200];
    size_t got = mem::readPartial(block, buf, sizeof(buf));
    for (size_t o = 8; o + 8 <= got; o += 8) {
        uintptr_t p;
        memcpy(&p, buf + o, 8);
        if (!mem::isPlausiblePtr(p) || !derives(p, {"BlockType", "BlockLegacy"})) continue;
        uint8_t tb[0x400];
        size_t tg = mem::readPartial(p, tb, sizeof(tb));
        for (size_t k = 8; k + 40 <= tg; k += 8) {
            std::string s;
            if (cxx::readHashedString(p + k, s) && looksLikeNamespacedId(s)) {
                info.typeId = s;
                break;
            }
        }
        if (!info.typeId.empty()) break;
    }
    // tags: a vector of HashedString inside the Block
    for (size_t o = 8; o + 24 <= got && info.tags.empty(); o += 8) {
        cxx::Vec v;
        if (!cxx::readVector(block + o, v, 40, 1 << 16) || !v.begin || v.bytes() < 40) continue;
        std::string first;
        if (!cxx::readHashedString(v.begin, first) || first.empty()) continue;
        for (size_t i = 0; i < v.count(40) && i < 64; i++) {
            std::string t;
            if (cxx::readHashedString(v.begin + i * 40, t)) info.tags.push_back(t);
        }
    }
    return !info.typeId.empty();
}
}  // namespace

void setGetBlockSlot(int slot) { g_slot = slot; }

bool getBlock(int x, int y, int z, BlockInfo& out, std::string* err) {
    auto fail = [&](const char* m) {
        if (err) *err = m;
        return false;
    };
    if (!config().gameCalls) return fail("game calls are disabled in config (gameCalls=false)");
    if (!tick::onMainThread())
        return fail("getBlock must run on the game thread; wait until the tick hook is installed (see status())");
    auto& g = game::game();
    game::ActorRef lp{g.localPlayer(), g.localEntity()};
    uintptr_t comp = g.registry().get("BlockSourceComponent", lp.entity);
    uintptr_t bs = comp ? mem::readPtr(comp) : 0;
    if (!bs || !derives(bs, {"BlockSource", "IConstBlockSource", "IBlockSource"})) {
        // fallback: the BlockSource owned by the player's Dimension
        bs = 0;
        uintptr_t dim = g.dimensionObject(lp);
        uint8_t buf[0x400];
        size_t got = dim ? mem::readPartial(dim, buf, sizeof(buf)) : 0;
        for (size_t o = 8; o + 8 <= got && !bs; o += 8) {
            uintptr_t p;
            memcpy(&p, buf + o, 8);
            if (mem::isPlausibleHeapPtr(p) && derives(p, {"BlockSource", "IConstBlockSource", "IBlockSource"})) bs = p;
        }
    }
    if (!bs) return fail("could not find the local player's BlockSource");
    uintptr_t vptr = mem::readPtr(bs);
    uintptr_t fn = mem::readPtr(vptr + (uintptr_t)g_slot * 8);
    if (!rtti().module().inExec(fn)) return fail("unexpected BlockSource vtable layout");
    BlockPos pos{x, y, z};
    const void* res = reinterpret_cast<GetBlockFn>(fn)(reinterpret_cast<const void*>(bs), &pos);
    uintptr_t block = (uintptr_t)res;
    if (!block || !derives(block, {"Block"})) return fail("getBlock returned something that is not a Block");
    std::lock_guard<std::mutex> lk(g_mu);
    auto it = g_cache.find(block);
    if (it == g_cache.end()) {
        BlockInfo info;
        describeBlock(block, info);
        it = g_cache.emplace(block, info).first;
    }
    out = it->second;
    return true;
}

}  // namespace se::blocks

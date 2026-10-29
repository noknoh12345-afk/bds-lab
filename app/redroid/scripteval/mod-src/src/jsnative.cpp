// Native functions exposed to JavaScript as __native.mc (game model) and
// __native.dbg (low level memory / RTTI / ECS inspection).
#include <atomic>
#include <mutex>
#include <cmath>
#include <thread>
#include <unordered_set>

#include "blocks.h"
#include "common.h"
#include "session.h"
#include "config.h"
#include "cxxtypes.h"
#include "game.h"
#include "heapscan.h"
#include "jsengine.h"
#include "jsutil.h"
#include "memory.h"
#include "platform.h"
#include "rtti.h"
#include "tickhook.h"

namespace se::js {

using game::ActorRef;

namespace {
std::atomic<bool> g_tickHookAttempted{false};
std::atomic<bool> g_tickHookBusy{false};  // profiling in progress
std::mutex g_tickReportMu;
std::string g_tickReport;
uint64_t g_lastGeneration = 0;

game::Game& G() { return game::game(); }

// Ensures the world model; throws a JS exception when not in a world.
bool needWorld(JSContext* ctx, bool allowScan = true) {
    std::string err;
    if (!G().ensure(&err, allowScan)) {
        JS_ThrowInternalError(ctx, "ScriptEval: %s", err.c_str());
        return false;
    }
    if (G().generation() != g_lastGeneration) {
        g_lastGeneration = G().generation();
        onWorldDiscovered();
    }
    return true;
}

ActorRef refArgs(JSContext* ctx, int argc, JSValueConst* argv) {
    ActorRef r;
    r.addr = toAddr(ctx, SE_ARG(0));
    r.entity = (uint32_t)toI64(ctx, SE_ARG(1), 0);
    return r;
}

#define REF_OR_NULL()                                       \
    if (!needWorld(ctx, false)) return JS_EXCEPTION;        \
    ActorRef r = refArgs(ctx, argc, argv);                  \
    if (!G().refValid(r)) return JS_NULL;

JSValue itemsToJs(JSContext* ctx, const std::vector<game::ItemInfo>& items) {
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& it : items) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "slot", JS_NewInt32(ctx, it.slot));
        setProp(ctx, o, "typeId", it.typeId.empty() ? JS_NULL : newStr(ctx, it.typeId));
        setProp(ctx, o, "amount", JS_NewInt32(ctx, it.count));
        setProp(ctx, o, "aux", JS_NewInt32(ctx, it.aux));
        setProp(ctx, o, "address", fromAddr(ctx, it.addr));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

// ------------------------------------------------------------------ __native.mc
JSValue mc_ensure(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    bool allowScan = argc < 1 || toBool(ctx, argv[0]);
    if (!needWorld(ctx, allowScan)) return JS_EXCEPTION;
    return JS_TRUE;
}

JSValue mc_status(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    auto s = G().status();
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "rttiReady", JS_NewBool(ctx, s.rttiReady));
    setProp(ctx, o, "rtti", newStr(ctx, rtti().ready() ? rtti().summary() : ""));
    setProp(ctx, o, "inWorld", JS_NewBool(ctx, s.inWorld));
    setProp(ctx, o, "error", newStr(ctx, s.error));
    setProp(ctx, o, "localPlayer", fromAddr(ctx, s.localPlayer));
    setProp(ctx, o, "localPlayerClass", newStr(ctx, s.localPlayerClass));
    setProp(ctx, o, "localEntity", JS_NewFloat64(ctx, s.localEntity));
    setProp(ctx, o, "registry", fromAddr(ctx, s.registry));
    setProp(ctx, o, "componentPools", JS_NewFloat64(ctx, (double)s.storages));
    setProp(ctx, o, "actors", JS_NewFloat64(ctx, (double)s.actors));
    setProp(ctx, o, "level", fromAddr(ctx, s.level));
    setProp(ctx, o, "levelClass", newStr(ctx, s.levelClass));
    setProp(ctx, o, "playerList", JS_NewBool(ctx, s.playerList));
    setProp(ctx, o, "lastScan", newStr(ctx, s.scanStats));
    setProp(ctx, o, "discoveryMs", JS_NewFloat64(ctx, (double)s.discoveryMs));
    setProp(ctx, o, "memoryBackend", newStr(ctx, mem::backendName()));
    setProp(ctx, o, "gameVersion", newStr(ctx, platform::gameVersion()));
    return o;
}

JSValue mc_actors(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    int kind = (int)toI64(ctx, SE_ARG(0), 0);
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& a : G().actors()) {
        if (kind == 1 && !G().isPlayer(a)) continue;
        JSValue p = JS_NewArray(ctx);
        JS_SetPropertyUint32(ctx, p, 0, fromAddr(ctx, a.addr));
        JS_SetPropertyUint32(ctx, p, 1, JS_NewFloat64(ctx, a.entity));
        JS_SetPropertyUint32(ctx, arr, i++, p);
    }
    return arr;
}

JSValue mc_localPlayer(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    JSValue p = JS_NewArray(ctx);
    JS_SetPropertyUint32(ctx, p, 0, fromAddr(ctx, G().localPlayer()));
    JS_SetPropertyUint32(ctx, p, 1, JS_NewFloat64(ctx, G().localEntity()));
    return p;
}

JSValue mc_valid(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!G().ensure(nullptr, false)) return JS_FALSE;
    return JS_NewBool(ctx, G().refValid(refArgs(ctx, argc, argv)));
}

JSValue mc_cls(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    Rtti::Classified c;
    if (!rtti().ready() || !rtti().classify(toAddr(ctx, SE_ARG(0)), c)) return JS_NULL;
    return newStr(ctx, c.ti->name);
}

JSValue mc_isPlayer(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    return JS_NewBool(ctx, G().isPlayer(refArgs(ctx, argc, argv)));
}

JSValue mc_isLocal(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    return JS_NewBool(ctx, toAddr(ctx, SE_ARG(0)) == G().localPlayer());
}

JSValue mc_pos(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    cxx::Vec3 raw, prev, delta, feet;
    if (!G().position(r, raw, prev, delta)) return JS_NULL;
    G().feetPosition(r, feet);
    return numArray(ctx, {feet.x, feet.y, feet.z, raw.x, raw.y, raw.z, prev.x, prev.y, prev.z, delta.x, delta.y,
                          delta.z});
}

JSValue mc_rot(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    float p, y;
    if (!G().rotation(r, p, y)) return JS_NULL;
    double head = NAN, body = NAN;
    float h;
    if (G().headYaw(r, h)) head = h;
    if (G().bodyYaw(r, h)) body = h;
    return numArray(ctx, {p, y, head, body});
}

JSValue mc_aabb(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    cxx::Vec3 mn, mx;
    float w, h;
    if (!G().aabb(r, mn, mx, w, h)) return JS_NULL;
    float ho = NAN;
    G().heightOffset(r, ho);
    return numArray(ctx, {mn.x, mn.y, mn.z, mx.x, mx.y, mx.z, w, h, ho});
}

JSValue mc_typeId(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::string s;
    return G().typeId(r, s) ? newStr(ctx, s) : JS_NULL;
}

JSValue mc_uniqueId(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    int64_t v;
    return G().uniqueId(r, v) ? newStr(ctx, std::to_string((long long)v)) : JS_NULL;
}

JSValue mc_runtimeId(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    uint64_t v;
    return G().runtimeId(r, v) ? newStr(ctx, std::to_string((unsigned long long)v)) : JS_NULL;
}

JSValue mc_dim(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    int d;
    return G().dimensionId(r, d) ? JS_NewInt32(ctx, d) : JS_NULL;
}

JSValue mc_gameMode(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    int m;
    return G().gameMode(r, m) ? JS_NewInt32(ctx, m) : JS_NULL;
}

JSValue mc_actorType(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    uint32_t t;
    return G().actorType(r, t) ? JS_NewFloat64(ctx, t) : JS_NULL;
}

JSValue mc_nameTag(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::string s;
    return G().nameTag(r, s) ? newStr(ctx, s) : JS_NULL;
}

JSValue mc_playerName(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::string s;
    return G().playerName(r, s) ? newStr(ctx, s) : JS_NULL;
}

JSValue mc_flags(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    uint64_t f[2];
    if (!G().flags(r, f)) return JS_NULL;
    std::vector<double> bits;
    for (int i = 0; i < 128; i++)
        if (f[i / 64] & (1ull << (i % 64))) bits.push_back(i);
    return numArray(ctx, bits);
}

JSValue mc_hasComp(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx, false)) return JS_EXCEPTION;
    ActorRef r = refArgs(ctx, argc, argv);
    return JS_NewBool(ctx, G().hasComponent(r, toStr(ctx, SE_ARG(2))));
}

JSValue mc_comp(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx, false)) return JS_EXCEPTION;
    ActorRef r = refArgs(ctx, argc, argv);
    return fromAddr(ctx, G().registry().get(toStr(ctx, SE_ARG(2)), r.entity));
}

JSValue mc_comps(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx, false)) return JS_EXCEPTION;
    ActorRef r = refArgs(ctx, argc, argv);
    auto& reg = G().registry();
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto* s : reg.componentsOf(r.entity)) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "name", newStr(ctx, s->component));
        setProp(ctx, o, "address", fromAddr(ctx, reg.get(*s, r.entity)));
        setProp(ctx, o, "size", JS_NewInt32(ctx, (int)s->elemSize));
        setProp(ctx, o, "tag", JS_NewBool(ctx, s->empty));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue mc_attributes(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::vector<game::Attribute> attrs;
    if (!G().attributes(r, attrs)) return JS_NULL;
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& a : attrs) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "id", newStr(ctx, a.name));
        setProp(ctx, o, "currentValue", JS_NewFloat64(ctx, a.current));
        setProp(ctx, o, "effectiveMin", JS_NewFloat64(ctx, a.min));
        setProp(ctx, o, "effectiveMax", JS_NewFloat64(ctx, a.max));
        setProp(ctx, o, "defaultValue", JS_NewFloat64(ctx, a.defaultValue));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue mc_synched(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::vector<std::pair<int, std::string>> items;
    if (!G().synchedData(r, items)) return JS_NULL;
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& [id, v] : items) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "id", JS_NewInt32(ctx, id));
        setProp(ctx, o, "value", newStr(ctx, v));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue mc_equipment(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::vector<game::ItemInfo> hand, armor;
    if (!G().equipment(r, hand, armor)) return JS_NULL;
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "hand", itemsToJs(ctx, hand));
    setProp(ctx, o, "armor", itemsToJs(ctx, armor));
    return o;
}

JSValue mc_inventory(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    REF_OR_NULL();
    std::vector<game::ItemInfo> items;
    int sel = -1;
    if (!G().inventory(r, items, sel)) return JS_NULL;
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "selectedSlot", JS_NewInt32(ctx, sel));
    setProp(ctx, o, "items", itemsToJs(ctx, items));
    return o;
}

JSValue mc_container(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::vector<game::ItemInfo> items;
    if (!G().readContainerItems(toAddr(ctx, SE_ARG(0)), items)) return JS_NULL;
    return itemsToJs(ctx, items);
}

JSValue mc_playerList(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    std::vector<game::PlayerListEntry> list;
    if (!G().playerList(list)) return JS_NULL;
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& e : list) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "name", newStr(ctx, e.name));
        setProp(ctx, o, "xuid", newStr(ctx, e.xuid));
        setProp(ctx, o, "uuid", newStr(ctx, e.uuid));
        setProp(ctx, o, "id", newStr(ctx, std::to_string((long long)e.uniqueId)));
        setProp(ctx, o, "platformOnlineId", newStr(ctx, e.platformOnlineId));
        setProp(ctx, o, "buildPlatform", JS_NewInt32(ctx, e.buildPlatform));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue mc_scoreboard(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    game::ScoreboardInfo sb;
    std::string err;
    if (!G().scoreboard(sb, &err)) return JS_ThrowInternalError(ctx, "ScriptEval: %s", err.c_str());
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "address", fromAddr(ctx, sb.addr));
    setProp(ctx, o, "class", newStr(ctx, sb.cls));
    JSValue objs = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& ob : sb.objectives) {
        JSValue jo = JS_NewObject(ctx);
        setProp(ctx, jo, "id", newStr(ctx, ob.name));
        setProp(ctx, jo, "displayName", newStr(ctx, ob.displayName));
        setProp(ctx, jo, "criteria", newStr(ctx, ob.criteria));
        setProp(ctx, jo, "address", fromAddr(ctx, ob.addr));
        JSValue sc = JS_NewArray(ctx);
        uint32_t k = 0;
        for (auto& e : ob.scores) {
            JSValue je = JS_NewObject(ctx);
            setProp(ctx, je, "participant", newStr(ctx, e.participant));
            setProp(ctx, je, "type", JS_NewInt32(ctx, e.type));
            setProp(ctx, je, "scoreboardId", JS_NewFloat64(ctx, (double)e.scoreboardId));
            setProp(ctx, je, "entityId", newStr(ctx, std::to_string((long long)e.entityId)));
            setProp(ctx, je, "score", JS_NewInt32(ctx, e.score));
            JS_SetPropertyUint32(ctx, sc, k++, je);
        }
        setProp(ctx, jo, "scores", sc);
        JS_SetPropertyUint32(ctx, objs, i++, jo);
    }
    setProp(ctx, o, "objectives", objs);
    JSValue disp = JS_NewArray(ctx);
    i = 0;
    for (auto& d : sb.displays) {
        JSValue jd = JS_NewObject(ctx);
        setProp(ctx, jd, "slot", newStr(ctx, d.slot));
        setProp(ctx, jd, "objective", newStr(ctx, d.objective));
        setProp(ctx, jd, "sortOrder", JS_NewInt32(ctx, d.sortOrder));
        JS_SetPropertyUint32(ctx, disp, i++, jd);
    }
    setProp(ctx, o, "displays", disp);
    return o;
}

JSValue mc_level(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    return fromAddr(ctx, G().level());
}

JSValue mc_offsets(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    std::string j = G().offsets().toJson();
    return JS_ParseJSON(ctx, j.c_str(), j.size(), "<offsets>");
}

JSValue mc_rescan(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    G().invalidate();
    if (!needWorld(ctx)) return JS_EXCEPTION;
    return JS_TRUE;
}

JSValue mc_tickInfo(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "installed", JS_NewBool(ctx, tick::installed()));
    setProp(ctx, o, "slot", JS_NewInt32(ctx, tick::installedSlot()));
    setProp(ctx, o, "ticks", JS_NewFloat64(ctx, (double)tick::ticks()));
    setProp(ctx, o, "ticking", JS_NewBool(ctx, tick::tickingRecently(400)));
    setProp(ctx, o, "onGameThread", JS_NewBool(ctx, tick::onMainThread()));
    setProp(ctx, o, "attempted", JS_NewBool(ctx, g_tickHookAttempted.load()));
    setProp(ctx, o, "busy", JS_NewBool(ctx, g_tickHookBusy.load()));
    {
        std::lock_guard<std::mutex> lk(g_tickReportMu);
        setProp(ctx, o, "report", newStr(ctx, g_tickReport));
    }
    return o;
}

JSValue mc_installTickHook(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    g_tickHookAttempted = false;
    onWorldDiscovered();
    return JS_TRUE;
}

JSValue mc_dimensionName(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    return newStr(ctx, G().dimensionName((int)toI64(ctx, SE_ARG(0), 0)));
}

JSValue mc_getBlock(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    int x = (int)std::floor(toF64(ctx, SE_ARG(0))), y = (int)std::floor(toF64(ctx, SE_ARG(1))),
        z = (int)std::floor(toF64(ctx, SE_ARG(2)));
    blocks::BlockInfo info;
    std::string err;
    if (!blocks::getBlock(x, y, z, info, &err)) return JS_ThrowInternalError(ctx, "ScriptEval: %s", err.c_str());
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "typeId", newStr(ctx, info.typeId));
    setProp(ctx, o, "address", fromAddr(ctx, info.block));
    setProp(ctx, o, "runtimeId", JS_NewFloat64(ctx, info.runtimeId));
    setProp(ctx, o, "tags", strArray(ctx, info.tags));
    return o;
}

// ------------------------------------------------------------------ __native.dbg
JSValue dbg_read(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    uintptr_t a = toAddr(ctx, SE_ARG(0));
    size_t len = (size_t)toI64(ctx, SE_ARG(1), 0);
    if (len > (64u << 20)) return JS_ThrowRangeError(ctx, "length too large");
    std::vector<uint8_t> buf(len);
    if (!mem::read(a, buf.data(), len)) return JS_NULL;
    return JS_NewArrayBufferCopy(ctx, buf.data(), len);
}

template <class T>
JSValue readNum(JSContext* ctx, int argc, JSValueConst* argv) {
    T v;
    if (!mem::read(toAddr(ctx, SE_ARG(0)), v)) return JS_NULL;
    return JS_NewFloat64(ctx, (double)v);
}
JSValue dbg_u8(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<uint8_t>(c, n, v); }
JSValue dbg_i8(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<int8_t>(c, n, v); }
JSValue dbg_u16(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<uint16_t>(c, n, v); }
JSValue dbg_i16(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<int16_t>(c, n, v); }
JSValue dbg_u32(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<uint32_t>(c, n, v); }
JSValue dbg_i32(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<int32_t>(c, n, v); }
JSValue dbg_f32(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<float>(c, n, v); }
JSValue dbg_f64(JSContext* c, JSValueConst, int n, JSValueConst* v) { return readNum<double>(c, n, v); }
JSValue dbg_ptr(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
    uintptr_t v;
    if (!mem::read(toAddr(c, SE_ARG(0)), v)) return JS_NULL;
    return fromAddr(c, v);
}
JSValue dbg_u64(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
    uint64_t v;
    if (!mem::read(toAddr(c, SE_ARG(0)), v)) return JS_NULL;
    return JS_NewBigUint64(c, v);
}
JSValue dbg_i64(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
    int64_t v;
    if (!mem::read(toAddr(c, SE_ARG(0)), v)) return JS_NULL;
    return JS_NewBigInt64(c, v);
}

JSValue dbg_str(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string s;
    return cxx::readString(toAddr(ctx, SE_ARG(0)), s) ? newStr(ctx, s) : JS_NULL;
}

JSValue dbg_hstr(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string s;
    return cxx::readHashedString(toAddr(ctx, SE_ARG(0)), s) ? newStr(ctx, s) : JS_NULL;
}

JSValue dbg_cstr(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    uintptr_t a = toAddr(ctx, SE_ARG(0));
    size_t max = (size_t)toI64(ctx, SE_ARG(1), 256);
    std::vector<char> buf(max + 1, 0);
    size_t got = mem::readPartial(a, buf.data(), max);
    if (!got) return JS_NULL;
    size_t n = strnlen(buf.data(), got);
    return JS_NewStringLen(ctx, buf.data(), n);
}

JSValue dbg_hexdump(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    size_t len = (size_t)toI64(ctx, SE_ARG(1), 64);
    if (len > 65536) len = 65536;
    return newStr(ctx, mem::hexdump(toAddr(ctx, SE_ARG(0)), len));
}

bool needRtti(JSContext* ctx) {
    std::string err;
    if (!ensureRtti(&err)) {
        JS_ThrowInternalError(ctx, "ScriptEval: %s", err.c_str());
        return false;
    }
    return true;
}

JSValue classifyToJs(JSContext* ctx, const Rtti::Classified& c) {
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "name", newStr(ctx, c.ti->name));
    setProp(ctx, o, "mangled", newStr(ctx, c.ti->mangled));
    setProp(ctx, o, "object", fromAddr(ctx, c.object));
    setProp(ctx, o, "offsetToTop", JS_NewFloat64(ctx, (double)c.vt->offsetToTop));
    setProp(ctx, o, "vtable", fromAddr(ctx, c.vt->addressPoint()));
    setProp(ctx, o, "slots", JS_NewInt32(ctx, (int)c.vt->slots));
    setProp(ctx, o, "bases", strArray(ctx, rtti().baseChain(c.ti->addr)));
    return o;
}

JSValue dbg_classify(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    Rtti::Classified c;
    if (!rtti().classify(toAddr(ctx, SE_ARG(0)), c)) return JS_NULL;
    return classifyToJs(ctx, c);
}

JSValue tiToJs(JSContext* ctx, const TypeInfoRec* t, bool detail) {
    auto& rt = rtti();
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "name", newStr(ctx, t->name));
    setProp(ctx, o, "mangled", newStr(ctx, t->mangled));
    setProp(ctx, o, "typeinfo", fromAddr(ctx, t->addr));
    std::vector<std::string> bases;
    for (auto b : t->bases)
        if (auto* bt = rt.byAddr(b)) bases.push_back(bt->name);
    setProp(ctx, o, "bases", strArray(ctx, bases));
    if (detail) {
        JSValue vts = JS_NewArray(ctx);
        uint32_t i = 0;
        for (auto* v : rt.vtablesOf(t->addr)) {
            JSValue vo = JS_NewObject(ctx);
            setProp(ctx, vo, "address", fromAddr(ctx, v->addressPoint()));
            setProp(ctx, vo, "offsetToTop", JS_NewFloat64(ctx, (double)v->offsetToTop));
            setProp(ctx, vo, "slots", JS_NewInt32(ctx, (int)v->slots));
            JS_SetPropertyUint32(ctx, vts, i++, vo);
        }
        setProp(ctx, o, "vtables", vts);
        auto derived = rt.withDerived(t->addr);
        setProp(ctx, o, "derivedCount", JS_NewInt32(ctx, (int)derived.size() - 1));
        std::vector<std::string> dn;
        for (size_t k = 1; k < derived.size() && dn.size() < 200; k++)
            if (auto* d = rt.byAddr(derived[k])) dn.push_back(d->name);
        setProp(ctx, o, "derived", strArray(ctx, dn));
        setProp(ctx, o, "chain", strArray(ctx, rt.baseChain(t->addr)));
    }
    return o;
}

JSValue dbg_rttiSearch(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    auto res = rtti().search(toStr(ctx, SE_ARG(0)), (size_t)toI64(ctx, SE_ARG(1), 50));
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto* t : res) JS_SetPropertyUint32(ctx, arr, i++, tiToJs(ctx, t, false));
    return arr;
}

JSValue dbg_rttiInfo(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    auto* t = rtti().find(toStr(ctx, SE_ARG(0)));
    return t ? tiToJs(ctx, t, true) : JS_NULL;
}

JSValue dbg_vfuncs(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    uintptr_t vptr = 0;
    uint32_t slots = 0;
    if (JS_IsString(SE_ARG(0))) {
        auto* t = rtti().find(toStr(ctx, argv[0]));
        if (!t) return JS_NULL;
        auto* v = rtti().primaryVtable(t->addr);
        if (!v) return JS_NULL;
        vptr = v->addressPoint();
        slots = v->slots;
    } else {
        vptr = toAddr(ctx, SE_ARG(0));
        auto* v = rtti().vtableAt(vptr);
        slots = v ? v->slots : 64;
    }
    std::vector<uintptr_t> fns(slots);
    mem::readPartial(vptr, fns.data(), slots * 8);
    std::vector<double> out;
    for (auto f : fns) out.push_back((double)f);
    return numArray(ctx, out);
}

JSValue dbg_findInstances(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    auto* t = rtti().find(toStr(ctx, SE_ARG(0)));
    if (!t) return JS_ThrowTypeError(ctx, "unknown class");
    bool derived = argc < 2 || toBool(ctx, argv[1]);
    size_t limit = (size_t)toI64(ctx, SE_ARG(2), 1000);
    std::vector<uintptr_t> tis = derived ? rtti().withDerived(t->addr) : std::vector<uintptr_t>{t->addr};
    std::vector<uint64_t> vptrs;
    for (auto ti : tis)
        for (auto* v : rtti().vtablesOf(ti))
            if (v->offsetToTop == 0) vptrs.push_back(v->addressPoint());
    heap::ScanOptions opt;
    opt.maxHits = limit;
    auto hits = heap::scanValues(std::move(vptrs), opt);
    // drop stale copies: the object must still classify as one of the requested classes
    std::unordered_set<uintptr_t> wanted(tis.begin(), tis.end());
    std::vector<double> out;
    for (auto h : hits) {
        Rtti::Classified c;
        if (!rtti().classify(h, c) || c.object != h || !wanted.count(c.ti->addr)) continue;
        // actors must have a plausible EntityContext (any registry: server-side actors of a
        // singleplayer world are legitimate results too)
        if (G().offsets().registryPtr > 0 && rtti().derivesFrom(c.ti->addr, "Actor") &&
            !mem::isPlausibleHeapPtr(mem::readPtr(h + G().offsets().registryPtr)))
            continue;
        out.push_back((double)h);
    }
    return numArray(ctx, out);
}

JSValue dbg_findValue(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    uint64_t v = 0;
    if (JS_IsBigInt(SE_ARG(0))) JS_ToBigUint64(ctx, &v, argv[0]);
    else v = (uint64_t)toAddr(ctx, SE_ARG(0));
    heap::ScanOptions opt;
    opt.maxHits = (size_t)toI64(ctx, SE_ARG(1), 1000);
    auto hits = heap::scanValues({v}, opt);
    std::vector<double> out;
    for (auto h : hits) out.push_back((double)h);
    return numArray(ctx, out);
}

JSValue dbg_findString(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    heap::ScanOptions opt;
    opt.maxHits = (size_t)toI64(ctx, SE_ARG(1), 1000);
    auto hits = heap::scanBytes(toStr(ctx, SE_ARG(0)), opt);
    std::vector<double> out;
    for (auto h : hits) out.push_back((double)h);
    return numArray(ctx, out);
}

JSValue dbg_findU32(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    uint32_t v = (uint32_t)(uint64_t)toI64(ctx, SE_ARG(0), 0);
    heap::ScanOptions opt;
    opt.maxHits = (size_t)toI64(ctx, SE_ARG(1), 1000);
    auto hits = heap::scanU32(v, opt);
    std::vector<double> out;
    for (auto h : hits) out.push_back((double)h);
    return numArray(ctx, out);
}

JSValue dbg_findBytes(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    size_t n = 0;
    uint8_t* p = JS_GetUint8Array(ctx, &n, SE_ARG(0));
    if (!p) {
        JS_FreeValue(ctx, JS_GetException(ctx));
        p = JS_GetArrayBuffer(ctx, &n, SE_ARG(0));
    }
    if (!p) return JS_ThrowTypeError(ctx, "Uint8Array or ArrayBuffer expected");
    if (n == 0 || n > 4096) return JS_ThrowRangeError(ctx, "pattern must be 1..4096 bytes");
    std::string needle((const char*)p, n);
    heap::ScanOptions opt;
    opt.maxHits = (size_t)toI64(ctx, SE_ARG(1), 1000);
    auto hits = heap::scanBytes(needle, opt);
    std::vector<double> out;
    for (auto h : hits) out.push_back((double)h);
    return numArray(ctx, out);
}

// What is at this address? ECS component, polymorphic object, module section, region.
JSValue dbg_whereIs(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    uintptr_t a = toAddr(ctx, SE_ARG(0));
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "address", fromAddr(ctx, a));
    auto list = mem::regions(false);
    if (const mem::Region* r = mem::findRegion(*list, a)) {
        std::string perms = std::string(r->r ? "r" : "-") + (r->w ? "w" : "-") + (r->x ? "x" : "-") + (r->priv ? "p" : "s");
        JSValue ro = JS_NewObject(ctx);
        setProp(ctx, ro, "start", fromAddr(ctx, r->start));
        setProp(ctx, ro, "end", fromAddr(ctx, r->end));
        setProp(ctx, ro, "perms", newStr(ctx, perms));
        setProp(ctx, ro, "path", newStr(ctx, r->path));
        setProp(ctx, o, "region", ro);
    }
    std::string err;
    if (ensureRtti(&err)) {
        const Module& m = rtti().module();
        if (m.inModule(a)) {
            std::string sect = m.inExec(a) ? "code" : m.inRodata(a) ? "rodata" : m.inRelro(a) ? "relro" : "data";
            setProp(ctx, o, "module", newStr(ctx, strprintf("libminecraftpe.so+0x%llx (%s)",
                                                             (unsigned long long)(a - m.base), sect.c_str())));
        }
        // nearest polymorphic object at or before the address (heuristic for heap objects)
        size_t back = (size_t)toI64(ctx, SE_ARG(1), 0x1000) & ~(size_t)7;
        if (back > 0x10000) back = 0x10000;
        uintptr_t start = a & ~(uintptr_t)7;
        if (start > back + 0x10000) {
            std::vector<uintptr_t> win(back / 8 + 1, 0);
            size_t got = mem::readPartial(start - back, win.data(), win.size() * 8);
            if (got < win.size() * 8) {
                // the window starts in unmapped memory: read word by word
                for (size_t i = 0; i < win.size(); i++) mem::read(start - back + i * 8, win[i]);
            }
            for (size_t i = win.size(); i-- > 0;) {
                if (!rtti().isVptr(win[i])) continue;
                Rtti::Classified c;
                if (rtti().classify(start - back + i * 8, c)) {
                    JSValue oo = classifyToJs(ctx, c);
                    setProp(ctx, oo, "offset", JS_NewFloat64(ctx, (double)((intptr_t)a - (intptr_t)c.object)));
                    setProp(ctx, o, "nearestObject", oo);
                    break;
                }
            }
        }
    }
    if (G().quickValid()) {
        ecs::Registry::Location loc;
        if (G().registry().locate(a, loc)) {
            JSValue eo = JS_NewObject(ctx);
            setProp(ctx, eo, "component", newStr(ctx, loc.storage->component));
            setProp(ctx, eo, "entity", JS_NewFloat64(ctx, loc.entity));
            setProp(ctx, eo, "index", JS_NewFloat64(ctx, (double)loc.index));
            setProp(ctx, eo, "componentAddress", fromAddr(ctx, loc.component));
            setProp(ctx, eo, "offset", JS_NewInt32(ctx, (int)loc.offset));
            setProp(ctx, eo, "size", JS_NewInt32(ctx, (int)loc.storage->elemSize));
            setProp(ctx, o, "ecs", eo);
        }
    }
    return o;
}

// Struct explorer: interprets every 8-byte word of [addr, addr+len).
JSValue dbg_fields(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    ensureRtti();
    uintptr_t base = toAddr(ctx, SE_ARG(0));
    size_t len = (size_t)toI64(ctx, SE_ARG(1), 256);
    if (len > 0x10000) len = 0x10000;
    std::vector<uint8_t> buf(len);
    size_t got = mem::readPartial(base, buf.data(), len);
    auto& rt = rtti();
    const Module& mod = rt.module();
    JSValue arr = JS_NewArray(ctx);
    uint32_t n = 0;
    for (size_t off = 0; off + 8 <= got; off += 8) {
        uint64_t w;
        memcpy(&w, buf.data() + off, 8);
        std::string kind, info;
        std::string s;
        Rtti::Classified c;
        if (cxx::readHashedString(base + off, s) && !s.empty()) {
            kind = "hashedstring";
            info = "\"" + s + "\"";
        } else if (w && (w & 1) && cxx::readString(base + off, s) && !s.empty()) {
            kind = "string";
            info = "\"" + s + "\"";
        } else if (!(w & 1) && (w & 0xff) >= 2 && cxx::readString(base + off, s) && s.size() >= 2) {
            kind = "string";
            info = "\"" + s + "\"";
        } else if (w == 0) {
            kind = "zero";
        } else if (rt.ready() && rt.vtableAt(w)) {
            auto* vt = rt.vtableAt(w);
            auto* t = rt.byAddr(vt->typeInfo);
            kind = "vptr";
            info = t ? t->name : "?";
            if (vt->offsetToTop) info += strprintf(" (subobject, top %+lld)", (long long)vt->offsetToTop);
        } else if (rt.ready() && mem::isPlausiblePtr(w) && rt.classify(w, c)) {
            kind = "object*";
            info = c.ti->name;
            if (c.object != w) info += strprintf(" (subobject of %s)", hex(c.object).c_str());
        } else if (mod.inExec(w)) {
            kind = "code*";
            info = strprintf("libminecraftpe+%#llx", (unsigned long long)(w - mod.base));
        } else if (mod.inRodata(w)) {
            kind = "rodata*";
            char tmp[48] = {0};
            size_t g = mem::readPartial(w, tmp, 47);
            if (g && looksLikeText(tmp, strnlen(tmp, g))) info = std::string("\"") + tmp + "\"";
        } else if (mem::isPlausiblePtr(w)) {
            kind = mem::isWritableData(w) ? "heap*" : "ptr";
            if (cxx::readString(w, s) && !s.empty()) info = "-> string \"" + s + "\"";
        } else {
            float f[2];
            memcpy(f, &w, 8);
            auto nice = [](float x) { return std::isfinite(x) && (x == 0 || (std::fabs(x) > 1e-6f && std::fabs(x) < 1e8f)); };
            uint32_t lo = (uint32_t)w, hi = (uint32_t)(w >> 32);
            if (nice(f[0]) && nice(f[1]) && (f[0] != 0 || f[1] != 0) && (std::fabs(f[0]) > 1e-3f || std::fabs(f[1]) > 1e-3f) &&
                !(lo < 0x10000 && hi < 0x10000)) {
                kind = "float2";
                info = strprintf("%g, %g", f[0], f[1]);
            } else {
                kind = "int";
                info = strprintf("%lld | u32 %u, %u", (long long)w, lo, hi);
            }
        }
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "offset", JS_NewInt32(ctx, (int)off));
        setProp(ctx, o, "value", newStr(ctx, hex(w)));
        setProp(ctx, o, "kind", newStr(ctx, kind));
        setProp(ctx, o, "info", newStr(ctx, info));
        JS_SetPropertyUint32(ctx, arr, n++, o);
    }
    return arr;
}

JSValue dbg_regions(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string filter = argc > 0 ? toStr(ctx, argv[0]) : "";
    auto list = mem::regions(true);
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& r : *list) {
        if (!filter.empty() && !contains(r.path, filter)) continue;
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "start", fromAddr(ctx, r.start));
        setProp(ctx, o, "end", fromAddr(ctx, r.end));
        std::string perms = std::string(r.r ? "r" : "-") + (r.w ? "w" : "-") + (r.x ? "x" : "-") + (r.priv ? "p" : "s");
        setProp(ctx, o, "perms", newStr(ctx, perms));
        setProp(ctx, o, "path", newStr(ctx, r.path));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue dbg_module(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    if (!needRtti(ctx)) return JS_EXCEPTION;
    auto& m = rtti().module();
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "path", newStr(ctx, m.path));
    setProp(ctx, o, "base", fromAddr(ctx, m.base));
    setProp(ctx, o, "summary", newStr(ctx, m.describe()));
    setProp(ctx, o, "rtti", newStr(ctx, rtti().summary()));
    return o;
}

JSValue dbg_ecs(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    std::string filter = argc > 0 ? toLower(toStr(ctx, argv[0])) : "";
    auto& reg = G().registry();
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& s : reg.storages) {
        if (!filter.empty() && toLower(s.component).find(filter) == std::string::npos) continue;
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "name", newStr(ctx, s.component));
        setProp(ctx, o, "storage", fromAddr(ctx, s.addr));
        setProp(ctx, o, "size", JS_NewInt32(ctx, (int)s.elemSize));
        setProp(ctx, o, "sizeKnown", JS_NewBool(ctx, s.sizeKnown));
        setProp(ctx, o, "tag", JS_NewBool(ctx, s.empty));
        setProp(ctx, o, "count", JS_NewFloat64(ctx, (double)reg.size(s)));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue dbg_ecsEntities(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    auto* s = G().registry().find(toStr(ctx, SE_ARG(0)));
    if (!s) return JS_NULL;
    std::vector<double> out;
    for (auto e : G().registry().entities(*s, (size_t)toI64(ctx, SE_ARG(1), 100000))) out.push_back(e);
    return numArray(ctx, out);
}

JSValue dbg_ecsGet(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    uint32_t e = (uint32_t)toI64(ctx, SE_ARG(0), 0);
    return fromAddr(ctx, G().registry().get(toStr(ctx, SE_ARG(1)), e));
}

JSValue dbg_ecsSetSize(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    if (!needWorld(ctx)) return JS_EXCEPTION;
    G().registry().setElemSize(toStr(ctx, SE_ARG(0)), (uint32_t)toI64(ctx, SE_ARG(1), 0));
    return JS_UNDEFINED;
}

JSValue dbg_backend(JSContext* ctx, JSValueConst, int, JSValueConst*) { return newStr(ctx, mem::backendName()); }

JSValue dbg_log(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    return strArray(ctx, logTail((size_t)toI64(ctx, SE_ARG(0), 50)));
}
}  // namespace

void onWorldDiscovered() {
    if (config().tickHook != "auto" || tick::installed() || session::safeMode()) return;
    bool expected = false;
    if (!g_tickHookAttempted.compare_exchange_strong(expected, true)) return;
    uintptr_t lp = G().localPlayer();
    uintptr_t vptr = mem::readPtr(lp);
    auto* vt = rtti().vtableAt(vptr);
    if (!vt) return;
    uint32_t slots = vt->slots;
    g_tickHookBusy = true;
    std::thread([vptr, slots, lp] {
      try {
        sleepMs(300);
        std::string report;
        if (config().tickHookSlot >= 0) {
            bool ok = tick::installOnSlot(vptr, config().tickHookSlot);
            report = strprintf("tick hook on configured slot %d: %s", config().tickHookSlot, ok ? "ok" : "failed");
        } else {
            auto r = tick::installOnVtable(vptr, slots, (unsigned)config().tickSampleMs, tick::renderThread(), lp);
            report = "tick hook: " + r.report;
        }
        SE_LOGI("%s", report.c_str());
        consolePrint(1, report);
        std::lock_guard<std::mutex> lk(g_tickReportMu);
        g_tickReport = report;
      } catch (...) {
        SE_LOGE("tick hook installation failed with an exception");
      }
      g_tickHookBusy = false;
    }).detach();
}

void registerGameBindings(JSContext* ctx, JSValueConst o) {
    setFn(ctx, o, "ensure", mc_ensure, 1);
    setFn(ctx, o, "status", mc_status, 0);
    setFn(ctx, o, "actors", mc_actors, 1);
    setFn(ctx, o, "localPlayer", mc_localPlayer, 0);
    setFn(ctx, o, "valid", mc_valid, 2);
    setFn(ctx, o, "cls", mc_cls, 1);
    setFn(ctx, o, "isPlayer", mc_isPlayer, 2);
    setFn(ctx, o, "isLocal", mc_isLocal, 1);
    setFn(ctx, o, "pos", mc_pos, 2);
    setFn(ctx, o, "rot", mc_rot, 2);
    setFn(ctx, o, "aabb", mc_aabb, 2);
    setFn(ctx, o, "typeId", mc_typeId, 2);
    setFn(ctx, o, "uniqueId", mc_uniqueId, 2);
    setFn(ctx, o, "runtimeId", mc_runtimeId, 2);
    setFn(ctx, o, "dim", mc_dim, 2);
    setFn(ctx, o, "gameMode", mc_gameMode, 2);
    setFn(ctx, o, "actorType", mc_actorType, 2);
    setFn(ctx, o, "nameTag", mc_nameTag, 2);
    setFn(ctx, o, "playerName", mc_playerName, 2);
    setFn(ctx, o, "flags", mc_flags, 2);
    setFn(ctx, o, "hasComp", mc_hasComp, 3);
    setFn(ctx, o, "comp", mc_comp, 3);
    setFn(ctx, o, "comps", mc_comps, 2);
    setFn(ctx, o, "attributes", mc_attributes, 2);
    setFn(ctx, o, "synched", mc_synched, 2);
    setFn(ctx, o, "equipment", mc_equipment, 2);
    setFn(ctx, o, "inventory", mc_inventory, 2);
    setFn(ctx, o, "container", mc_container, 1);
    setFn(ctx, o, "playerList", mc_playerList, 0);
    setFn(ctx, o, "level", mc_level, 0);
    setFn(ctx, o, "scoreboard", mc_scoreboard, 0);
    setFn(ctx, o, "offsets", mc_offsets, 0);
    setFn(ctx, o, "rescan", mc_rescan, 0);
    setFn(ctx, o, "tickInfo", mc_tickInfo, 0);
    setFn(ctx, o, "installTickHook", mc_installTickHook, 0);
    setFn(ctx, o, "dimensionName", mc_dimensionName, 1);
    setFn(ctx, o, "getBlock", mc_getBlock, 3);
}

void registerDebugBindings(JSContext* ctx, JSValueConst o) {
    setFn(ctx, o, "read", dbg_read, 2);
    setFn(ctx, o, "u8", dbg_u8, 1);
    setFn(ctx, o, "i8", dbg_i8, 1);
    setFn(ctx, o, "u16", dbg_u16, 1);
    setFn(ctx, o, "i16", dbg_i16, 1);
    setFn(ctx, o, "u32", dbg_u32, 1);
    setFn(ctx, o, "i32", dbg_i32, 1);
    setFn(ctx, o, "u64", dbg_u64, 1);
    setFn(ctx, o, "i64", dbg_i64, 1);
    setFn(ctx, o, "f32", dbg_f32, 1);
    setFn(ctx, o, "f64", dbg_f64, 1);
    setFn(ctx, o, "ptr", dbg_ptr, 1);
    setFn(ctx, o, "str", dbg_str, 1);
    setFn(ctx, o, "hstr", dbg_hstr, 1);
    setFn(ctx, o, "cstr", dbg_cstr, 2);
    setFn(ctx, o, "hexdump", dbg_hexdump, 2);
    setFn(ctx, o, "classify", dbg_classify, 1);
    setFn(ctx, o, "rttiSearch", dbg_rttiSearch, 2);
    setFn(ctx, o, "rttiInfo", dbg_rttiInfo, 1);
    setFn(ctx, o, "vfuncs", dbg_vfuncs, 1);
    setFn(ctx, o, "findInstances", dbg_findInstances, 3);
    setFn(ctx, o, "findValue", dbg_findValue, 2);
    setFn(ctx, o, "findString", dbg_findString, 2);
    setFn(ctx, o, "findU32", dbg_findU32, 2);
    setFn(ctx, o, "findBytes", dbg_findBytes, 2);
    setFn(ctx, o, "whereIs", dbg_whereIs, 2);
    setFn(ctx, o, "fields", dbg_fields, 2);
    setFn(ctx, o, "regions", dbg_regions, 1);
    setFn(ctx, o, "module", dbg_module, 0);
    setFn(ctx, o, "ecs", dbg_ecs, 1);
    setFn(ctx, o, "ecsEntities", dbg_ecsEntities, 2);
    setFn(ctx, o, "ecsGet", dbg_ecsGet, 2);
    setFn(ctx, o, "ecsSetSize", dbg_ecsSetSize, 2);
    setFn(ctx, o, "backend", dbg_backend, 0);
    setFn(ctx, o, "log", dbg_log, 1);
}

}  // namespace se::js

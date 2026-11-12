// マルチワールドの中核
//  - ワールド一覧（バニラ3次元 + MoreDimensions のカスタム次元）とルール
//  - /dim メニュー、移動（最後の位置 / スポーン + 着地処理）、入場制限（閉鎖・OP専用・許可リスト・人数上限）
//  - ワールド切り替えの検出（/dim・ポータル・ネザーゲート・/tpdim・死亡すべて）→ 持ち物グループ・ゲームモード・
//    時間固定・入退場タイトル/コマンド
//  - ワールドボーダー、ポータル（範囲に入ると移動）、ワープ、ロビー(hub)
//  - 建築保護・PvP・モブスポーン・延焼・ワールド別 keepInventory / リスポーン・ワールド別チャット
#include "levikit/Common.h"

#include "ll/api/command/CommandRegistrar.h"
#include "ll/api/command/EnumName.h"
#include "ll/api/form/SimpleForm.h"
#include "ll/api/io/Logger.h"
#include "ll/api/service/Bedrock.h"
#include "ll/api/thread/ServerThreadExecutor.h"

#include "mc/deps/core/math/Vec2.h"
#include "mc/network/packet/SetTimePacket.h"
#include "mc/network/packet/cerealize/core/SerializationMode.h"
#include "mc/platform/UUID.h"
#include "mc/world/actor/ActorDamageSource.h"
#include "mc/world/actor/ActorType.h"
#include "mc/world/actor/player/Player.h"
#include "mc/world/level/BlockPos.h"
#include "mc/world/level/BlockSource.h"
#include "mc/world/level/block/Block.h"
#include "mc/world/level/Level.h"
#include "mc/world/level/dimension/VanillaDimensions.h"

#include <algorithm>
#include <cmath>
#include <set>

namespace levikit {

namespace {

std::vector<RegisteredDim> gRegistered;
std::vector<World>         gWorlds;

struct LastPos {
    Vec3 pos;
    int  epoch = 0;
};
// uuid -> (dimId -> pos)
std::unordered_map<std::string, std::unordered_map<int, LastPos>> gLastPos;
// uuid -> 現在適用中の持ち物グループ
std::unordered_map<std::string, std::string> gCurrentGroup;
// uuid -> 最後にログアウトしたディメンションとその時の epoch
std::unordered_map<std::string, std::pair<int, int>> gLogout;
// 一度でも参加したことがある uuid（hub firstJoin 用）
std::set<std::string> gKnown;
bool                  gDirty = false;

struct Track {
    int               dim = 0;
    Vec3              good{};
    Clock::time_point suppressUntil{};
    std::string       inPortal;
    Clock::time_point portalCooldown{};
    Clock::time_point lastWarn{};
};
std::unordered_map<std::string, Track> gTrack;

// 死亡時に保持した持ち物（keepInventory ワールド）
std::unordered_map<std::string, Json> gDeathKeep;
// uuid -> 死亡したディメンション
std::unordered_map<std::string, int> gDiedIn;
// リスポーン直後（ディメンション移動が落ち着くまで待ってから処理する）
std::unordered_map<std::string, Clock::time_point> gPendingRespawn;

struct Selection {
    bool has1 = false, has2 = false;
    int  dim1 = 0, dim2 = 0;
    int  x1 = 0, y1 = 0, z1 = 0, x2 = 0, y2 = 0, z2 = 0;
};
std::unordered_map<std::string, Selection> gSel;

std::vector<std::string> gWarpEnumValues;

struct BackPoint {
    int  dim;
    Vec3 pos;
};
std::unordered_map<std::string, BackPoint> gBack;

struct TpaRequest {
    mce::UUID         from;
    Clock::time_point expires;
};
std::unordered_map<std::string, TpaRequest> gTpa; // 受け手 uuid -> 依頼

std::filesystem::path positionsPath() { return worldData() / u8"positions.json"; }
std::filesystem::path groupsPath() { return worldData() / u8"inventory_groups.json"; }
std::filesystem::path logoutPath() { return worldData() / u8"logout.json"; }
std::filesystem::path knownPath() { return worldData() / u8"known_players.json"; }
std::filesystem::path deathKeepPath(std::string const& uuid) {
    return worldData() / u8"deathkeep" / std::filesystem::path(uuid + ".json");
}

int dimOf(Player const& p) { return static_cast<int>(p.getDimensionId()); }

std::string uuidOf(Player const& p) { return p.getUuid().asString(); }

void later(std::chrono::milliseconds delay, mce::UUID uuid, std::function<void(Player&)> fn) {
    ll::thread::ServerThreadExecutor::getDefault().executeAfter(
        [uuid, fn = std::move(fn)]() {
            auto level = ll::service::getLevel();
            if (!level) return;
            if (auto* p = level->getPlayer(uuid)) fn(*p);
        },
        delay
    );
}

std::string resolveLanding(World const& w) {
    if (w.landing != "auto") return w.landing;
    int id = static_cast<int>(w.id);
    if (id == 0) return "surface";
    if (id == 1) return "platform";
    if (id == 2) return "fixed";
    if (w.generator == "Overworld") return "surface";
    if (w.generator == "Flat") return "fixed";
    return "platform";
}

int epochOf(World const& w) { return w.custom ? resetEpoch(w.key) : 0; }

void setLastPos(std::string const& uuid, int dim, Vec3 const& pos) {
    auto* w                 = worldById(dim);
    gLastPos[uuid][dim]     = LastPos{pos, w ? epochOf(*w) : 0};
    gDirty                  = true;
}

std::optional<Vec3> getLastPos(std::string const& uuid, World const& w) {
    auto it = gLastPos.find(uuid);
    if (it == gLastPos.end()) return std::nullopt;
    auto jt = it->second.find(static_cast<int>(w.id));
    if (jt == it->second.end() || jt->second.epoch != epochOf(w)) return std::nullopt;
    return jt->second.pos;
}

void sendTime(Player& p, int time) {
    SetTimePacket pkt;
    pkt.mSerializationMode = SerializationMode::SideBySideLogOnMismatch;
    pkt.mTime              = time;
    pkt.sendTo(p);
}

void applyGameMode(Player& p, std::string const& mode) {
    if (mode.empty()) return;
    if (mode != "survival" && mode != "creative" && mode != "adventure" && mode != "spectator") return;
    runCommand(fmt::format("gamemode {} {}", mode, quoteName(p.getRealName())));
}

void runWorldCommands(Player& p, std::vector<std::string> const& cmds) {
    auto q = quoteName(p.getRealName());
    for (auto const& c : cmds) {
        if (c.empty()) continue;
        auto cmd = replaceAll(c, "{player}", q);
        if (!cmd.empty() && cmd[0] == '/') cmd.erase(0, 1);
        runCommand(cmd);
    }
}

void switchInventoryGroup(Player& p, std::string const& from, std::string const& to) {
    auto uuid = uuidOf(p);
    writeJson(inventoryPath(uuid, from), snapshotInventory(p));
    Json next = Json::object();
    if (auto j = readJson(inventoryPath(uuid, to))) next = *j;
    applyInventory(p, next);
    gCurrentGroup[uuid] = to;
    gDirty              = true;
    p.sendMessage(fmt::format("§7[LeviKit] 持ち物を「{}」に切り替えました", to));
    emitMachine("INV_SWITCH", {{"player", p.getRealName()}, {"from", from}, {"to", to}});
}

std::string groupFor(World const* w) {
    if (!w || w->rules.inventoryGroup.empty()) return "default";
    return w->rules.inventoryGroup;
}

void syncGroup(Player& p, World const* w) {
    if (!cfg().separateInventories) return;
    auto uuid = uuidOf(p);
    auto want = groupFor(w);
    auto cur  = gCurrentGroup.find(uuid);
    if (cur == gCurrentGroup.end()) {
        // 初回: 今の持ち物をこのグループのものとして扱う
        gCurrentGroup[uuid] = want;
        gDirty              = true;
    } else if (cur->second != want) {
        switchInventoryGroup(p, cur->second, want);
    }
}

/// ワールドが変わったときの処理
void onWorldChanged(Player& p, World const* from, World const* to) {
    syncGroup(p, to);
    if (from) runWorldCommands(p, from->rules.leaveCommands);

    // ゲームモード
    if (to && !to->rules.gameMode.empty()) applyGameMode(p, to->rules.gameMode);
    else if (from && !from->rules.gameMode.empty()) applyGameMode(p, cfg().defaultGameMode);

    // 時間固定（見た目）
    if (to && to->rules.timeLock >= 0) sendTime(p, to->rules.timeLock);
    else if (from && from->rules.timeLock >= 0) {
        if (auto level = ll::service::getLevel()) sendTime(p, level->getTime());
    }

    if (to) {
        title(p, to->rules.enterTitle, to->rules.enterSubtitle);
        runWorldCommands(p, to->rules.enterCommands);
    }
    emitMachine("WORLD_CHANGE", {{"player", p.getRealName()}, {"from", from ? from->key : ""}, {"to", to ? to->key : ""}});
}

/// 境界の外に出ていたら押し戻す。押し戻したら true
bool enforceBorder(Player& p, World const& w, Vec3 const& pos, Track& t) {
    int r = w.rules.borderRadius;
    if (r <= 0) return false;
    double cx = w.rules.borderCenterOnSpawn ? w.spawn.x : w.rules.borderCenterX;
    double cz = w.rules.borderCenterOnSpawn ? w.spawn.z : w.rules.borderCenterZ;
    double dx = pos.x - cx;
    double dz = pos.z - cz;
    auto   now = Clock::now();
    if (std::abs(dx) <= r && std::abs(dz) <= r) {
        if ((r - std::abs(dx) < 8 || r - std::abs(dz) < 8) && now - t.lastWarn > std::chrono::seconds(3)) {
            t.lastWarn = now;
            actionbar(p, "§eワールドの境界に近づいています");
        }
        return false;
    }
    double lim = std::max(1.0, r - 2.0);
    Vec3   back{static_cast<float>(cx + std::clamp(dx, -lim, lim)), pos.y, static_cast<float>(cz + std::clamp(dz, -lim, lim))};
    p.teleport(back, w.id);
    actionbar(p, fmt::format("§cここがワールドの境界です（半径 {}）", r));
    return true;
}

bool inside(Portal const& pt, int x, int y, int z) {
    return x >= std::min(pt.x1, pt.x2) && x <= std::max(pt.x1, pt.x2) && y >= std::min(pt.y1, pt.y2)
        && y <= std::max(pt.y1, pt.y2) && z >= std::min(pt.z1, pt.z2) && z <= std::max(pt.z1, pt.z2);
}

void checkPortals(Player& p, World const& w, Vec3 const& pos, Track& t) {
    int           bx = static_cast<int>(std::floor(pos.x));
    int           by = static_cast<int>(std::floor(pos.y));
    int           bz = static_cast<int>(std::floor(pos.z));
    Portal const* hit = nullptr;
    for (auto const& pt : cfg().portals) {
        if (pt.enabled && pt.world == w.key && inside(pt, bx, by, bz)) {
            hit = &pt;
            break;
        }
    }
    if (!hit) {
        t.inPortal.clear();
        return;
    }
    if (t.inPortal == hit->name) return; // 入ったまま（到着直後も含む）
    t.inPortal = hit->name;
    auto now   = Clock::now();
    if (now < t.portalCooldown) return;
    t.portalCooldown = now + std::chrono::seconds(3);
    if (!hit->message.empty()) p.sendMessage(hit->message);
    if (!teleportToTarget(p, hit->target)) p.sendMessage("§c[LeviKit] ポータルの行き先が見つかりません: " + hit->target);
}

std::optional<std::pair<World const*, Vec3>> spawnTarget(World const& w) {
    return std::make_pair(&w, Vec3{static_cast<float>(w.spawn.x), static_cast<float>(w.spawn.y), static_cast<float>(w.spawn.z)});
}

void teleportToPoint(Player& p, World const& w, SpawnPoint spawn);

void teleportToSpawn(Player& p, World const& w) { teleportToPoint(p, w, w.spawn); }

/// w の (spawn.x, spawn.y, spawn.z) へ移動し、ワールドの着地のしかたで安全に降ろす
void teleportToPoint(Player& p, World const& w, SpawnPoint spawn) {
    std::string name = p.getRealName();
    Vec3        pos{static_cast<float>(spawn.x), static_cast<float>(spawn.y), static_cast<float>(spawn.z)};
    p.teleport(pos, w.id);
    auto landing = resolveLanding(w);
    if (landing != "fixed") {
        // 着地処理が終わるまで落下死しないように
        runCommand(fmt::format("effect {} slow_falling 15 0 true", quoteName(name)));
    }
    auto dimId  = static_cast<int>(w.id);
    // 天井のある次元（ネザー型）では天井の上に着地しないよう高さの上限を付ける
    bool roof = dimId == 1 || (w.custom && w.generator == "Nether");
    // チャンクがロードされるのを待ってから着地処理
    // ※ カスタム次元の名前を "execute in" に渡さず、プレイヤー自身の次元（at @s）で実行する
    later(std::chrono::milliseconds(1500), p.getUuid(), [dimId, spawn, landing, name, roof](Player& pl) {
        if (dimOf(pl) != dimId) return;
        auto q = quoteName(name);
        if (landing == "surface") {
            runCommand(fmt::format("execute as {} at @s run spreadplayers ~ ~ 0 1 @s{}", q, roof ? " 110" : ""));
        } else if (landing == "platform") {
            int x = static_cast<int>(std::floor(spawn.x));
            int y = static_cast<int>(std::floor(spawn.y));
            int z = static_cast<int>(std::floor(spawn.z));
            runCommand(fmt::format("execute as {} at @s run fill {} {} {} {} {} {} air", q, x - 1, y, z - 1, x + 1, y + 2, z + 1));
            runCommand(fmt::format("execute as {} at @s run fill {} {} {} {} {} {} glass", q, x - 2, y - 1, z - 2, x + 2, y - 1, z + 2));
            runCommand(fmt::format("tp {} {} {} {}", q, fmtNum(spawn.x), fmtNum(spawn.y), fmtNum(spawn.z)));
        }
        runCommand(fmt::format("effect {} slow_falling 0", q));
    });
}

/// リスポーン後の処理（keepInventory の復元・ワールドで復活・持ち物グループ）
/// 死亡 → リスポーンでディメンションが変わる場合、グループの切り替えと持ち物の復元の順番を確定させる
void processRespawn(Player& p, Track& t) {
    auto uuid = uuidOf(p);
    int  R    = dimOf(p);
    int  D    = t.dim;
    if (auto died = gDiedIn.find(uuid); died != gDiedIn.end()) {
        D = died->second;
        gDiedIn.erase(died);
    }
    auto*               wD = worldById(D);
    auto*               wR = worldById(R);
    std::optional<Json> keep;
    if (auto k = gDeathKeep.find(uuid); k != gDeathKeep.end()) {
        keep = k->second;
        gDeathKeep.erase(k);
        std::error_code ec;
        std::filesystem::remove(deathKeepPath(uuid), ec);
    }
    // 死亡地点には戻さない
    if (auto lp = gLastPos.find(uuid); lp != gLastPos.end()) lp->second.erase(D);

    if (wD && wD->rules.respawnInWorld && R != D) {
        // まだ死亡したワールドのグループのまま → そのまま復元してワールドへ戻す
        if (keep) applyInventory(p, *keep);
        t.dim           = D;
        t.suppressUntil = Clock::now() + std::chrono::seconds(5);
        teleportToSpawn(p, *wD);
        if (keep) p.sendMessage("§7[LeviKit] このワールドでは持ち物が保持されます");
        return;
    }
    if (R != D && cfg().separateInventories && groupFor(wD) != groupFor(wR)) {
        // 保持した持ち物は「死亡したワールドのグループ」のものとして保存し、復活先のグループを読み込む
        auto from = groupFor(wD);
        auto to   = groupFor(wR);
        writeJson(inventoryPath(uuid, from), keep ? *keep : snapshotInventory(p));
        Json next = Json::object();
        if (auto j = readJson(inventoryPath(uuid, to))) next = *j;
        applyInventory(p, next);
        gCurrentGroup[uuid] = to;
        gDirty              = true;
        if (keep) p.sendMessage(fmt::format("§7[LeviKit] 持ち物は「{}」に保持されています", from));
    } else if (keep) {
        applyInventory(p, *keep);
        p.sendMessage("§7[LeviKit] このワールドでは持ち物が保持されます");
    }
    if (R != D) {
        t.dim = R;
        onWorldChanged(p, wD, wR);
    }
    t.good = p.getFeetPos();
}

const std::set<std::string> kHostile{
    "minecraft:zombie",       "minecraft:husk",          "minecraft:drowned",       "minecraft:zombie_villager_v2",
    "minecraft:skeleton",     "minecraft:stray",         "minecraft:bogged",        "minecraft:creeper",
    "minecraft:spider",       "minecraft:cave_spider",   "minecraft:enderman",      "minecraft:witch",
    "minecraft:slime",        "minecraft:magma_cube",    "minecraft:phantom",       "minecraft:pillager",
    "minecraft:vindicator",   "minecraft:evocation_illager", "minecraft:ravager",   "minecraft:vex",
    "minecraft:guardian",     "minecraft:elder_guardian", "minecraft:blaze",        "minecraft:ghast",
    "minecraft:wither_skeleton", "minecraft:piglin_brute", "minecraft:hoglin",      "minecraft:zoglin",
    "minecraft:shulker",      "minecraft:endermite",     "minecraft:silverfish",    "minecraft:breeze",
    "minecraft:creaking",     "minecraft:warden",        "minecraft:zombie_pigman",
};

} // namespace

// ================= registry =================

std::vector<RegisteredDim>& registeredDims() { return gRegistered; }

void rebuildWorlds() {
    gWorlds.clear();
    auto& c    = cfg();
    auto  addV = [&](VanillaEntry const& v, DimensionType id, char const* key) {
        gWorlds.push_back(World{id, key, v.displayName, v.description, v.icon, v.spawn, v.landing, v.rules, "", false, v.show});
    };
    addV(c.overworld, VanillaDimensions::Overworld(), "overworld");
    addV(c.nether, VanillaDimensions::Nether(), "nether");
    addV(c.theEnd, VanillaDimensions::TheEnd(), "the_end");
    for (auto const& r : gRegistered) {
        auto it = std::find_if(c.dimensions.begin(), c.dimensions.end(), [&](DimensionEntry const& e) { return e.name == r.name; });
        if (it == c.dimensions.end()) {
            // 設定から外されたが今回の起動では登録済み: 非表示・閉鎖扱い
            WorldRules closed{};
            closed.open = false;
            gWorlds.push_back(World{r.id, r.name, r.name, "", "", SpawnPoint{}, "auto", closed, "Overworld", true, false});
            continue;
        }
        gWorlds.push_back(World{r.id, r.name, it->displayName.empty() ? r.name : it->displayName, it->description, it->icon,
                                it->spawn, it->landing, it->rules, it->generator, true, it->enabled});
    }
}

std::vector<World> const& worlds() { return gWorlds; }

World const* worldById(int id) {
    for (auto const& w : gWorlds) {
        if (static_cast<int>(w.id) == id) return &w;
    }
    return nullptr;
}

World const* worldByKey(std::string const& key) {
    for (auto const& w : gWorlds) {
        if (w.key == key) return &w;
    }
    return nullptr;
}

int playersIn(int dimId, Player const* except) {
    auto level = ll::service::getLevel();
    if (!level) return 0;
    int n = 0;
    level->forEachPlayer([&](Player& p) {
        if (!p.isSimulatedPlayer() && &p != except && dimOf(p) == dimId) ++n;
        return true;
    });
    return n;
}

// ================= state =================

void loadWorldState() {
    gLastPos.clear();
    gCurrentGroup.clear();
    gLogout.clear();
    gKnown.clear();
    if (auto j = readJson(positionsPath())) {
        for (auto& [uuid, dims] : j->items()) {
            for (auto& [dim, pos] : dims.items()) {
                if (!pos.is_array() || pos.size() < 3) continue;
                int epoch = pos.size() >= 4 ? pos[3].get<int>() : 0;
                gLastPos[uuid][std::stoi(dim)] = LastPos{Vec3{pos[0].get<float>(), pos[1].get<float>(), pos[2].get<float>()}, epoch};
            }
        }
    }
    if (auto j = readJson(groupsPath())) {
        for (auto& [uuid, g] : j->items()) {
            if (g.is_string()) gCurrentGroup[uuid] = g.get<std::string>();
        }
    }
    if (auto j = readJson(logoutPath())) {
        for (auto& [uuid, v] : j->items()) {
            if (v.is_array() && v.size() == 2) gLogout[uuid] = {v[0].get<int>(), v[1].get<int>()};
        }
    }
    if (auto j = readJson(knownPath()); j && j->is_array()) {
        for (auto& u : *j) gKnown.insert(u.get<std::string>());
    }
}

void saveWorldState() {
    if (!gDirty) return;
    Json pos = Json::object();
    for (auto& [uuid, dims] : gLastPos) {
        auto& d = pos[uuid];
        for (auto& [dim, lp] : dims) d[std::to_string(dim)] = {lp.pos.x, lp.pos.y, lp.pos.z, lp.epoch};
    }
    writeJson(positionsPath(), pos);
    Json groups = Json::object();
    for (auto& [uuid, g] : gCurrentGroup) groups[uuid] = g;
    writeJson(groupsPath(), groups);
    Json logout = Json::object();
    for (auto& [uuid, v] : gLogout) logout[uuid] = {v.first, v.second};
    writeJson(logoutPath(), logout);
    writeJson(knownPath(), Json(gKnown));
    gDirty = false;
}

void rememberPosition(Player& p) { setLastPos(uuidOf(p), dimOf(p), p.getFeetPos()); }

// ================= movement =================

std::optional<std::string> enterDenyReason(Player& p, World const& w) {
    if (p.isOperator()) return std::nullopt;
    if (!w.rules.open) return fmt::format("{} は現在閉鎖中です", w.displayName);
    if (w.rules.opOnly) return fmt::format("{} は OP 専用です", w.displayName);
    if (!w.rules.allowedPlayers.empty() && !containsName(w.rules.allowedPlayers, p)) {
        return fmt::format("{} への入場は許可されていません", w.displayName);
    }
    if (w.rules.maxPlayers > 0) {
        int n = playersIn(static_cast<int>(w.id), &p);
        if (n >= w.rules.maxPlayers) return fmt::format("{} は満員です（{}/{}）", w.displayName, n, w.rules.maxPlayers);
    }
    return std::nullopt;
}

void teleportToWorld(Player& p, World const& w, bool useLast, bool checkAccess) {
    if (checkAccess) {
        if (auto deny = enterDenyReason(p, w)) {
            p.sendMessage("§c[LeviKit] " + *deny);
            return;
        }
    }
    bool same = dimOf(p) == static_cast<int>(w.id);
    if (same && useLast) {
        p.sendMessage("§e[LeviKit] すでに " + w.displayName + " にいます");
        return;
    }
    if (!same && cfg().rememberLastPosition) rememberPosition(p);
    setBackPoint(p);
    if (useLast && cfg().rememberLastPosition) {
        if (auto last = getLastPos(uuidOf(p), w)) {
            p.teleport(*last, w.id);
            p.sendMessage("§a[LeviKit] " + w.displayName + " (前回の位置) へ移動しました");
            return;
        }
    }
    teleportToSpawn(p, w);
    p.sendMessage("§a[LeviKit] " + w.displayName + " へ移動しました");
}

bool teleportToWarp(Player& p, std::string const& name) {
    auto const& warps = cfg().warps;
    auto        it    = std::find_if(warps.begin(), warps.end(), [&](Warp const& w) { return w.name == name; });
    if (it == warps.end()) return false;
    if (it->opOnly && !p.isOperator()) {
        p.sendMessage("§c[LeviKit] このワープは OP 専用です");
        return true;
    }
    auto* w = worldByKey(it->world);
    if (!w) {
        p.sendMessage("§c[LeviKit] ワープ先のワールドがありません: " + it->world);
        return true;
    }
    if (dimOf(p) != static_cast<int>(w->id)) {
        if (auto deny = enterDenyReason(p, *w)) {
            p.sendMessage("§c[LeviKit] " + *deny);
            return true;
        }
        if (cfg().rememberLastPosition) rememberPosition(p);
    }
    setBackPoint(p);
    p.teleport(Vec3{static_cast<float>(it->x), static_cast<float>(it->y), static_cast<float>(it->z)}, w->id, Vec2{0.0f, it->yaw});
    p.sendMessage("§a[LeviKit] ワープ: " + it->name);
    return true;
}

bool teleportToTarget(Player& p, std::string const& target) {
    auto starts = [&](char const* pre) { return target.rfind(pre, 0) == 0; };
    if (starts("warp:")) return teleportToWarp(p, target.substr(5));
    if (starts("world:") || starts("last:")) {
        auto* w = worldByKey(target.substr(target.find(':') + 1));
        if (!w) return false;
        teleportToWorld(p, *w, starts("last:"), true);
        return true;
    }
    if (auto* w = worldByKey(target)) {
        teleportToWorld(p, *w, false, true);
        return true;
    }
    return teleportToWarp(p, target);
}

void openWorldMenu(Player& p) {
    ll::form::SimpleForm form{"§lワールド", ""};
    auto                 here = dimOf(p);
    if (auto* cur = worldById(here)) form.setContent("現在地: §a" + cur->displayName);
    std::vector<std::string> keys;
    for (auto const& w : gWorlds) {
        if (!w.show) continue;
        if (w.rules.opOnly && !p.isOperator()) continue;
        int         n     = playersIn(static_cast<int>(w.id));
        std::string label = w.displayName;
        if (static_cast<int>(w.id) == here) label = "§2▶ " + label;
        if (!w.rules.open) label += " §c[閉鎖]";
        else if (w.rules.maxPlayers > 0 && n >= w.rules.maxPlayers) label += " §6[満員]";
        std::string sub = fmt::format("§8{}人", n);
        if (w.rules.maxPlayers > 0) sub = fmt::format("§8{}/{}人", n, w.rules.maxPlayers);
        if (!w.rules.gameMode.empty()) sub += " · " + w.rules.gameMode;
        if (!w.description.empty()) sub += " · " + w.description;
        if (sub.size() > 90) sub = sub.substr(0, 90);
        label += "\n" + sub;
        if (!w.icon.empty()) form.appendButton(label, w.icon, "path");
        else form.appendButton(label);
        keys.push_back(w.key);
    }
    bool hasWarps = std::any_of(cfg().warps.begin(), cfg().warps.end(), [&](Warp const& w) { return !w.opOnly || p.isOperator(); });
    if (hasWarps) {
        form.appendButton("§lワープ一覧\n§8登録された地点へ移動", "textures/items/ender_pearl", "path");
        keys.push_back("__warps");
    }
    form.sendTo(p, [keys](Player& pl, int index, ll::form::FormCancelReason) {
        if (index < 0 || static_cast<size_t>(index) >= keys.size()) return;
        auto const& key = keys[static_cast<size_t>(index)];
        if (key == "__warps") return openWarpMenu(pl);
        if (auto* w = worldByKey(key)) teleportToWorld(pl, *w, true, true);
    });
}

void openWarpMenu(Player& p) {
    ll::form::SimpleForm     form{"§lワープ", "移動先を選んでください"};
    std::vector<std::string> names;
    for (auto const& w : cfg().warps) {
        if (w.opOnly && !p.isOperator()) continue;
        auto*       world = worldByKey(w.world);
        std::string label = w.name + "\n§8" + (world ? world->displayName : w.world);
        if (!w.description.empty()) label += " · " + w.description;
        form.appendButton(label);
        names.push_back(w.name);
    }
    form.sendTo(p, [names](Player& pl, int index, ll::form::FormCancelReason) {
        if (index < 0 || static_cast<size_t>(index) >= names.size()) return;
        teleportToWarp(pl, names[static_cast<size_t>(index)]);
    });
}

void updateWarpEnum() {
    auto& reg  = ll::command::CommandRegistrar::getInstance(false);
    auto  name = std::string{ll::command::enum_name_v<LeviKitWarp>};
    if (!gWarpEnumValues.empty()) reg.removeSoftEnumValues(name, gWarpEnumValues);
    gWarpEnumValues.clear();
    for (auto const& w : cfg().warps) gWarpEnumValues.push_back(w.name);
    if (!gWarpEnumValues.empty()) reg.addSoftEnumValues(name, gWarpEnumValues);
}

// ================= tick =================

void evictFromClosedWorlds() {
    auto level = ll::service::getLevel();
    if (!level || cfg().limboMode) return;
    auto* home = worldByKey("overworld");
    level->forEachPlayer([&](Player& p) {
        if (p.isSimulatedPlayer() || p.isOperator() || p.isDead()) return true;
        auto* w = worldById(dimOf(p));
        if (!w || !home || w == home) return true;
        if (!w->rules.open || w->rules.opOnly || (!w->rules.allowedPlayers.empty() && !containsName(w->rules.allowedPlayers, p))) {
            p.sendMessage("§e[LeviKit] " + w->displayName + " は閉鎖されたため移動しました");
            teleportToWorld(p, *home, true, false);
        }
        return true;
    });
}

/// ネザーゲートで着いた直後か（すぐそば = 周囲 2 ブロック以内にゲートのブロックがある）
bool standingInPortal(Player& p, Vec3 const& pos) {
    auto& bs = p.getDimensionBlockSource();
    int   x0 = static_cast<int>(std::floor(pos.x));
    int   y0 = static_cast<int>(std::floor(pos.y));
    int   z0 = static_cast<int>(std::floor(pos.z));
    for (int dx = -2; dx <= 2; ++dx) {
        for (int dy = -1; dy <= 2; ++dy) {
            for (int dz = -2; dz <= 2; ++dz) {
                if (bs.getBlock(BlockPos{x0 + dx, y0 + dy, z0 + dz}).getTypeName() == "minecraft:portal") return true;
            }
        }
    }
    return false;
}

bool isRoofed(World const& w) { return static_cast<int>(w.id) == 1 || (w.custom && w.generator == "Nether"); }

/// ワールド専用ネザーへの付け替え先（無ければ nullptr）。scale はかける倍率
World const* netherRedirect(World const* from, int toDim, double& scale) {
    if (!from || !from->custom) return nullptr;
    if (toDim == 1 && !from->rules.netherLink.empty()) {
        auto* n = worldByKey(from->rules.netherLink);
        if (n && n != from) {
            scale = 1.0 / 8.0;
            return n;
        }
    }
    if (toDim == 0) {
        for (auto const& w : worlds()) {
            if (w.custom && w.rules.netherLink == from->key && &w != from) {
                scale = 8.0;
                return &w;
            }
        }
    }
    return nullptr;
}

void tickWorlds(uint64_t tick) {
    auto level = ll::service::getLevel();
    if (!level || cfg().limboMode) return;

    if (tick % 10 == 0) {
        auto now = Clock::now();
        level->forEachPlayer([&](Player& p) {
            if (p.isSimulatedPlayer()) return true;
            auto uuid = uuidOf(p);
            int  dim  = dimOf(p);
            auto pos  = p.getFeetPos();
            auto it   = gTrack.find(uuid);
            if (it == gTrack.end()) {
                // 参加直後: 現在のワールドの持ち物グループ・ゲームモード・時間を合わせる
                Track t;
                t.dim  = dim;
                t.good = pos;
                gTrack.emplace(uuid, t);
                auto* w = worldById(dim);
                syncGroup(p, w);
                if (w && !w->rules.gameMode.empty()) applyGameMode(p, w->rules.gameMode);
                if (w && w->rules.timeLock >= 0) sendTime(p, w->rules.timeLock);
                emitMachine("WORLD_CHANGE", {{"player", p.getRealName()}, {"from", ""}, {"to", w ? w->key : ""}});
                return true;
            }
            auto& t = it->second;
            if (p.isDead()) return true;
            if (auto pr = gPendingRespawn.find(uuid); pr != gPendingRespawn.end()) {
                if (now - pr->second < std::chrono::seconds(1)) return true; // ディメンション移動が落ち着くまで待つ
                gPendingRespawn.erase(pr);
                processRespawn(p, t);
                return true;
            }
            if (dim != t.dim) {
                if (now < t.suppressUntil) return true; // 移動処理中
                auto* from = worldById(t.dim);
                double scale = 1.0;
                if (auto* linked = netherRedirect(from, dim, scale); linked && standingInPortal(p, pos)) {
                    // ワールド専用のネザー: 通常のネザー/オーバーワールドに着いたところを付け替える
                    if (auto deny = enterDenyReason(p, *linked)) {
                        p.sendMessage("§c[LeviKit] " + *deny);
                        p.teleport(t.good, DimensionType{t.dim});
                    } else {
                        SpawnPoint sp{t.good.x * scale, isRoofed(*linked) ? 64.0 : linked->spawn.y, t.good.z * scale};
                        teleportToPoint(p, *linked, sp);
                        p.sendMessage("§d[LeviKit] " + linked->displayName + " へ移動しました");
                    }
                    t.suppressUntil = now + std::chrono::seconds(3);
                    return true;
                }
                auto* to   = worldById(dim);
                if (to) {
                    if (auto deny = enterDenyReason(p, *to)) {
                        // ネザーゲートなど /dim 以外で入ろうとした場合も弾く
                        p.sendMessage("§c[LeviKit] " + *deny);
                        p.teleport(t.good, DimensionType{t.dim});
                        t.suppressUntil = now + std::chrono::seconds(3);
                        return true;
                    }
                }
                if (cfg().rememberLastPosition) {
                    auto died = gDiedIn.find(uuid);
                    if (died != gDiedIn.end() && died->second == t.dim) {
                        // 死亡地点には戻さない
                        if (auto lp = gLastPos.find(uuid); lp != gLastPos.end()) lp->second.erase(t.dim);
                        gDiedIn.erase(died);
                    } else {
                        setLastPos(uuid, t.dim, t.good);
                    }
                }
                t.dim      = dim;
                t.good     = pos;
                t.inPortal = "__arrived";
                onWorldChanged(p, from, to);
                return true;
            }
            if (auto* w = worldById(dim)) {
                if (enforceBorder(p, *w, pos, t)) return true;
                checkPortals(p, *w, pos, t);
                if (t.inPortal == "__arrived") t.inPortal.clear();
            }
            t.good = pos;
            return true;
        });
    }

    if (tick % 100 == 0) {
        // 時間固定の再送（サーバーが送る時刻で上書きされるため）
        level->forEachPlayer([&](Player& p) {
            if (p.isSimulatedPlayer()) return true;
            if (auto* w = worldById(dimOf(p)); w && w->rules.timeLock >= 0) sendTime(p, w->rules.timeLock);
            return true;
        });
    }
    if (tick % 60 == 0) {
        // パネルのライブマップ用: 全員の位置（3秒ごと）
        Json list = Json::array();
        level->forEachPlayer([&](Player& p) {
            if (p.isSimulatedPlayer()) return true;
            auto  pos = p.getFeetPos();
            auto* w   = worldById(dimOf(p));
            list.push_back({{"n", p.getRealName()}, {"w", w ? w->key : std::to_string(dimOf(p))}, {"x", static_cast<int>(pos.x)}, {"y", static_cast<int>(pos.y)}, {"z", static_cast<int>(pos.z)}});
            return true;
        });
        emitMachine("POS", list);
    }
    if (tick % 200 == 0) evictFromClosedWorlds();
    if (tick % 1200 == 0) saveWorldState();
}

// ================= join / leave / death =================

void onPlayerJoinWorlds(Player& p) {
    auto uuid  = uuidOf(p);
    bool first = !gKnown.contains(uuid);
    gKnown.insert(uuid);
    gDirty = true;
    gTrack.erase(uuid);
    auto id = p.getUuid();

    // keepInventory ワールドで死んだままログアウトした場合の持ち物
    if (auto keep = readJson(deathKeepPath(uuid))) {
        if (keep->contains("diedDim")) gDiedIn[uuid] = (*keep)["diedDim"].get<int>();
        gDeathKeep[uuid] = *keep;
    }

    // リセットされたワールドでログアウトしていた → 新しいスポーンへ
    if (auto* w = worldById(dimOf(p)); w && w->custom) {
        int  epoch = resetEpoch(w->key);
        auto rec   = gLogout.find(uuid);
        bool stale = epoch > 0 && (rec == gLogout.end() || rec->second.first != static_cast<int>(w->id) || rec->second.second < epoch);
        if (stale) {
            auto key = w->key;
            later(std::chrono::milliseconds(1500), id, [key](Player& pl) {
                if (auto* ww = worldByKey(key)) {
                    pl.sendMessage("§e[LeviKit] " + ww->displayName + " はリセットされたため、スポーン地点へ移動しました");
                    teleportToSpawn(pl, *ww);
                }
            });
        }
    }

    auto const& hub = cfg().hub;
    if (!hub.target.empty() && (hub.mode == "always" || (hub.mode == "firstJoin" && first))) {
        auto target = hub.target;
        later(std::chrono::milliseconds(2000), id, [target](Player& pl) { teleportToTarget(pl, target); });
    }
}

void onPlayerLeaveWorlds(Player& p) {
    auto uuid = uuidOf(p);
    if (cfg().rememberLastPosition && !p.isDead()) rememberPosition(p);
    if (auto* w = worldById(dimOf(p))) gLogout[uuid] = {static_cast<int>(w->id), epochOf(*w)};
    gDirty = true;
    saveWorldState();
    gTrack.erase(uuid);
    gSel.erase(uuid);
    gPendingRespawn.erase(uuid);
    gTpa.erase(uuid);
}

void onPlayerDie(Player& p) {
    auto uuid  = uuidOf(p);
    int  dim   = dimOf(p);
    gDiedIn[uuid] = dim;
    gBack[uuid]   = BackPoint{dim, p.getFeetPos()}; // /back で死亡地点へ
    auto* w    = worldById(dim);
    if (!w || !w->rules.keepInventory) return;
    // ここはドロップ処理の前に呼ばれる → 持ち物を退避して空にすれば何も落ちない
    auto snap = snapshotInventory(p);
    snap.erase("enderChest");
    snap["diedDim"]  = dim;
    gDeathKeep[uuid] = snap;
    writeJson(deathKeepPath(uuid), snap);
    clearInventory(p);
}

void onPlayerRespawn(Player& p) {
    // 実際の処理は tickWorlds → processRespawn（リスポーン先へのディメンション移動が終わってから）
    gPendingRespawn[uuidOf(p)] = Clock::now();
}

// ================= rules =================

bool blockEditDenied(Player& p, BlockPos const& pos, bool interact) {
    if (cfg().limboMode) return !p.isOperator();
    auto* w = worldById(dimOf(p));
    if (!w || w->rules.protection == "none") return false;
    if (interact && !w->rules.protectInteract) return false;
    if (p.isOperator() || containsName(w->rules.builders, p)) return false;
    if (w->rules.protection == "spawn") {
        double dx = pos.x - w->spawn.x;
        double dz = pos.z - w->spawn.z;
        if (std::abs(dx) > w->rules.protectionRadius || std::abs(dz) > w->rules.protectionRadius) return false;
    }
    actionbar(p, interact ? "§cこの場所では操作できません" : "§cこのワールドは保護されています");
    return true;
}

bool pvpDenied(Actor& victim, ActorDamageSource const& source) {
    if (!victim.isPlayer()) return false;
    if (source.getDamagingEntityType() != ActorType::Player) return false;
    if (cfg().limboMode) return true;
    auto* w = worldById(static_cast<int>(victim.getDimensionId()));
    return w && !w->rules.pvp;
}

bool mobSpawnDenied(int dimId, std::string const& identifier, bool natural) {
    if (!natural) return false;
    if (cfg().limboMode) return true;
    auto* w = worldById(dimId);
    if (!w || w->rules.mobSpawning == "all") return false;
    if (w->rules.mobSpawning == "none") return true;
    return kHostile.contains(identifier);
}

bool fireSpreadDenied(int dimId, BlockPos const& pos) {
    auto* w = worldById(dimId);
    if (!w || w->rules.protection == "none") return false;
    if (w->rules.protection == "all") return true;
    return std::abs(pos.x - w->spawn.x) <= w->rules.protectionRadius && std::abs(pos.z - w->spawn.z) <= w->rules.protectionRadius;
}

bool handleChat(Player& p, std::string const& message) {
    auto const& mode = cfg().chatMode;
    auto*       w    = worldById(dimOf(p));
    emitMachine("CHAT", {{"name", p.getRealName()}, {"message", message}, {"world", w ? w->key : ""}});
    if (mode != "prefix" && mode != "world") return false;
    std::string msg    = message;
    bool        global = mode == "prefix";
    if (mode == "world" && !msg.empty() && msg[0] == '!') {
        global = true;
        msg.erase(0, 1);
    }
    std::string tag  = mode == "world" && global ? "§6全体" : (w ? w->displayName : "?");
    std::string line = fmt::format("§7[{}§7]§r <{}> {}", tag, p.getRealName(), msg);
    int         dim  = dimOf(p);
    if (auto level = ll::service::getLevel()) {
        level->forEachPlayer([&](Player& pl) {
            if (global || dimOf(pl) == dim) pl.sendMessage(line);
            return true;
        });
    }
    logger().info("[chat] {}", line);
    return true;
}

void flushInventories() {
    auto level = ll::service::getLevel();
    if (!level || !cfg().separateInventories) return;
    level->forEachPlayer([](Player& p) {
        if (p.isSimulatedPlayer() || p.isDead()) return true;
        auto uuid = uuidOf(p);
        if (auto g = gCurrentGroup.find(uuid); g != gCurrentGroup.end()) writeJson(inventoryPath(uuid, g->second), snapshotInventory(p));
        return true;
    });
}

// ================= portals =================

void setPortalCorner(Player& p, int corner) {
    auto& s   = gSel[uuidOf(p)];
    auto  pos = p.getFeetPos();
    int   x   = static_cast<int>(std::floor(pos.x));
    int   y   = static_cast<int>(std::floor(pos.y));
    int   z   = static_cast<int>(std::floor(pos.z));
    if (corner == 1) {
        s.has1 = true;
        s.dim1 = dimOf(p);
        s.x1 = x, s.y1 = y, s.z1 = z;
    } else {
        s.has2 = true;
        s.dim2 = dimOf(p);
        s.x2 = x, s.y2 = y, s.z2 = z;
    }
    p.sendMessage(fmt::format("§a[LeviKit] ポータル範囲の角{}: {} {} {}", corner, x, y, z));
}

std::optional<std::string> createPortal(Player& p, std::string const& name, std::string const& target) {
    auto it = gSel.find(uuidOf(p));
    if (it == gSel.end() || !it->second.has1 || !it->second.has2) return "先に /dimportal pos1 と pos2 で範囲を決めてください";
    auto& s = it->second;
    if (s.dim1 != s.dim2) return "2つの角は同じワールドで指定してください";
    auto* w = worldById(s.dim1);
    if (!w) return "このワールドはポータルに使えません";
    auto starts = [&](char const* pre) { return target.rfind(pre, 0) == 0; };
    bool ok     = false;
    if (starts("warp:")) {
        auto n = target.substr(5);
        ok     = std::any_of(cfg().warps.begin(), cfg().warps.end(), [&](Warp const& wp) { return wp.name == n; });
    } else if (starts("world:") || starts("last:")) {
        ok = worldByKey(target.substr(target.find(':') + 1)) != nullptr;
    } else {
        ok = worldByKey(target) != nullptr;
    }
    if (!ok) return "行き先が見つかりません（world:<名前> / warp:<名前> / last:<名前>）";
    reloadConfigNow();
    auto& portals = cfg().portals;
    std::erase_if(portals, [&](Portal const& pt) { return pt.name == name; });
    portals.push_back(Portal{name, w->key, s.x1, s.y1, s.z1, s.x2, s.y2, s.z2, target, "", true});
    saveConfigNow();
    rebuildWorlds();
    return std::nullopt;
}

// ================= /spawn /back /tpa =================

void setBackPoint(Player& p) { gBack[uuidOf(p)] = BackPoint{dimOf(p), p.getFeetPos()}; }

bool teleportBack(Player& p) {
    auto it = gBack.find(uuidOf(p));
    if (it == gBack.end()) return false;
    auto  target = it->second;
    auto* w      = worldById(target.dim);
    if (!w) {
        p.sendMessage("§c[LeviKit] 戻り先のワールドはもうありません");
        gBack.erase(it);
        return true;
    }
    if (target.dim != dimOf(p)) {
        if (auto deny = enterDenyReason(p, *w)) {
            p.sendMessage("§c[LeviKit] " + *deny);
            return true;
        }
        if (cfg().rememberLastPosition) rememberPosition(p);
    }
    setBackPoint(p);
    p.teleport(target.pos, DimensionType{target.dim});
    p.sendMessage("§a[LeviKit] 前の場所へ戻りました");
    return true;
}

void teleportToCurrentSpawn(Player& p) {
    auto* w = worldById(dimOf(p));
    if (!w) {
        p.sendMessage("§c[LeviKit] このワールドのスポーンは設定されていません");
        return;
    }
    setBackPoint(p);
    teleportToSpawn(p, *w);
    p.sendMessage("§a[LeviKit] " + w->displayName + " のスポーンへ移動しました");
}

std::optional<std::string> tpaRequest(Player& from, Player& to) {
    if (&from == &to) return "自分には送れません";
    if (!cfg().tpaCrossWorld && dimOf(from) != dimOf(to)) return "別のワールドにいる人には送れません";
    gTpa[uuidOf(to)] = TpaRequest{from.getUuid(), Clock::now() + std::chrono::seconds(std::max(10, cfg().tpaTimeoutSeconds))};
    auto* w = worldById(dimOf(from));
    to.sendMessage(fmt::format("§e[LeviKit] {}（{}）があなたの所へ移動したいそうです。§a/tpaccept§e で許可、§c/tpdeny§e で拒否（{}秒）",
                               from.getRealName(), w ? w->displayName : "?", cfg().tpaTimeoutSeconds));
    from.sendMessage(fmt::format("§a[LeviKit] {} にリクエストを送りました", to.getRealName()));
    return std::nullopt;
}

std::optional<std::string> tpaAccept(Player& target) {
    auto it = gTpa.find(uuidOf(target));
    if (it == gTpa.end()) return "届いているリクエストはありません";
    auto req = it->second;
    gTpa.erase(it);
    if (Clock::now() > req.expires) return "リクエストの期限が切れています";
    auto level = ll::service::getLevel();
    auto* from = level ? level->getPlayer(req.from) : nullptr;
    if (!from) return "相手がオフラインです";
    if (auto* w = worldById(dimOf(target)); w && dimOf(*from) != dimOf(target)) {
        if (auto deny = enterDenyReason(*from, *w)) {
            from->sendMessage("§c[LeviKit] " + *deny);
            return "相手はこのワールドに入れません: " + *deny;
        }
        if (cfg().rememberLastPosition) rememberPosition(*from);
    }
    setBackPoint(*from);
    from->teleport(target.getFeetPos(), target.getDimensionId());
    from->sendMessage(fmt::format("§a[LeviKit] {} の所へ移動しました（/back で戻れます）", target.getRealName()));
    target.sendMessage(fmt::format("§a[LeviKit] {} を受け入れました", from->getRealName()));
    return std::nullopt;
}

std::optional<std::string> tpaDeny(Player& target) {
    auto it = gTpa.find(uuidOf(target));
    if (it == gTpa.end()) return "届いているリクエストはありません";
    auto level = ll::service::getLevel();
    if (auto* from = level ? level->getPlayer(it->second.from) : nullptr) {
        from->sendMessage(fmt::format("§c[LeviKit] {} にリクエストを断られました", target.getRealName()));
    }
    gTpa.erase(it);
    target.sendMessage("§7[LeviKit] リクエストを断りました");
    return std::nullopt;
}

// ================= JSON for panel =================

Json worldsJson() {
    Json arr = Json::array();
    for (auto const& w : gWorlds) {
        arr.push_back({
            {"id",        static_cast<int>(w.id)},
            {"key",       w.key                 },
            {"display",   w.displayName         },
            {"custom",    w.custom              },
            {"show",      w.show                },
            {"open",      w.rules.open          },
            {"players",   playersIn(static_cast<int>(w.id))},
            {"epoch",     epochOf(w)            },
            {"gameMode",  w.rules.gameMode      },
            {"group",     groupFor(&w)          },
            {"generator", w.generator           }
        });
    }
    return arr;
}

Json playersJson() {
    auto level = ll::service::getLevel();
    Json arr   = Json::array();
    if (!level) return arr;
    level->forEachPlayer([&](Player& p) {
        auto pos  = p.getFeetPos();
        auto uuid = uuidOf(p);
        auto g    = gCurrentGroup.find(uuid);
        auto* w   = worldById(dimOf(p));
        arr.push_back({
            {"name",      p.getRealName()                           },
            {"xuid",      p.getXuid()                               },
            {"uuid",      uuid                                      },
            {"dim",       dimOf(p)                                  },
            {"world",     w ? w->key : ""                           },
            {"pos",       {pos.x, pos.y, pos.z}                     },
            {"op",        p.isOperator()                            },
            {"simulated", p.isSimulatedPlayer()                     },
            {"group",     g == gCurrentGroup.end() ? "" : g->second }
        });
        return true;
    });
    return arr;
}

} // namespace levikit

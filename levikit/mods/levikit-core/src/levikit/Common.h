#pragma once
// levikit-core 内部で共有する宣言

#include "levikit/Config.h"

#include "mc/deps/core/math/Vec3.h"
#include "mc/world/level/dimension/DimensionType.h"

#include "nlohmann/json.hpp"

#include <chrono>
#include <filesystem>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

class Player;
class Actor;
class ActorDamageSource;
class BlockPos;

namespace ll::io {
class Logger;
}

namespace levikit {

using Clock = std::chrono::steady_clock;

/// /warp のオートコンプリート用ソフト列挙
enum class LeviKitWarp {};
using Json  = nlohmann::json;

// ---------- Core ----------
Config&         cfg();
ll::io::Logger& logger();
bool            reloadConfigNow();
bool            saveConfigNow();

// ---------- Util ----------
void                  emitMachine(std::string const& kind, Json const& data);
bool                  runCommand(std::string const& cmd);
std::string           quoteName(std::string const& name);
std::string           replaceAll(std::string s, std::string const& from, std::string const& to);
std::string           fmtNum(double v);
long long             nowUnix();
std::filesystem::path worldData();
void                  writeJson(std::filesystem::path const& path, Json const& j);
std::optional<Json>   readJson(std::filesystem::path const& path);
void                  actionbar(Player& p, std::string const& text);
void                  title(Player& p, std::string const& main, std::string const& sub);
bool                  containsName(std::vector<std::string> const& list, Player& p);

// ---------- Worlds ----------
/// /dim や各種ルールが参照する「ワールド」（バニラ3次元 + 登録済みカスタム次元）
struct World {
    DimensionType id;
    std::string   key; // overworld / nether / the_end / namespace:name（execute in で使える名前）
    std::string   displayName;
    std::string   description;
    std::string   icon;
    SpawnPoint    spawn;
    std::string   landing;
    WorldRules    rules;
    std::string   generator; // カスタムのみ
    bool          custom = false;
    bool          show   = true;
};

struct RegisteredDim {
    std::string   name;
    DimensionType id;
};

std::vector<RegisteredDim>& registeredDims();
void                        rebuildWorlds();
std::vector<World> const&   worlds();
World const*                worldById(int id);
World const*                worldByKey(std::string const& key);
int                         playersIn(int dimId, Player const* except = nullptr);

/// 入れない理由（入れるなら nullopt）
std::optional<std::string> enterDenyReason(Player& p, World const& w);
/// ワールドへ移動（useLast=true なら最後にいた位置へ）
void teleportToWorld(Player& p, World const& w, bool useLast = true, bool checkAccess = true);
bool teleportToWarp(Player& p, std::string const& name);
/// "world:x" / "warp:x" / "last:x" / "x" を解決して移動
bool teleportToTarget(Player& p, std::string const& target);
void openWorldMenu(Player& p);
void openWarpMenu(Player& p);
void tickWorlds(uint64_t tick);
void onPlayerJoinWorlds(Player& p);
void onPlayerLeaveWorlds(Player& p);
void onPlayerDie(Player& p);
void onPlayerRespawn(Player& p);
void rememberPosition(Player& p);
void loadWorldState();
void saveWorldState();
void updateWarpEnum();
Json worldsJson();
Json playersJson();
void setPortalCorner(Player& p, int corner);
std::optional<std::string> createPortal(Player& p, std::string const& name, std::string const& target);

// ---------- Rules (イベントから呼ぶ判定) ----------
bool blockEditDenied(Player& p, BlockPos const& pos, bool interact);
bool pvpDenied(Actor& victim, ActorDamageSource const& source);
bool mobSpawnDenied(int dimId, std::string const& identifier, bool natural);
bool fireSpreadDenied(int dimId, BlockPos const& pos);
/// チャットを処理したら true（元のチャットはキャンセルする）
bool handleChat(Player& p, std::string const& message);
void evictFromClosedWorlds();
/// オンラインの人の現在の持ち物をグループのファイルへ書き出す（バックアップ前）
void flushInventories();
/// BAN/メンテナンスに該当する参加中の人を切断（Core.cpp）
void enforceAccessForOnline();

// ---------- /spawn /back /tpa ----------
void setBackPoint(Player& p);
bool teleportBack(Player& p);
void teleportToCurrentSpawn(Player& p);
std::optional<std::string> tpaRequest(Player& from, Player& to);
std::optional<std::string> tpaAccept(Player& target);
std::optional<std::string> tpaDeny(Player& target);

// ---------- Inventory ----------
Json snapshotInventory(Player& p);
void applyInventory(Player& p, Json const& j);
void clearInventory(Player& p);
std::filesystem::path inventoryPath(std::string const& uuid, std::string const& group);

// ---------- Reset ----------
/// pendingResets に入っているディメンションのチャンクを削除する（ディメンション登録前に呼ぶ）
void performPendingResets();
/// pendingImports / pendingClones を処理する（ディメンション登録の直後に呼ぶ）
void performPendingTransfers();
/// ディメンションのリセット回数（epoch）
int  resetEpoch(std::string const& name);
void loadResetState();

// ---------- Commands ----------
void registerCommands();

// ---------- Events ----------
void registerProtection();
void unregisterProtection();

} // namespace levikit

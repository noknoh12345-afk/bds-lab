// LeviKit core mod — マルチワールド拡張
//
// Target: LeviLamina 26.51.9 / BDS 1.26.51 / MoreDimensions 0.15.0
//
// 機能の本体は Worlds.cpp / Reset.cpp / Inventory.cpp / Commands.cpp。ここは設定の読み書きとイベントの配線。
#include "levikit/Core.h"
#include "levikit/Common.h"

#include "ll/api/event/EventBus.h"
#include "ll/api/event/entity/ActorHurtEvent.h"
#include "ll/api/event/player/PlayerChatEvent.h"
#include "ll/api/event/player/PlayerDestroyBlockEvent.h"
#include "ll/api/event/player/PlayerDieEvent.h"
#include "ll/api/event/player/PlayerDisconnectEvent.h"
#include "ll/api/event/player/PlayerInteractBlockEvent.h"
#include "ll/api/event/player/PlayerJoinEvent.h"
#include "ll/api/event/player/PlayerPlaceBlockEvent.h"
#include "ll/api/event/player/PlayerRespawnEvent.h"
#include "ll/api/event/player/PlayerUseItemEvent.h"
#include "ll/api/event/server/ServerStartedEvent.h"
#include "ll/api/event/world/FireSpreadEvent.h"
#include "ll/api/event/world/ServerLevelTickEvent.h"
#include "ll/api/event/world/SpawnMobEvent.h"
#include "ll/api/io/FileUtils.h"
#include "ll/api/io/Logger.h"
#include "ll/api/mod/RegisterHelper.h"
#include "ll/api/reflection/Deserialization.h"
#include "ll/api/reflection/Serialization.h"
#include "ll/api/service/Bedrock.h"
#include "ll/api/thread/ServerThreadExecutor.h"

#include "mc/platform/UUID.h"
#include "mc/world/actor/player/Player.h"
#include "mc/world/item/ItemStack.h"
#include "mc/world/level/BlockSource.h"
#include "mc/world/level/GeneratorType.h"
#include "mc/world/level/Level.h"

#include "more_dimensions/api/dimension/CustomDimensionManager.h"

#include <algorithm>
#include <cmath>

namespace levikit {

namespace {

using OJ = nlohmann::ordered_json;

// TPS 計測
uint64_t          gTicks       = 0;
uint64_t          gTicksAtMark = 0;
Clock::time_point gMark        = Clock::now();
Clock::time_point gLastStats   = Clock::now();
double            gTps         = 20.0;
std::unordered_map<std::string, Clock::time_point> gMenuCooldown;

std::vector<ll::event::ListenerPtr> gListeners;

std::filesystem::path configPath() { return Core::getInstance().getSelf().getConfigDir() / u8"config.json"; }

template <class T>
OJ toJson(T const& v) {
    return ll::reflection::serialize<OJ>(v).value();
}

/// v1/v2 の設定を v3 の形へ（gameMode / inventoryGroup / opOnly を rules の中へ）
void migrate(OJ& data) {
    int v = data.contains("version") && data["version"].is_number() ? data["version"].get<int>() : 1;
    if (v >= 3) return;
    auto moveRules = [](OJ& e) {
        if (!e.is_object()) return;
        if (!e.contains("rules") || !e["rules"].is_object()) e["rules"] = OJ::object();
        for (char const* k : {"gameMode", "inventoryGroup", "opOnly"}) {
            if (e.contains(k)) {
                e["rules"][k] = e[k];
                e.erase(k);
            }
        }
    };
    if (data.contains("dimensions") && data["dimensions"].is_array()) {
        for (auto& e : data["dimensions"]) moveRules(e);
    }
    for (char const* k : {"overworld", "nether", "theEnd"}) {
        if (data.contains(k)) moveRules(data[k]);
    }
}

/// 欠けているキーを既定値で補完（配列の各要素もそれぞれの既定値で補完）
OJ normalizeConfig(OJ data) {
    migrate(data);
    auto normArr = [&](char const* key, OJ const& elemDefault) {
        if (!data.contains(key) || !data[key].is_array()) return;
        OJ out = OJ::array();
        for (auto& e : data[key]) {
            OJ d = elemDefault;
            if (e.is_object()) d.merge_patch(e);
            out.push_back(std::move(d));
        }
        data[key] = std::move(out);
    };
    normArr("dimensions", toJson(DimensionEntry{}));
    normArr("warps", toJson(Warp{}));
    normArr("portals", toJson(Portal{}));
    normArr("bans", toJson(BanEntry{}));
    normArr("roles", toJson(Role{}));
    normArr("pendingImports", toJson(ImportJob{}));
    normArr("pendingClones", toJson(CloneJob{}));
    OJ base = toJson(Config{});
    base.merge_patch(data);
    base["version"] = Config{}.version;
    return base;
}

std::optional<BanEntry> findBan(std::string const& name, std::string const& xuid) {
    auto now = nowUnix();
    for (auto const& b : cfg().bans) {
        if (b.until != 0 && b.until < now) continue;
        bool byXuid = !b.xuid.empty() && !xuid.empty() && b.xuid == xuid;
        bool byName = !b.name.empty() && b.name == name;
        if (byXuid || byName) return b;
    }
    return std::nullopt;
}

void kickLater(mce::UUID uuid, std::string reason) {
    ll::thread::ServerThreadExecutor::getDefault().executeAfter(
        [uuid, reason]() {
            auto level = ll::service::getLevel();
            if (!level) return;
            if (auto* p = level->getPlayer(uuid)) {
                runCommand(fmt::format("kick {} {}", quoteName(p->getRealName()), replaceAll(reason, "\n", " ")));
            }
        },
        std::chrono::milliseconds(100)
    );
}

/// BAN/メンテナンスの判定。弾くべきなら理由を返す
std::optional<std::string> denyReason(Player& p) {
    auto name = p.getRealName();
    auto xuid = p.getXuid();
    if (auto b = findBan(name, xuid)) {
        std::string msg = "§cこのサーバーから BAN されています";
        if (!b->reason.empty()) msg += "\n§f理由: " + b->reason;
        if (b->until != 0) msg += fmt::format("\n§7残り約 {} 分", (b->until - nowUnix() + 59) / 60);
        return msg;
    }
    if (cfg().maintenance && !p.isOperator() && !containsName(cfg().maintenanceAllow, p)) return cfg().maintenanceMessage;
    return std::nullopt;
}

void emitStats() {
    auto level = ll::service::getLevel();
    if (!level) return;
    int  players = 0;
    Json perWorld = Json::object();
    level->forEachPlayer([&](Player& p) {
        if (p.isSimulatedPlayer()) return true;
        ++players;
        if (auto* w = worldById(static_cast<int>(p.getDimensionId()))) {
            perWorld[w->key] = perWorld.value(w->key, 0) + 1;
        }
        return true;
    });
    emitMachine("STATS", {{"tps", std::round(gTps * 10.0) / 10.0}, {"players", players}, {"worlds", perWorld}});
}

std::optional<GeneratorType> parseGenerator(std::string const& s) {
    if (s == "Overworld") return GeneratorType::Overworld;
    if (s == "Flat") return GeneratorType::Flat;
    if (s == "Nether") return GeneratorType::Nether;
    if (s == "TheEnd") return GeneratorType::TheEnd;
    if (s == "Void") return GeneratorType::Void;
    return std::nullopt;
}

void registerDimensions() {
    auto& dims = registeredDims();
    dims.clear();
    if (cfg().limboMode) {
        logger().info("limboMode: ディメンション登録をスキップ");
        return;
    }
    auto& mgr = more_dimensions::CustomDimensionManager::getInstance();
    for (auto const& e : cfg().dimensions) {
        if (!e.enabled) continue;
        auto gen = parseGenerator(e.generator);
        if (!gen) {
            logger().error("不明な generator '{}' ({})", e.generator, e.name);
            continue;
        }
        try {
            auto id = mgr.addSimpleDimension(e.name, e.seed, *gen);
            dims.push_back({e.name, id});
            logger().info("ディメンション登録: {} -> id {}", e.name, static_cast<int>(id));
        } catch (std::exception const& ex) {
            logger().error("ディメンション登録失敗 {}: {}", e.name, ex.what());
        }
    }
}

template <class E, class F>
void listen(F&& f) {
    gListeners.push_back(ll::event::EventBus::getInstance().emplaceListener<E>(std::forward<F>(f)));
}

} // namespace

void enforceAccessForOnline() {
    auto level = ll::service::getLevel();
    if (!level || cfg().limboMode) return;
    level->forEachPlayer([](Player& p) {
        if (p.isSimulatedPlayer()) return true;
        if (auto r = denyReason(p)) kickLater(p.getUuid(), *r);
        return true;
    });
}

Core& Core::getInstance() {
    static Core instance;
    return instance;
}

bool Core::reloadConfig() {
    auto path    = configPath();
    auto content = ll::file_utils::readFile(path);
    if (!content || content->empty()) return saveConfig();
    try {
        auto data       = OJ::parse(*content, nullptr, true, true);
        auto normalized = normalizeConfig(data);
        Config next{};
        if (auto r = ll::reflection::deserialize(next, normalized); !r) {
            getSelf().getLogger().error("config.json の内容が不正です（前の設定のまま）: {}", r.error().message());
            return false;
        }
        mConfig = std::move(next);
        if (normalized != data) ll::file_utils::writeFile(path, normalized.dump(4));
    } catch (std::exception const& e) {
        getSelf().getLogger().error("config.json の読み込みに失敗（前の設定のまま）: {}", e.what());
        return false;
    }
    return true;
}

bool Core::saveConfig() {
    std::error_code ec;
    std::filesystem::create_directories(configPath().parent_path(), ec);
    return ll::file_utils::writeFile(configPath(), toJson(mConfig).dump(4));
}

bool Core::load() {
    reloadConfig();
    return true;
}

bool Core::enable() {
    listen<ll::event::ServerStartedEvent>([](ll::event::ServerStartedEvent&) {
        loadResetState();
        performPendingResets(); // ディメンションが生成される前に
        loadWorldState();
        registerDimensions();
        performPendingTransfers(); // 取り込み・複製（新しいディメンションの ID が決まってから、生成される前に）
        rebuildWorlds();
        updateWarpEnum();
        emitMachine("DIMS", worldsJson());
        emitMachine("READY", {{"limbo", cfg().limboMode}});
    });

    listen<ll::event::PlayerJoinEvent>([](ll::event::PlayerJoinEvent& ev) {
        auto& p = ev.self();
        if (p.isSimulatedPlayer()) return;
        auto uuid = p.getUuid();
        if (!cfg().limboMode) {
            if (auto reason = denyReason(p)) {
                emitMachine("DENIED", {{"name", p.getRealName()}, {"xuid", p.getXuid()}, {"reason", *reason}});
                kickLater(uuid, *reason);
                return;
            }
        }
        emitMachine("JOIN", {{"name", p.getRealName()}, {"xuid", p.getXuid()}, {"uuid", uuid.asString()}});
        if (!cfg().limboMode) onPlayerJoinWorlds(p);
        std::string msg = cfg().limboMode ? cfg().limboMessage : cfg().welcomeMessage;
        if (msg.empty()) return;
        ll::thread::ServerThreadExecutor::getDefault().executeAfter(
            [uuid, msg]() {
                auto level = ll::service::getLevel();
                if (!level) return;
                if (auto* pl = level->getPlayer(uuid)) {
                    int online = 0;
                    level->forEachPlayer([&](Player& o) {
                        if (!o.isSimulatedPlayer()) ++online;
                        return true;
                    });
                    pl->sendMessage(replaceAll(replaceAll(msg, "{name}", pl->getRealName()), "{online}", std::to_string(online)));
                }
            },
            std::chrono::milliseconds(3000)
        );
    });

    listen<ll::event::PlayerDisconnectEvent>([](ll::event::PlayerDisconnectEvent& ev) {
        auto& p = ev.self();
        if (p.isSimulatedPlayer()) return;
        if (!cfg().limboMode) onPlayerLeaveWorlds(p);
        gMenuCooldown.erase(p.getUuid().asString());
        emitMachine("LEAVE", {{"name", p.getRealName()}, {"xuid", p.getXuid()}});
    });

    listen<ll::event::PlayerChatEvent>([](ll::event::PlayerChatEvent& ev) {
        if (handleChat(ev.self(), ev.message())) ev.cancel();
    });

    listen<ll::event::ServerLevelTickEvent>([](ll::event::ServerLevelTickEvent&) {
        ++gTicks;
        auto now = Clock::now();
        auto dt  = std::chrono::duration<double>(now - gMark).count();
        if (dt >= 5.0) {
            gTps         = std::min(20.0, static_cast<double>(gTicks - gTicksAtMark) / dt);
            gTicksAtMark = gTicks;
            gMark        = now;
        }
        tickWorlds(gTicks);
        int interval = cfg().statsIntervalSeconds;
        if (interval > 0 && std::chrono::duration<double>(now - gLastStats).count() >= interval) {
            gLastStats = now;
            emitStats();
        }
    });

    listen<ll::event::PlayerDieEvent>([](ll::event::PlayerDieEvent& ev) {
        if (!cfg().limboMode) onPlayerDie(ev.self());
    });
    listen<ll::event::PlayerRespawnEvent>([](ll::event::PlayerRespawnEvent& ev) {
        if (!cfg().limboMode) onPlayerRespawn(ev.self());
    });

    // メニューを開くアイテム（既定: コンパス）
    listen<ll::event::PlayerUseItemEvent>([](ll::event::PlayerUseItemEvent& ev) {
        auto const& item = cfg().menuItem;
        if (item.empty() || cfg().limboMode) return;
        if (ev.item().isNull() || ev.item().getTypeName() != item) return;
        auto& p    = ev.self();
        auto  uuid = p.getUuid().asString();
        auto  now  = Clock::now();
        if (auto it = gMenuCooldown.find(uuid); it != gMenuCooldown.end() && now - it->second < std::chrono::seconds(1)) return;
        gMenuCooldown[uuid] = now;
        openWorldMenu(p);
    });

    // 保護・PvP・モブ・延焼
    listen<ll::event::PlayerDestroyBlockEvent>([](ll::event::PlayerDestroyBlockEvent& ev) {
        if (blockEditDenied(ev.self(), ev.pos(), false)) ev.cancel();
    });
    listen<ll::event::PlayerPlacingBlockEvent>([](ll::event::PlayerPlacingBlockEvent& ev) {
        if (blockEditDenied(ev.self(), ev.pos(), false)) ev.cancel();
    });
    listen<ll::event::PlayerInteractBlockEvent>([](ll::event::PlayerInteractBlockEvent& ev) {
        if (blockEditDenied(ev.self(), ev.blockPos(), true)) ev.cancel();
    });
    listen<ll::event::ActorHurtEvent>([](ll::event::ActorHurtEvent& ev) {
        if (pvpDenied(ev.self(), ev.source())) ev.cancel();
    });
    listen<ll::event::SpawningMobEvent>([](ll::event::SpawningMobEvent& ev) {
        if (mobSpawnDenied(static_cast<int>(ev.blockSource().getDimensionId()), ev.identifier().mFullName, ev.naturalSpawn())) {
            ev.cancel();
        }
    });
    listen<ll::event::FireSpreadEvent>([](ll::event::FireSpreadEvent& ev) {
        if (fireSpreadDenied(static_cast<int>(ev.blockSource().getDimensionId()), ev.pos())) ev.cancel();
    });

    registerCommands();
    return true;
}

bool Core::disable() {
    saveWorldState();
    auto& bus = ll::event::EventBus::getInstance();
    for (auto& l : gListeners) {
        if (l) bus.removeListener(l);
    }
    gListeners.clear();
    return true;
}

} // namespace levikit

LL_REGISTER_MOD(levikit::Core, levikit::Core::getInstance());

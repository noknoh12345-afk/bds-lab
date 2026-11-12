// コマンド
//   /dim [list|who|info|setspawn|<ワールド>]      ワールド切り替え
//   /warp [<名前>]  /setwarp <名前>  /delwarp <名前> ワープ
//   /hub                                           ロビーへ
//   /dimportal pos1|pos2|list|create <名前> <行き先>|remove <名前>
//   /levikit ...                                   パネル用（コンソール専用）
#include "levikit/Common.h"
#include "levikit/Core.h"

#include "ll/api/command/CommandHandle.h"
#include "ll/api/command/CommandRegistrar.h"
#include "ll/api/command/SoftEnum.h"
#include "ll/api/service/Bedrock.h"
#include "ll/api/service/ServerInfo.h"

#include "mc/network/packet/TransferPacket.h"
#include "mc/server/commands/CommandOrigin.h"
#include "mc/server/commands/CommandOriginType.h"
#include "mc/server/commands/CommandOutput.h"
#include "mc/server/commands/CommandPermissionLevel.h"
#include "mc/server/commands/CommandSelector.h"
#include "mc/world/actor/Actor.h"
#include "mc/world/actor/player/Player.h"
#include "mc/world/level/Level.h"

#include <algorithm>
#include <cmath>

namespace levikit {

// コマンドの引数の型は無名名前空間に置かない: LeviLamina は boost.pfr でメンバーを数え、clang は内部リンケージの型で
// 「fake_object<...> is used but not defined」のエラーにする。inline 名前空間なら外部リンケージで、名前はそのまま使える。
inline namespace command_params {

struct DimParam {
    DimensionType dimension;
};
struct WarpParam {
    ll::command::SoftEnum<LeviKitWarp> name;
};
struct NameParam {
    std::string name;
};
struct PortalCreateParam {
    std::string name;
    std::string target;
};
struct TransferParam {
    std::string host;
    int         port;
};
struct TextParam {
    std::string text;
};
struct PlayerParam {
    CommandSelector<Player> player;
};

} // namespace command_params

namespace {

bool isConsole(CommandOrigin const& origin) { return origin.getOriginType() == CommandOriginType::DedicatedServer; }

Player* asPlayer(CommandOrigin const& origin) {
    auto* e = origin.getEntity();
    if (!e || !e->isPlayer()) return nullptr;
    return static_cast<Player*>(e);
}

template <class F>
auto playerOnly(F&& f) {
    return [f = std::forward<F>(f)](CommandOrigin const& origin, CommandOutput& output) {
        auto* p = asPlayer(origin);
        if (!p) return output.error("プレイヤーのみ実行できます");
        f(*p, output);
    };
}

template <class P, class F>
auto playerOnlyP(F&& f) {
    return [f = std::forward<F>(f)](CommandOrigin const& origin, CommandOutput& output, P const& param) {
        auto* p = asPlayer(origin);
        if (!p) return output.error("プレイヤーのみ実行できます");
        f(*p, output, param);
    };
}

template <class F>
auto consoleOnly(F&& f) {
    return [f = std::forward<F>(f)](CommandOrigin const& origin, CommandOutput& output) {
        if (!isConsole(origin)) return output.error("console only");
        f(output);
    };
}

template <class P, class F>
auto consoleOnlyP(F&& f) {
    return [f = std::forward<F>(f)](CommandOrigin const& origin, CommandOutput& output, P const& param) {
        if (!isConsole(origin)) return output.error("console only");
        f(output, param);
    };
}

int transferAll(std::string const& host, int port) {
    auto level = ll::service::getLevel();
    if (!level) return 0;
    int count = 0;
    level->forEachPlayer([&](Player& p) {
        if (p.isSimulatedPlayer()) return true;
        if (cfg().rememberLastPosition) rememberPosition(p);
        TransferPacket pkt{host, static_cast<ushort>(port)};
        p.sendNetworkPacket(pkt);
        ++count;
        return true;
    });
    saveWorldState();
    emitMachine("TRANSFER", {{"host", host}, {"port", port}, {"count", count}});
    return count;
}

std::string worldListText(bool withPlayers) {
    std::string s;
    auto        level = ll::service::getLevel();
    for (auto const& w : worlds()) {
        if (!w.show) continue;
        s += fmt::format("§a{}§r ({}) {}人{}{}\n", w.displayName, w.key, playersIn(static_cast<int>(w.id)),
                         w.rules.open ? "" : " §c[閉鎖]", w.rules.gameMode.empty() ? "" : " §7[" + w.rules.gameMode + "]");
        if (withPlayers && level) {
            std::string names;
            level->forEachPlayer([&](Player& p) {
                if (!p.isSimulatedPlayer() && static_cast<int>(p.getDimensionId()) == static_cast<int>(w.id)) {
                    names += (names.empty() ? "" : ", ") + p.getRealName();
                }
                return true;
            });
            if (!names.empty()) s += "  §7" + names + "\n";
        }
    }
    return s;
}

std::string rulesText(World const& w) {
    auto const& r = w.rules;
    return fmt::format(
        "§l{}§r ({})\nゲームモード: {} / 持ち物: {} / PvP: {} / keepInventory: {}\n保護: {} / モブ: {} / ボーダー: {} / 時間固定: {}\n人数上限: {} / {}",
        w.displayName, w.key, r.gameMode.empty() ? "変更なし" : r.gameMode, r.inventoryGroup, r.pvp ? "ON" : "OFF",
        r.keepInventory ? "ON" : "OFF", r.protection, r.mobSpawning, r.borderRadius > 0 ? std::to_string(r.borderRadius) : "なし",
        r.timeLock >= 0 ? std::to_string(r.timeLock) : "なし", r.maxPlayers > 0 ? std::to_string(r.maxPlayers) : "なし",
        r.open ? "開放中" : "閉鎖中"
    );
}

} // namespace

void registerCommands() {
    auto& reg = ll::command::CommandRegistrar::getInstance(false);
    auto& c   = cfg();

    if (!c.limboMode) {
        // ---------- /dim ----------
        auto& dim = reg.getOrCreateCommand(
            "dim",
            "ワールドを切り替える",
            c.dimCommandForEveryone ? CommandPermissionLevel::Any : CommandPermissionLevel::GameDirectors
        );
        dim.overload().execute([](CommandOrigin const& origin, CommandOutput& output) {
            auto* p = asPlayer(origin);
            if (!p) {
                emitMachine("DIMS", worldsJson());
                return output.success("dims dumped");
            }
            openWorldMenu(*p);
        });
        dim.overload().text("list").execute([](CommandOrigin const&, CommandOutput& output) { output.success(worldListText(false)); });
        dim.overload().text("who").execute([](CommandOrigin const&, CommandOutput& output) { output.success(worldListText(true)); });
        dim.overload().text("info").execute(playerOnly([](Player& p, CommandOutput& output) {
            auto* w = worldById(static_cast<int>(p.getDimensionId()));
            if (!w) return output.error("このワールドは LeviKit の管理外です");
            output.success(rulesText(*w));
        }));
        dim.overload().text("setspawn").execute(playerOnly([](Player& p, CommandOutput& output) {
            if (!p.isOperator()) return output.error("OP のみ実行できます");
            auto* w = worldById(static_cast<int>(p.getDimensionId()));
            if (!w) return output.error("このワールドは LeviKit の管理外です");
            auto key = w->key;
            auto pos = p.getFeetPos();
            reloadConfigNow();
            SpawnPoint sp{std::round(pos.x * 2) / 2, std::floor(pos.y), std::round(pos.z * 2) / 2};
            auto&      cc = cfg();
            if (key == "overworld") cc.overworld.spawn = sp;
            else if (key == "nether") cc.nether.spawn = sp;
            else if (key == "the_end") cc.theEnd.spawn = sp;
            else {
                for (auto& e : cc.dimensions) {
                    if (e.name == key) {
                        e.spawn   = sp;
                        e.landing = "fixed";
                    }
                }
            }
            saveConfigNow();
            rebuildWorlds();
            output.success(fmt::format("{} のスポーン地点を {} {} {} にしました", key, fmtNum(sp.x), fmtNum(sp.y), fmtNum(sp.z)));
        }));
        dim.overload<DimParam>().required("dimension").execute(
            playerOnlyP<DimParam>([](Player& p, CommandOutput& output, DimParam const& param) {
                auto* w = worldById(static_cast<int>(param.dimension));
                if (!w || (!w->show && !p.isOperator())) return output.error("このワールドは /dim に登録されていません");
                teleportToWorld(p, *w, true, true);
            })
        );

        // ---------- /warp ----------
        auto& warp = reg.getOrCreateCommand("warp", "ワープ地点へ移動する", CommandPermissionLevel::Any);
        warp.overload().execute(playerOnly([](Player& p, CommandOutput& output) {
            if (cfg().warps.empty()) return output.error("ワープ地点はまだありません（OP は /setwarp <名前>）");
            openWarpMenu(p);
        }));
        warp.overload<WarpParam>().required("name").execute(playerOnlyP<WarpParam>([](Player& p, CommandOutput& output, WarpParam const& param) {
            if (!teleportToWarp(p, param.name)) output.error("ワープ地点が見つかりません: " + std::string(param.name));
        }));

        auto& setwarp = reg.getOrCreateCommand("setwarp", "今いる場所をワープ地点にする", CommandPermissionLevel::GameDirectors);
        setwarp.overload<NameParam>().required("name").execute(playerOnlyP<NameParam>([](Player& p, CommandOutput& output, NameParam const& param) {
            auto* w = worldById(static_cast<int>(p.getDimensionId()));
            if (!w) return output.error("このワールドは LeviKit の管理外です");
            if (param.name.empty() || param.name.size() > 32) return output.error("名前は1〜32文字");
            reloadConfigNow();
            auto& warps = cfg().warps;
            std::erase_if(warps, [&](Warp const& x) { return x.name == param.name; });
            auto pos = p.getFeetPos();
            warps.push_back(Warp{param.name, w->key, pos.x, pos.y, pos.z, p.getRotation().y, "", false});
            saveConfigNow();
            updateWarpEnum();
            output.success("ワープ地点を設定しました: " + param.name);
        }));

        auto& delwarp = reg.getOrCreateCommand("delwarp", "ワープ地点を削除する", CommandPermissionLevel::GameDirectors);
        delwarp.overload<WarpParam>().required("name").execute([](CommandOrigin const&, CommandOutput& output, WarpParam const& param) {
            reloadConfigNow();
            auto  name = std::string(param.name);
            auto& ws   = cfg().warps;
            auto  n    = std::erase_if(ws, [&](Warp const& x) { return x.name == name; });
            if (!n) return output.error("ワープ地点が見つかりません: " + name);
            saveConfigNow();
            updateWarpEnum();
            output.success("削除しました: " + name);
        });

        // ---------- /hub ----------
        auto& hub = reg.getOrCreateCommand("hub", "ロビーへ移動する", CommandPermissionLevel::Any);
        hub.alias("lobby");
        hub.overload().execute(playerOnly([](Player& p, CommandOutput& output) {
            auto const& target = cfg().hub.target;
            if (target.empty()) return output.error("ロビーが設定されていません");
            if (!teleportToTarget(p, target)) output.error("ロビーの行き先が見つかりません");
        }));

        // ---------- /spawn /back ----------
        if (c.spawnCommand) {
            auto& sp = reg.getOrCreateCommand("spawn", "今いるワールドのスポーンへ", CommandPermissionLevel::Any);
            sp.overload().execute(playerOnly([](Player& p, CommandOutput&) { teleportToCurrentSpawn(p); }));
        }
        if (c.backCommand) {
            auto& back = reg.getOrCreateCommand("back", "前の場所（移動前・死亡地点）へ戻る", CommandPermissionLevel::Any);
            back.overload().execute(playerOnly([](Player& p, CommandOutput& output) {
                if (!teleportBack(p)) output.error("戻る場所がありません");
            }));
        }

        // ---------- /tpa ----------
        if (c.tpaEnabled) {
            auto& tpa = reg.getOrCreateCommand("tpa", "相手の所へ移動するリクエストを送る（ワールドをまたいでも可）", CommandPermissionLevel::Any);
            tpa.overload<PlayerParam>().required("player").execute(
                [](CommandOrigin const& origin, CommandOutput& output, PlayerParam const& param) {
                    auto* p = asPlayer(origin);
                    if (!p) return output.error("プレイヤーのみ実行できます");
                    auto results = param.player.results(origin);
                    if (results.empty()) return output.error("相手が見つかりません");
                    if (results.size() > 1) return output.error("相手は1人だけ指定してください");
                    if (auto err = tpaRequest(*p, **results.begin())) output.error(*err);
                }
            );
            auto& acc = reg.getOrCreateCommand("tpaccept", "届いた /tpa を許可する", CommandPermissionLevel::Any);
            acc.overload().execute(playerOnly([](Player& p, CommandOutput& output) {
                if (auto err = tpaAccept(p)) output.error(*err);
            }));
            auto& deny = reg.getOrCreateCommand("tpdeny", "届いた /tpa を断る", CommandPermissionLevel::Any);
            deny.overload().execute(playerOnly([](Player& p, CommandOutput& output) {
                if (auto err = tpaDeny(p)) output.error(*err);
            }));
        }

        // ---------- /dimportal ----------
        auto& portal = reg.getOrCreateCommand("dimportal", "範囲に入ると移動するポータルを作る", CommandPermissionLevel::GameDirectors);
        portal.overload().text("pos1").execute(playerOnly([](Player& p, CommandOutput&) { setPortalCorner(p, 1); }));
        portal.overload().text("pos2").execute(playerOnly([](Player& p, CommandOutput&) { setPortalCorner(p, 2); }));
        portal.overload().text("list").execute([](CommandOrigin const&, CommandOutput& output) {
            std::string s;
            for (auto const& pt : cfg().portals) {
                s += fmt::format("{}{}§r [{}] ({},{},{})-({},{},{}) → {}\n", pt.enabled ? "§a" : "§7", pt.name, pt.world, pt.x1, pt.y1,
                                 pt.z1, pt.x2, pt.y2, pt.z2, pt.target);
            }
            output.success(s.empty() ? "ポータルはありません" : s);
        });
        portal.overload<PortalCreateParam>().text("create").required("name").required("target").execute(
            playerOnlyP<PortalCreateParam>([](Player& p, CommandOutput& output, PortalCreateParam const& param) {
                if (auto err = createPortal(p, param.name, param.target)) return output.error(*err);
                output.success(fmt::format("ポータル {} を作成しました → {}", param.name, param.target));
            })
        );
        portal.overload<NameParam>().text("remove").required("name").execute([](CommandOrigin const&, CommandOutput& output, NameParam const& param) {
            reloadConfigNow();
            auto n = std::erase_if(cfg().portals, [&](Portal const& pt) { return pt.name == param.name; });
            if (!n) return output.error("ポータルが見つかりません: " + param.name);
            saveConfigNow();
            output.success("削除しました: " + param.name);
        });
    }

    // ---------- /levikit（パネル用） ----------
    auto& kit = reg.getOrCreateCommand("levikit", "LeviKit 管理用(コンソール専用)", CommandPermissionLevel::Owner);
    kit.overload<TransferParam>().text("transfer").required("host").required("port").execute(
        consoleOnlyP<TransferParam>([](CommandOutput& output, TransferParam const& p) {
            int n = transferAll(p.host, p.port);
            output.success(fmt::format("transferred {} player(s) to {}:{}", n, p.host, p.port));
        })
    );
    kit.overload().text("players").execute(consoleOnly([](CommandOutput& output) {
        emitMachine("PLAYERS", playersJson());
        output.success("ok");
    }));
    kit.overload().text("dims").execute(consoleOnly([](CommandOutput& output) {
        emitMachine("DIMS", worldsJson());
        output.success("ok");
    }));
    kit.overload().text("reload").execute(consoleOnly([](CommandOutput& output) {
        // ルール/表示名/ワープ/ポータル/BAN 等は即時反映。ディメンションの追加・削除・リセットは再起動が必要
        reloadConfigNow();
        rebuildWorlds();
        updateWarpEnum();
        evictFromClosedWorlds();
        enforceAccessForOnline();
        emitMachine("DIMS", worldsJson());
        emitMachine("RELOADED", {{"maintenance", cfg().maintenance}, {"bans", cfg().bans.size()}, {"warps", cfg().warps.size()}, {"portals", cfg().portals.size()}});
        output.success("reloaded (dimension add/remove/reset needs restart)");
    }));
    kit.overload().text("save").execute(consoleOnly([](CommandOutput& output) {
        // バックアップ前に呼ぶ: 位置と持ち物グループを確定させる
        auto level = ll::service::getLevel();
        if (level && cfg().separateInventories) {
            level->forEachPlayer([](Player& p) {
                if (p.isSimulatedPlayer()) return true;
                rememberPosition(p);
                return true;
            });
        }
        flushInventories();
        saveWorldState();
        output.success("ok");
    }));
    kit.overload<TextParam>().text("motd").required("text").execute(consoleOnlyP<TextParam>([](CommandOutput& output, TextParam const& p) {
        ll::setServerMotd(p.text, true);
        output.success("motd updated");
    }));
}

} // namespace levikit

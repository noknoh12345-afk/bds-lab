"""LeviKit for Endstone: what levikit-core (the LeviLamina mod) gives the LeviKit panel, on a plain Endstone server.

Same contract as levikit-core, so the same panel drives it:
  - reads plugins/levikit-core/config/config.json (the file the panel writes)
  - prints machine lines "@@LEVIKIT <KIND> <json>" (READY, DIMS, STATS, POS, PLAYERS, JOIN, LEAVE, DENIED, CHAT, WORLD_CHANGE,
    TRANSFER, RELOADED)
  - console commands: levikit transfer <host> <port> | players | dims | stats | reload | save | motd <text>
  - player commands: /dim /warp /setwarp /delwarp /hub /spawn /back /tpa /tpaccept /tpdeny

What Endstone cannot do and this edition leaves out: extra worlds (custom dimensions), so no reset / import / clone of a world,
no inventory groups, world border, time lock or mob-spawning rule. The worlds are the three vanilla dimensions, each with its
rules: game mode, PvP, build protection, who may enter, a title and commands on entering and leaving.
"""

import json
import time
from pathlib import Path

from endstone import GameMode, Player
from endstone.command import Command, CommandSender
from endstone.event import (
    ActorDamageEvent,
    BlockBreakEvent,
    BlockPlaceEvent,
    PlayerChatEvent,
    PlayerDeathEvent,
    PlayerDimensionChangeEvent,
    PlayerJoinEvent,
    PlayerLoginEvent,
    PlayerQuitEvent,
    ServerListPingEvent,
    event_handler,
)
from endstone.form import ActionForm
from endstone.level import Location
from endstone.plugin import Plugin

VANILLA = [  # key, the config's field, Endstone's dimension name, id, defaults
    ("overworld", "overworld", "Overworld", 0, {"displayName": "オーバーワールド", "spawn": {"x": 0.5, "y": 100.0, "z": 0.5}, "landing": "surface"}),
    ("nether", "nether", "Nether", 1, {"displayName": "ネザー", "spawn": {"x": 0.5, "y": 70.0, "z": 0.5}, "landing": "platform"}),
    ("the_end", "theEnd", "TheEnd", 2, {"displayName": "ジ・エンド", "spawn": {"x": 100.5, "y": 49.0, "z": 0.5}, "landing": "fixed"}),
]
RULES = {
    "gameMode": "", "pvp": True, "protection": "none", "protectionRadius": 32, "builders": [], "maxPlayers": 0, "open": True,
    "opOnly": False, "allowedPlayers": [], "enterTitle": "", "enterSubtitle": "", "enterCommands": [], "leaveCommands": [],
}
DEFAULTS = {
    "limboMode": False,
    "limboMessage": "§e[LeviKit] §fサーバーを更新/復元しています。完了すると自動で元のワールドへ戻ります…",
    "dimCommandForEveryone": True,
    "chatMode": "global",
    "hub": {"mode": "none", "target": ""},
    "tpaEnabled": True,
    "tpaCrossWorld": True,
    "tpaTimeoutSeconds": 60,
    "spawnCommand": True,
    "backCommand": True,
    "roles": [],
    "maintenance": False,
    "maintenanceMessage": "§cただいまメンテナンス中です。しばらくお待ちください",
    "maintenanceAllow": [],
    "bans": [],
    "warps": [],
    "welcomeMessage": "§a{name} さん、ようこそ！ §7/dim でワールドを切り替えられます",
    "statsIntervalSeconds": 10,
}
MODES = {"survival": GameMode.SURVIVAL, "creative": GameMode.CREATIVE, "adventure": GameMode.ADVENTURE, "spectator": GameMode.SPECTATOR}
P = "§7[LeviKit] §f"


class World:
    def __init__(self, key: str, dim_name: str, dim_id: int, entry: dict, base: dict) -> None:
        self.key, self.dim_name, self.id = key, dim_name, dim_id
        self.display: str = entry.get("displayName") or base["displayName"]
        self.description: str = entry.get("description", "")
        self.icon: str = entry.get("icon", "")
        self.spawn: dict = {**base["spawn"], **(entry.get("spawn") or {})}
        self.landing: str = entry.get("landing") or base["landing"]
        self.show: bool = entry.get("show", True)
        self.rules: dict = {**RULES, **(entry.get("rules") or {})}


class Levikit(Plugin):
    api_version = "0.11"
    prefix = "levikit-core"  # (the panel shows this tag; the lines it reads are the @@LEVIKIT ones)

    commands = {
        "levikit": {"description": "LeviKit 管理用（コンソール専用）", "usages": ["/levikit <action: str> [args: message]"], "permissions": ["levikit.admin"]},
        "dim": {"description": "ワールドを切り替える", "usages": ["/dim [world: str]"], "permissions": ["levikit.dim"]},
        "warp": {"description": "ワープする", "usages": ["/warp [name: str]"], "permissions": ["levikit.use"]},
        "setwarp": {"description": "今いる場所をワープにする", "usages": ["/setwarp <name: str>"], "permissions": ["levikit.admin"]},
        "delwarp": {"description": "ワープを消す", "usages": ["/delwarp <name: str>"], "permissions": ["levikit.admin"]},
        "hub": {"description": "ロビーへ行く", "usages": ["/hub"], "permissions": ["levikit.use"]},
        "spawn": {"description": "今いるワールドのスポーンへ行く", "usages": ["/spawn"], "permissions": ["levikit.use"]},
        "back": {"description": "前の場所へ戻る", "usages": ["/back"], "permissions": ["levikit.use"]},
        "tpa": {"description": "相手の所へ行くリクエストを送る", "usages": ["/tpa <player: str>"], "permissions": ["levikit.use"]},
        "tpaccept": {"description": "リクエストを許可する", "usages": ["/tpaccept"], "permissions": ["levikit.use"]},
        "tpdeny": {"description": "リクエストを断る", "usages": ["/tpdeny"], "permissions": ["levikit.use"]},
    }
    permissions = {
        "levikit.admin": {"description": "LeviKit の管理", "default": "op"},
        "levikit.dim": {"description": "/dim", "default": True},
        "levikit.use": {"description": "ワープなど", "default": True},
    }

    # ---------- start ----------
    def on_enable(self) -> None:
        self.cfg_file = Path("plugins") / "levikit-core" / "config" / "config.json"
        self.state_file = Path("plugins") / "levikit-core" / "data" / "endstone-state.json"
        self.cfg: dict = {}
        self.worlds: list[World] = []
        self.where: dict[str, str] = {}  # player name -> world key
        self.back: dict[str, list] = {}  # player name -> [world key, x, y, z]
        self.tpa: dict[str, tuple] = {}  # target name -> (requester name, expires at)
        self.motd: str = ""
        self.load_config()
        try:
            self.back = dict(json.loads(self.state_file.read_text("utf-8")).get("back", {}))
        except (OSError, ValueError):
            self.back = {}
        self.register_events(self)
        self.server.scheduler.run_task(self, self.tick_pos, delay=20, period=20)
        self.server.scheduler.run_task(self, self.tick_stats, delay=40, period=max(1, int(self.cfg["statsIntervalSeconds"])) * 20)
        self.emit("DIMS", self.worlds_json())
        self.emit("READY", {"limbo": bool(self.cfg["limboMode"]), "engine": "endstone"})

    def on_disable(self) -> None:
        self.save_state()

    def read_raw(self) -> dict:
        try:
            raw = json.loads(self.cfg_file.read_text("utf-8"))
            return raw if isinstance(raw, dict) else {}
        except (OSError, ValueError):
            return {}

    def write_raw(self, raw: dict) -> None:
        self.cfg_file.parent.mkdir(parents=True, exist_ok=True)
        self.cfg_file.write_text(json.dumps(raw, ensure_ascii=False, indent=2), "utf-8")

    def load_config(self) -> None:
        raw = self.read_raw()
        self.cfg = {**DEFAULTS, **{k: v for k, v in raw.items() if v is not None}}
        self.cfg["hub"] = {**DEFAULTS["hub"], **(raw.get("hub") or {})}
        self.worlds = [World(key, name, i, raw.get(field) or {}, base) for key, field, name, i, base in VANILLA]

    def save_state(self) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps({"back": self.back}, ensure_ascii=False), "utf-8")

    def emit(self, kind: str, data) -> None:
        self.logger.info(f"@@LEVIKIT {kind} {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}")

    # ---------- worlds ----------
    def world(self, key: str) -> World | None:
        k = key.lower()
        return next((w for w in self.worlds if k in (w.key, w.display.lower(), w.dim_name.lower())), None)

    def world_of(self, p: Player) -> World:
        name = p.dimension.name
        return next((w for w in self.worlds if w.dim_name == name), self.worlds[0])

    def players_in(self, w: World) -> list[Player]:
        return [p for p in self.server.online_players if p.dimension.name == w.dim_name]

    def worlds_json(self) -> list[dict]:
        return [
            {"id": w.id, "key": w.key, "display": w.display, "custom": False, "show": w.show, "open": w.rules["open"],
             "players": len(self.players_in(w)), "epoch": 0, "gameMode": w.rules["gameMode"], "group": "default", "generator": w.dim_name}
            for w in self.worlds
        ]

    def players_json(self) -> list[dict]:
        out = []
        for p in self.server.online_players:
            loc, w = p.location, self.world_of(p)
            out.append({"name": p.name, "xuid": p.xuid, "uuid": str(p.unique_id), "dim": w.id, "world": w.key,
                        "pos": [round(loc.x, 2), round(loc.y, 2), round(loc.z, 2)], "op": p.is_op, "simulated": False, "group": "default"})
        return out

    def in_role(self, name: str, names: list[str]) -> bool:
        """names: player names and @role names (the panel's 権限グループ)."""
        n = name.lower()
        for x in names:
            if x.startswith("@"):
                role = next((r for r in self.cfg["roles"] if r.get("name", "").lower() == x[1:].lower()), None)
                if role and n in [m.lower() for m in role.get("members", [])]:
                    return True
            elif x.lower() == n:
                return True
        return False

    def why_not(self, p: Player, w: World) -> str | None:
        """Why p may not enter w (None: may)."""
        r = w.rules
        if p.is_op:
            return None
        if not r["open"]:
            return "このワールドは閉鎖中です"
        if r["opOnly"]:
            return "このワールドは OP 専用です"
        if r["allowedPlayers"] and not self.in_role(p.name, r["allowedPlayers"]):
            return "このワールドに入る許可がありません"
        if r["maxPlayers"] and len([q for q in self.players_in(w) if q.name != p.name]) >= r["maxPlayers"]:
            return "このワールドは満員です"
        return None

    def spot(self, w: World) -> Location:
        dim = self.server.level.get_dimension(w.dim_name)
        s = w.spawn
        y = float(s["y"])
        if w.landing in ("surface", "auto"):
            top = dim.get_highest_block_y_at(int(s["x"]), int(s["z"]))
            if top > -64:
                y = top + 1.0
        return Location(dim, float(s["x"]), y, float(s["z"]))

    def go(self, p: Player, w: World, loc: Location | None = None) -> bool:
        no = self.why_not(p, w)
        if no:
            p.send_error_message(no)
            return False
        here = p.location
        self.back[p.name] = [self.world_of(p).key, here.x, here.y, here.z]
        p.teleport(loc or self.spot(w))
        return True

    def entered(self, p: Player, before: World | None, now: World) -> None:
        if before and before.key != now.key:
            for c in before.rules["leaveCommands"]:
                self.server.dispatch_command(self.server.command_sender, c.replace("{player}", p.name))
        mode = MODES.get(str(now.rules["gameMode"]).lower())
        if mode is not None and p.game_mode != mode:
            p.game_mode = mode
        if now.rules["enterTitle"]:
            p.send_title(now.rules["enterTitle"], now.rules["enterSubtitle"])
        for c in now.rules["enterCommands"]:
            self.server.dispatch_command(self.server.command_sender, c.replace("{player}", p.name))
        self.where[p.name] = now.key
        self.emit("WORLD_CHANGE", {"player": p.name, "from": before.key if before else "", "to": now.key})

    # ---------- who may join ----------
    def denied(self, name: str, xuid: str, op: bool) -> str | None:
        now = time.time()
        for b in self.cfg["bans"]:
            if (b.get("name", "").lower() == name.lower() or (xuid and b.get("xuid") == xuid)) and (not b.get("until") or b["until"] > now):
                return "§cBAN されています" + (f"\n§7理由: {b['reason']}" if b.get("reason") else "")
        if self.cfg["maintenance"] and not op and not self.in_role(name, self.cfg["maintenanceAllow"]):
            return self.cfg["maintenanceMessage"]
        return None

    @event_handler
    def on_login(self, e: PlayerLoginEvent) -> None:
        why = self.denied(e.player.name, e.player.xuid, e.player.is_op)
        if why:
            e.kick_message = why
            e.is_cancelled = True
            self.emit("DENIED", {"name": e.player.name, "xuid": e.player.xuid, "reason": why})

    @event_handler
    def on_join(self, e: PlayerJoinEvent) -> None:
        p = e.player
        self.emit("JOIN", {"name": p.name, "xuid": p.xuid, "uuid": str(p.unique_id)})
        if self.cfg["limboMode"]:
            p.send_message(self.cfg["limboMessage"])
            return
        if self.cfg["welcomeMessage"]:
            p.send_message(self.cfg["welcomeMessage"].replace("{name}", p.name))
        self.entered(p, None, self.world_of(p))
        if self.cfg["hub"]["mode"] == "always" and self.cfg["hub"]["target"]:
            self.server.scheduler.run_task(self, lambda: self.hub_now(p), delay=10)

    @event_handler
    def on_quit(self, e: PlayerQuitEvent) -> None:
        self.where.pop(e.player.name, None)
        self.tpa.pop(e.player.name, None)
        self.emit("LEAVE", {"name": e.player.name, "xuid": e.player.xuid})

    @event_handler
    def on_dimension(self, e: PlayerDimensionChangeEvent) -> None:
        p = e.player
        before = self.world(self.where.get(p.name, "")) or next((w for w in self.worlds if w.dim_name == e.from_dimension.name), None)
        now = next((w for w in self.worlds if w.dim_name == e.to_dimension.name), self.worlds[0])
        no = self.why_not(p, now)
        if no and before and before.key != now.key:  # a portal took them where they may not be: back out
            p.send_error_message(no)
            self.server.scheduler.run_task(self, lambda: self.put_back(p, before), delay=2)
            return
        self.entered(p, before, now)

    @event_handler
    def on_death(self, e: PlayerDeathEvent) -> None:
        loc = e.player.location
        self.back[e.player.name] = [self.world_of(e.player).key, loc.x, loc.y, loc.z]

    # ---------- rules ----------
    def may_build(self, p: Player, x: float, z: float) -> bool:
        w = self.world_of(p)
        r = w.rules
        if r["protection"] == "none" or p.is_op or self.in_role(p.name, r["builders"]):
            return True
        if r["protection"] == "spawn":
            return abs(x - w.spawn["x"]) > r["protectionRadius"] or abs(z - w.spawn["z"]) > r["protectionRadius"]
        return False

    @event_handler
    def on_break(self, e: BlockBreakEvent) -> None:
        if not self.may_build(e.player, e.block.x, e.block.z):
            e.is_cancelled = True
            e.player.send_popup("§cここでは建築できません")

    @event_handler
    def on_place(self, e: BlockPlaceEvent) -> None:
        if not self.may_build(e.player, e.block.x, e.block.z):
            e.is_cancelled = True
            e.player.send_popup("§cここでは建築できません")

    @event_handler
    def on_damage(self, e: ActorDamageEvent) -> None:
        victim, by = e.actor, e.damage_source.actor
        if isinstance(victim, Player) and isinstance(by, Player) and not self.world_of(victim).rules["pvp"]:
            e.is_cancelled = True

    @event_handler
    def on_chat(self, e: PlayerChatEvent) -> None:
        p, w = e.player, self.world_of(e.player)
        self.emit("CHAT", {"name": p.name, "message": e.message, "world": w.key})
        mode = self.cfg["chatMode"]
        if mode not in ("prefix", "world"):
            return
        msg, everyone = e.message, mode == "prefix"
        if mode == "world" and msg.startswith("!"):
            msg, everyone = msg[1:].strip(), True
        tag = "§6全体" if mode == "world" and everyone else w.display
        e.is_cancelled = True
        for q in self.server.online_players if everyone else self.players_in(w):
            q.send_message(f"§7[{tag}§7] §f<{p.name}> {msg}")

    @event_handler
    def on_ping(self, e: ServerListPingEvent) -> None:
        if self.motd:
            e.motd = self.motd

    # ---------- the panel's lines ----------
    def tick_pos(self) -> None:
        ps = self.server.online_players
        if ps:
            self.emit("POS", [{"n": p.name, "w": self.world_of(p).key, "x": int(p.location.x), "y": int(p.location.y), "z": int(p.location.z)} for p in ps])

    def tick_stats(self) -> None:
        ps = self.server.online_players
        self.emit("STATS", {"tps": round(self.server.current_tps, 1), "players": len(ps), "worlds": {w.key: len(self.players_in(w)) for w in self.worlds}})

    # ---------- going places ----------
    def hub_now(self, p: Player) -> None:
        self.to_target(p, self.cfg["hub"]["target"])

    def put_back(self, p: Player, w: World) -> None:
        p.teleport(self.spot(w))

    def to_target(self, p: Player, target: str) -> bool:
        """world:<key> | warp:<name> | <key>."""
        kind, _, name = target.partition(":")
        if kind == "warp":
            return self.warp(p, name)
        w = self.world(name if kind in ("world", "last") else target)
        if not w:
            p.send_error_message(f"行き先がありません: {target}")
            return False
        return self.go(p, w)

    def warp(self, p: Player, name: str) -> bool:
        wp = next((x for x in self.cfg["warps"] if x.get("name", "").lower() == name.lower()), None)
        w = self.world(wp.get("world", "overworld")) if wp else None
        if not wp or not w:
            p.send_error_message(f"ワープ「{name}」はありません")
            return False
        if wp.get("opOnly") and not p.is_op:
            p.send_error_message("このワープは OP 専用です")
            return False
        dim = self.server.level.get_dimension(w.dim_name)
        if self.go(p, w, Location(dim, float(wp["x"]), float(wp["y"]), float(wp["z"]), 0.0, float(wp.get("yaw", 0.0)))):
            p.send_message(f"{P}ワープ「{wp['name']}」へ移動しました")
            return True
        return False

    def menu(self, p: Player) -> None:
        form = ActionForm(title="ワールド", content="行き先を選んでください")
        for w in self.worlds:
            if not w.show:
                continue
            no = self.why_not(p, w)
            label = f"{w.display}\n§8{len(self.players_in(w))} 人" + (" · 入れません" if no else "")
            form.add_button(label, w.icon or None, lambda q, w=w: self.dim_to(q, w))
        p.send_form(form)

    def dim_to(self, p: Player, w: World) -> None:
        if self.go(p, w):
            p.send_message(f"{P}{w.display} へ移動しました")

    # ---------- commands ----------
    def console(self, sender: CommandSender, args: list[str]) -> bool:
        if isinstance(sender, Player):
            sender.send_error_message("コンソール専用です")
            return True
        action, rest = (args[0] if args else ""), (args[1] if len(args) > 1 else "")
        if action == "transfer":
            host, _, port = rest.partition(" ")
            if not host or not (port or "19132").isdigit():
                sender.send_error_message("levikit transfer <host> <port>")
                return True
            ps = self.server.online_players
            self.save_state()
            for p in ps:
                p.transfer(host, int(port or 19132))
            self.emit("TRANSFER", {"host": host, "port": int(port or 19132), "count": len(ps)})
            sender.send_message(f"transferred {len(ps)} player(s) to {host}:{port or 19132}")
        elif action == "players":
            self.emit("PLAYERS", self.players_json())
        elif action == "dims":
            self.emit("DIMS", self.worlds_json())
        elif action == "stats":
            self.tick_stats()
        elif action == "reload":
            self.load_config()
            for p in self.server.online_players:  # bans and maintenance act at once; a closed world empties
                why = self.denied(p.name, p.xuid, p.is_op)
                no = self.why_not(p, self.world_of(p))
                if why:
                    p.kick(why)
                elif no:
                    p.send_error_message(no)
                    p.teleport(self.spot(self.worlds[0]))
            self.emit("DIMS", self.worlds_json())
            self.emit("RELOADED", {"maintenance": bool(self.cfg["maintenance"]), "bans": len(self.cfg["bans"]), "warps": len(self.cfg["warps"]), "portals": 0})
        elif action == "save":
            self.save_state()
            sender.send_message("ok")
        elif action == "motd":
            self.motd = rest[1:-1] if len(rest) > 1 and rest[0] == rest[-1] == '"' else rest
            sender.send_message("motd updated")
        else:
            sender.send_error_message("levikit transfer <host> <port> | players | dims | stats | reload | save | motd <text>")
        return True

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        name = command.name
        if name == "levikit":
            return self.console(sender, args)
        if not isinstance(sender, Player):
            if name == "dim":
                self.emit("DIMS", self.worlds_json())
            else:
                sender.send_error_message("プレイヤー専用です")
            return True
        p = sender
        if name == "dim":
            self.cmd_dim(p, args)
        elif name == "warp":
            if args:
                self.warp(p, args[0])
            else:
                names = [x["name"] for x in self.cfg["warps"] if not x.get("opOnly") or p.is_op]
                p.send_message(P + ("ワープ: " + ", ".join(names) if names else "ワープはまだありません"))
        elif name == "setwarp":
            loc = p.location
            warps = [x for x in self.cfg["warps"] if x.get("name", "").lower() != args[0].lower()]
            warps.append({"name": args[0], "world": self.world_of(p).key, "x": round(loc.x, 2), "y": round(loc.y, 2), "z": round(loc.z, 2), "yaw": round(loc.yaw, 1), "description": "", "opOnly": False})
            self.set_warps(warps)
            p.send_message(f"{P}ワープ「{args[0]}」を作りました")
        elif name == "delwarp":
            warps = [x for x in self.cfg["warps"] if x.get("name", "").lower() != args[0].lower()]
            if len(warps) == len(self.cfg["warps"]):
                p.send_error_message(f"ワープ「{args[0]}」はありません")
            else:
                self.set_warps(warps)
                p.send_message(f"{P}ワープ「{args[0]}」を消しました")
        elif name == "hub":
            if not self.cfg["hub"]["target"]:
                p.send_error_message("ロビーが設定されていません")
            else:
                self.to_target(p, self.cfg["hub"]["target"])
        elif name == "spawn":
            if not self.cfg["spawnCommand"]:
                p.send_error_message("/spawn は使えません")
            elif self.go(p, self.world_of(p)):
                p.send_message(f"{P}スポーンへ移動しました")
        elif name == "back":
            b = self.back.get(p.name)
            w = self.world(b[0]) if b else None
            if not self.cfg["backCommand"]:
                p.send_error_message("/back は使えません")
            elif not b or not w:
                p.send_error_message("戻る場所がありません")
            elif self.go(p, w, Location(self.server.level.get_dimension(w.dim_name), b[1], b[2], b[3])):
                p.send_message(f"{P}前の場所へ戻りました")
        elif name == "tpa":
            self.tpa_ask(p, args[0])
        elif name in ("tpaccept", "tpdeny"):
            self.tpa_answer(p, name == "tpaccept")
        return True

    def cmd_dim(self, p: Player, args: list[str]) -> None:
        if not self.cfg["dimCommandForEveryone"] and not p.is_op:
            p.send_error_message("このコマンドは OP 専用です")
        elif not args:
            self.menu(p)
        elif args[0] == "list":
            p.send_message(P + " / ".join(f"{w.display}（{w.key}・{len(self.players_in(w))} 人）" for w in self.worlds if w.show))
        elif args[0] == "who":
            p.send_message(P + " / ".join(f"{w.display}: {', '.join(q.name for q in self.players_in(w)) or '-'}" for w in self.worlds))
        elif args[0] == "info":
            w = self.world_of(p)
            r = w.rules
            p.send_message(f"{P}{w.display}: ゲームモード {r['gameMode'] or '指定なし'} · PvP {'あり' if r['pvp'] else 'なし'} · 建築保護 {r['protection']}")
        elif args[0] == "setspawn":
            if not p.is_op:
                p.send_error_message("このコマンドは OP 専用です")
            else:
                self.set_spawn(p)
        else:
            w = self.world(args[0])
            if not w:
                p.send_error_message(f"ワールド「{args[0]}」はありません（/dim list）")
            else:
                self.dim_to(p, w)

    def set_warps(self, warps: list) -> None:
        raw = self.read_raw()
        raw["warps"] = warps
        self.write_raw(raw)
        self.cfg["warps"] = warps

    def set_spawn(self, p: Player) -> None:
        w, loc = self.world_of(p), p.location
        field = next(f for k, f, _, _, _ in VANILLA if k == w.key)
        raw = self.read_raw()
        entry = raw.get(field) or {}
        entry["spawn"] = {"x": round(loc.x, 2), "y": round(loc.y, 2), "z": round(loc.z, 2)}
        entry["landing"] = "fixed"
        raw[field] = entry
        self.write_raw(raw)
        self.load_config()
        p.send_message(f"{P}{w.display} のスポーンをここにしました")

    def tpa_ask(self, p: Player, name: str) -> None:
        t = self.server.get_player(name)
        if not self.cfg["tpaEnabled"]:
            p.send_error_message("/tpa は使えません")
        elif t is None or t.name == p.name:
            p.send_error_message(f"{name} さんはいません")
        elif not self.cfg["tpaCrossWorld"] and self.world_of(t).key != self.world_of(p).key:
            p.send_error_message("別のワールドにいる相手には /tpa できません")
        else:
            self.tpa[t.name] = (p.name, time.time() + int(self.cfg["tpaTimeoutSeconds"]))
            p.send_message(f"{P}{t.name} さんにリクエストを送りました")
            t.send_message(f"{P}{p.name} さんがあなたの所へ来ようとしています。/tpaccept で許可、/tpdeny で断れます")

    def tpa_answer(self, t: Player, yes: bool) -> None:
        req = self.tpa.pop(t.name, None)
        p = self.server.get_player(req[0]) if req and req[1] > time.time() else None
        if p is None:
            t.send_error_message("リクエストはありません")
        elif not yes:
            t.send_message(f"{P}リクエストを断りました")
            p.send_message(f"{P}{t.name} さんに断られました")
        elif self.go(p, self.world_of(t), t.location):
            t.send_message(f"{P}{p.name} さんが来ました")
            p.send_message(f"{P}{t.name} さんの所へ移動しました")

"""/tempban <player> <minutes> [reason]: kicks now and refuses the player's login until the time is up, showing the reason and
the time left on their disconnect screen; kept across restarts (bans.json). /bans lists them, /unban2 <player> lifts one
early. BDS scripts can kick, but cannot refuse a login or show why."""
import json
import os
import time

from endstone.command import Command, CommandSender
from endstone.event import PlayerLoginEvent, event_handler
from endstone.plugin import Plugin


def left(until: float) -> str:
    s = max(0, int(until - time.time()))
    return f"{s // 60}m {s % 60}s"


class Tempban(Plugin):
    api_version = "0.11"
    prefix = "Tempban"
    commands = {
        "tempban": {"description": "Ban a player for some minutes", "usages": ["/tempban <player: str> <minutes: float> [reason: message]"], "permissions": ["tempban.command"]},
        "bans": {"description": "List timed bans", "usages": ["/bans"], "permissions": ["tempban.command"]},
        "unban2": {"description": "Lift a timed ban", "usages": ["/unban2 <player: str>"], "permissions": ["tempban.command"]},
    }
    permissions = {"tempban.command": {"description": "Use timed bans", "default": "op"}}

    def on_enable(self) -> None:
        self.data_folder.mkdir(parents=True, exist_ok=True)
        self.file = self.data_folder / "bans.json"
        self.bans: dict[str, dict] = {}
        if self.file.exists():
            try:
                raw = json.loads(self.file.read_text("utf-8"))
                self.bans = {str(k): v for k, v in raw.items() if isinstance(v, dict) and isinstance(v.get("until"), (int, float))}
            except (ValueError, AttributeError) as e:
                # a file this plugin cannot read is kept aside (bans.json.bad), never thrown away, and the plugin still starts
                os.replace(self.file, self.file.with_name("bans.json.bad"))
                self.logger.error(f"bans.json was not readable ({e}): kept as bans.json.bad, starting with no timed bans")
        self.register_events(self)

    def keep(self) -> None:
        now = time.time()
        self.bans = {k: v for k, v in self.bans.items() if v["until"] > now}
        # written whole, then moved over the old file: a crash mid-write never leaves half a bans.json
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.bans), "utf-8")
        os.replace(tmp, self.file)

    def ban_of(self, name: str) -> dict | None:
        b = self.bans.get(name.lower())
        return b if b and b["until"] > time.time() else None

    @event_handler
    def on_login(self, e: PlayerLoginEvent) -> None:
        b = self.ban_of(e.player.name)
        if b:
            e.kick_message = f"Banned: {b['reason']} ({left(b['until'])} left)"
            e.is_cancelled = True

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if command.name == "bans":
            self.keep()
            rows = [f"{v['name']}: {v['reason']} ({left(v['until'])} left)" for v in self.bans.values()]
            sender.send_message("timed bans: " + (" | ".join(rows) or "none"))
            return True
        if not args:
            return False
        name = args[0]
        if command.name == "unban2":
            if self.ban_of(name) is None:
                sender.send_error_message(f"{name} is not banned")
            else:
                del self.bans[name.lower()]
                self.keep()
                sender.send_message(f"{name} can join again")
            return True
        try:
            minutes = float(args[1])
        except (IndexError, ValueError):
            return False
        if not 0 < minutes <= 60 * 24 * 365:
            sender.send_error_message("minutes: more than 0, at most a year")
            return True
        reason = " ".join(args[2:]) or "no reason given"
        until = time.time() + minutes * 60
        self.bans[name.lower()] = {"name": name, "reason": reason, "until": until, "by": sender.name}
        self.keep()
        p = self.server.get_player(name)
        if p is not None:
            p.kick(f"Banned: {reason} ({left(until)} left)")
        sender.send_message(f"{name} banned for {minutes:g} min: {reason}")
        return True

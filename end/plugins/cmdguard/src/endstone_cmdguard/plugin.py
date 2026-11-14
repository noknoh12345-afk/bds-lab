"""Sees every command a player types, vanilla ones included, before it runs: /mute <player> [minutes] silences chat AND
/tell /msg /w /me (a BDS script can only stop chat); short aliases (/day /night /gmc /gms) rewrite into the real
command; every command is written to commands.log with time and place (rolled over to commands.log.1 past 5 MB). Mutes are kept
across restarts (mutes.json). BDS scripts cannot see or change vanilla commands."""
import json
import os
import time

from endstone.command import Command, CommandSender
from endstone.event import PlayerChatEvent, PlayerCommandEvent, event_handler
from endstone.plugin import Plugin

WHISPER = {"tell", "msg", "w", "me"}
ALIASES = {"day": "time set day", "night": "time set night", "gmc": "gamemode creative", "gms": "gamemode survival"}
LOG_MAX = 5 * 1024 * 1024  # bytes: then commands.log becomes commands.log.1 (one old file kept)


class Cmdguard(Plugin):
    api_version = "0.11"
    prefix = "CmdGuard"
    commands = {
        "mute": {"description": "Silence a player's chat and whispers", "usages": ["/mute <player: str> [minutes: float]"], "permissions": ["cmdguard.mute"]},
        "unmute": {"description": "Let a player talk again", "usages": ["/unmute <player: str>"], "permissions": ["cmdguard.mute"]},
    }
    permissions = {"cmdguard.mute": {"description": "Mute players", "default": "op"}}

    def on_enable(self) -> None:
        self.data_folder.mkdir(parents=True, exist_ok=True)
        self.mutes_file = self.data_folder / "mutes.json"
        self.muted: dict[str, float] = {}
        if self.mutes_file.exists():
            try:
                now = time.time()
                self.muted = {str(k): float(v) for k, v in json.loads(self.mutes_file.read_text("utf-8")).items() if float(v) > now}
            except (ValueError, AttributeError, TypeError) as e:
                self.logger.warning(f"mutes.json is not readable ({e}): starting with no mutes")
        self.register_events(self)

    def save_mutes(self) -> None:
        # written whole, then moved over the old file: a crash mid-write never loses every mute
        now = time.time()
        self.muted = {k: v for k, v in self.muted.items() if v > now}
        tmp = self.mutes_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.muted), "utf-8")
        os.replace(tmp, self.mutes_file)

    def log(self, line: str) -> None:
        f = self.data_folder / "commands.log"
        try:
            if f.stat().st_size > LOG_MAX:
                os.replace(f, f.with_name("commands.log.1"))
        except FileNotFoundError:
            pass
        with open(f, "a", encoding="utf-8") as out:
            out.write(line)

    def mute_left(self, name: str) -> int:
        s = int(self.muted.get(name.lower(), 0) - time.time())
        return s if s > 0 else 0

    @event_handler
    def on_player_command(self, e: PlayerCommandEvent) -> None:
        p, line = e.player, e.command.lstrip("/")
        word = line.split(" ", 1)[0].lower()
        loc = p.location
        # (one command, one line: a line break in it cannot write a made-up line into the log)
        safe = line.replace("\r", "\\r").replace("\n", "\\n")
        self.log(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {p.name} {loc.block_x} {loc.block_y} {loc.block_z} /{safe}\n")
        if word in WHISPER and self.mute_left(p.name):
            e.is_cancelled = True
            p.send_message(f"§cYou are muted ({self.mute_left(p.name)}s left)")
        elif word in ALIASES:
            e.command = "/" + ALIASES[word] + line[len(word):]

    @event_handler
    def on_chat(self, e: PlayerChatEvent) -> None:
        if self.mute_left(e.player.name):
            e.is_cancelled = True
            e.player.send_message(f"§cYou are muted ({self.mute_left(e.player.name)}s left)")

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if not args:
            return False
        name = args[0]
        if command.name == "unmute":
            self.muted.pop(name.lower(), None)
            self.save_mutes()
            sender.send_message(f"{name} can talk again")
            return True
        try:
            minutes = float(args[1]) if len(args) > 1 else 10
        except ValueError:
            return False
        if not 0 < minutes <= 10080:
            sender.send_error_message("minutes: more than 0, at most a week")
            return True
        self.muted[name.lower()] = time.time() + minutes * 60
        self.save_mutes()
        sender.send_message(f"{name} muted for {minutes:g} min")
        return True

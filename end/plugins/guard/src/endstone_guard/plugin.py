"""/guard <x1> <z1> <x2> <z2>: a no-entry zone in the dimension it is set in. Moves into it are cancelled on the server (the
client is pulled back); BDS scripts cannot stop a player's movement, only teleport them afterwards."""
import json
import os
import time

from endstone import Player
from endstone.level import Location
from endstone.command import Command, CommandSender
from endstone.event import PlayerMoveEvent, PlayerQuitEvent, event_handler
from endstone.plugin import Plugin

DEFAULT_DIM = "Overworld"


class Guard(Plugin):
    api_version = "0.11"
    prefix = "Guard"
    commands = {"guard": {"description": "Set or clear the no-entry zone", "usages": ["/guard <x1: int> <z1: int> <x2: int> <z2: int>", "/guard (off)<off: GuardOff>"], "permissions": ["guard.command.guard"]}}
    permissions = {"guard.command.guard": {"description": "Use /guard", "default": "op"}, "guard.bypass": {"description": "Walk into zones", "default": False}}

    def on_enable(self) -> None:
        self.file = self.data_folder / "zone.json"
        self.zone: list[int] | None = None
        self.dim = DEFAULT_DIM
        if self.file.exists():
            try:
                saved = json.loads(self.file.read_text("utf-8"))
                # (an older zone.json is the bare box: it was set in the overworld)
                box, dim = (saved["box"], saved.get("dim", DEFAULT_DIM)) if isinstance(saved, dict) else (saved, DEFAULT_DIM)
                if isinstance(box, list) and len(box) == 4 and all(isinstance(v, int) for v in box):
                    self.zone, self.dim = box, str(dim)
                else:
                    raise ValueError("not a box")
            except (ValueError, KeyError, TypeError) as e:
                self.logger.warning(f"zone.json is not readable ({e}): no zone until /guard sets one")
        self.warned: dict[str, int] = {}
        self.safe: dict[str, Location] = {}
        self.register_events(self)
        self.server.scheduler.run_task(self, self.sweep, delay=1, period=2)

    def inside(self, x: float, z: float, dim: str) -> bool:
        a = self.zone
        return bool(a) and dim == self.dim and a[0] <= x <= a[2] and a[1] <= z <= a[3]

    def depth(self, x: float, z: float, dim: str) -> float:
        a = self.zone
        if a is None or not self.inside(x, z, dim):
            return 0.0
        return min(x - a[0], a[2] - x, z - a[1], a[3] - z)

    def sweep(self) -> None:
        # the cancelled move pulls the client back; a step that still lands inside (a lagging client, a knockback)
        # is undone here: back to where they last stood outside — in the same dimension (a place in another one is not "back")
        for p in self.server.online_players:
            loc = p.location
            dim = loc.dimension.name
            if not self.inside(loc.x, loc.z, dim):
                self.safe[p.name] = loc
            elif p.name in self.safe and self.safe[p.name].dimension.name == dim and not p.has_permission("guard.bypass"):
                p.teleport(self.safe[p.name])

    @event_handler
    def on_move(self, e: PlayerMoveEvent) -> None:
        if not self.zone or e.player.has_permission("guard.bypass"):
            return
        t, f = e.to_location, e.from_location
        dim = t.dimension.name
        # no step that ends inside and is not on its way out (someone caught inside can still walk out)
        if self.inside(t.x, t.z, dim) and self.depth(t.x, t.z, dim) >= self.depth(f.x, f.z, f.dimension.name) - 1e-6:
            e.is_cancelled = True
            now = int(time.monotonic() * 20)
            if now - self.warned.get(e.player.name, -100) > 40:
                self.warned[e.player.name] = now
                e.player.send_tip("立入禁止 / No entry")

    @event_handler
    def on_quit(self, e: PlayerQuitEvent) -> None:
        # (nothing kept for someone who left: a server up for weeks does not keep every name it ever saw)
        self.warned.pop(e.player.name, None)
        self.safe.pop(e.player.name, None)

    def save(self) -> None:
        # written whole, then moved over the old file: a crash mid-write never leaves half a zone.json
        self.data_folder.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps({"box": self.zone, "dim": self.dim}), "utf-8")
        os.replace(tmp, self.file)

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if args and args[0] == "off":
            self.zone = None
            self.file.unlink(missing_ok=True)
            sender.send_message("zone cleared")
            return True
        try:
            x1, z1, x2, z2 = (int(a) for a in args[:4])
        except ValueError:
            return False
        self.zone = [min(x1, x2), min(z1, z2), max(x1, x2) + 1, max(z1, z2) + 1]
        # the dimension of whoever set it (the console: the overworld)
        self.dim = sender.location.dimension.name if isinstance(sender, Player) else DEFAULT_DIM
        self.save()
        sender.send_message(f"zone {self.zone[0]},{self.zone[1]} .. {self.zone[2]},{self.zone[3]}: no entry")
        return True

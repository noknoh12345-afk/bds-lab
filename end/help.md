## py
`py <code>` runs Python inside the server, on the server thread, through the lab's helper plugin (`scriptevent lab:py`, loaded only on lab servers).
An expression prints its value; statements run as a function body, so `return x` works: `py S.n = 3\nreturn S.n * 2`.
Names: `server`, `plugin` (the plugin under test, as Endstone loaded it), `p(name)` (last joined player without a name), `cmd("say hi")`, `dim("overworld")`, `inv(p)`, `block(x,y,z)`, `S` (a namespace kept for the whole run), `endstone`, `fmt(v)`.
Values print short: Player → name, ItemStack → `diamond*3`, Block → `stone@1,2,3`, Location → `x,y,z`, objects → `{field=value ...}`.

## events
`events on [PlayerJoinEvent PlayerChatEvent ...]` registers a MONITOR handler for every Endstone event class (names with or without "Event" filter them).
Output: `EV <Class> field=value ...` after all plugins handled it, so `is_cancelled=True` shows the final decision. `events off` stops printing.
`states on [health location inventory ...]` polls each player every tick and prints changes: `ST A location=3,-60,0`; the first line per player is `init`.
Script API events (bp/scripts) instead: `sapi events on`.

## reload
`do` after an edit: the lab asks the helper to forget your package's modules, sends Endstone's `/reload` (plugins + scripts), and waits for the helper to report back. Players stay; your plugin's on_disable/on_load/on_enable run again.
Changed pyproject.toml (entry point, name) or packs: `reload --full` (restart, world kept). If /reload does not come back, the lab restarts by itself.
Module-level state is rebuilt on reload; keep what must survive in `self.data_folder` files.

## cpp
`new <name> --cpp`: CMakeLists.txt (FetchContent endstone at the pinned tag + `endstone_add_plugin`) and `src/<name>.cpp` with `ENDSTONE_PLUGIN("name", "version", Class) { ... }`.
Needs cmake and a C++20 compiler: Linux clang + libc++ (Endstone's requirement), Windows MSVC. The first build fetches Endstone's headers (network). The built library goes into each lab server's plugins/.
`trace`/`cov`/`prof`/`py` see Python only; for C++ use `logger` output, `events on`, `states on`, `py` to inspect the world.

## server
The lab keeps a Python venv at `.lab/py` with `endstone` from PyPI (pinned to the release line that supports this BDS; `LAB_ENDSTONE="endstone==x.y.z"` overrides; `LAB_PYTHON` picks the interpreter) and lets Endstone download the BDS it supports into `.lab/bds`.
Each server instance gets its own entry-point metadata for your plugin (no pip install per run), so your src/ is what runs and instances never mix.
`server` shows versions · `server --update` newest compatible Endstone + its BDS · `server 0.11.12` a specific Endstone.
Endstone keeps IPv6 off by default; the lab needs no IPv6 shim here.
macOS: Endstone ships no macOS wheels, so the venv, Endstone and its BDS live in the lab's linux/amd64 container (`help human`); pyright on the host reads the container venv's site-packages, Python syntax checks use the host's python3 when there is one. C++ plugins build in the same image (cmake, ninja, clang, libc++).

## packets
`packets on [name|id ...]` taps PacketReceiveEvent/PacketSendEvent (Endstone): `PK A> name {decoded}` from the client, `PK A< name {..}` to it. Decoded on the host with the real player's protocol tables (installed by the first `@A join`; ids + hex before that). Without names the per-tick noise (chunks, movement, attributes, sounds, auth input) is hidden. `packets drop <name|id> [n] [in|out]` cancels the next n: how does the plugin (or the client) cope with a lost packet. `packets off`.
## fuzz
`fuzz <command> [n] [seed]` calls the command's on_command n times with arguments generated from its `usages` (`<n: int>` → 0 -1 2147483647 abc ..., str → empty, unicode, 300 chars, quotes; player/target → online names, @a, nobody; enums → each value + a wrong one; optionals sometimes left out). Each distinct failure once: `E FUZZ ValueError: .. (src/../plugin.py:23) <- /cmd abc`. Same seed = same inputs.
## lag
`lag <ms> [ticks]` sleeps on the server thread every tick (TPS drops as on a busy server): timers, scheduler tasks, movement checks. `perf` shows the effect. `watch <expr>` / `watch off`: a Python expression evaluated every tick, `W expr = value` on change.
## ideas
What Endstone does that BDS scripts cannot. Each is a working sample in examples/<name>/ (tests.txt passes on the real server; `examples` lists them, `new <n> --from <name>` copies one into your plugins/). Read examples/<name>/src/endstone_<name>/plugin.py (~50 lines) and its tests.txt, then write yours in `new <yours>`:
- webapi: an HTTP API in the server (GET /status, POST /say with a token): threading + a snapshot the server thread refreshes
- bossbar: per-player boss bars (`server.create_boss_bar`, `bar.add_player`)
- toast: toast cards (`player.send_toast`)
- sidebar: a private sidebar per player (`server.create_scoreboard()` → `player.scoreboard = sb`)
- whois: IP, ping, device, OS, language, client version (`player.address/ping/device_os/locale/game_version`)
- guard: a no-entry zone (cancel `PlayerMoveEvent` + pull back what slips through)
- antispam: drop raw packets before the game sees them (`PacketReceiveEvent`, `is_cancelled`)
- hub: send a player to another server (`player.transfer(host, port)`)
- motd: the server list line per ping (`ServerListPingEvent.motd/level_name`); test with `serverping`
- sqlstats: SQLite statistics + leaderboard across restarts (`sqlite3`, `self.data_folder`)
- skinpng: players' skins as PNG files (`player.skin.image` numpy RGBA)
- pixelmap: pixel art on map items (`server.create_map`, `MapRenderer.render` → `canvas.set_pixel_color`, `MapMeta.map_view`)
- qrmap: any PyPI library (`lib add qrcode`): a QR code drawn on a map
- abilities: flight and walking speed per player (`player.allow_flight`, `walk_speed`)
- i18n: every player in their own game language (`player.locale`), one broadcast → each player's language
- tempban: refuse a login with a reason and time left (`PlayerLoginEvent.kick_message` + `is_cancelled`), kept in a JSON file
- worldpng: the land as a PNG file + map item (`dim.get_highest_block_at(x, z)`, zlib PNG writer, `MapRenderer`)
- livemap: a live web map in the browser (HTTP server thread + a PNG of the land, redrawn one row per tick, player dots, auto-refreshing page)
- cmdguard: see/cancel/rewrite every typed command, vanilla too (`PlayerCommandEvent.command` settable): full mute, aliases, a command log
- report: a report system (`/report` for everyone, `/reports` for ops through `permissions` with `"default": "op"`, an enum argument `(clear)<action: ReportsClear>`), kept in SQLite with a per-pair cooldown that holds over a restart
More in the same vein: raw packets out (`player.send_packet`), `player.kick`, server stats (`server.average_tps/mspt`), outbound HTTP/WebSocket libraries (Discord bridges) in a thread, file backups, numpy/Pillow image work, C++ plugins (`new --cpp`) for anything the Python API lacks.
## import
A person's plugin (fix, update, finish): `node lab.mjs import <plugin.whl|.tar.gz|.zip|folder> ["<what they asked>"] [--name n]` (paths from where you are; from PyPI: `pip download --no-deps endstone-<name>` gives its wheel; GitHub's "Download ZIP" or a release's source archive works too; a C++ plugin as its source with CMakeLists.txt — a built .so/.dll alone cannot be tested) → plugins/<name>/ named by its entry point, with its distribution name, entry point and version kept (their servers update in place). A wheel or a setup.py project gets a pyproject.toml from its metadata (dependencies without the dev extras); a flat layout (<pkg>/ beside pyproject.toml) is moved under src/ — the layout the lab reads and packs; an sdist holding an example project too: the shallow one. Then the brief (read without running it, end/brief.py: the standard library's ast): what it is (class file:line, api_version — read from a plugin.yml when a class decorator loads it, as Endstone sees it — and whether this Endstone loads that version: E when it does not), every command with the usage, aliases, permissions and what answers it (an on_command branch, the code after the named branches, an executor from register_command — or nothing, said), permissions with their defaults, every @event_handler with the event class and whether its class is ever passed to register_events (one never registered never runs, said), scheduler tasks, its data files, what it could do outside the game (processes, network, eval, deleting, writing files: someone else's code — read those lines before it runs), calls that freeze the server thread, imports no declared dependency provides (by what the installed packages say they give; `lib add` names the fix), invalid string escapes, then the type check against this Endstone's stubs: what is not in this Endstone's API in full (a removed attribute, a renamed call, a property overridden), the other type errors counted by kind — go stops on both. tests.txt starts as a draft that runs each way in once: loads, each command with the shortest valid arguments (an enum's first value, a player as A, a position 0 -60 0), each registered event made to happen once by a player (join, leave, chat, a block broken or placed, a mob hit, a move, a drop, a death …), its repeating task for a while, a restart — an unexpected E line (a Python traceback) fails a section, so the first `go` shows every crashing path at once. Add what the request wants under each. `node lab.mjs brief` prints the brief again; `brief --live` starts the plugin on a fresh real server and says what Endstone itself sees — enabled or not with the errors that say why, its commands as registered beside the ones read from the code (a commands dict built at runtime shows up here). go's name checks are Endstone's own: the distribution must be "endstone-" + the entry point's name (- and _ alike), the plugin is then called by that name with - as _ (its data folder, get_plugin).

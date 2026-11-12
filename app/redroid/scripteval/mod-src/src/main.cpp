// ScriptEval - evaluate Script API style JavaScript against the *client's*
// own world state (works while connected to any server, no addon needed).
#include <sys/stat.h>

#include <thread>

#include "blocks.h"
#include "common.h"
#include "config.h"
#include "jsengine.h"
#include "memory.h"
#include "platform.h"
#include "repl.h"
#include "respack.h"
#include "session.h"
#include "studio.h"
#include "rtti.h"
#include "ui.h"

namespace {
bool g_preinitDone = false;
bool g_initDone = false;

const char* kAutorun = R"JS(// scripts/autorun.js - executed once when ScriptEval starts (as an ES module).
// Define helpers here; everything you put on globalThis is available in the console.
//
// import { world, system } from "@minecraft/server";
//
// globalThis.me = () => world.getLocalPlayer();
)JS";

const char* kPlayers = R"JS(// scripts/players.js - list loaded players with distance (run with the Scripts... window or `.run players`)
import { world } from "@minecraft/server";

const me = world.getLocalPlayer();
const here = me.location;
for (const p of world.getAllPlayers()) {
  const d = Math.round(dist(p.location, here) * 10) / 10;
  console.log(`${p.name.padEnd(16)} ${String(d).padStart(7)}m  ${fmt(p.location)}  ${p.dimension.id}${p.isLocalPlayer ? "  (you)" : ""}`);
}
console.log("player list (all online):", world.getPlayerList().map(p => p.name).join(", "));
)JS";

const char* kEntities = R"JS(// scripts/entities.js - entity census around you
import { world } from "@minecraft/server";

const me = world.getLocalPlayer();
const near = me.dimension.getEntities({ location: me.location, maxDistance: 64 });
const counts = {};
for (const e of near) counts[e.typeId] = (counts[e.typeId] ?? 0) + 1;
console.table(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, n]) => ({ type, n })));
)JS";

const char* kWatch = R"JS(// scripts/watch.js - print players entering/leaving render distance (stop with client.reset())
import { world, system } from "@minecraft/server";

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId === "minecraft:player") console.log(`[watch] ${entity.name} loaded at ${fmt(entity.location)}`);
});
world.afterEvents.playerJoin.subscribe(({ playerName }) => console.log(`[watch] ${playerName} joined the server`));
world.afterEvents.playerLeave.subscribe(({ playerName }) => console.log(`[watch] ${playerName} left the server`));
console.log("watching... (system.clearAll() does not remove event handlers; reload with client.reset())");
)JS";

const char* kDebugMenu = R"JS(// scripts/debugmenu.js - a small debug menu built with @minecraft/server-ui.
// The form is shown locally in a launcher overlay window (nothing is sent to the server).
import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const actions = [
  ["Players (loaded + player list)", () => console.table(client.players().map(p => ({
    name: p.name, distance: p.distance ?? "-", where: p.location ? fmt(p.location) : "(not loaded)" })))],
  ["Entities within 32 blocks", () => console.table(client.nearby(32))],
  ["Entity count by type", () => console.table(Object.entries(client.countByType()).map(([type, n]) => ({ type, n })))],
  ["Sidebar scoreboard", () => console.log(client.sidebar() ?? "no sidebar objective")],
  ["Toggle the players panel", () => console.log(client.playersPanel())],
  ["Watch my position", () => client.watch(() => fmt(world.getLocalPlayer().location), "my position")],
  ["Status", () => console.log(client.status())],
];

const form = new ActionFormData().title("ScriptEval debug menu").body("Pick something to inspect:");
for (const [label] of actions) form.button(label);
form.show(world.getLocalPlayer()).then(r => {
  if (!r.canceled) actions[r.selection][1]();
});
)JS";

void writeIfMissing(const std::string& path, const char* content) {
    struct stat st;
    if (stat(path.c_str(), &st) == 0) return;
    se::platform::writeFile(path, content);
}

void preinit() {
    if (g_preinitDone) return;
    g_preinitDone = true;
    se::platform::loadLauncherApis();
    std::string dir = se::platform::dataDir();
    se::platform::mkdirs(dir + "/scripts");
    se::logInit(dir + "/log.txt");
    std::string err;
    if (!se::config().load(dir + "/config.json", &err)) SE_LOGE("config.json: %s (using defaults)", err.c_str());
    se::session::init();
    // forced global resource packs go back into global_resource_packs.json before the game reads it
    se::respack::enforceAtStartup();
    writeIfMissing(dir + "/scripts/autorun.js", kAutorun);
    writeIfMissing(dir + "/scripts/players.js", kPlayers);
    writeIfMissing(dir + "/scripts/entities.js", kEntities);
    writeIfMissing(dir + "/scripts/watch.js", kWatch);
    writeIfMissing(dir + "/scripts/debugmenu.js", kDebugMenu);
    SE_LOGI("ScriptEval preinit (data dir: %s)", dir.c_str());
    se::ui::init();
}
}  // namespace

extern "C" void scripteval_install_input_backend();  // input_backend.cpp

extern "C" __attribute__((visibility("default"))) void mod_preinit() { preinit(); }

extern "C" __attribute__((visibility("default"))) void mod_init() {
    preinit();
    if (g_initDone) return;
    g_initDone = true;
    se::mem::init();
    {
        auto it = se::config().offsets.find("getBlockSlot");
        if (it != se::config().offsets.end()) se::blocks::setGetBlockSlot(it->second);
    }
    se::js::start();
    scripteval_install_input_backend();  // injectInput のバックエンドを登録(戦略A: 直接書き込み)
    se::repl::start(se::config().replBind.c_str(), se::config().replPort);
    se::studio::start(se::config().studioBind.c_str(), se::config().studioPort);
    se::respack::startWatcher();
    // Build the RTTI index in the background so the first evaluation is fast.
    std::thread([] {
        try {
            se::sleepMs(2000);
            std::string err;
            if (!se::ensureRtti(&err)) SE_LOGE("RTTI: %s", err.c_str());
        } catch (...) {
            SE_LOGE("RTTI: exception while building the index");
        }
    }).detach();
    if (se::config().autorun && !se::session::safeMode()) {
        std::string code;
        if (se::platform::readFile(se::platform::dataDir() + "/scripts/autorun.js", code) && !code.empty())
            se::js::submit("runScript(\"autorun.js\")", "<autorun>", se::js::Echo::Output);
    }
    SE_LOGI("ScriptEval %s ready (game %s)", se::kVersion, se::platform::gameVersion().c_str());
}

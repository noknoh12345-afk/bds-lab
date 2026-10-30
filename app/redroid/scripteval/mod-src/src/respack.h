// Global resource packs, managed from Studio (and client.packs in JS).
//
// The browser unpacks a .mcpack / .zip / .mcaddon and uploads the files one by
// one; they are staged under <dataDir>/tmp and then moved into
// games/com.mojang/resource_packs. Activating a pack edits
// games/com.mojang/minecraftpe/global_resource_packs.json, the list the game
// reads when it starts.
//
// "Forced" packs are remembered in <dataDir>/packs.json and put back into
// global_resource_packs.json at every launch (before the game reads it) and
// whenever the file loses them, so switching them off in the game's settings
// does not stick. Studio (or client.packs.force(id, false)) turns that off;
// "forcePacks": false in config.json disables it altogether.
//
// Only resource packs (assets) are accepted: packs with behavior ("data") or
// script modules are refused.
#pragma once

#include <string>

#include "config.h"

namespace se::respack {

// games/com.mojang of the running game (config "comMojangDir", else detected).
std::string comMojangDir();
// mod_preinit: puts the forced packs back before the game reads its settings.
void enforceAtStartup();
// mod_init: re-checks global_resource_packs.json every few seconds.
void startWatcher();

// global_resource_packs.json is a stack: the game applies it from the first entry
// to the last, so the LAST entry has the highest priority. Everything ScriptEval
// reports lists active packs highest priority first (like the game's settings
// screen), and "move" takes delta > 0 for "higher priority".
//
// Studio / JS entry point. Methods:
//   list                              -> state of every pack (active: highest priority first)
//   begin {}                          -> {upload}
//   commit {upload, activate, force}  -> installs the staged files
//   abort {upload}
//   enable {id, force?, subpack?}  disable {id}  force {id, on}
//   subpack {id, subpack}  move {id, delta}  remove {id}  icon {id}
// `id` is the pack UUID (or its folder name). Returns false with err set on failure.
bool call(const std::string& method, const JsonValue& params, std::string& resultJson, std::string& err);
// One binary chunk of an upload. params: {upload, path, offset}
bool put(const JsonValue& params, const char* data, size_t len, std::string& resultJson, std::string& err);

struct Summary {
    bool found = false;  // the com.mojang folder exists
    int installed = 0, active = 0, forced = 0, missing = 0;
    bool restartNeeded = false;  // the active list changed since the game started
    bool fileOk = true;          // global_resource_packs.json is readable JSON (or absent)
};
Summary summary();

}  // namespace se::respack

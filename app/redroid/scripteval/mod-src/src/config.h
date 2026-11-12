// ScriptEval configuration (config.json in the data directory).
#pragma once

#include <map>
#include <string>
#include <vector>

namespace se {

struct Config {
    int replPort = 25599;           // 0 disables the TCP REPL
    std::string replBind = "127.0.0.1";
    std::string tickHook = "auto";  // "auto" | "off"
    int tickHookSlot = -1;          // force a LocalPlayer vtable slot
    int tickSampleMs = 1500;
    int evalTimeoutMs = 3000;
    int tickTimeoutMs = 1000;       // budget for system.run* callbacks per game tick
    std::string hotkey = "F8";      // toggles the console window ("" disables)
    bool autorun = true;            // run scripts/autorun.js at start
    int consoleLines = 60;          // lines shown in the in-game window
    bool gameCalls = true;          // allow calling game functions (dimension.getBlock)
    int studioPort = 25600;         // ScriptEval Studio (browser IDE) + MCP; 0 disables
    std::string studioBind = "127.0.0.1";
    bool replAuth = true;           // REPL clients must send "#AUTH <session token>" first
    bool mcp = true;                // MCP endpoint at /mcp on the Studio port
    std::string safeMode = "auto";  // "auto" | "off" (crash-loop protection)
    std::string comMojangDir;       // games/com.mojang of the game ("" = detect)
    bool forcePacks = true;         // keep the packs marked "forced" in global_resource_packs.json
    std::map<std::string, int> offsets;         // manual offset overrides
    std::map<std::string, int> componentSizes;  // manual ECS element sizes

    bool load(const std::string& path, std::string* err);
    std::string toJson() const;
};

Config& config();

// Minimal JSON value used for the config file.
struct JsonValue {
    enum Type { Null, Bool, Number, String, Array, Object } type = Null;
    bool b = false;
    double n = 0;
    std::string s;
    std::map<std::string, JsonValue> obj;
    std::vector<JsonValue> arr;
};
// Accepts what Bedrock accepts in pack manifests too: a UTF-8 BOM, // and /* */
// comments, trailing commas.
bool parseJson(const std::string& text, JsonValue& out, std::string* err);
// Serializes a JsonValue (indent < 0: compact; otherwise that many spaces per level).
std::string toJson(const JsonValue& v, int indent = -1);

}  // namespace se

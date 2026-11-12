// Access to the mcpelauncher mod APIs (menu, windows, game window callbacks,
// host libc functions) plus a few platform helpers.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace se::platform {

// ABI of libmcpelauncher_menu.so (see mcpelauncher-client/src/imgui_ui.h)
struct MenuEntryABI {
    const char* name;
    void* user = nullptr;
    bool (*selected)(void* user) = [](void*) { return false; };
    void (*click)(void* user) = nullptr;
    size_t length = 0;
    MenuEntryABI* subentries = nullptr;
};

struct ControlABI {
    int type = 0;  // 0 button, 1 sliderint, 2 sliderfloat, 3 text, 4 textinput
    union {
        struct {
            const char* label;
            void* user;
            void (*onClick)(void* user);
        } button;
        struct {
            const char* label;
            int min;
            int def;
            int max;
            void* user;
            void (*onChange)(void* user, int value);
        } sliderint;
        struct {
            const char* label;
            float min;
            float def;
            float max;
            void* user;
            void (*onChange)(void* user, float value);
        } sliderfloat;
        struct {
            const char* label;
            int size;  // 0 normal, 1 medium, 2 large, 3 very large
        } text;
        struct {
            const char* label;
            const char* def;
            const char* placeholder;
            void* user;
            void (*onChange)(void* user, const char* value);
        } textinput;
    } data;
};

static_assert(sizeof(ControlABI) == 48, "must match mcpelauncher's struct control");

// Loads the launcher-provided libraries. Safe to call more than once.
void loadLauncherApis();

bool hasMenuApi();
void addMenu(size_t length, MenuEntryABI* entries);
void showWindow(const char* title, int isModal, void* user, void (*onClose)(void* user), int count,
                ControlABI* controls);
void closeWindow(const char* title);

// Game window callbacks (libmcpelauncher_gamewindow.so)
bool hasGameWindowApi();
// Calls cb once the game window exists (immediately if it already does).
void onWindowCreated(void* user, void (*cb)(void* user));
bool addKeyboardCallback(void* user, bool (*cb)(void* user, int keyCode, int action));
bool addSwapBuffersCallback(void* user, void (*cb)(void* user, void* display, void* surface));

// Function from the *host* libc (glibc on Linux). nullptr when unavailable.
void* hostLibcSymbol(const char* name);

// Game version reported by the launcher ("1.26.51.1"), or "" if unknown.
std::string gameVersion();

// Directory where ScriptEval stores its config, scripts and logs.
// On Android builds this is under /data/data/com.mojang.minecraftpe which
// mcpelauncher rewrites to its data directory (e.g. ~/.local/share/mcpelauncher).
std::string dataDir();
bool mkdirs(const std::string& path);
bool readFile(const std::string& path, std::string& out);
bool writeFile(const std::string& path, const std::string& data);

// Cheap identifier of the calling thread (thread pointer register).
uintptr_t threadTag();

}  // namespace se::platform

#include "platform.h"

#include <dlfcn.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <atomic>
#include <cstdlib>
#include <mutex>

#include "common.h"

namespace se::platform {

namespace {
std::once_flag g_loadOnce;

void (*p_addMenu)(size_t, MenuEntryABI*) = nullptr;
void (*p_showWindow)(const char*, int, void*, void (*)(void*), int, ControlABI*) = nullptr;
void (*p_closeWindow)(const char*) = nullptr;

void* (*p_gwGetPrimaryWindow)() = nullptr;
void (*p_gwAddKeyboardCallback)(void*, void*, bool (*)(void*, int, int)) = nullptr;
void (*p_gwAddWindowCreationCallback)(void*, void (*)(void*)) = nullptr;
void (*p_gwAddSwapBuffersCallback)(void*, void (*)(void*, void*, void*)) = nullptr;

void* (*p_hostDlopen)(const char*, int) = nullptr;
void* (*p_hostDlsym)(void*, const char*) = nullptr;
void* g_hostLibc = nullptr;

int* p_verMajor = nullptr;
int* p_verMinor = nullptr;
int* p_verPatch = nullptr;
int* p_verRevision = nullptr;

template <class T>
void sym(void* lib, const char* name, T& out) {
    if (!lib) return;
    out = reinterpret_cast<T>(dlsym(lib, name));
}
}  // namespace

void loadLauncherApis() {
    std::call_once(g_loadOnce, [] {
        void* menu = dlopen("libmcpelauncher_menu.so", RTLD_NOW);
        sym(menu, "mcpelauncher_addmenu", p_addMenu);
        sym(menu, "mcpelauncher_show_window", p_showWindow);
        sym(menu, "mcpelauncher_close_window", p_closeWindow);

        void* gw = dlopen("libmcpelauncher_gamewindow.so", RTLD_NOW);
        sym(gw, "game_window_get_primary_window", p_gwGetPrimaryWindow);
        sym(gw, "game_window_add_keyboard_callback", p_gwAddKeyboardCallback);
        sym(gw, "game_window_add_window_creation_callback", p_gwAddWindowCreationCallback);
        sym(gw, "game_window_add_swap_buffers_callback", p_gwAddSwapBuffersCallback);

        void* mod = dlopen("libmcpelauncher_mod.so", RTLD_NOW);
        sym(mod, "mcpelauncher_host_dlopen", p_hostDlopen);
        sym(mod, "mcpelauncher_host_dlsym", p_hostDlsym);
        sym(mod, "mcpelauncher_package_version_major", p_verMajor);
        sym(mod, "mcpelauncher_package_version_minor", p_verMinor);
        sym(mod, "mcpelauncher_package_version_patch", p_verPatch);
        sym(mod, "mcpelauncher_package_version_revision", p_verRevision);

        if (p_hostDlopen && p_hostDlsym) {
            static const char* names[] = {"libc.so.6", "libc.so", "/usr/lib/libSystem.B.dylib"};
            for (auto n : names) {
                g_hostLibc = p_hostDlopen(n, RTLD_NOW);
                if (g_hostLibc) break;
            }
        }
        SE_LOGI("launcher apis: menu=%d window=%d gamewindow=%d hostlibc=%d", p_addMenu != nullptr,
                p_showWindow != nullptr, p_gwAddKeyboardCallback != nullptr, g_hostLibc != nullptr);
    });
}

bool hasMenuApi() { return p_addMenu && p_showWindow && p_closeWindow; }

void addMenu(size_t length, MenuEntryABI* entries) {
    if (p_addMenu) p_addMenu(length, entries);
}

void showWindow(const char* title, int isModal, void* user, void (*onClose)(void*), int count,
                ControlABI* controls) {
    if (p_showWindow) p_showWindow(title, isModal, user, onClose, count, controls);
}

void closeWindow(const char* title) {
    if (p_closeWindow) p_closeWindow(title);
}

bool hasGameWindowApi() { return p_gwAddKeyboardCallback && p_gwGetPrimaryWindow; }

void onWindowCreated(void* user, void (*cb)(void*)) {
    if (p_gwAddWindowCreationCallback) p_gwAddWindowCreationCallback(user, cb);
}

bool addKeyboardCallback(void* user, bool (*cb)(void*, int, int)) {
    if (!p_gwAddKeyboardCallback || !p_gwGetPrimaryWindow) return false;
    void* wnd = p_gwGetPrimaryWindow();
    if (!wnd) return false;
    p_gwAddKeyboardCallback(wnd, user, cb);
    return true;
}

bool addSwapBuffersCallback(void* user, void (*cb)(void*, void*, void*)) {
    if (!p_gwAddSwapBuffersCallback) return false;
    p_gwAddSwapBuffersCallback(user, cb);
    return true;
}

void* hostLibcSymbol(const char* name) {
#if defined(__ANDROID__)
    if (g_hostLibc && p_hostDlsym) return p_hostDlsym(g_hostLibc, name);
    return nullptr;
#else
    return dlsym(RTLD_DEFAULT, name);
#endif
}

std::string gameVersion() {
    if (!p_verMajor || !p_verMinor) return "";
    return strprintf("%d.%d.%d.%d", *p_verMajor, *p_verMinor, p_verPatch ? *p_verPatch : 0,
                     p_verRevision ? *p_verRevision : 0);
}

std::string dataDir() {
    static std::string dir = [] {
        const char* env = getenv("SCRIPTEVAL_DIR");
        if (env && *env) return std::string(env);
#if defined(__ANDROID__)
        return std::string("/data/data/com.mojang.minecraftpe/scripteval");
#else
        return std::string("/tmp/scripteval");
#endif
    }();
    return dir;
}

bool mkdirs(const std::string& path) {
    if (path.empty()) return false;
    std::string cur;
    size_t i = 0;
    while (i <= path.size()) {
        size_t j = path.find('/', i);
        if (j == std::string::npos) j = path.size();
        cur = path.substr(0, j);
        if (!cur.empty()) mkdir(cur.c_str(), 0755);
        i = j + 1;
    }
    struct stat st;
    return stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode);
}

bool readFile(const std::string& path, std::string& out) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return false;
    out.clear();
    char buf[16384];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), f)) > 0) out.append(buf, n);
    fclose(f);
    return true;
}

bool writeFile(const std::string& path, const std::string& data) {
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) return false;
    bool ok = fwrite(data.data(), 1, data.size(), f) == data.size();
    fclose(f);
    return ok;
}

uintptr_t threadTag() {
    uintptr_t v = 0;
#if defined(__x86_64__)
    __asm__ volatile("mov %%fs:0, %0" : "=r"(v));
#elif defined(__aarch64__)
    __asm__ volatile("mrs %0, tpidr_el0" : "=r"(v));
#endif
    return v;
}

}  // namespace se::platform

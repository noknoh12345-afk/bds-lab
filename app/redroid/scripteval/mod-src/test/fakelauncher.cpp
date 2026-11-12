// Fake mcpelauncher API libraries for host tests. Built three times with
// different FAKE_* defines into libmcpelauncher_menu.so,
// libmcpelauncher_gamewindow.so and libmcpelauncher_mod.so.
//
// The menu fake reproduces the important property of the real ImGui overlay:
// control callbacks are invoked while the window list lock is held, so a mod
// that calls mcpelauncher_show_window from a callback deadlocks.
#include <dlfcn.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#define API extern "C" __attribute__((visibility("default")))

#ifdef FAKE_MENU
struct MenuEntryABI {
    const char* name;
    void* user;
    bool (*selected)(void* user);
    void (*click)(void* user);
    size_t length;
    MenuEntryABI* subentries;
};
struct ControlABI {
    int type;
    union {
        struct {
            const char* label;
            void* user;
            void (*onClick)(void*);
        } button;
        struct {
            const char* label;
            int size;
        } text;
        struct {
            const char* label;
            int min, def, max;
            void* user;
            void (*onChange)(void*, int);
        } sliderint;
        struct {
            const char* label;
            float min, def, max;
            void* user;
            void (*onChange)(void*, float);
        } sliderfloat;
        struct {
            const char* label;
            const char* def;
            const char* placeholder;
            void* user;
            void (*onChange)(void*, const char*);
        } textinput;
    } data;
};
static_assert(sizeof(ControlABI) == 48, "ABI must match mcpelauncher's struct control");
struct Control {
    int type;
    std::string label, def;
    void* user;
    void (*onClick)(void*);
    void (*onChange)(void*, const char*);
    void (*onInt)(void*, int) = nullptr;
    void (*onFloat)(void*, float) = nullptr;
    double min = 0, max = 0, value = 0;
};
// what ImGui displays for a label: the part before "##", without padding spaces
static std::string disp(const std::string& l) {
    std::string d = l.substr(0, l.find("##"));
    while (!d.empty() && d.back() == ' ') d.pop_back();
    return d;
}
static bool match(const std::string& have, const char* want) { return have == want || disp(have) == want; }
struct Window {
    std::string title;
    void* user;
    void (*onClose)(void*);
    std::vector<Control> controls;
    int updates = 0;
};
struct Menu {
    std::string name;
    void* user;
    bool (*selected)(void*);
    void (*click)(void*);
    std::vector<Menu> sub;
};
static std::mutex g_lock;  // = activeWindowsLock
static std::vector<Window> g_windows;
static std::vector<Menu> g_menus;

static void conv(std::vector<Menu>& out, size_t n, MenuEntryABI* e) {
    for (size_t i = 0; i < n; i++) {
        Menu m{e[i].name, e[i].user, e[i].selected, e[i].click, {}};
        conv(m.sub, e[i].length, e[i].subentries);
        out.push_back(m);
    }
}

API void mcpelauncher_addmenu(size_t length, MenuEntryABI* entries) {
    std::lock_guard<std::mutex> lk(g_lock);
    conv(g_menus, length, entries);
}

API void mcpelauncher_show_window(const char* title, int, void* user, void (*onClose)(void*), int count,
                                  ControlABI* controls) {
    std::lock_guard<std::mutex> lk(g_lock);
    Window w{title ? title : "Untitled", user, onClose, {}};
    for (int i = 0; i < count; i++) {
        Control c{controls[i].type, "", "", nullptr, nullptr, nullptr};
        if (c.type == 0) {
            c.label = controls[i].data.button.label;
            c.user = controls[i].data.button.user;
            c.onClick = controls[i].data.button.onClick;
        } else if (c.type == 1) {
            c.label = controls[i].data.sliderint.label;
            c.user = controls[i].data.sliderint.user;
            c.onInt = controls[i].data.sliderint.onChange;
            c.min = controls[i].data.sliderint.min;
            c.max = controls[i].data.sliderint.max;
            c.value = controls[i].data.sliderint.def;
        } else if (c.type == 2) {
            c.label = controls[i].data.sliderfloat.label;
            c.user = controls[i].data.sliderfloat.user;
            c.onFloat = controls[i].data.sliderfloat.onChange;
            c.min = controls[i].data.sliderfloat.min;
            c.max = controls[i].data.sliderfloat.max;
            c.value = controls[i].data.sliderfloat.def;
        } else if (c.type == 3) {
            c.label = controls[i].data.text.label;
        } else if (c.type == 4) {
            c.label = controls[i].data.textinput.label;
            c.def = controls[i].data.textinput.def ? controls[i].data.textinput.def : "";
            c.user = controls[i].data.textinput.user;
            c.onChange = controls[i].data.textinput.onChange;
        }
        w.controls.push_back(c);
    }
    for (auto& x : g_windows)
        if (x.title == w.title) {
            w.updates = x.updates + 1;
            x = w;
            return;
        }
    g_windows.push_back(w);
}

API void mcpelauncher_close_window(const char* title) {
    std::lock_guard<std::mutex> lk(g_lock);
    g_windows.erase(std::remove_if(g_windows.begin(), g_windows.end(), [&](auto& w) { return w.title == title; }),
                    g_windows.end());
}

// ---- test hooks (callbacks run with the lock held, like the ImGui frame)
API bool fake_click(const char* title, const char* label) {
    std::lock_guard<std::mutex> lk(g_lock);
    for (auto& w : g_windows)
        if (match(w.title, title))
            for (auto& c : w.controls)
                if (c.type == 0 && match(c.label, label)) {
                    c.onClick(c.user);
                    return true;
                }
    return false;
}

API bool fake_input(const char* title, const char* label, const char* text) {
    std::lock_guard<std::mutex> lk(g_lock);
    for (auto& w : g_windows)
        if (match(w.title, title))
            for (auto& c : w.controls)
                if (c.type == 4 && match(c.label, label)) {
                    c.def = text;
                    c.onChange(c.user, text);
                    return true;
                }
    return false;
}

API bool fake_slide(const char* title, const char* label, double value) {
    std::lock_guard<std::mutex> lk(g_lock);
    for (auto& w : g_windows)
        if (match(w.title, title))
            for (auto& c : w.controls)
                if ((c.type == 1 || c.type == 2) && match(c.label, label)) {
                    c.value = value;
                    if (c.type == 1) c.onInt(c.user, (int)value);
                    else c.onFloat(c.user, (float)value);
                    return true;
                }
    return false;
}

// the user clicks the window's close button: like ImGui, onClose is called
// (unconditionally) and the window is removed
API bool fake_close(const char* title) {
    std::lock_guard<std::mutex> lk(g_lock);
    for (size_t i = 0; i < g_windows.size(); i++)
        if (match(g_windows[i].title, title)) {
            g_windows[i].onClose(g_windows[i].user);
            g_windows.erase(g_windows.begin() + (long)i);
            return true;
        }
    return false;
}

API bool fake_type(const char* title, const char* text) {
    std::lock_guard<std::mutex> lk(g_lock);
    for (auto& w : g_windows)
        if (match(w.title, title))
            for (auto& c : w.controls)
                if (c.type == 4) {
                    c.def = text;
                    c.onChange(c.user, text);
                    return true;
                }
    return false;
}

API void fake_dump(const char* title, char* out, size_t cap) {
    std::lock_guard<std::mutex> lk(g_lock);
    std::string s;
    bool found = false;
    for (auto& w : g_windows)
        if (match(w.title, title) || strcmp(title, "*") == 0) {
            found = true;
            s += "[window \"" + w.title + "\" updates=" + std::to_string(w.updates) + "]\n";
            for (auto& c : w.controls) {
                char num[128];
                if (c.type == 0) s += "  [button] " + disp(c.label) + "\n";
                if (c.type == 1 || c.type == 2) {
                    snprintf(num, sizeof num, " = %g (%g..%g)", c.value, c.min, c.max);
                    s += "  [slider] " + disp(c.label) + num + "\n";
                }
                if (c.type == 3) s += "  [text] " + c.label + "\n";
                if (c.type == 4) s += "  [input] '" + c.def + "' label=" + disp(c.label) + "\n";
            }
        }
    if (!found) s = "[window \"" + std::string(title) + "\" not shown]\n";
    snprintf(out, cap, "%s", s.c_str());
}

API bool fake_menu(const char* path) {
    std::lock_guard<std::mutex> lk(g_lock);
    std::string p = path;
    std::vector<Menu>* level = &g_menus;
    while (true) {
        size_t slash = p.find('/');
        std::string head = p.substr(0, slash);
        Menu* m = nullptr;
        for (auto& x : *level)
            if (x.name == head) m = &x;
        if (!m) return false;
        if (slash == std::string::npos) {
            m->click(m->user);
            return true;
        }
        level = &m->sub;
        p = p.substr(slash + 1);
    }
}
#endif

#ifdef FAKE_GAMEWINDOW
static std::vector<std::pair<void*, bool (*)(void*, int, int)>> g_keys;
static std::vector<std::pair<void*, void (*)(void*)>> g_created;
static std::vector<std::pair<void*, void (*)(void*, void*, void*)>> g_swap;
static int g_window = 1;
API void* game_window_get_primary_window() { return &g_window; }
API void game_window_add_keyboard_callback(void*, void* user, bool (*cb)(void*, int, int)) { g_keys.push_back({user, cb}); }
API void game_window_add_window_creation_callback(void* user, void (*cb)(void*)) { g_created.push_back({user, cb}); }
API void game_window_add_swap_buffers_callback(void* user, void (*cb)(void*, void*, void*)) {
    g_swap.push_back({user, cb});
}
API void fake_create_window() {
    for (auto& [u, cb] : g_created) cb(u);
    // a "render thread" calling the swap buffers callbacks
    std::thread([] {
        for (int i = 0; i < 100000; i++) {
            for (auto& [u, cb] : g_swap) cb(u, nullptr, nullptr);
            std::this_thread::sleep_for(std::chrono::milliseconds(16));
        }
    }).detach();
}
API bool fake_key(int code) {
    bool consumed = false;
    for (auto& [u, cb] : g_keys) consumed |= cb(u, code, 0);
    for (auto& [u, cb] : g_keys) cb(u, code, 2);
    return consumed;
}
#endif

#ifdef FAKE_MOD
API void* mcpelauncher_host_dlopen(const char* n, int f) { return dlopen(n, f); }
API void* mcpelauncher_host_dlsym(void* h, const char* n) { return dlsym(h, n); }
API int mcpelauncher_package_version_major = 1;
API int mcpelauncher_package_version_minor = 26;
API int mcpelauncher_package_version_patch = 51;
API int mcpelauncher_package_version_revision = 1;
#endif

#include "ui.h"

#include <dirent.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <deque>
#include <map>
#include <mutex>
#include <set>
#include <thread>
#include <vector>

#include "common.h"
#include "config.h"
#include "jsengine.h"
#include "platform.h"
#include "tickhook.h"

namespace se::ui {

namespace {
using platform::ControlABI;
using platform::MenuEntryABI;

constexpr const char* kConsoleTitle = "ScriptEval Console";
constexpr const char* kScriptsTitle = "ScriptEval Scripts";

// Lock order: platform::showWindow / closeWindow are never called while g_mu
// is held. The launcher invokes control callbacks with its own window lock
// held, and those callbacks take g_mu.
std::mutex g_mu;
bool g_consoleOpen = false;
bool g_scriptsOpen = false;
bool g_dirty = true;
std::string g_input;
uint64_t g_lastEditMs = 0;
bool g_lastEditConsole = true;
std::string g_lastRun;
std::vector<std::string> g_history;
int g_histPos = -1;
int g_exampleIdx = 0;
uint64_t g_shownSeq = 0;
std::string g_shownStatus;
std::vector<std::string> g_scriptFiles;
int g_hotkey = 119;  // F8

const char* kExamples[] = {
    "world.getAllPlayers().map(p => `${p.name} @ ${fmt(p.location)}`)",
    "world.getLocalPlayer()",
    "client.playersPanel()",
    "client.watch('world.getLocalPlayer().location')",
    "world.getDimension('overworld').getEntities({ maxDistance: 32, location: world.getLocalPlayer().location })",
    "world.getPlayerList()",
    "client.nearby(32)",
    "client.sidebar()",
    "client.status()",
    "world.getLocalPlayer().getComponent('health')",
    "world.getLocalPlayer().getComponent('inventory').container.items()",
    "dbg.rtti('LocalPlayer')",
    "dbg.fields(world.getLocalPlayer().address, 0x100)",
    "system.runInterval(() => console.log(world.getLocalPlayer().location), 20)",
};

// ---------------------------------------------------------------------------
// forms / panels state
// ---------------------------------------------------------------------------
struct FormState {
    FormSpec spec;
    std::string window;  // unique window title ("Title##se_form<id>")
    bool shown = false;
    bool dirty = true;
    bool finished = false;      // result delivered: the window has to go away
    bool closedByUser = false;  // the launcher already removed the window
};
std::map<int, FormState> g_forms;

struct PanelState {
    std::string title;
    std::vector<PanelItem> items;
    std::string shownTitle;
    bool shown = false, dirty = true, remove = false;
};
std::map<std::string, PanelState> g_panels;
std::vector<std::string> g_panelIds;  // append-only, index+1 is the callback user data
std::set<std::string> g_panelsClosedByUser;

size_t panelIndex(const std::string& name) {  // g_mu held
    for (size_t i = 0; i < g_panelIds.size(); i++)
        if (g_panelIds[i] == name) return i;
    g_panelIds.push_back(name);
    return g_panelIds.size() - 1;
}

void* packUser(uint64_t a, uint64_t b) { return (void*)(uintptr_t)((a << 20) | (b & 0xFFFFF)); }
void unpackUser(void* u, uint64_t& a, uint64_t& b) {
    uintptr_t v = (uintptr_t)u;
    a = v >> 20;
    b = v & 0xFFFFF;
}

// Minecraft formatting codes ("§a") are not understood by ImGui.
std::string stripFormatting(const std::string& s) {
    std::string o;
    o.reserve(s.size());
    for (size_t i = 0; i < s.size(); i++) {
        if ((unsigned char)s[i] == 0xC2 && i + 1 < s.size() && (unsigned char)s[i + 1] == 0xA7) {
            i += 2;  // skip "§" and the code character
            continue;
        }
        o += s[i];
    }
    return o;
}

std::string fmtNum(double v) {
    if (!std::isfinite(v)) return "0";
    if (v == std::floor(v) && std::fabs(v) < 1e15) return strprintf("%.0f", v);
    return strprintf("%.6g", v);
}

bool isIntegral(double v) { return std::isfinite(v) && v == std::floor(v); }

// Collects controls plus the strings they point to (the launcher copies both).
struct Builder {
    std::deque<std::string> store;
    std::vector<ControlABI> c;
    std::set<std::string> ids;

    const char* keep(std::string s) {
        store.push_back(std::move(s));
        return store.back().c_str();
    }
    // Sliders and inputs use their label as ImGui id and also print it, so
    // uniqueness is obtained with invisible trailing spaces.
    std::string unique(std::string s) {
        if (s.empty()) s = " ";
        while (ids.count(s)) s += ' ';
        ids.insert(s);
        return s;
    }
    void text(const std::string& s, int size = 0) {
        // older ImGui versions truncate formatted text at ~3 KB: split long texts
        size_t pos = 0;
        do {
            size_t end = s.size();
            if (end - pos > 1500) {
                end = s.rfind('\n', pos + 1500);
                if (end == std::string::npos || end <= pos) {
                    end = pos + 1500;
                    while (end > pos && ((unsigned char)s[end] & 0xC0) == 0x80) end--;  // UTF-8 boundary
                }
            }
            ControlABI x{};
            x.type = 3;
            x.data.text.label = keep(s.substr(pos, end - pos));
            x.data.text.size = size;
            c.push_back(x);
            pos = end;
            if (pos < s.size() && s[pos] == '\n') pos++;
        } while (pos < s.size());
    }
    void button(const std::string& label, void (*cb)(void*), void* user) {
        ControlABI x{};
        x.type = 0;
        x.data.button.label = keep(label);
        x.data.button.user = user;
        x.data.button.onClick = cb;
        c.push_back(x);
    }
    void sliderInt(const std::string& label, int min, int def, int max, void* user, void (*cb)(void*, int)) {
        ControlABI x{};
        x.type = 1;
        x.data.sliderint.label = keep(label);
        x.data.sliderint.min = min;
        x.data.sliderint.def = def;
        x.data.sliderint.max = max;
        x.data.sliderint.user = user;
        x.data.sliderint.onChange = cb;
        c.push_back(x);
    }
    void sliderFloat(const std::string& label, float min, float def, float max, void* user,
                     void (*cb)(void*, float)) {
        ControlABI x{};
        x.type = 2;
        x.data.sliderfloat.label = keep(label);
        x.data.sliderfloat.min = min;
        x.data.sliderfloat.def = def;
        x.data.sliderfloat.max = max;
        x.data.sliderfloat.user = user;
        x.data.sliderfloat.onChange = cb;
        c.push_back(x);
    }
    void input(const std::string& label, const std::string& def, void* user, void (*cb)(void*, const char*)) {
        ControlABI x{};
        x.type = 4;
        x.data.textinput.label = keep(label);
        x.data.textinput.def = keep(def);
        x.data.textinput.placeholder = x.data.textinput.label;
        x.data.textinput.user = user;
        x.data.textinput.onChange = cb;
        c.push_back(x);
    }
};

int keyFromName(const std::string& n) {
    std::string s = toLower(n);
    if (s.empty() || s == "none" || s == "off") return -1;
    if (s.size() >= 2 && s[0] == 'f') {
        int k = atoi(s.c_str() + 1);
        if (k >= 1 && k <= 12) return 111 + k;
    }
    if (s.size() == 1 && s[0] >= 'a' && s[0] <= 'z') return 'A' + (s[0] - 'a');
    if (s == "grave" || s == "`") return 192;
    if (s == "insert") return 45;
    if (s == "home") return 36;
    if (s == "end") return 35;
    if (s == "pause") return 19;
    return -1;
}

void runInput() {
    std::string code;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        code = g_input;
        if (code.find_first_not_of(" \t") == std::string::npos) return;
        if (g_history.empty() || g_history.back() != code) g_history.push_back(code);
        if (g_history.size() > 200) g_history.erase(g_history.begin());
        g_histPos = -1;
        g_lastRun = code;
        g_input.clear();
        g_dirty = true;
    }
    js::submit(code, "<console>", true);
}

// ---- console callbacks (render thread; must not call showWindow)
void cbRun(void*) { runInput(); }
void cbClear(void*) {
    js::consoleClear();
    std::lock_guard<std::mutex> lk(g_mu);
    g_dirty = true;
}
void cbPrev(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_history.empty()) return;
    if (g_histPos < 0) g_histPos = (int)g_history.size();
    if (g_histPos > 0) g_histPos--;
    g_input = g_history[(size_t)g_histPos];
    g_dirty = true;
}
void cbNext(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_histPos < 0) return;
    g_histPos++;
    if (g_histPos >= (int)g_history.size()) {
        g_histPos = -1;
        g_input.clear();
    } else {
        g_input = g_history[(size_t)g_histPos];
    }
    g_dirty = true;
}
void cbExample(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_input = kExamples[g_exampleIdx];
    g_exampleIdx = (g_exampleIdx + 1) % (int)(sizeof(kExamples) / sizeof(kExamples[0]));
    g_dirty = true;
}
void cbStop(void*) { js::interrupt(); }
void cbStudio(void*) { js::submit("client.studio()", "<console>", js::Echo::Output); }
void cbScripts(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_scriptsOpen = true;
    g_dirty = true;
}
void cbInput(void*, const char* v) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_input = v ? v : "";
    g_lastEditMs = nowMs();
    g_lastEditConsole = true;
}
void cbCloseConsole(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_consoleOpen = false;
}
void cbCloseScripts(void*) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_scriptsOpen = false;
}
void cbRunScript(void* user) {
    size_t idx = (size_t)(uintptr_t)user;
    std::string name;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        if (idx >= g_scriptFiles.size()) return;
        name = g_scriptFiles[idx];
        g_consoleOpen = true;
        g_dirty = true;
    }
    js::submit("runScript(" + jsonQuote(name) + ")", "<scripts>", true);
}

// ---- form callbacks
std::string formValuesJson(const FormSpec& s) {
    std::string o = "[";
    bool first = true;
    for (auto& c : s.controls) {
        std::string v;
        switch (c.kind) {
            case FormControl::Input: v = jsonQuote(c.str); break;
            case FormControl::Slider: v = fmtNum(c.value); break;
            case FormControl::Toggle: v = c.on ? "true" : "false"; break;
            case FormControl::Dropdown: v = std::to_string(c.index); break;
            default: continue;
        }
        if (!first) o += ",";
        o += v;
        first = false;
    }
    return o + "]";
}

// g_mu held. Returns the JS code reporting the result.
std::string finishFormLocked(int id, FormState& f, int selection) {
    f.finished = true;
    g_dirty = true;
    if (selection < 0) return strprintf("__formDone(%d, -1, null)", id);
    return strprintf("__formDone(%d, %d, %s)", id, selection, formValuesJson(f.spec).c_str());
}

FormControl* formControl(void* user, int* idOut, FormState** formOut) {  // g_mu held
    uint64_t id, ci;
    unpackUser(user, id, ci);
    auto it = g_forms.find((int)id);
    if (it == g_forms.end() || it->second.finished || ci >= it->second.spec.controls.size()) return nullptr;
    if (idOut) *idOut = (int)id;
    if (formOut) *formOut = &it->second;
    return &it->second.spec.controls[ci];
}

void cbFormButton(void* user) {
    std::string code;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        int id;
        FormState* f;
        FormControl* c = formControl(user, &id, &f);
        if (!c) return;
        if (c->kind == FormControl::Toggle) {
            c->on = !c->on;
            f->dirty = true;
            return;
        }
        if (c->kind == FormControl::Dropdown) {
            if (!c->options.empty()) c->index = (c->index + 1) % (int)c->options.size();
            f->dirty = true;
            return;
        }
        code = finishFormLocked(id, *f, c->result);
    }
    js::submit(code, "<form>", js::Echo::Output);
}

void cbFormSliderInt(void* user, int v) {
    std::lock_guard<std::mutex> lk(g_mu);
    FormState* f;
    FormControl* c = formControl(user, nullptr, &f);
    if (!c) return;
    if (c->kind == FormControl::Dropdown) {
        if (v >= 0 && v < (int)c->options.size() && v != c->index) {
            c->index = v;
            f->dirty = true;  // the button shows the selected option
        }
        return;
    }
    if (c->kind != FormControl::Slider) return;
    if (c->step > 1) {
        c->value = std::min(c->max, c->min + v * c->step);
        f->dirty = true;  // update the "= value" line
    } else {
        c->value = v;
    }
}

void cbFormSliderFloat(void* user, float v) {
    std::lock_guard<std::mutex> lk(g_mu);
    FormControl* c = formControl(user, nullptr, nullptr);
    if (!c || c->kind != FormControl::Slider) return;
    double x = v;
    if (c->step > 0) x = c->min + std::round((x - c->min) / c->step) * c->step;
    c->value = std::max(c->min, std::min(c->max, x));
}

void cbFormInput(void* user, const char* s) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_lastEditConsole = false;
    FormControl* c = formControl(user, nullptr, nullptr);
    if (c && c->kind == FormControl::Input) c->str = s ? s : "";
}

void cbFormClose(void* user) {
    std::string code;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        int id = (int)(intptr_t)user;
        auto it = g_forms.find(id);
        if (it == g_forms.end() || it->second.finished) return;
        it->second.closedByUser = true;
        code = finishFormLocked(id, it->second, -1);
    }
    js::submit(code, "<form>", js::Echo::Output);
}

// ---- panel callbacks
void cbPanelButton(void* user) {
    uint64_t pi, bi;
    unpackUser(user, pi, bi);
    std::string code;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        if (pi >= g_panelIds.size()) return;
        auto it = g_panels.find(g_panelIds[pi]);
        if (it == g_panels.end() || it->second.remove || bi >= it->second.items.size()) return;
        code = it->second.items[bi].code;
    }
    if (!code.empty()) js::submit(code, "<panel>", js::Echo::Output);
}

void cbPanelClose(void* user) {
    size_t pi = (size_t)(uintptr_t)user - 1;
    std::string name;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        if (pi >= g_panelIds.size()) return;
        name = g_panelIds[pi];
        auto it = g_panels.find(name);
        if (it == g_panels.end()) return;
        g_panels.erase(it);
        g_panelsClosedByUser.insert(name);
    }
    js::submit("__panelClosed(" + jsonQuote(name) + ")", "<panel>", js::Echo::Output);
}

// ---------------------------------------------------------------------------
// windows
// ---------------------------------------------------------------------------
void refreshScriptList() {
    std::vector<std::string> files;
    std::string dir = platform::dataDir() + "/scripts";
    if (DIR* d = opendir(dir.c_str())) {
        while (dirent* e = readdir(d)) {
            std::string n = e->d_name;
            if (n.size() > 3 && endsWith(n, ".js")) files.push_back(n);
        }
        closedir(d);
    }
    std::sort(files.begin(), files.end());
    std::lock_guard<std::mutex> lk(g_mu);
    g_scriptFiles = files;
}

void showConsole() {
    std::string input, status = js::statusLine();
    {
        std::lock_guard<std::mutex> lk(g_mu);
        input = g_input;
    }
    auto lines = js::consoleSince(0, (size_t)std::max(5, config().consoleLines));
    std::string out;
    for (auto& l : lines) {
        std::string t = l.text;
        if (t.size() > 220) t = t.substr(0, 217) + "...";
        out += t;
        out += '\n';
    }
    if (out.empty()) out = "(output appears here - try the Example button)";
    Builder b;
    b.text(status);
    b.input("JavaScript", input, nullptr, cbInput);
    b.button("Run", cbRun, nullptr);
    b.button("< History", cbPrev, nullptr);
    b.button("History >", cbNext, nullptr);
    b.button("Example", cbExample, nullptr);
    b.button("Scripts...", cbScripts, nullptr);
    b.button("Stop script", cbStop, nullptr);
    b.button("Clear", cbClear, nullptr);
    b.button("Open Studio", cbStudio, nullptr);
    b.text("Run with the button or Enter. Hotkey: " + config().hotkey);
    b.text(stripFormatting(out));
    platform::showWindow(kConsoleTitle, 0, nullptr, cbCloseConsole, (int)b.c.size(), b.c.data());
}

void showScripts() {
    refreshScriptList();
    std::vector<std::string> files;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        files = g_scriptFiles;
    }
    Builder b;
    b.text("Files in " + platform::dataDir() + "/scripts:");
    for (size_t i = 0; i < files.size() && i < 64; i++) b.button(files[i], cbRunScript, (void*)(uintptr_t)i);
    if (files.empty()) b.text("(no .js files yet)");
    platform::showWindow(kScriptsTitle, 0, nullptr, cbCloseScripts, (int)b.c.size(), b.c.data());
}

void buildForm(Builder& b, int id, const FormSpec& spec) {
    for (size_t i = 0; i < spec.controls.size(); i++) {
        const FormControl& c = spec.controls[i];
        void* user = packUser((uint64_t)id, i);
        std::string label = stripFormatting(c.label);
        std::string tag = std::to_string(i);
        switch (c.kind) {
            case FormControl::Text:
                b.text(label, c.size);
                break;
            case FormControl::Button:
                b.button(label + "###b" + tag, cbFormButton, user);
                break;
            case FormControl::Toggle:
                b.button(std::string(c.on ? "[x] " : "[  ] ") + label + "###t" + tag, cbFormButton, user);
                break;
            case FormControl::Dropdown: {
                int n = (int)c.options.size();
                std::string cur = n ? stripFormatting(c.options[(size_t)std::clamp(c.index, 0, n - 1)]) : "-";
                b.button(label + ": " + cur + "  >###d" + tag, cbFormButton, user);
                if (n > 6) b.sliderInt(b.unique(" "), 0, c.index, n - 1, user, cbFormSliderInt);
                break;
            }
            case FormControl::Slider: {
                std::string l = b.unique(label);
                bool integral = isIntegral(c.min) && isIntegral(c.max) && isIntegral(c.step) && c.step >= 1;
                if (integral && c.step == 1) {
                    b.sliderInt(l, (int)c.min, (int)c.value, (int)c.max, user, cbFormSliderInt);
                } else if (integral) {
                    int steps = (int)((c.max - c.min) / c.step);
                    b.sliderInt(l, 0, (int)std::lround((c.value - c.min) / c.step), steps, user, cbFormSliderInt);
                    b.text("= " + fmtNum(c.value));
                } else {
                    b.sliderFloat(l, (float)c.min, (float)c.value, (float)c.max, user, cbFormSliderFloat);
                }
                break;
            }
            case FormControl::Input:
                b.input(b.unique(label), c.str, user, cbFormInput);
                break;
        }
    }
}

void refreshForms() {
    struct ShowJob {
        int id;
        std::string window;
        FormSpec spec;
    };
    std::vector<ShowJob> show;
    std::vector<std::string> close;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        for (auto it = g_forms.begin(); it != g_forms.end();) {
            FormState& f = it->second;
            if (f.finished) {
                // also when closed by the user: a refresh may have re-shown it meanwhile
                if (f.shown) close.push_back(f.window);
                it = g_forms.erase(it);
                continue;
            }
            if (!f.shown || f.dirty) {
                show.push_back({it->first, f.window, f.spec});
                f.shown = true;
                f.dirty = false;
            }
            ++it;
        }
    }
    for (auto& w : close) platform::closeWindow(w.c_str());
    for (auto& j : show) {
        Builder b;
        buildForm(b, j.id, j.spec);
        platform::showWindow(j.window.c_str(), 0, (void*)(intptr_t)j.id, cbFormClose, (int)b.c.size(), b.c.data());
    }
}

void refreshPanels() {
    struct ShowJob {
        size_t index;
        std::string title;
        std::vector<PanelItem> items;
    };
    std::vector<ShowJob> show;
    std::vector<std::string> close;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        for (auto it = g_panels.begin(); it != g_panels.end();) {
            PanelState& p = it->second;
            if (p.remove) {
                if (p.shown) close.push_back(p.shownTitle);
                it = g_panels.erase(it);
                continue;
            }
            if (!p.shown || p.dirty) {
                if (p.shown && p.shownTitle != p.title) close.push_back(p.shownTitle);
                show.push_back({panelIndex(it->first), p.title, p.items});
                p.shown = true;
                p.dirty = false;
                p.shownTitle = p.title;
            }
            ++it;
        }
    }
    for (auto& w : close) platform::closeWindow(w.c_str());
    for (auto& j : show) {
        Builder b;
        for (size_t i = 0; i < j.items.size(); i++) {
            const PanelItem& it = j.items[i];
            if (it.code.empty())
                b.text(stripFormatting(it.text), it.size);
            else
                b.button(stripFormatting(it.text) + "###p" + std::to_string(i), cbPanelButton, packUser(j.index, i));
        }
        if (b.c.empty()) b.text("(empty)");
        platform::showWindow(j.title.c_str(), 0, (void*)(uintptr_t)(j.index + 1), cbPanelClose, (int)b.c.size(),
                             b.c.data());
    }
}

void refreshLoopImpl();
void refreshLoop() {
    while (true) {
        try {
            refreshLoopImpl();
        } catch (const std::exception& e) {
            SE_LOGE("ui: %s", e.what());
            sleepMs(1000);
        }
    }
}

void refreshLoopImpl() {
    bool consoleShown = false, scriptsShown = false;
    while (true) {
        sleepMs(100);
        bool open, sopen, dirty;
        {
            std::lock_guard<std::mutex> lk(g_mu);
            open = g_consoleOpen;
            sopen = g_scriptsOpen;
            dirty = g_dirty;
            g_dirty = false;
        }
        if (open) {
            uint64_t seq = js::consoleSeq();
            std::string st = js::statusLine();
            if (!consoleShown || dirty || seq != g_shownSeq || st != g_shownStatus) {
                // don't rebuild the window while the user is typing (keeps the caret stable)
                bool typing;
                {
                    std::lock_guard<std::mutex> lk(g_mu);
                    typing = nowMs() - g_lastEditMs < 400 && !dirty;
                }
                if (!typing || !consoleShown) {
                    showConsole();
                    g_shownSeq = seq;
                    g_shownStatus = st;
                    consoleShown = true;
                }
            }
        } else if (consoleShown) {
            platform::closeWindow(kConsoleTitle);
            consoleShown = false;
        }
        if (sopen && (!scriptsShown || dirty)) {
            showScripts();
            scriptsShown = true;
        } else if (!sopen && scriptsShown) {
            platform::closeWindow(kScriptsTitle);
            scriptsShown = false;
        }
        refreshForms();
        refreshPanels();
    }
}

bool onKey(void*, int key, int action) {
    if (action != 0) return false;  // press only
    if (key == g_hotkey) {
        toggleConsole();
        return true;
    }
    if (key == 13) {  // Enter: run when the console input was edited recently
        bool run = false;
        {
            std::lock_guard<std::mutex> lk(g_mu);
            run = g_consoleOpen && g_lastEditConsole && !g_input.empty() && g_input != g_lastRun &&
                  nowMs() - g_lastEditMs < 15000;
        }
        if (run) runInput();
    }
    return false;
}

void onWindowCreated(void*) {
    if (g_hotkey >= 0 && platform::addKeyboardCallback(nullptr, onKey))
        SE_LOGI("console hotkey: %s", config().hotkey.c_str());
    platform::addSwapBuffersCallback(nullptr, [](void*, void*, void*) {
        // remember the render thread so the tick hook never picks it
        static std::atomic<bool> noted{false};
        if (!noted.exchange(true)) tick::noteRenderThread(platform::threadTag());
    });
}

// menu callbacks
bool selNever(void*) { return false; }
bool selConsole(void*) { return g_consoleOpen; }
bool selPanel(void* user) {
    std::lock_guard<std::mutex> lk(g_mu);
    auto it = g_panels.find((const char*)user);
    return it != g_panels.end() && !it->second.remove;
}
void clickConsole(void*) { toggleConsole(); }
void clickScripts(void*) { cbScripts(nullptr); }
void clickPlayers(void*) { js::submit("client.playersPanel()", "<menu>", js::Echo::Output); }
void clickWatch(void*) { js::submit("client.watchPanel()", "<menu>", js::Echo::Output); }
void clickRescan(void*) {
    openConsole();
    js::submit("client.rescan()", "<menu>", true);
}
void clickStatus(void*) {
    openConsole();
    js::submit("client.status()", "<menu>", true);
}
void clickStop(void*) { js::interrupt(); }
void clickStudio(void*) { js::submit("client.studio()", "<menu>", js::Echo::Output); }
void clickDoctor(void*) {
    openConsole();
    js::submit("client.doctor().line", "<menu>", true);
}
}  // namespace

bool available() { return platform::hasMenuApi(); }

void toggleConsole() {
    std::lock_guard<std::mutex> lk(g_mu);
    g_consoleOpen = !g_consoleOpen;
    g_dirty = true;
}

void openConsole() {
    std::lock_guard<std::mutex> lk(g_mu);
    g_consoleOpen = true;
    g_dirty = true;
}

void submitFromUi(const std::string& code, const std::string& source) { js::submit(code, source, true); }

bool formShow(int id, FormSpec spec) {
    if (!available()) return false;
    std::lock_guard<std::mutex> lk(g_mu);
    FormState& f = g_forms[id];
    std::string title = stripFormatting(spec.title);
    if (title.empty()) title = "Form";
    f.window = title + "##se_form" + std::to_string(id);
    f.spec = std::move(spec);
    f.dirty = true;
    f.finished = false;
    return true;
}

void formClose(int id, bool notify) {
    std::string code;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        auto it = g_forms.find(id);
        if (it == g_forms.end() || it->second.finished) return;
        code = finishFormLocked(id, it->second, -1);
    }
    if (notify) js::submit(code, "<form>", js::Echo::Output);
}

void formCloseAll() {
    std::vector<int> ids;
    {
        std::lock_guard<std::mutex> lk(g_mu);
        for (auto& [id, f] : g_forms)
            if (!f.finished) ids.push_back(id);
    }
    for (int id : ids) formClose(id, true);
}

int formsOpen() {
    std::lock_guard<std::mutex> lk(g_mu);
    int n = 0;
    for (auto& [id, f] : g_forms)
        if (!f.finished) n++;
    return n;
}

void panelSet(const std::string& name, const std::string& title, std::vector<PanelItem> items) {
    if (!available()) return;
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_panelsClosedByUser.count(name)) return;
    PanelState& p = g_panels[name];
    panelIndex(name);
    std::string t = stripFormatting(title.empty() ? name : title);
    bool same = p.shown && !p.remove && p.title == t && p.items.size() == items.size() &&
                std::equal(p.items.begin(), p.items.end(), items.begin(), [](const PanelItem& a, const PanelItem& b) {
                    return a.text == b.text && a.code == b.code && a.size == b.size;
                });
    if (same) return;
    p.title = t;
    p.items = std::move(items);
    p.remove = false;
    p.dirty = true;
}

void panelClose(const std::string& name) {
    std::lock_guard<std::mutex> lk(g_mu);
    auto it = g_panels.find(name);
    if (it != g_panels.end()) it->second.remove = true;
}

void panelAck(const std::string& name) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_panelsClosedByUser.erase(name);
}

void init() {
    g_hotkey = keyFromName(config().hotkey);
    if (platform::hasMenuApi()) {
        static MenuEntryABI sub[9];
        sub[0] = MenuEntryABI{"Console", nullptr, selConsole, clickConsole, 0, nullptr};
        sub[1] = MenuEntryABI{"Players panel", (void*)"players", selPanel, clickPlayers, 0, nullptr};
        sub[2] = MenuEntryABI{"Watch panel", (void*)"watch", selPanel, clickWatch, 0, nullptr};
        sub[3] = MenuEntryABI{"Scripts...", nullptr, selNever, clickScripts, 0, nullptr};
        sub[4] = MenuEntryABI{"Rescan world", nullptr, selNever, clickRescan, 0, nullptr};
        sub[5] = MenuEntryABI{"Status", nullptr, selNever, clickStatus, 0, nullptr};
        sub[6] = MenuEntryABI{"Stop running script", nullptr, selNever, clickStop, 0, nullptr};
        sub[7] = MenuEntryABI{"Open Studio (browser)", nullptr, selNever, clickStudio, 0, nullptr};
        sub[8] = MenuEntryABI{"Doctor", nullptr, selNever, clickDoctor, 0, nullptr};
        static MenuEntryABI root{"ScriptEval", nullptr, selNever, nullptr, 9, sub};
        platform::addMenu(1, &root);
        std::thread(refreshLoop).detach();
    }
    if (platform::hasGameWindowApi()) {
        platform::onWindowCreated(nullptr, onWindowCreated);
    }
}

}  // namespace se::ui

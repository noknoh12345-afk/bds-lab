// In-game console, live panels and local forms built on the mcpelauncher
// ImGui overlay API (libmcpelauncher_menu.so).
#pragma once

#include <string>
#include <vector>

namespace se::ui {

void init();               // registers the menu + hotkey and starts the refresh thread
bool available();          // the launcher provides the window API
void toggleConsole();
void openConsole();
void submitFromUi(const std::string& code, const std::string& source);

// ---------------------------------------------------------------------------
// Forms (@minecraft/server-ui emulation). Shown as an overlay window; the
// result is delivered to JS as __formDone(id, selection, values) where
// selection is the result index of the clicked button (-1 = closed) and
// values holds the current value of every input control in order.
// ---------------------------------------------------------------------------
struct FormControl {
    enum Kind { Text, Button, Input, Slider, Toggle, Dropdown } kind = Text;
    std::string label;  // Text: the text; others: the label
    int size = 0;       // Text: 0 normal .. 3 very large
    int result = -1;    // Button: selection index reported when clicked
    std::string str;    // Input: current value
    double value = 0, min = 0, max = 1, step = 1;  // Slider
    bool on = false;                                 // Toggle
    std::vector<std::string> options;                // Dropdown
    int index = 0;                                   // Dropdown: selected option
};

struct FormSpec {
    std::string title;
    std::vector<FormControl> controls;
};

bool formShow(int id, FormSpec spec);
void formClose(int id, bool notify);  // notify: report a cancelation to JS
void formCloseAll();
int formsOpen();

// ---------------------------------------------------------------------------
// Panels: named, live-updating text windows (watch list, player list...).
// Buttons run JS code. Closing a panel window calls __panelClosed(name).
// ---------------------------------------------------------------------------
struct PanelItem {
    std::string text;  // text, or the button label
    std::string code;  // non-empty: a button running this JS code
    int size = 0;      // text size (0 normal .. 3 very large)
};
void panelSet(const std::string& name, const std::string& title, std::vector<PanelItem> items);
void panelClose(const std::string& name);
// After the user closed a panel window, panelSet() is ignored for that name
// until JS acknowledges the close (avoids re-opening it from a racing refresh).
void panelAck(const std::string& name);

}  // namespace se::ui

// __native.ui: overlay windows for @minecraft/server-ui emulation and live panels.
#include <algorithm>

#include "jsutil.h"
#include "ui.h"

namespace se::js {

namespace {

std::string strProp(JSContext* ctx, JSValueConst o, const char* name, const std::string& def = "") {
    JSValue v = JS_GetPropertyStr(ctx, o, name);
    std::string r = (JS_IsUndefined(v) || JS_IsNull(v)) ? def : toStr(ctx, v);
    JS_FreeValue(ctx, v);
    return r;
}

double numProp(JSContext* ctx, JSValueConst o, const char* name, double def = 0) {
    JSValue v = JS_GetPropertyStr(ctx, o, name);
    double r = (JS_IsUndefined(v) || JS_IsNull(v)) ? def : toF64(ctx, v, def);
    JS_FreeValue(ctx, v);
    return std::isfinite(r) ? r : def;
}

bool boolProp(JSContext* ctx, JSValueConst o, const char* name) {
    JSValue v = JS_GetPropertyStr(ctx, o, name);
    bool r = toBool(ctx, v);
    JS_FreeValue(ctx, v);
    return r;
}

uint32_t arrayLength(JSContext* ctx, JSValueConst a) {
    JSValue l = JS_GetPropertyStr(ctx, a, "length");
    uint32_t n = 0;
    JS_ToUint32(ctx, &n, l);
    JS_FreeValue(ctx, l);
    return std::min<uint32_t>(n, 512);
}

std::vector<std::string> strArrayProp(JSContext* ctx, JSValueConst o, const char* name) {
    std::vector<std::string> r;
    JSValue a = JS_GetPropertyStr(ctx, o, name);
    if (JS_IsArray(a)) {
        uint32_t n = arrayLength(ctx, a);
        for (uint32_t i = 0; i < n; i++) {
            JSValue x = JS_GetPropertyUint32(ctx, a, i);
            r.push_back(toStr(ctx, x));
            JS_FreeValue(ctx, x);
        }
    }
    JS_FreeValue(ctx, a);
    return r;
}

JSValue ui_available(JSContext* ctx, JSValueConst, int, JSValueConst*) { return JS_NewBool(ctx, ui::available()); }

JSValue ui_formShow(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    int id = (int)toI64(ctx, SE_ARG(0), 0);
    JSValueConst spec = SE_ARG(1);
    if (!JS_IsObject(spec)) return JS_ThrowTypeError(ctx, "form spec expected");
    ui::FormSpec fs;
    fs.title = strProp(ctx, spec, "title");
    JSValue ctls = JS_GetPropertyStr(ctx, spec, "controls");
    if (JS_IsArray(ctls)) {
        uint32_t n = arrayLength(ctx, ctls);
        for (uint32_t i = 0; i < n; i++) {
            JSValue c = JS_GetPropertyUint32(ctx, ctls, i);
            ui::FormControl fc;
            std::string kind = strProp(ctx, c, "kind", "text");
            fc.label = strProp(ctx, c, "label");
            if (kind == "button") {
                fc.kind = ui::FormControl::Button;
                fc.result = (int)numProp(ctx, c, "result", 0);
            } else if (kind == "input") {
                fc.kind = ui::FormControl::Input;
                fc.str = strProp(ctx, c, "value");
            } else if (kind == "slider") {
                fc.kind = ui::FormControl::Slider;
                fc.min = numProp(ctx, c, "min", 0);
                fc.max = numProp(ctx, c, "max", 1);
                if (fc.max < fc.min) std::swap(fc.min, fc.max);
                fc.step = numProp(ctx, c, "step", 1);
                if (!(fc.step > 0)) fc.step = 1;
                fc.value = std::clamp(numProp(ctx, c, "value", fc.min), fc.min, fc.max);
            } else if (kind == "toggle") {
                fc.kind = ui::FormControl::Toggle;
                fc.on = boolProp(ctx, c, "value");
            } else if (kind == "dropdown") {
                fc.kind = ui::FormControl::Dropdown;
                fc.options = strArrayProp(ctx, c, "options");
                fc.index = (int)numProp(ctx, c, "value", 0);
                if (fc.index < 0 || fc.index >= (int)fc.options.size()) fc.index = 0;
            } else {
                fc.kind = ui::FormControl::Text;
                fc.size = (int)numProp(ctx, c, "size", 0);
            }
            fs.controls.push_back(std::move(fc));
            JS_FreeValue(ctx, c);
        }
    }
    JS_FreeValue(ctx, ctls);
    return JS_NewBool(ctx, ui::formShow(id, std::move(fs)));
}

JSValue ui_formClose(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    ui::formClose((int)toI64(ctx, SE_ARG(0), 0), argc > 1 && toBool(ctx, argv[1]));
    return JS_UNDEFINED;
}

JSValue ui_formCloseAll(JSContext*, JSValueConst, int, JSValueConst*) {
    ui::formCloseAll();
    return JS_UNDEFINED;
}

JSValue ui_formsOpen(JSContext* ctx, JSValueConst, int, JSValueConst*) { return JS_NewInt32(ctx, ui::formsOpen()); }

// items: [ "text" | [label, code] | { text, code?, size? } ]
JSValue ui_panelSet(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string name = toStr(ctx, SE_ARG(0));
    std::string title = toStr(ctx, SE_ARG(1));
    std::vector<ui::PanelItem> items;
    JSValueConst arr = SE_ARG(2);
    if (JS_IsString(arr)) {
        items.push_back(ui::PanelItem{toStr(ctx, arr), "", 0});
    } else if (JS_IsArray(arr)) {
        uint32_t n = arrayLength(ctx, arr);
        for (uint32_t i = 0; i < n; i++) {
            JSValue x = JS_GetPropertyUint32(ctx, arr, i);
            ui::PanelItem it;
            if (JS_IsArray(x)) {
                JSValue a = JS_GetPropertyUint32(ctx, x, 0), b = JS_GetPropertyUint32(ctx, x, 1);
                it.text = toStr(ctx, a);
                it.code = toStr(ctx, b);
                JS_FreeValue(ctx, a);
                JS_FreeValue(ctx, b);
            } else if (JS_IsObject(x)) {
                it.text = strProp(ctx, x, "text");
                it.code = strProp(ctx, x, "code");
                it.size = (int)numProp(ctx, x, "size", 0);
            } else {
                it.text = toStr(ctx, x);
            }
            items.push_back(std::move(it));
            JS_FreeValue(ctx, x);
        }
    }
    ui::panelSet(name, title, std::move(items));
    return JS_UNDEFINED;
}

JSValue ui_panelClose(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    ui::panelClose(toStr(ctx, SE_ARG(0)));
    return JS_UNDEFINED;
}

JSValue ui_panelAck(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    ui::panelAck(toStr(ctx, SE_ARG(0)));
    return JS_UNDEFINED;
}

}  // namespace

void registerUiBindings(JSContext* ctx, JSValueConst o) {
    setFn(ctx, o, "available", ui_available, 0);
    setFn(ctx, o, "formShow", ui_formShow, 2);
    setFn(ctx, o, "formClose", ui_formClose, 2);
    setFn(ctx, o, "formCloseAll", ui_formCloseAll, 0);
    setFn(ctx, o, "formsOpen", ui_formsOpen, 0);
    setFn(ctx, o, "panelSet", ui_panelSet, 3);
    setFn(ctx, o, "panelClose", ui_panelClose, 1);
    setFn(ctx, o, "panelAck", ui_panelAck, 1);
}

}  // namespace se::js

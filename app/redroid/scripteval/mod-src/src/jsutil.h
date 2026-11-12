// Small helpers shared by the QuickJS binding files.
#pragma once

#include <cmath>
#include <cstdint>
#include <exception>
#include <string>
#include <vector>

#include "quickjs.h"

namespace se::js {

inline uintptr_t toAddr(JSContext* ctx, JSValueConst v) {
    if (JS_IsBigInt(v)) {
        uint64_t u = 0;
        JS_ToBigUint64(ctx, &u, v);
        return (uintptr_t)u;
    }
    if (JS_IsString(v)) {
        const char* s = JS_ToCString(ctx, v);
        uintptr_t r = s ? (uintptr_t)strtoull(s, nullptr, 0) : 0;
        if (s) JS_FreeCString(ctx, s);
        return r;
    }
    double d = 0;
    if (JS_ToFloat64(ctx, &d, v) || !(d >= 0) || !std::isfinite(d)) return 0;
    return (uintptr_t)d;
}

inline JSValue fromAddr(JSContext* ctx, uintptr_t a) { return JS_NewFloat64(ctx, (double)a); }

inline std::string toStr(JSContext* ctx, JSValueConst v) {
    size_t len = 0;
    const char* s = JS_ToCStringLen(ctx, &len, v);
    if (!s) return {};
    std::string r(s, len);
    JS_FreeCString(ctx, s);
    return r;
}

inline JSValue newStr(JSContext* ctx, const std::string& s) { return JS_NewStringLen(ctx, s.data(), s.size()); }

inline int64_t toI64(JSContext* ctx, JSValueConst v, int64_t def = 0) {
    if (JS_IsUndefined(v) || JS_IsNull(v)) return def;
    if (JS_IsBigInt(v)) {
        int64_t r = def;
        JS_ToBigInt64(ctx, &r, v);
        return r;
    }
    int64_t r = def;
    if (JS_ToInt64(ctx, &r, v)) return def;
    return r;
}

inline double toF64(JSContext* ctx, JSValueConst v, double def = 0) {
    double d = def;
    if (JS_ToFloat64(ctx, &d, v)) return def;
    return d;
}

inline bool toBool(JSContext* ctx, JSValueConst v) { return JS_ToBool(ctx, v) == 1; }

inline void setProp(JSContext* ctx, JSValueConst obj, const char* name, JSValue v) {
    JS_SetPropertyStr(ctx, obj, name, v);
}

inline void setFnRaw(JSContext* ctx, JSValueConst obj, const char* name, JSCFunction* fn, int argc) {
    JS_SetPropertyStr(ctx, obj, name, JS_NewCFunction(ctx, fn, name, argc));
}

// C++ exceptions must never unwind through QuickJS (C) frames: convert them to JS errors.
template <JSCFunction* F>
JSValue safeCall(JSContext* ctx, JSValueConst self, int argc, JSValueConst* argv) {
    try {
        return F(ctx, self, argc, argv);
    } catch (const std::exception& e) {
        return JS_ThrowInternalError(ctx, "ScriptEval native error: %s", e.what());
    } catch (...) {
        return JS_ThrowInternalError(ctx, "ScriptEval native error");
    }
}
#define setFn(ctx, obj, name, fn, argc) ::se::js::setFnRaw(ctx, obj, name, &::se::js::safeCall<fn>, argc)

inline JSValue numArray(JSContext* ctx, const std::vector<double>& v) {
    JSValue a = JS_NewArray(ctx);
    for (uint32_t i = 0; i < v.size(); i++) JS_SetPropertyUint32(ctx, a, i, JS_NewFloat64(ctx, v[i]));
    return a;
}

inline JSValue strArray(JSContext* ctx, const std::vector<std::string>& v) {
    JSValue a = JS_NewArray(ctx);
    for (uint32_t i = 0; i < v.size(); i++) JS_SetPropertyUint32(ctx, a, i, newStr(ctx, v[i]));
    return a;
}

#define SE_ARG(i) (argc > (i) ? argv[(i)] : JS_UNDEFINED)

void registerGameBindings(JSContext* ctx, JSValueConst obj);
void registerDebugBindings(JSContext* ctx, JSValueConst obj);
void registerUiBindings(JSContext* ctx, JSValueConst obj);
void registerInputBindings(JSContext* ctx, JSValueConst obj);  // __native.input (injectInput)
// Called after a successful world discovery (installs the tick hook when enabled).
void onWorldDiscovered();

}  // namespace se::js

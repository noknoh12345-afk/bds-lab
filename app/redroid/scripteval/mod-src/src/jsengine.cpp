#include "jsengine.h"

#include <dirent.h>
#include <dlfcn.h>
#include <unistd.h>

#include <atomic>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <thread>

#include "common.h"
#include "inject_input.h"
#include "config.h"
#include "game.h"
#include "http.h"
#include "jsutil.h"
#include "platform.h"
#include "prelude_js.h"
#include "respack.h"
#include "session.h"
#include "studio.h"
#include "tickhook.h"
#include "ui.h"

namespace se::js {

namespace {
JSRuntime* g_rt = nullptr;
JSContext* g_ctx = nullptr;
std::recursive_mutex g_jsMutex;
std::atomic<bool> g_started{false};
std::atomic<bool> g_stop{false};
std::atomic<uint64_t> g_deadline{0};
std::atomic<bool> g_interrupt{false};
std::atomic<bool> g_inJs{false};
std::thread g_worker;
uint64_t g_virtualTicks = 0;

struct Task {
    uint64_t id = 0;
    std::string code, source;
    std::string call;  // non-empty: call globalThis[call](code) instead of evaluating code
    Echo echo = Echo::Full;
    std::shared_ptr<std::promise<std::string>> prom;
    uint64_t startMs = 0;
    bool done = false;
};
std::mutex g_qMu;
std::deque<std::shared_ptr<Task>> g_queue;
std::map<uint64_t, std::shared_ptr<Task>> g_running;
std::atomic<uint64_t> g_nextId{1};

std::mutex g_conMu;
std::deque<ConsoleLine> g_console;
uint64_t g_conSeq = 0;
constexpr size_t kConsoleMax = 3000;

int interruptHandler(JSRuntime*, void*) {
    if (g_interrupt.load()) return 1;
    uint64_t d = g_deadline.load();
    return (d && nowMs() > d) ? 1 : 0;
}

void armDeadline() {
    g_interrupt = false;
    g_deadline = nowMs() + (uint64_t)config().evalTimeoutMs;
}

std::string exceptionString(JSContext* ctx) {
    JSValue e = JS_GetException(ctx);
    std::string msg = toStr(ctx, e);
    if (msg == "InternalError: interrupted")
        msg = strprintf("Script interrupted: time limit exceeded (evalTimeoutMs=%d, tickTimeoutMs=%d) or stopped by the user",
                        config().evalTimeoutMs, config().tickTimeoutMs);
    JSValue stack = JS_GetPropertyStr(ctx, e, "stack");
    if (JS_IsString(stack)) {
        std::string st = toStr(ctx, stack), kept;
        size_t pos = 0;
        while (pos < st.size()) {
            size_t nl = st.find('\n', pos);
            if (nl == std::string::npos) nl = st.size();
            std::string line = st.substr(pos, nl - pos);
            pos = nl + 1;
            if (line.find("<prelude>") != std::string::npos || line.find("(native)") != std::string::npos) continue;
            if (line.find_first_not_of(" ") == std::string::npos) continue;
            kept += "\n" + line;
        }
        msg += kept;
    }
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, e);
    return msg;
}

// Calls globalThis[name](args...) and reports exceptions to the console.
// `onError` names a JS cleanup function that is called after an exception.
void callGlobal(const char* name, int argc, JSValue* argv, const char* onError = nullptr,
                int timeoutMs = 0) {
    JSValue global = JS_GetGlobalObject(g_ctx);
    JSValue fn = JS_GetPropertyStr(g_ctx, global, name);
    if (JS_IsFunction(g_ctx, fn)) {
        armDeadline();
        if (timeoutMs > 0) g_deadline = nowMs() + (uint64_t)timeoutMs;
        JSValue r = JS_Call(g_ctx, fn, global, argc, argv);
        if (JS_IsException(r)) {
            consolePrint(3, std::string(name) + ": " + exceptionString(g_ctx));
            g_deadline = 0;
            g_interrupt = false;
            if (onError) {
                JSValue cleanup = JS_GetPropertyStr(g_ctx, global, onError);
                if (JS_IsFunction(g_ctx, cleanup)) JS_FreeValue(g_ctx, JS_Call(g_ctx, cleanup, global, 0, nullptr));
                JS_FreeValue(g_ctx, cleanup);
            }
        }
        JS_FreeValue(g_ctx, r);
    }
    JS_FreeValue(g_ctx, fn);
    JS_FreeValue(g_ctx, global);
}

void runJobs() {
    for (int i = 0; i < 100000; i++) {
        JSContext* c = nullptr;
        armDeadline();
        int r = JS_ExecutePendingJob(g_rt, &c);
        if (r <= 0) {
            if (r < 0 && c) consolePrint(3, "unhandled job error: " + exceptionString(c));
            break;
        }
    }
}

void finishTask(uint64_t id, const std::string& text) {
    std::shared_ptr<Task> t;
    {
        std::lock_guard<std::mutex> lk(g_qMu);
        auto it = g_running.find(id);
        if (it == g_running.end()) return;
        t = it->second;
        g_running.erase(it);
    }
    if (t->done) return;
    t->done = true;
    if (t->echo != Echo::Silent && !text.empty()) consolePrint(5, text);
    t->prom->set_value(text);
}

void runTask(const std::shared_ptr<Task>& t) {
    {
        std::lock_guard<std::mutex> lk(g_qMu);
        g_running[t->id] = t;
    }
    t->startMs = nowMs();
    if (t->echo == Echo::Full) consolePrint(4, "> " + t->code);
    const bool isCall = !t->call.empty();
    JSValue args[4] = {JS_NewFloat64(g_ctx, (double)t->id), isCall ? newStr(g_ctx, t->call) : newStr(g_ctx, t->code),
                       isCall ? newStr(g_ctx, t->code) : newStr(g_ctx, t->source),
                       JS_NewBool(g_ctx, t->echo == Echo::Output)};
    JSValue global = JS_GetGlobalObject(g_ctx);
    JSValue fn = JS_GetPropertyStr(g_ctx, global, isCall ? "__callTask" : "__runTask");
    if (!JS_IsFunction(g_ctx, fn)) {
        finishTask(t->id, "internal error: prelude not loaded");
    } else {
        armDeadline();
        JSValue r = JS_Call(g_ctx, fn, global, 4, args);
        if (JS_IsException(r)) {
            finishTask(t->id, exceptionString(g_ctx));
            // the JS side could not clean up (uncatchable interrupt): reset its task capture
            JSValue abortFn = JS_GetPropertyStr(g_ctx, global, "__abortTask");
            g_deadline = 0;
            g_interrupt = false;
            if (JS_IsFunction(g_ctx, abortFn)) JS_FreeValue(g_ctx, JS_Call(g_ctx, abortFn, global, 0, nullptr));
            JS_FreeValue(g_ctx, abortFn);
        }
        JS_FreeValue(g_ctx, r);
    }
    JS_FreeValue(g_ctx, fn);
    JS_FreeValue(g_ctx, global);
    for (auto& a : args) JS_FreeValue(g_ctx, a);
}

void tickWorkLocked(bool real) {
    g_inJs = true;
    JS_UpdateStackTop(g_rt);
    if (!real) g_virtualTicks++;
    JSValue arg = JS_NewBool(g_ctx, real);
    callGlobal("__tick", 1, &arg, "__abortTick", real ? config().tickTimeoutMs : 0);
    // queued evaluations
    for (int i = 0; i < 16; i++) {
        std::shared_ptr<Task> t;
        {
            std::lock_guard<std::mutex> lk(g_qMu);
            if (g_queue.empty()) break;
            t = g_queue.front();
            g_queue.pop_front();
        }
        runTask(t);
        runJobs();
    }
    runJobs();
    // tasks still waiting on a promise after 60 s (10 min while a form waits for the user)
    std::vector<uint64_t> stale;
    bool anyRunning;
    {
        std::lock_guard<std::mutex> lk(g_qMu);
        anyRunning = !g_running.empty();
    }
    if (anyRunning) {
        uint64_t limit = ui::formsOpen() > 0 ? 600000 : 60000;  // (ui lock is never held together with g_qMu)
        std::lock_guard<std::mutex> lk(g_qMu);
        for (auto& [id, t] : g_running)
            if (nowMs() - t->startMs > limit) stale.push_back(id);
    }
    for (auto id : stale) finishTask(id, "(promise still pending, giving up waiting for it)");
    g_deadline = 0;
    g_inJs = false;
}

void workerLoop() {
    while (!g_stop) {
        sleepMs(50);
        bool realTicks = tick::installed() && tick::tickingRecently(300);
        if (realTicks) continue;
        std::unique_lock<std::recursive_mutex> lk(g_jsMutex, std::try_to_lock);
        if (!lk.owns_lock()) continue;
        try {
            tickWorkLocked(false);
        } catch (const std::exception& e) {
            SE_LOGE("worker tick: %s", e.what());
            g_inJs = false;
        } catch (...) {
            g_inJs = false;
        }
    }
}

// ---------------------------------------------------------------------------
// native: __sys
// ---------------------------------------------------------------------------
JSValue n_print(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    int level = (int)toI64(ctx, SE_ARG(0), 0);
    consolePrint(level, toStr(ctx, SE_ARG(1)));
    return JS_UNDEFINED;
}

JSValue n_taskDone(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    finishTask((uint64_t)toI64(ctx, SE_ARG(0), 0), toStr(ctx, SE_ARG(1)));
    return JS_UNDEFINED;
}

JSValue n_evalScript(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string code = toStr(ctx, SE_ARG(0));
    std::string name = argc > 1 ? toStr(ctx, argv[1]) : "<eval>";
    bool async = argc > 2 && toBool(ctx, argv[2]);
    int flags = JS_EVAL_TYPE_GLOBAL | (async ? JS_EVAL_FLAG_ASYNC : 0);
    return JS_Eval(ctx, code.c_str(), code.size(), name.c_str(), flags);
}

JSValue n_evalModule(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string code = toStr(ctx, SE_ARG(0));
    std::string name = argc > 1 ? toStr(ctx, argv[1]) : "<module>";
    return JS_Eval(ctx, code.c_str(), code.size(), name.c_str(), JS_EVAL_TYPE_MODULE);
}

JSValue n_now(JSContext* ctx, JSValueConst, int, JSValueConst*) { return JS_NewFloat64(ctx, (double)nowUs() / 1000.0); }

std::string safePath(const std::string& rel) {
    if (rel.find("..") != std::string::npos) return "";
    if (!rel.empty() && rel[0] == '/') return "";
    return platform::dataDir() + "/" + rel;
}

JSValue n_readFile(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string p = safePath(toStr(ctx, SE_ARG(0)));
    std::string data;
    if (p.empty() || !platform::readFile(p, data)) return JS_NULL;
    return newStr(ctx, data);
}

JSValue n_writeFile(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string p = safePath(toStr(ctx, SE_ARG(0)));
    if (p.empty()) return JS_ThrowTypeError(ctx, "invalid path (relative paths inside the ScriptEval folder only)");
    size_t slash = p.rfind('/');
    if (slash != std::string::npos) platform::mkdirs(p.substr(0, slash));
    return JS_NewBool(ctx, platform::writeFile(p, toStr(ctx, SE_ARG(1))));
}

JSValue n_removeFile(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string p = safePath(toStr(ctx, SE_ARG(0)));
    if (p.empty()) return JS_ThrowTypeError(ctx, "invalid path (relative paths inside the ScriptEval folder only)");
    return JS_NewBool(ctx, ::unlink(p.c_str()) == 0);
}

JSValue n_listDir(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string p = safePath(argc > 0 ? toStr(ctx, argv[0]) : "");
    std::vector<std::string> names;
    if (DIR* d = opendir(p.c_str())) {
        while (dirent* e = readdir(d))
            if (e->d_name[0] != '.') names.push_back(e->d_name);
        closedir(d);
    }
    std::sort(names.begin(), names.end());
    return strArray(ctx, names);
}

JSValue n_consoleTail(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    size_t n = (size_t)std::max<int64_t>(1, std::min<int64_t>(2000, toI64(ctx, SE_ARG(0), 100)));
    uint64_t seq = consoleSeq();
    auto lines = consoleSince(seq > n ? seq - n : 0, n);
    JSValue arr = JS_NewArray(ctx);
    uint32_t i = 0;
    for (auto& l : lines) {
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "seq", JS_NewFloat64(ctx, (double)l.seq));
        setProp(ctx, o, "level", JS_NewInt32(ctx, l.level));
        setProp(ctx, o, "text", newStr(ctx, l.text));
        JS_SetPropertyUint32(ctx, arr, i++, o);
    }
    return arr;
}

JSValue n_session(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "studioPort", JS_NewInt32(ctx, studio::port()));
    setProp(ctx, o, "studioClients", JS_NewInt32(ctx, studio::clients()));
    setProp(ctx, o, "studioUrl", newStr(ctx, session::studioUrl(false)));
    setProp(ctx, o, "mcp", JS_NewBool(ctx, config().mcp && studio::port() > 0));
    setProp(ctx, o, "mcpCalls", JS_NewFloat64(ctx, (double)studio::mcpCalls()));
    setProp(ctx, o, "replPort", JS_NewInt32(ctx, config().replPort));
    setProp(ctx, o, "safeMode", JS_NewBool(ctx, session::safeMode()));
    setProp(ctx, o, "safeModeReason", newStr(ctx, session::safeModeReason()));
    setProp(ctx, o, "host", newStr(ctx, session::hostOs()));
    return o;
}

// secrets are only handed to code that already runs inside the game (Studio needs them to show the MCP setup)
JSValue n_secret(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string what = toStr(ctx, SE_ARG(0));
    if (what == "studioUrl") return newStr(ctx, session::studioUrl(true));
    if (what == "mcpToken") return newStr(ctx, session::mcpToken());
    if (what == "newMcpToken") return newStr(ctx, session::regenerateMcpToken());
    return JS_UNDEFINED;
}

JSValue n_openUrl(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    return JS_NewBool(ctx, session::openUrl(toStr(ctx, SE_ARG(0))));
}

JSValue n_leaveSafeMode(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    bool was = session::safeMode();
    session::leaveSafeMode();
    return JS_NewBool(ctx, was);
}

// __native.sys.packs(method, paramsJson) -> result object (global resource packs, see respack.h)
JSValue n_packs(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string method = toStr(ctx, SE_ARG(0));
    if (method == "summary") {
        auto s = respack::summary();
        JSValue o = JS_NewObject(ctx);
        setProp(ctx, o, "found", JS_NewBool(ctx, s.found));
        setProp(ctx, o, "installed", JS_NewInt32(ctx, s.installed));
        setProp(ctx, o, "active", JS_NewInt32(ctx, s.active));
        setProp(ctx, o, "forced", JS_NewInt32(ctx, s.forced));
        setProp(ctx, o, "missing", JS_NewInt32(ctx, s.missing));
        setProp(ctx, o, "restartNeeded", JS_NewBool(ctx, s.restartNeeded));
        setProp(ctx, o, "fileOk", JS_NewBool(ctx, s.fileOk));
        setProp(ctx, o, "dir", newStr(ctx, respack::comMojangDir()));
        setProp(ctx, o, "forcePacks", JS_NewBool(ctx, config().forcePacks));
        return o;
    }
    if (method == "put") return JS_ThrowTypeError(ctx, "packs: uploads go through Studio");
    std::string p = argc > 1 && JS_IsString(argv[1]) ? toStr(ctx, argv[1]) : "{}";
    JsonValue params;
    std::string err;
    if (!parseJson(p, params, &err) || params.type != JsonValue::Object) return JS_ThrowTypeError(ctx, "packs: bad parameters");
    std::string out;
    if (!respack::call(method, params, out, err)) return JS_ThrowInternalError(ctx, "%s", err.c_str());
    return JS_ParseJSON(ctx, out.c_str(), out.size(), "<packs>");
}

// __native.sys.http(optsJson) -> { ok, status, headers:{...}, body, error, backend }
// optsJson: {"method":"GET","url":"https://…","headers":{...},"body":"…","timeoutMs":15000,"followRedirects":true}
// REPL/eval はワーカースレッドで走るのでブロッキングで可(ゲームスレッドは触らない)。
JSValue n_http(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string optsStr = argc > 0 && JS_IsString(argv[0]) ? toStr(ctx, argv[0]) : "{}";
    JsonValue o; std::string perr;
    if (!parseJson(optsStr, o, &perr) || o.type != JsonValue::Object) return JS_ThrowTypeError(ctx, "http: bad options JSON");
    se::http::Request req;
    auto get = [&](const char* k) -> const JsonValue* { auto it = o.obj.find(k); return it == o.obj.end() ? nullptr : &it->second; };
    if (auto* v = get("url"); v && v->type == JsonValue::String) req.url = v->s;
    if (auto* v = get("method"); v && v->type == JsonValue::String) req.method = v->s;
    if (auto* v = get("body"); v && v->type == JsonValue::String) req.body = v->s;
    if (auto* v = get("timeoutMs"); v && v->type == JsonValue::Number) req.timeoutMs = (int)v->n;
    if (auto* v = get("followRedirects"); v && v->type == JsonValue::Bool) req.followRedirects = v->b;
    if (auto* v = get("headers"); v && v->type == JsonValue::Object)
        for (auto& kv : v->obj) if (kv.second.type == JsonValue::String) req.headers.emplace_back(kv.first, kv.second.s);
    if (req.url.empty()) return JS_ThrowTypeError(ctx, "http: url is required");
    se::http::Response res = se::http::request(req);
    JSValue r = JS_NewObject(ctx);
    setProp(ctx, r, "ok", JS_NewBool(ctx, res.ok));
    setProp(ctx, r, "status", JS_NewInt32(ctx, res.status));
    setProp(ctx, r, "body", newStr(ctx, res.body));
    setProp(ctx, r, "error", newStr(ctx, res.error));
    setProp(ctx, r, "backend", newStr(ctx, res.backend));
    JSValue h = JS_NewObject(ctx);
    for (auto& kv : res.headers) setProp(ctx, h, kv.first.c_str(), newStr(ctx, kv.second));
    setProp(ctx, r, "headers", h);
    return r;
}

// __native.sys.selfUpdate(optsJson) -> { ok, path, bytes, restartNeeded, error }
// 新しい .so をダウンロードして「今動いている mod ファイル」に原子的に差し替える(write tmp + rename)。
// ネイティブコードはプロセス内で安全に入れ替えられないので restartNeeded=true(= 次回 mcpelauncher 起動で反映)。
// スクリプト層のライブ更新は prelude 側(client.reset + runScript)で行う。
// opts: {"url":"https://…/libscripteval.so", "dest":"<省略時は実行中の .so パス>"}
JSValue n_selfUpdate(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string optsStr = argc > 0 && JS_IsString(argv[0]) ? toStr(ctx, argv[0]) : "{}";
    JsonValue o; std::string perr;
    if (!parseJson(optsStr, o, &perr) || o.type != JsonValue::Object) return JS_ThrowTypeError(ctx, "selfUpdate: bad options JSON");
    auto sfield = [&](const char* k) -> std::string { auto it = o.obj.find(k); return it != o.obj.end() && it->second.type == JsonValue::String ? it->second.s : std::string(); };
    std::string url = sfield("url"), dest = sfield("dest");
    JSValue r = JS_NewObject(ctx);
    auto ret = [&](bool ok, const std::string& err, long bytes) {
        setProp(ctx, r, "ok", JS_NewBool(ctx, ok));
        setProp(ctx, r, "path", newStr(ctx, dest));
        setProp(ctx, r, "bytes", JS_NewInt64(ctx, bytes));
        setProp(ctx, r, "restartNeeded", JS_NewBool(ctx, ok));
        setProp(ctx, r, "error", newStr(ctx, err));
        return r;
    };
    if (url.empty()) return ret(false, "url が必要です", 0);
    if (dest.empty()) {  // 実行中の .so のパスを dladdr で特定
        Dl_info info{};
        if (dladdr((void*)&n_selfUpdate, &info) && info.dli_fname) dest = info.dli_fname;
        if (dest.empty()) return ret(false, "mod のパスを特定できません(dest を指定してください)", 0);
    }
    se::http::Request req; req.url = url; req.timeoutMs = 120000;
    se::http::Response res = se::http::request(req);
    if (!res.ok) return ret(false, "ダウンロード失敗: " + res.error, 0);
    if (res.status >= 400) return ret(false, "ダウンロード HTTP " + std::to_string(res.status), 0);
    if (res.body.size() < 1024) return ret(false, "ファイルが小さすぎます(.so ではない?)", 0);
    // ELF/Mach-O のごく簡単な健全性チェック(壊れたものを掴まされて次回起動不能を防ぐ)
    const unsigned char* b = (const unsigned char*)res.body.data();
    bool elf = res.body.size() > 4 && b[0] == 0x7f && b[1] == 'E' && b[2] == 'L' && b[3] == 'F';
    bool macho = res.body.size() > 4 && (b[0] == 0xcf || b[0] == 0xca) && b[1] == 0xfa && b[2] == 0xed && b[3] == 0xfe;
    if (!elf && !macho) return ret(false, "ELF/Mach-O ではありません", (long)res.body.size());
    std::string tmp = dest + ".new";
    if (!se::platform::writeFile(tmp, res.body)) return ret(false, "書き込み失敗: " + tmp, (long)res.body.size());
    if (::rename(tmp.c_str(), dest.c_str()) != 0) { ::unlink(tmp.c_str()); return ret(false, "差し替え失敗(rename): " + dest, (long)res.body.size()); }
    SE_LOGI("selfUpdate: wrote %zu bytes to %s (effective next launch)", res.body.size(), dest.c_str());
    return ret(true, "", (long)res.body.size());
}

JSValue n_info(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    JSValue o = JS_NewObject(ctx);
    setProp(ctx, o, "version", newStr(ctx, kVersion));
    setProp(ctx, o, "host", newStr(ctx, session::hostOs()));
    setProp(ctx, o, "gameVersion", newStr(ctx, platform::gameVersion()));
    setProp(ctx, o, "dataDir", newStr(ctx, platform::dataDir()));
#if defined(__x86_64__)
    setProp(ctx, o, "arch", newStr(ctx, "x86_64"));
#elif defined(__aarch64__)
    setProp(ctx, o, "arch", newStr(ctx, "arm64"));
#endif
    setProp(ctx, o, "evalTimeoutMs", JS_NewInt32(ctx, config().evalTimeoutMs));
    setProp(ctx, o, "mainThread", JS_NewBool(ctx, tick::onMainThread()));
    setProp(ctx, o, "virtualTicks", JS_NewFloat64(ctx, (double)g_virtualTicks));
    return o;
}

// ---------------------------------------------------------------------------
// module loader
// ---------------------------------------------------------------------------
char* moduleNormalize(JSContext* ctx, const char* base, const char* name, void*) {
    std::string n = name;
    if (!startsWith(n, "./") && !startsWith(n, "../")) return js_strdup(ctx, name);
    std::string b = base ? base : "";
    size_t slash = b.rfind('/');
    std::string dir = slash == std::string::npos ? "" : b.substr(0, slash + 1);
    std::string full = dir + n;
    // collapse "./" and "../"
    std::vector<std::string> parts;
    size_t i = 0;
    while (i <= full.size()) {
        size_t j = full.find('/', i);
        if (j == std::string::npos) j = full.size();
        std::string seg = full.substr(i, j - i);
        if (seg == "..") {
            if (!parts.empty()) parts.pop_back();
        } else if (seg != "." && !seg.empty()) {
            parts.push_back(seg);
        }
        i = j + 1;
    }
    std::string out;
    for (size_t k = 0; k < parts.size(); k++) out += (k ? "/" : "") + parts[k];
    return js_strdup(ctx, out.c_str());
}

JSModuleDef* moduleLoaderImpl(JSContext* ctx, const char* name);
JSModuleDef* moduleLoader(JSContext* ctx, const char* name, void*) {
    try {
        return moduleLoaderImpl(ctx, name);
    } catch (...) {
        JS_ThrowInternalError(ctx, "module loader failed for %s", name);
        return nullptr;
    }
}

JSModuleDef* moduleLoaderImpl(JSContext* ctx, const char* name) {
    std::string src;
    // builtin modules provided by the prelude
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue fn = JS_GetPropertyStr(ctx, global, "__moduleSource");
    if (JS_IsFunction(ctx, fn)) {
        JSValue arg = JS_NewString(ctx, name);
        JSValue r = JS_Call(ctx, fn, global, 1, &arg);
        if (JS_IsString(r)) src = toStr(ctx, r);
        JS_FreeValue(ctx, r);
        JS_FreeValue(ctx, arg);
    }
    JS_FreeValue(ctx, fn);
    JS_FreeValue(ctx, global);
    if (src.empty()) {
        std::string rel = name;
        if (startsWith(rel, "scripts/")) rel = rel.substr(8);
        std::string path = platform::dataDir() + "/scripts/" + rel;
        if (!platform::readFile(path, src) && !platform::readFile(path + ".js", src)) {
            JS_ThrowReferenceError(ctx, "module not found: %s (looked in %s)", name, path.c_str());
            return nullptr;
        }
    }
    JSValue v = JS_Eval(ctx, src.c_str(), src.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    if (JS_IsException(v)) return nullptr;
    auto* m = (JSModuleDef*)JS_VALUE_GET_PTR(v);
    JS_FreeValue(ctx, v);
    return m;
}
}  // namespace

JSContext* context() { return g_ctx; }

void consolePrint(int level, const std::string& text) {
    std::lock_guard<std::mutex> lk(g_conMu);
    size_t pos = 0;
    while (pos <= text.size()) {
        size_t nl = text.find('\n', pos);
        if (nl == std::string::npos) nl = text.size();
        g_console.push_back(ConsoleLine{++g_conSeq, level, text.substr(pos, nl - pos)});
        pos = nl + 1;
    }
    while (g_console.size() > kConsoleMax) g_console.pop_front();
}

std::vector<ConsoleLine> consoleSince(uint64_t seq, size_t max) {
    std::lock_guard<std::mutex> lk(g_conMu);
    std::vector<ConsoleLine> out;
    for (auto& l : g_console)
        if (l.seq > seq) out.push_back(l);
    if (out.size() > max) out.erase(out.begin(), out.end() - (long)max);
    return out;
}

uint64_t consoleSeq() {
    std::lock_guard<std::mutex> lk(g_conMu);
    return g_conSeq;
}

void consoleClear() {
    std::lock_guard<std::mutex> lk(g_conMu);
    g_console.clear();
    g_conSeq++;
}

void interrupt() {
    g_interrupt = true;
}

bool started() { return g_started; }

bool start() {
    std::lock_guard<std::recursive_mutex> lk(g_jsMutex);
    if (g_started) return true;
    g_rt = JS_NewRuntime();
    if (!g_rt) return false;
    JS_SetMemoryLimit(g_rt, 512u << 20);
    JS_SetMaxStackSize(g_rt, 2u << 20);
    JS_SetInterruptHandler(g_rt, interruptHandler, nullptr);
    JS_SetModuleLoaderFunc(g_rt, moduleNormalize, moduleLoader, nullptr);
    g_ctx = JS_NewContext(g_rt);
    if (!g_ctx) return false;
    JS_UpdateStackTop(g_rt);

    JSValue global = JS_GetGlobalObject(g_ctx);
    JSValue native = JS_NewObject(g_ctx);
    JSValue sys = JS_NewObject(g_ctx);
    setFn(g_ctx, sys, "print", n_print, 2);
    setFn(g_ctx, sys, "taskDone", n_taskDone, 2);
    setFn(g_ctx, sys, "evalScript", n_evalScript, 3);
    setFn(g_ctx, sys, "evalModule", n_evalModule, 2);
    setFn(g_ctx, sys, "now", n_now, 0);
    setFn(g_ctx, sys, "readFile", n_readFile, 1);
    setFn(g_ctx, sys, "writeFile", n_writeFile, 2);
    setFn(g_ctx, sys, "listDir", n_listDir, 1);
    setFn(g_ctx, sys, "removeFile", n_removeFile, 1);
    setFn(g_ctx, sys, "info", n_info, 0);
    setFn(g_ctx, sys, "consoleTail", n_consoleTail, 1);
    setFn(g_ctx, sys, "session", n_session, 0);
    setFn(g_ctx, sys, "secret", n_secret, 1);
    setFn(g_ctx, sys, "openUrl", n_openUrl, 1);
    setFn(g_ctx, sys, "leaveSafeMode", n_leaveSafeMode, 0);
    setFn(g_ctx, sys, "packs", n_packs, 2);
    setFn(g_ctx, sys, "http", n_http, 1);
    setFn(g_ctx, sys, "selfUpdate", n_selfUpdate, 1);
    setProp(g_ctx, native, "sys", sys);
    JSValue mc = JS_NewObject(g_ctx);
    registerGameBindings(g_ctx, mc);
    setProp(g_ctx, native, "mc", mc);
    JSValue dbg = JS_NewObject(g_ctx);
    registerDebugBindings(g_ctx, dbg);
    setProp(g_ctx, native, "dbg", dbg);
    JSValue uiObj = JS_NewObject(g_ctx);
    registerUiBindings(g_ctx, uiObj);
    setProp(g_ctx, native, "ui", uiObj);
    JSValue inputObj = JS_NewObject(g_ctx);
    registerInputBindings(g_ctx, inputObj);
    setProp(g_ctx, native, "input", inputObj);
    setProp(g_ctx, global, "__native", native);
    JS_FreeValue(g_ctx, global);

    armDeadline();
    g_deadline = nowMs() + 10000;
    JSValue r = JS_Eval(g_ctx, (const char*)kPreludeJs, kPreludeJsLen, "<prelude>", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        std::string err = exceptionString(g_ctx);
        SE_LOGE("prelude failed: %s", err.c_str());
        consolePrint(3, "prelude failed: " + err);
    }
    JS_FreeValue(g_ctx, r);
    runJobs();
    g_deadline = 0;
    g_started = true;
    g_worker = std::thread(workerLoop);
    g_worker.detach();
    tick::setTickCallback(onGameTick);
    SE_LOGI("JS engine started");
    return true;
}

std::future<std::string> call(const std::string& fn, const std::string& arg) {
    auto t = std::make_shared<Task>();
    t->id = g_nextId++;
    t->code = arg;
    t->call = fn;
    t->source = "<" + fn + ">";
    t->echo = Echo::Silent;
    t->prom = std::make_shared<std::promise<std::string>>();
    auto fut = t->prom->get_future();
    std::lock_guard<std::mutex> lk(g_qMu);
    g_queue.push_back(t);
    return fut;
}

std::future<std::string> submit(const std::string& code, const std::string& source, Echo echo) {
    auto t = std::make_shared<Task>();
    t->id = g_nextId++;
    t->code = code;
    t->source = source;
    t->echo = echo;
    t->prom = std::make_shared<std::promise<std::string>>();
    auto fut = t->prom->get_future();
    std::lock_guard<std::mutex> lk(g_qMu);
    g_queue.push_back(t);
    return fut;
}

void onGameTick(void*) {
    if (!g_started) return;
    std::unique_lock<std::recursive_mutex> lk(g_jsMutex, std::try_to_lock);
    if (!lk.owns_lock()) return;
    try {
        tickWorkLocked(true);
        scripteval_input_tick();  // 保持入力(前進など)を毎tick反映し、単発/UI キューを消化
    } catch (...) {
        g_inJs = false;
    }
}

std::string statusLine() {
    auto st = game::game().status();
    std::string s;
    if (st.inWorld) {
        s = strprintf("world: %s | actors %zu | pools %zu", st.levelClass.empty() ? "?" : st.levelClass.c_str(),
                      st.actors, st.storages);
    } else {
        s = st.error.empty() ? "world: not scanned yet (run any world/system call)" : "world: " + st.error;
    }
    if (tick::installed())
        s += strprintf(" | tick hook: slot %d, %s", tick::installedSlot(),
                       tick::tickingRecently(500) ? "ticking" : "idle");
    else
        s += " | tick hook: off (worker thread)";
    return s;
}

}  // namespace se::js

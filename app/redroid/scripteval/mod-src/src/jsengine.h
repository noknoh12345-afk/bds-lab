// QuickJS runtime hosting the @minecraft/server-like API.
//
// Execution model: all JavaScript runs while holding one mutex. When the tick
// hook is installed, queued evaluations and system.run* timers run on the
// game thread inside the hooked tick (consistent with real Script API). Until
// then (or when the game is not ticking, e.g. in menus) a worker thread
// drives "virtual" ticks at 20 Hz.
#pragma once

#include <cstdint>
#include <functional>
#include <future>
#include <string>
#include <vector>

struct JSContext;

namespace se::js {

struct ConsoleLine {
    uint64_t seq;
    int level;  // 0 log, 1 info, 2 warn, 3 error, 4 input echo, 5 result
    std::string text;
};

bool start();
bool started();

// How an evaluation shows up in the console buffer:
//   Silent - nothing (the future still receives the output)
//   Output - console output and errors only (no input echo, no result value)
//   Full   - "> code" echo, console output and the inspected result
enum class Echo { Silent, Output, Full };

// Queue code for evaluation. The future yields the formatted output
// (console output of the synchronous part + the inspected result).
std::future<std::string> submit(const std::string& code, const std::string& source, Echo echo);
inline std::future<std::string> submit(const std::string& code, const std::string& source, bool echo = true) {
    return submit(code, source, echo ? Echo::Full : Echo::Silent);
}

// Calls globalThis[fn](arg) on the JS thread. The function returns a string
// (or a Promise of one); nothing is echoed to the console. Used by the Studio
// server and MCP, whose handlers live in the prelude.
std::future<std::string> call(const std::string& fn, const std::string& arg);

// Called by the tick hook on the game thread.
void onGameTick(void* self);

// Console buffer shared by the UI and the REPL server.
std::vector<ConsoleLine> consoleSince(uint64_t seq, size_t max = 400);
uint64_t consoleSeq();
void consoleClear();
void consolePrint(int level, const std::string& text);

// Abort the currently running script (best effort).
void interrupt();

// Status line for the UI.
std::string statusLine();

// Runs `fn` with the JS lock held (used by native bindings that call back).
JSContext* context();

}  // namespace se::js

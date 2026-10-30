// ScriptEval - client-side Script API style evaluator for mcpelauncher
// Common helpers shared by all translation units.
#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>

namespace se {

constexpr const char* kVersion = "0.3.0";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
enum class LogLevel { Debug = 0, Info = 1, Warn = 2, Error = 3 };

void logInit(const std::string& logFilePath);
void logMessage(LogLevel level, const char* fmt, ...) __attribute__((format(printf, 2, 3)));
// Last N log lines (for the "status" view)
std::vector<std::string> logTail(size_t n);

#define SE_LOGD(...) ::se::logMessage(::se::LogLevel::Debug, __VA_ARGS__)
#define SE_LOGI(...) ::se::logMessage(::se::LogLevel::Info, __VA_ARGS__)
#define SE_LOGW(...) ::se::logMessage(::se::LogLevel::Warn, __VA_ARGS__)
#define SE_LOGE(...) ::se::logMessage(::se::LogLevel::Error, __VA_ARGS__)

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
std::string strprintf(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
std::string hex(uint64_t v);
uint64_t nowMs();       // monotonic milliseconds
uint64_t nowUs();       // monotonic microseconds
void sleepMs(unsigned ms);

bool startsWith(std::string_view s, std::string_view p);
bool endsWith(std::string_view s, std::string_view p);
bool contains(std::string_view s, std::string_view p);
std::string toLower(std::string_view s);

// FNV-1 style hash used by Bedrock's HashedString (multiply, then xor).
uint64_t bedrockStringHash(const char* s, size_t n);

// Printable ASCII / UTF-8 check used by heuristics.
bool looksLikeText(const char* s, size_t n, bool allowNewlines = false);
// "namespace:path" style identifiers like "minecraft:zombie"
bool looksLikeNamespacedId(std::string_view s);

// JSON string literal (also a valid JavaScript string literal).
std::string jsonQuote(std::string_view s);
// Replaces invalid UTF-8 sequences with U+FFFD (WebSocket text frames must be valid UTF-8).
std::string utf8Sanitize(std::string_view s);
std::string base64Encode(const unsigned char* d, size_t n);

}  // namespace se

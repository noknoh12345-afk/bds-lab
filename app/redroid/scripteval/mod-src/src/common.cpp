#include "common.h"

#include <chrono>
#include <deque>
#include <mutex>
#include <thread>
#include <ctime>

#if defined(__ANDROID__)
#include <android/log.h>
#endif

namespace se {

namespace {
std::mutex g_logMutex;
std::deque<std::string> g_logRing;
FILE* g_logFile = nullptr;
constexpr size_t kLogRingMax = 400;
}  // namespace

void logInit(const std::string& path) {
    std::lock_guard<std::mutex> lk(g_logMutex);
    if (g_logFile) return;
    if (!path.empty()) {
        g_logFile = fopen(path.c_str(), "w");
    }
}

void logMessage(LogLevel level, const char* fmt, ...) {
    char buf[2048];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    static const char* names[] = {"D", "I", "W", "E"};
    const char* lv = names[(int)level];
#if defined(__ANDROID__)
    static const int prio[] = {ANDROID_LOG_DEBUG, ANDROID_LOG_INFO, ANDROID_LOG_WARN, ANDROID_LOG_ERROR};
    __android_log_print(prio[(int)level], "ScriptEval", "%s", buf);
#else
    fprintf(stderr, "[ScriptEval][%s] %s\n", lv, buf);
#endif
    std::lock_guard<std::mutex> lk(g_logMutex);
    std::string line = std::string("[") + lv + "] " + buf;
    if (g_logFile) {
        time_t t = time(nullptr);
        struct tm tmv;
        localtime_r(&t, &tmv);
        char ts[32];
        strftime(ts, sizeof(ts), "%H:%M:%S", &tmv);
        fprintf(g_logFile, "%s %s\n", ts, line.c_str());
        fflush(g_logFile);
    }
    g_logRing.push_back(std::move(line));
    while (g_logRing.size() > kLogRingMax) g_logRing.pop_front();
}

std::vector<std::string> logTail(size_t n) {
    std::lock_guard<std::mutex> lk(g_logMutex);
    std::vector<std::string> out;
    size_t start = g_logRing.size() > n ? g_logRing.size() - n : 0;
    for (size_t i = start; i < g_logRing.size(); i++) out.push_back(g_logRing[i]);
    return out;
}

std::string strprintf(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    va_list ap2;
    va_copy(ap2, ap);
    int n = vsnprintf(nullptr, 0, fmt, ap);
    va_end(ap);
    std::string s;
    if (n > 0) {
        s.resize((size_t)n);
        vsnprintf(s.data(), (size_t)n + 1, fmt, ap2);
    }
    va_end(ap2);
    return s;
}

std::string hex(uint64_t v) {
    char b[24];
    snprintf(b, sizeof(b), "0x%llx", (unsigned long long)v);
    return b;
}

uint64_t nowMs() {
    return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

uint64_t nowUs() {
    return (uint64_t)std::chrono::duration_cast<std::chrono::microseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

void sleepMs(unsigned ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

bool startsWith(std::string_view s, std::string_view p) { return s.size() >= p.size() && s.substr(0, p.size()) == p; }
bool endsWith(std::string_view s, std::string_view p) {
    return s.size() >= p.size() && s.substr(s.size() - p.size()) == p;
}
bool contains(std::string_view s, std::string_view p) { return s.find(p) != std::string_view::npos; }

std::string toLower(std::string_view s) {
    std::string r(s);
    for (auto& c : r)
        if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    return r;
}

uint64_t bedrockStringHash(const char* s, size_t n) {
    if (n == 0) return 0;
    uint64_t h = 0xCBF29CE484222325ULL;
    for (size_t i = 0; i < n; i++) {
        h *= 0x100000001B3ULL;
        h ^= (unsigned char)s[i];
    }
    return h;
}

bool looksLikeText(const char* s, size_t n, bool allowNewlines) {
    size_t i = 0;
    while (i < n) {
        unsigned char c = (unsigned char)s[i];
        if (c < 0x80) {
            if (c == 0) return false;
            if (c < 0x20) {
                if (!(allowNewlines && (c == '\n' || c == '\r' || c == '\t'))) return false;
            }
            if (c == 0x7f) return false;
            i++;
            continue;
        }
        // validate UTF-8 sequence
        int len = (c >= 0xF0 && c <= 0xF4) ? 4 : (c >= 0xE0) ? 3 : (c >= 0xC2 && c <= 0xDF) ? 2 : 0;
        if (len == 0 || i + (size_t)len > n) return false;
        for (int k = 1; k < len; k++)
            if (((unsigned char)s[i + k] & 0xC0) != 0x80) return false;
        i += (size_t)len;
    }
    return true;
}

bool looksLikeNamespacedId(std::string_view s) {
    if (s.size() < 3 || s.size() > 128) return false;
    size_t colon = s.find(':');
    if (colon == std::string_view::npos || colon == 0 || colon + 1 >= s.size()) return false;
    if (s.find(':', colon + 1) != std::string_view::npos) return false;
    for (char c : s) {
        bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == ':' || c == '.' ||
                  c == '/' || c == '-' || (c >= 'A' && c <= 'Z');
        if (!ok) return false;
    }
    return true;
}

std::string utf8Sanitize(std::string_view s) {
    std::string o;
    o.reserve(s.size());
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = (unsigned char)s[i];
        if (c < 0x80) {
            o += (char)c;
            i++;
            continue;
        }
        int len = (c >= 0xF0 && c <= 0xF4) ? 4 : (c >= 0xE0 && c <= 0xEF) ? 3 : (c >= 0xC2 && c <= 0xDF) ? 2 : 0;
        bool ok = len > 0 && i + (size_t)len <= s.size();
        for (int k = 1; ok && k < len; k++)
            if (((unsigned char)s[i + k] & 0xC0) != 0x80) ok = false;
        if (ok && len == 3) {  // no overlongs, no surrogates
            unsigned char c1 = (unsigned char)s[i + 1];
            if ((c == 0xE0 && c1 < 0xA0) || (c == 0xED && c1 >= 0xA0)) ok = false;
        }
        if (ok && len == 4) {
            unsigned char c1 = (unsigned char)s[i + 1];
            if ((c == 0xF0 && c1 < 0x90) || (c == 0xF4 && c1 >= 0x90)) ok = false;
        }
        if (ok) {
            o.append(s.data() + i, (size_t)len);
            i += (size_t)len;
        } else {
            o += "\xEF\xBF\xBD";
            i++;
        }
    }
    return o;
}

std::string base64Encode(const unsigned char* d, size_t n) {
    static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string o;
    o.reserve((n + 2) / 3 * 4);
    for (size_t i = 0; i < n; i += 3) {
        uint32_t v = (uint32_t)d[i] << 16 | (i + 1 < n ? (uint32_t)d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
        o += t[(v >> 18) & 63];
        o += t[(v >> 12) & 63];
        o += i + 1 < n ? t[(v >> 6) & 63] : '=';
        o += i + 2 < n ? t[v & 63] : '=';
    }
    return o;
}

std::string jsonQuote(std::string_view s) {
    std::string o;
    o.reserve(s.size() + 2);
    o += '"';
    for (unsigned char c : s) {
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            default:
                if (c < 0x20) o += strprintf("\\u%04x", c);
                else o += (char)c;
        }
    }
    o += '"';
    return o;
}

}  // namespace se

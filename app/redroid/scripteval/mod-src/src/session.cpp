#include "session.h"

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <atomic>
#include <cstdlib>
#include <mutex>
#include <thread>

#include "common.h"
#include "config.h"
#include "platform.h"

namespace se::session {

namespace {
std::string g_token, g_mcpToken;
std::mutex g_mu;
std::atomic<bool> g_safe{false};
std::string g_safeReason;
bool g_inited = false;

std::string randomHex(size_t bytes) {
    std::string raw(bytes, '\0');
    size_t got = 0;
    int fd = ::open("/dev/urandom", O_RDONLY);
    if (fd >= 0) {
        while (got < bytes) {
            ssize_t n = ::read(fd, &raw[got], bytes - got);
            if (n <= 0) break;
            got += (size_t)n;
        }
        ::close(fd);
    }
    if (got < bytes) {
        // fallback (should not happen): mix clock, addresses and pid
        uint64_t x = nowUs() ^ ((uint64_t)getpid() << 32) ^ (uint64_t)(uintptr_t)&raw;
        for (size_t i = 0; i < bytes; i++) {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            raw[i] = (char)(x & 0xff);
        }
    }
    static const char* hexd = "0123456789abcdef";
    std::string out;
    for (unsigned char c : raw) {
        out += hexd[c >> 4];
        out += hexd[c & 15];
    }
    return out;
}

bool writePrivate(const std::string& path, const std::string& data) {
    int fd = ::open(path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (fd < 0) return false;
    bool ok = ::write(fd, data.data(), data.size()) == (ssize_t)data.size();
    ::close(fd);
    chmod(path.c_str(), 0600);
    return ok;
}

bool validToken(const std::string& t) {
    if (t.size() < 32 || t.size() > 128) return false;
    for (char c : t)
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    return true;
}

std::string markerPath() { return platform::dataDir() + "/running.marker"; }
void removeMarker() { ::unlink(markerPath().c_str()); }
}  // namespace

void init() {
    std::lock_guard<std::mutex> lk(g_mu);
    if (g_inited) return;
    g_inited = true;
    const std::string dir = platform::dataDir();
    g_token = randomHex(16);
    if (!writePrivate(dir + "/session.token", g_token + "\n")) SE_LOGW("cannot write session.token");
    std::string mt;
    if (platform::readFile(dir + "/mcp.token", mt)) {
        while (!mt.empty() && (mt.back() == '\n' || mt.back() == '\r' || mt.back() == ' ')) mt.pop_back();
    }
    if (!validToken(mt)) {
        mt = randomHex(24);
        writePrivate(dir + "/mcp.token", mt + "\n");
    }
    g_mcpToken = mt;

    // crash-loop protection: the marker lives during the first minute of a launch
    struct stat st;
    if (config().safeMode != "off" && stat(markerPath().c_str(), &st) == 0) {
        g_safe = true;
        g_safeReason = "the previous launch ended within its first minute (crash?)";
        SE_LOGW("safe mode: %s - autorun and the tick hook stay off; client.leaveSafeMode() turns them on",
                g_safeReason.c_str());
    }
    platform::writeFile(markerPath(), strprintf("%llu\n", (unsigned long long)nowMs()));
    std::atexit(removeMarker);
    std::thread([] {
        sleepMs(60000);
        removeMarker();
    }).detach();
}

const std::string& token() { return g_token; }
const std::string& mcpToken() { return g_mcpToken; }

std::string regenerateMcpToken() {
    std::lock_guard<std::mutex> lk(g_mu);
    g_mcpToken = randomHex(24);
    writePrivate(platform::dataDir() + "/mcp.token", g_mcpToken + "\n");
    return g_mcpToken;
}

std::string randomId(size_t bytes) { return randomHex(bytes); }

bool tokenEquals(const std::string& a, const std::string& b) {
    if (a.size() != b.size() || a.empty()) return false;
    unsigned char d = 0;
    for (size_t i = 0; i < a.size(); i++) d |= (unsigned char)(a[i] ^ b[i]);
    return d == 0;
}

bool safeMode() { return g_safe; }
std::string safeModeReason() {
    std::lock_guard<std::mutex> lk(g_mu);
    return g_safe ? g_safeReason : "";
}
void leaveSafeMode() { g_safe = false; }

const char* hostOs() {
    static const char* os = [] {
        if (platform::hostLibcSymbol("mach_vm_region")) return "mac";
        return "linux";
    }();
    return os;
}

bool openUrl(const std::string& url) {
    if (getenv("SCRIPTEVAL_NO_BROWSER")) return false;
    for (char c : url)
        if (!(isalnum((unsigned char)c) || strchr(":/.#=_-?&%", c))) return false;
    using system_t = int (*)(const char*);
    auto sys = reinterpret_cast<system_t>(platform::hostLibcSymbol("system"));
    if (!sys) return false;
    std::string cmd = std::string(strcmp(hostOs(), "mac") == 0 ? "open" : "xdg-open") + " '" + url + "' >/dev/null 2>&1 &";
    std::thread([sys, cmd] { sys(cmd.c_str()); }).detach();
    return true;
}

std::string studioUrl(bool withToken) {
    if (config().studioPort <= 0) return "";
    std::string host = config().studioBind == "0.0.0.0" ? "127.0.0.1" : config().studioBind;
    std::string u = strprintf("http://%s:%d/", host.c_str(), config().studioPort);
    if (withToken) u += "#t=" + g_token;
    return u;
}

}  // namespace se::session

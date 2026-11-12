#include "studio.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "common.h"
#include "config.h"
#include "jsengine.h"
#include "respack.h"
#include "session.h"
#include "studio_html.h"

namespace se::studio {

namespace {
std::atomic<int> g_port{0};
std::atomic<int> g_clients{0};
std::atomic<int> g_conns{0};
std::atomic<uint64_t> g_mcpCalls{0};
constexpr size_t kMaxHeader = 32 * 1024;
constexpr size_t kMaxBody = 8 * 1024 * 1024;
constexpr size_t kMaxWsMessage = 8 * 1024 * 1024;

// ---------------------------------------------------------------- utilities
bool sendAll(int fd, const void* data, size_t len) {
    const char* p = (const char*)data;
    while (len) {
        ssize_t n = ::send(fd, p, len, MSG_NOSIGNAL);
        if (n <= 0) return false;
        p += n;
        len -= (size_t)n;
    }
    return true;
}
bool sendStr(int fd, const std::string& s) { return sendAll(fd, s.data(), s.size()); }

// Waits up to timeoutMs for data, then reads exactly len bytes (0 timeout = forever).
bool recvExact(int fd, void* out, size_t len, int timeoutMs) {
    char* p = (char*)out;
    while (len) {
        if (timeoutMs > 0) {
            pollfd pf{fd, POLLIN, 0};
            if (poll(&pf, 1, timeoutMs) <= 0) return false;
        }
        ssize_t n = ::recv(fd, p, len, 0);
        if (n <= 0) return false;
        p += n;
        len -= (size_t)n;
    }
    return true;
}

std::string lower(std::string s) {
    for (auto& c : s) c = (char)tolower((unsigned char)c);
    return s;
}
std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

std::string base64(const unsigned char* d, size_t n) {
    static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string o;
    for (size_t i = 0; i < n; i += 3) {
        uint32_t v = (uint32_t)d[i] << 16 | (i + 1 < n ? (uint32_t)d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
        o += t[(v >> 18) & 63];
        o += t[(v >> 12) & 63];
        o += i + 1 < n ? t[(v >> 6) & 63] : '=';
        o += i + 2 < n ? t[v & 63] : '=';
    }
    return o;
}

// SHA-1 (only for the WebSocket handshake)
void sha1(const std::string& msg, unsigned char out[20]) {
    uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
    std::string m = msg;
    uint64_t bits = (uint64_t)msg.size() * 8;
    m += (char)0x80;
    while (m.size() % 64 != 56) m += (char)0;
    for (int i = 7; i >= 0; i--) m += (char)((bits >> (i * 8)) & 0xff);
    auto rol = [](uint32_t x, int c) { return (x << c) | (x >> (32 - c)); };
    for (size_t off = 0; off < m.size(); off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++)
            w[i] = (uint32_t)(unsigned char)m[off + i * 4] << 24 | (uint32_t)(unsigned char)m[off + i * 4 + 1] << 16 |
                   (uint32_t)(unsigned char)m[off + i * 4 + 2] << 8 | (uint32_t)(unsigned char)m[off + i * 4 + 3];
        for (int i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20) f = (b & c) | (~b & d), k = 0x5A827999;
            else if (i < 40) f = b ^ c ^ d, k = 0x6ED9EBA1;
            else if (i < 60) f = (b & c) | (b & d) | (c & d), k = 0x8F1BBCDC;
            else f = b ^ c ^ d, k = 0xCA62C1D6;
            uint32_t tmp = rol(a, 5) + f + e + k + w[i];
            e = d, d = c, c = rol(b, 30), b = a, a = tmp;
        }
        h[0] += a, h[1] += b, h[2] += c, h[3] += d, h[4] += e;
    }
    for (int i = 0; i < 5; i++)
        for (int j = 0; j < 4; j++) out[i * 4 + j] = (unsigned char)(h[i] >> (24 - j * 8));
}

// ---------------------------------------------------------------- HTTP
struct Request {
    std::string method, target, path;
    std::map<std::string, std::string> headers;  // lower-case names
    std::string body;
    std::string header(const char* n) const {
        auto it = headers.find(n);
        return it == headers.end() ? "" : it->second;
    }
};

bool readRequest(int fd, Request& req) {
    std::string buf;
    char tmp[4096];
    uint64_t t0 = nowMs();
    size_t end;
    while ((end = buf.find("\r\n\r\n")) == std::string::npos) {
        if (buf.size() > kMaxHeader || nowMs() - t0 > 15000) return false;
        pollfd pf{fd, POLLIN, 0};
        if (poll(&pf, 1, 15000) <= 0) return false;
        ssize_t n = ::recv(fd, tmp, sizeof(tmp), 0);
        if (n <= 0) return false;
        buf.append(tmp, (size_t)n);
    }
    std::string head = buf.substr(0, end);
    std::string rest = buf.substr(end + 4);
    size_t pos = head.find("\r\n");
    std::string line = head.substr(0, pos);
    size_t s1 = line.find(' '), s2 = line.rfind(' ');
    if (s1 == std::string::npos || s2 == s1) return false;
    req.method = line.substr(0, s1);
    req.target = line.substr(s1 + 1, s2 - s1 - 1);
    req.path = req.target.substr(0, req.target.find('?'));
    while (pos != std::string::npos && pos < head.size()) {
        size_t next = head.find("\r\n", pos + 2);
        std::string h = head.substr(pos + 2, (next == std::string::npos ? head.size() : next) - pos - 2);
        size_t c = h.find(':');
        if (c != std::string::npos) {
            std::string k = lower(trim(h.substr(0, c)));
            std::string v = trim(h.substr(c + 1));
            if (req.headers.count(k)) req.headers[k] += ", " + v;
            else req.headers[k] = v;
        }
        pos = next;
    }
    size_t clen = 0;
    if (!req.header("content-length").empty()) {
        clen = (size_t)strtoull(req.header("content-length").c_str(), nullptr, 10);
        if (clen > kMaxBody) return false;
    }
    if (!req.header("transfer-encoding").empty()) return false;  // chunked uploads are not supported
    req.body = rest.substr(0, std::min(rest.size(), clen));
    if (req.body.size() < clen) {
        size_t have = req.body.size();
        req.body.resize(clen);
        if (!recvExact(fd, &req.body[have], clen - have, 30000)) return false;
    }
    return true;
}

const char* reasonOf(int code) {
    switch (code) {
        case 200: return "OK";
        case 202: return "Accepted";
        case 400: return "Bad Request";
        case 401: return "Unauthorized";
        case 403: return "Forbidden";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 413: return "Payload Too Large";
        case 503: return "Service Unavailable";
        default: return "Error";
    }
}

void respond(int fd, int code, const std::string& type, const std::string& body, const std::string& extra = "") {
    std::string h = strprintf("HTTP/1.1 %d %s\r\n", code, reasonOf(code));
    if (!type.empty()) h += "Content-Type: " + type + "\r\n";
    h += strprintf("Content-Length: %zu\r\n", body.size());
    h += "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n";
    h += "Connection: close\r\n" + extra + "\r\n";
    sendStr(fd, h);
    if (!body.empty()) sendStr(fd, body);
}

// Host header must name this server by IP literal or "localhost" (blocks DNS rebinding).
bool hostAllowed(const std::string& hostHeader, int port) {
    std::string h = lower(hostHeader);
    std::string name = h, p;
    if (!h.empty() && h[0] == '[') {
        size_t rb = h.find(']');
        if (rb == std::string::npos) return false;
        name = h.substr(0, rb + 1);
        if (rb + 1 < h.size() && h[rb + 1] == ':') p = h.substr(rb + 2);
    } else {
        size_t c = h.rfind(':');
        if (c != std::string::npos) name = h.substr(0, c), p = h.substr(c + 1);
    }
    if (p != std::to_string(port)) return false;
    if (name == "localhost" || name == "[::1]") return true;
    in_addr a;
    return inet_pton(AF_INET, name.c_str(), &a) == 1;
}

bool originAllowed(const std::string& origin, int port) {
    if (origin.empty()) return true;  // non-browser client (curl, Claude Code)
    std::string o = lower(origin);
    if (!startsWith(o, "http://")) return false;
    return hostAllowed(o.substr(7), port);
}

std::string bearer(const Request& req) {
    std::string a = req.header("authorization");
    if (lower(a.substr(0, 7)) != "bearer ") return "";
    return trim(a.substr(7));
}

std::string csp(int port) {
    return strprintf(
        "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
        "img-src data:; font-src data:; connect-src 'self' ws://127.0.0.1:%d ws://localhost:%d; "
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\nX-Frame-Options: DENY\r\n",
        port, port);
}

// ---------------------------------------------------------------- WebSocket
struct WsConn {
    int fd;
    std::mutex sendMu;
    std::atomic<bool> alive{true};
    std::atomic<bool> subConsole{false}, subStatus{false};
    std::atomic<uint64_t> conSeq{0};
    std::atomic<int> inflight{0};
    explicit WsConn(int f) : fd(f) {}
    ~WsConn() { ::close(fd); }

    bool sendFrame(int opcode, const std::string& data) {
        std::lock_guard<std::mutex> lk(sendMu);
        if (!alive) return false;
        std::string h;
        h += (char)(0x80 | opcode);
        size_t n = data.size();
        if (n < 126) {
            h += (char)n;
        } else if (n < 65536) {
            h += (char)126;
            h += (char)(n >> 8);
            h += (char)(n & 0xff);
        } else {
            h += (char)127;
            for (int i = 7; i >= 0; i--) h += (char)((uint64_t)n >> (i * 8) & 0xff);
        }
        if (!sendStr(fd, h) || !sendStr(fd, data)) {
            alive = false;
            return false;
        }
        return true;
    }
    bool sendText(const std::string& s) { return sendFrame(1, s); }
    void kill() {
        if (alive.exchange(false)) ::shutdown(fd, SHUT_RDWR);
    }
};

std::string idJson(const JsonValue& msg) {
    auto it = msg.obj.find("id");
    if (it == msg.obj.end()) return "null";
    if (it->second.type == JsonValue::Number) return strprintf("%.0f", it->second.n);
    if (it->second.type == JsonValue::String) return jsonQuote(it->second.s);
    return "null";
}

std::string rpcResult(const std::string& id, const std::string& resultJson) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + resultJson + "}";
}
std::string rpcError(const std::string& id, int code, const std::string& msg) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id + strprintf(",\"error\":{\"code\":%d,\"message\":", code) + jsonQuote(msg) +
           "}}";
}

// Waits for a JS handler and returns its JSON (or a JSON-RPC error).
std::string callJs(const char* fn, const std::string& arg, const std::string& id, int timeoutSec) {
    auto fut = js::call(fn, arg);
    if (fut.wait_for(std::chrono::seconds(timeoutSec)) != std::future_status::ready)
        return rpcError(id, -32001, "timed out waiting for the game (is the JS engine stuck?)");
    std::string r = fut.get();
    if (r.empty() || r[0] != '{') return rpcError(id, -32603, r.empty() ? "no response" : r);
    return r;
}

void pusher(std::shared_ptr<WsConn> c) {
    uint64_t lastStatus = 0;
    while (c->alive) {
        sleepMs(100);
        if (c->subConsole) {
            auto lines = js::consoleSince(c->conSeq, 500);
            if (!lines.empty()) {
                std::string s = "{\"jsonrpc\":\"2.0\",\"method\":\"event\",\"params\":{\"topic\":\"console\",\"lines\":[";
                for (size_t i = 0; i < lines.size(); i++) {
                    if (i) s += ',';
                    s += strprintf("{\"seq\":%llu,\"level\":%d,\"text\":", (unsigned long long)lines[i].seq, lines[i].level) +
                         jsonQuote(lines[i].text) + "}";
                }
                s += "]}}";
                c->conSeq = lines.back().seq;
                if (!c->sendText(s)) break;
            }
        }
        if (c->subStatus && nowMs() - lastStatus >= 1000) {
            lastStatus = nowMs();
            auto fut = js::call("__studioStatus", "");
            if (fut.wait_for(std::chrono::seconds(3)) == std::future_status::ready) {
                std::string r = fut.get();
                if (!r.empty() && r[0] == '{' &&
                    !c->sendText("{\"jsonrpc\":\"2.0\",\"method\":\"event\",\"params\":{\"topic\":\"status\",\"data\":" + r +
                                 "}}"))
                    break;
            }
        }
    }
}

void handleWsMessage(const std::shared_ptr<WsConn>& c, const std::string& text) {
    JsonValue msg;
    std::string err;
    if (!parseJson(text, msg, &err) || msg.type != JsonValue::Object) {
        c->sendText(rpcError("null", -32700, "parse error: " + err));
        return;
    }
    std::string id = idJson(msg);
    auto mit = msg.obj.find("method");
    std::string method = mit != msg.obj.end() && mit->second.type == JsonValue::String ? mit->second.s : "";
    if (method == "interrupt") {  // handled natively: the JS thread may be the one that is stuck
        js::interrupt();
        c->sendText(rpcResult(id, "{\"ok\":true}"));
        return;
    }
    if (startsWith(method, "rp.")) {  // resource packs: file work, handled natively (never blocks the game thread)
        JsonValue params;
        auto pit = msg.obj.find("params");
        if (pit != msg.obj.end()) params = pit->second;
        if (params.type != JsonValue::Object) params.type = JsonValue::Object;
        std::string out, err;
        if (method == "rp.put") c->sendText(rpcError(id, -32600, "rp.put needs a binary frame"));
        else if (respack::call(method.substr(3), params, out, err)) c->sendText(rpcResult(id, out));
        else c->sendText(rpcError(id, -32000, err));
        return;
    }
    if (method == "subscribe") {
        auto pit = msg.obj.find("params");
        if (pit != msg.obj.end() && pit->second.type == JsonValue::Object) {
            auto tit = pit->second.obj.find("topics");
            if (tit != pit->second.obj.end() && tit->second.type == JsonValue::Array)
                for (auto& t : tit->second.arr) {
                    if (t.type != JsonValue::String) continue;
                    if (t.s == "console" && !c->subConsole.exchange(true)) {
                        uint64_t seq = js::consoleSeq();
                        c->conSeq = seq > 300 ? seq - 300 : 0;
                    }
                    if (t.s == "status") c->subStatus = true;
                }
        }
        c->sendText(rpcResult(id, "{\"ok\":true}"));
        return;
    }
    if (c->inflight.load() >= 32) {
        c->sendText(rpcError(id, -32002, "too many requests in flight"));
        return;
    }
    c->inflight++;
    std::thread([c, text, id] {
        std::string r = callJs("__studioRpc", text, id, 300);
        c->sendText(r);
        c->inflight--;
    }).detach();
}

// Binary message: [u32 big-endian header length][JSON-RPC header][payload].
// Only rp.put (one chunk of a resource pack upload) uses it.
void handleWsBinary(const std::shared_ptr<WsConn>& c, const std::string& m) {
    if (m.size() < 4) {
        c->sendText(rpcError("null", -32700, "binary frame too short"));
        return;
    }
    uint32_t hl = (uint32_t)(unsigned char)m[0] << 24 | (uint32_t)(unsigned char)m[1] << 16 |
                  (uint32_t)(unsigned char)m[2] << 8 | (uint32_t)(unsigned char)m[3];
    if (hl == 0 || hl > 64 * 1024 || (size_t)hl + 4 > m.size()) {
        c->sendText(rpcError("null", -32700, "bad binary frame header"));
        return;
    }
    JsonValue msg;
    std::string err;
    if (!parseJson(m.substr(4, hl), msg, &err) || msg.type != JsonValue::Object) {
        c->sendText(rpcError("null", -32700, "parse error: " + err));
        return;
    }
    std::string id = idJson(msg);
    auto mit = msg.obj.find("method");
    if (mit == msg.obj.end() || mit->second.type != JsonValue::String || mit->second.s != "rp.put") {
        c->sendText(rpcError(id, -32601, "binary frames are only used by rp.put"));
        return;
    }
    JsonValue params;
    auto pit = msg.obj.find("params");
    if (pit != msg.obj.end()) params = pit->second;
    std::string out;
    if (respack::put(params, m.data() + 4 + hl, m.size() - 4 - hl, out, err)) c->sendText(rpcResult(id, out));
    else c->sendText(rpcError(id, -32000, err));
}

void wsLoop(std::shared_ptr<WsConn> c) {
    g_clients++;
    std::thread(pusher, c).detach();
    std::string msg;
    int msgOp = 0;
    while (c->alive) {
        unsigned char h[2];
        if (!recvExact(c->fd, h, 2, 0)) break;
        bool fin = h[0] & 0x80;
        int op = h[0] & 0x0f;
        bool masked = h[1] & 0x80;
        uint64_t len = h[1] & 0x7f;
        if (len == 126) {
            unsigned char e[2];
            if (!recvExact(c->fd, e, 2, 10000)) break;
            len = (uint64_t)e[0] << 8 | e[1];
        } else if (len == 127) {
            unsigned char e[8];
            if (!recvExact(c->fd, e, 8, 10000)) break;
            len = 0;
            for (int i = 0; i < 8; i++) len = len << 8 | e[i];
        }
        if (!masked || len > kMaxWsMessage || msg.size() + len > kMaxWsMessage) break;  // clients must mask
        unsigned char mask[4];
        if (!recvExact(c->fd, mask, 4, 10000)) break;
        std::string payload(len, '\0');
        if (len && !recvExact(c->fd, &payload[0], len, 30000)) break;
        for (size_t i = 0; i < len; i++) payload[i] = (char)(payload[i] ^ mask[i & 3]);
        if (op == 8) {  // close
            c->sendFrame(8, payload.substr(0, 2));
            break;
        }
        if (op == 9) {
            c->sendFrame(10, payload);
            continue;
        }
        if (op == 10) continue;
        if (op == 1 || op == 2) {
            msg = payload;
            msgOp = op;
        } else if (op == 0) {
            msg += payload;
        } else {
            break;
        }
        if (fin) {
            if (msgOp == 1) handleWsMessage(c, msg);
            else if (msgOp == 2) handleWsBinary(c, msg);
            msg.clear();
        }
    }
    c->kill();
    g_clients--;
}

bool wsHandshake(int fd, const Request& req, int port) {
    if (lower(req.header("upgrade")) != "websocket" || req.header("sec-websocket-key").empty() ||
        req.header("sec-websocket-version") != "13") {
        respond(fd, 400, "text/plain", "WebSocket upgrade expected\n");
        return false;
    }
    if (!originAllowed(req.header("origin"), port)) {
        respond(fd, 403, "text/plain", "origin not allowed\n");
        return false;
    }
    bool proto = false, authed = false;
    std::string list = req.header("sec-websocket-protocol");
    size_t pos = 0;
    while (pos <= list.size()) {
        size_t comma = list.find(',', pos);
        if (comma == std::string::npos) comma = list.size();
        std::string p = trim(list.substr(pos, comma - pos));
        if (p == "scripteval.v1") proto = true;
        if (startsWith(p, "token.") && session::tokenEquals(p.substr(6), session::token())) authed = true;
        pos = comma + 1;
    }
    if (!proto || !authed) {
        SE_LOGW("studio: rejected a WebSocket client (%s)", proto ? "bad token" : "unknown protocol");
        respond(fd, 403, "text/plain", "token required\n");
        return false;
    }
    unsigned char dig[20];
    sha1(req.header("sec-websocket-key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", dig);
    std::string h = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    "Sec-WebSocket-Accept: " +
                    base64(dig, 20) + "\r\nSec-WebSocket-Protocol: scripteval.v1\r\n\r\n";
    return sendStr(fd, h);
}

void handleMcp(int fd, const Request& req, int port) {
    if (!config().mcp) {
        respond(fd, 404, "text/plain", "MCP is disabled (config.json: \"mcp\": false)\n");
        return;
    }
    if (!originAllowed(req.header("origin"), port)) {
        respond(fd, 403, "text/plain", "origin not allowed\n");
        return;
    }
    std::string tok = bearer(req);
    if (!session::tokenEquals(tok, session::mcpToken()) && !session::tokenEquals(tok, session::token())) {
        respond(fd, 401, "application/json", "{\"error\":\"missing or invalid bearer token (see mcp.token)\"}",
                "WWW-Authenticate: Bearer realm=\"scripteval\"\r\n");
        return;
    }
    if (req.method != "POST") {
        respond(fd, 405, "text/plain", "this server answers MCP over POST only\n", "Allow: POST\r\n");
        return;
    }
    JsonValue msg;
    std::string err;
    if (!parseJson(req.body, msg, &err)) {
        respond(fd, 400, "application/json", rpcError("null", -32700, "parse error: " + err));
        return;
    }
    if (msg.type != JsonValue::Object) {
        respond(fd, 400, "application/json", rpcError("null", -32600, "batches are not supported"));
        return;
    }
    if (!msg.obj.count("id") || !msg.obj.count("method")) {  // notification or response
        respond(fd, 202, "", "");
        return;
    }
    g_mcpCalls++;
    std::string r = callJs("__mcp", req.body, idJson(msg), 300);
    respond(fd, 200, "application/json", r);
}

void handleConn(int fd, int port) {
    struct Guard {
        ~Guard() { g_conns--; }
    } guard;
    int one = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
    Request req;
    if (!readRequest(fd, req)) {
        respond(fd, 400, "text/plain", "bad request\n");
        ::close(fd);
        return;
    }
    if (!hostAllowed(req.header("host"), port)) {
        respond(fd, 403, "text/plain", "host not allowed\n");
        ::close(fd);
        return;
    }
    if (req.path == "/ws") {
        if (wsHandshake(fd, req, port)) {
            wsLoop(std::make_shared<WsConn>(fd));  // the WsConn closes fd
            return;
        }
    } else if (req.path == "/mcp") {
        handleMcp(fd, req, port);
    } else if (req.method == "GET" && (req.path == "/" || req.path == "/index.html")) {
        std::string body((const char*)kStudioHtmlGz, kStudioHtmlGzLen);
        respond(fd, 200, "text/html; charset=utf-8", body, "Content-Encoding: gzip\r\n" + csp(port));
    } else if (req.method == "GET" && req.path == "/health") {
        respond(fd, 200, "application/json",
                strprintf("{\"ok\":true,\"name\":\"scripteval\",\"version\":\"%s\",\"mcp\":%s}", kVersion,
                          config().mcp ? "true" : "false"));
    } else if (req.method == "OPTIONS") {
        respond(fd, 403, "text/plain", "cross-origin requests are not allowed\n");
    } else {
        respond(fd, 404, "text/plain", "not found\n");
    }
    ::close(fd);
}

void acceptLoop(int srv, int port) {
    while (true) {
        sockaddr_in addr{};
        socklen_t len = sizeof(addr);
        int fd = accept(srv, (sockaddr*)&addr, &len);
        if (fd < 0) {
            sleepMs(50);
            continue;
        }
        if (g_conns.load() >= 64) {
            ::close(fd);
            continue;
        }
        g_conns++;
        std::thread(handleConn, fd, port).detach();
    }
}
}  // namespace

bool start(const char* bindAddr, int port) {
    if (port <= 0) return false;
    int srv = socket(AF_INET, SOCK_STREAM, 0);
    if (srv < 0) return false;
    int one = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, bindAddr, &addr.sin_addr) != 1) addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(srv, (sockaddr*)&addr, sizeof(addr)) != 0 || listen(srv, 16) != 0) {
        SE_LOGE("studio: cannot listen on %s:%d (port in use?)", bindAddr, port);
        ::close(srv);
        return false;
    }
    g_port = port;
    std::thread(acceptLoop, srv, port).detach();
    SE_LOGI("Studio listening on http://%s:%d/ (open it with client.studio() or the menu)", bindAddr, port);
    return true;
}

int port() { return g_port; }
int clients() { return g_clients; }
uint64_t mcpCalls() { return g_mcpCalls; }

}  // namespace se::studio

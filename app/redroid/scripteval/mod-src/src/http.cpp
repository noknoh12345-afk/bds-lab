#include "http.h"

#include <arpa/inet.h>
#include <dlfcn.h>
#include <netdb.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cctype>
#include <cstring>
#include <mutex>

#include "common.h"

namespace se::http {
namespace {

struct Url {
    bool https = false;
    std::string host, path = "/";
    int port = 0;
};

bool parseUrl(const std::string& u, Url& out) {
    size_t p = u.find("://");
    if (p == std::string::npos) return false;
    std::string scheme = u.substr(0, p);
    for (auto& c : scheme) c = (char)std::tolower((unsigned char)c);
    if (scheme == "https") out.https = true;
    else if (scheme == "http") out.https = false;
    else return false;
    std::string rest = u.substr(p + 3);
    size_t slash = rest.find('/');
    std::string hostport = slash == std::string::npos ? rest : rest.substr(0, slash);
    out.path = slash == std::string::npos ? "/" : rest.substr(slash);
    size_t colon = hostport.rfind(':');
    if (colon != std::string::npos && hostport.find(']') == std::string::npos) {
        out.host = hostport.substr(0, colon);
        out.port = std::atoi(hostport.c_str() + colon + 1);
    } else {
        out.host = hostport;
    }
    if (out.port == 0) out.port = out.https ? 443 : 80;
    return !out.host.empty();
}

// ---------------------------------------------------------------------------
// libcurl via dlopen (http + https)。オプション番号は curl の安定 ABI 定数。
// ---------------------------------------------------------------------------
enum {
    OPT_URL = 10002, OPT_WRITEFUNCTION = 20011, OPT_WRITEDATA = 10001,
    OPT_POSTFIELDS = 10015, OPT_POSTFIELDSIZE = 60, OPT_CUSTOMREQUEST = 10036,
    OPT_HTTPHEADER = 10023, OPT_TIMEOUT_MS = 155, OPT_FOLLOWLOCATION = 52,
    OPT_HEADERFUNCTION = 20079, OPT_HEADERDATA = 10029, OPT_NOSIGNAL = 99,
    OPT_USERAGENT = 10018, OPT_ACCEPT_ENCODING = 10102, OPT_SSL_VERIFYPEER = 64,
    OPT_SSL_VERIFYHOST = 81,
    INFO_RESPONSE_CODE = 0x200000 + 2,
};

struct Curl {
    void* lib = nullptr;
    void* (*easy_init)() = nullptr;
    int (*easy_setopt)(void*, int, ...) = nullptr;
    int (*easy_perform)(void*) = nullptr;
    int (*easy_getinfo)(void*, int, ...) = nullptr;
    void (*easy_cleanup)(void*) = nullptr;
    const char* (*easy_strerror)(int) = nullptr;
    void* (*slist_append)(void*, const char*) = nullptr;
    void (*slist_free_all)(void*) = nullptr;
    bool ok = false;
};

Curl& curl() {
    static Curl c;
    static std::once_flag once;
    std::call_once(once, [] {
        const char* names[] = {"libcurl.so.4", "libcurl.so", "libcurl.4.dylib", "libcurl.dylib", "libcurl-gnutls.so.4"};
        for (const char* n : names) {
            c.lib = dlopen(n, RTLD_NOW | RTLD_GLOBAL);
            if (c.lib) break;
        }
        if (!c.lib) return;
        auto sym = [&](const char* s) { return dlsym(c.lib, s); };
        c.easy_init = (decltype(c.easy_init))sym("curl_easy_init");
        c.easy_setopt = (decltype(c.easy_setopt))sym("curl_easy_setopt");
        c.easy_perform = (decltype(c.easy_perform))sym("curl_easy_perform");
        c.easy_getinfo = (decltype(c.easy_getinfo))sym("curl_easy_getinfo");
        c.easy_cleanup = (decltype(c.easy_cleanup))sym("curl_easy_cleanup");
        c.easy_strerror = (decltype(c.easy_strerror))sym("curl_easy_strerror");
        c.slist_append = (decltype(c.slist_append))sym("curl_slist_append");
        c.slist_free_all = (decltype(c.slist_free_all))sym("curl_slist_free_all");
        c.ok = c.easy_init && c.easy_setopt && c.easy_perform && c.easy_getinfo && c.easy_cleanup;
    });
    return c;
}

size_t writeCb(char* ptr, size_t size, size_t nmemb, void* userdata) {
    ((std::string*)userdata)->append(ptr, size * nmemb);
    return size * nmemb;
}

void parseHeaderBlock(const std::string& block, Response& r) {
    size_t start = 0;
    bool first = true;
    while (start < block.size()) {
        size_t nl = block.find('\n', start);
        std::string line = block.substr(start, (nl == std::string::npos ? block.size() : nl) - start);
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
        if (!first && !line.empty()) {
            size_t c = line.find(':');
            if (c != std::string::npos) {
                std::string k = line.substr(0, c), v = line.substr(c + 1);
                size_t vs = v.find_first_not_of(' ');
                r.headers.emplace_back(k, vs == std::string::npos ? "" : v.substr(vs));
            }
        }
        first = false;
        if (nl == std::string::npos) break;
        start = nl + 1;
    }
}

Response viaCurl(const Request& req, Url& url) {
    Response r;
    r.backend = "curl";
    Curl& c = curl();
    void* h = c.easy_init();
    if (!h) { r.error = "curl_easy_init failed"; return r; }
    std::string headerBlock;
    c.easy_setopt(h, OPT_URL, req.url.c_str());
    c.easy_setopt(h, OPT_WRITEFUNCTION, (void*)writeCb);
    c.easy_setopt(h, OPT_WRITEDATA, &r.body);
    c.easy_setopt(h, OPT_HEADERFUNCTION, (void*)writeCb);
    c.easy_setopt(h, OPT_HEADERDATA, &headerBlock);
    c.easy_setopt(h, OPT_TIMEOUT_MS, (long)req.timeoutMs);
    c.easy_setopt(h, OPT_NOSIGNAL, 1L);
    c.easy_setopt(h, OPT_FOLLOWLOCATION, req.followRedirects ? 1L : 0L);
    c.easy_setopt(h, OPT_USERAGENT, "ScriptEval");
    c.easy_setopt(h, OPT_ACCEPT_ENCODING, "");  // 全対応エンコーディングを許可(自動解凍)
    void* slist = nullptr;
    for (auto& kv : req.headers) slist = c.slist_append(slist, (kv.first + ": " + kv.second).c_str());
    if (slist) c.easy_setopt(h, OPT_HTTPHEADER, slist);
    if (req.method != "GET") c.easy_setopt(h, OPT_CUSTOMREQUEST, req.method.c_str());
    if (!req.body.empty()) {
        c.easy_setopt(h, OPT_POSTFIELDSIZE, (long)req.body.size());
        c.easy_setopt(h, OPT_POSTFIELDS, req.body.c_str());
    }
    int rc = c.easy_perform(h);
    if (rc != 0) {
        r.error = std::string("curl: ") + (c.easy_strerror ? c.easy_strerror(rc) : "error");
    } else {
        long code = 0;
        c.easy_getinfo(h, INFO_RESPONSE_CODE, &code);
        r.status = (int)code;
        parseHeaderBlock(headerBlock, r);
        r.ok = true;
    }
    if (slist) c.slist_free_all(slist);
    c.easy_cleanup(h);
    (void)url;
    return r;
}

// ---------------------------------------------------------------------------
// 生ソケット HTTP/1.1 (http:// のみ)。DNS は getaddrinfo。
// ---------------------------------------------------------------------------
int connectTimeout(const Url& url, int timeoutMs, std::string& err) {
    addrinfo hints{}, *res = nullptr;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    char portStr[16];
    std::snprintf(portStr, sizeof portStr, "%d", url.port);
    int gai = getaddrinfo(url.host.c_str(), portStr, &hints, &res);
    if (gai != 0 || !res) { err = std::string("getaddrinfo: ") + gai_strerror(gai); return -1; }
    int fd = -1;
    for (addrinfo* ai = res; ai; ai = ai->ai_next) {
        fd = socket(ai->ai_family, ai->ai_socktype | SOCK_NONBLOCK, ai->ai_protocol);
        if (fd < 0) continue;
        int rc = connect(fd, ai->ai_addr, ai->ai_addrlen);
        if (rc == 0) break;
        if (errno == EINPROGRESS) {
            pollfd pfd{fd, POLLOUT, 0};
            if (poll(&pfd, 1, timeoutMs) > 0 && (pfd.revents & POLLOUT)) {
                int soerr = 0; socklen_t l = sizeof soerr;
                getsockopt(fd, SOL_SOCKET, SO_ERROR, &soerr, &l);
                if (soerr == 0) break;
            }
        }
        close(fd); fd = -1;
    }
    freeaddrinfo(res);
    if (fd < 0) err = "connect failed";
    return fd;
}

Response viaSocket(const Request& req, Url& url) {
    Response r;
    r.backend = "socket";
    if (url.https) { r.error = "https にはフォールバックでは非対応(libcurl が要る)"; return r; }
    std::string err;
    int fd = connectTimeout(url, req.timeoutMs, err);
    if (fd < 0) { r.error = err; return r; }
    std::string reqStr = req.method + " " + url.path + " HTTP/1.1\r\nHost: " + url.host +
                         "\r\nUser-Agent: ScriptEval\r\nAccept: */*\r\nConnection: close\r\n";
    bool hasLen = false;
    for (auto& kv : req.headers) {
        reqStr += kv.first + ": " + kv.second + "\r\n";
        if (strcasecmp(kv.first.c_str(), "content-length") == 0) hasLen = true;
    }
    if (!req.body.empty() && !hasLen) reqStr += "Content-Length: " + std::to_string(req.body.size()) + "\r\n";
    reqStr += "\r\n" + req.body;
    size_t sent = 0;
    while (sent < reqStr.size()) {
        pollfd pfd{fd, POLLOUT, 0};
        if (poll(&pfd, 1, req.timeoutMs) <= 0) { close(fd); r.error = "send timeout"; return r; }
        ssize_t n = send(fd, reqStr.data() + sent, reqStr.size() - sent, MSG_NOSIGNAL);
        if (n <= 0) { close(fd); r.error = "send failed"; return r; }
        sent += (size_t)n;
    }
    std::string raw;
    char buf[8192];
    for (;;) {
        pollfd pfd{fd, POLLIN, 0};
        int pr = poll(&pfd, 1, req.timeoutMs);
        if (pr <= 0) { r.error = raw.empty() ? "recv timeout" : ""; break; }
        ssize_t n = recv(fd, buf, sizeof buf, 0);
        if (n < 0) { r.error = "recv failed"; break; }
        if (n == 0) break;  // Connection: close
        raw.append(buf, (size_t)n);
        if (raw.size() > 32u * 1024 * 1024) { r.error = "response too large"; break; }
    }
    close(fd);
    if (!r.error.empty() && raw.empty()) return r;
    size_t hdrEnd = raw.find("\r\n\r\n");
    if (hdrEnd == std::string::npos) { r.error = "malformed response"; return r; }
    std::string head = raw.substr(0, hdrEnd);
    std::string body = raw.substr(hdrEnd + 4);
    size_t sp = head.find(' ');
    if (sp != std::string::npos) r.status = std::atoi(head.c_str() + sp + 1);
    parseHeaderBlock(head, r);
    // chunked なら最小限デコード
    for (auto& kv : r.headers)
        if (strcasecmp(kv.first.c_str(), "transfer-encoding") == 0 && kv.second.find("chunked") != std::string::npos) {
            std::string dec; size_t i = 0;
            while (i < body.size()) {
                size_t nl = body.find("\r\n", i); if (nl == std::string::npos) break;
                long len = strtol(body.substr(i, nl - i).c_str(), nullptr, 16);
                i = nl + 2; if (len <= 0) break;
                if (i + (size_t)len > body.size()) break;
                dec.append(body, i, (size_t)len); i += (size_t)len + 2;
            }
            body.swap(dec); break;
        }
    r.body = body; r.ok = true;
    return r;
}

}  // namespace

Response request(const Request& req) {
    Url url;
    if (!parseUrl(req.url, url)) { Response r; r.error = "bad url"; return r; }
    if (curl().ok) return viaCurl(req, url);
    return viaSocket(req, url);
}

std::string backends() { return curl().ok ? "curl+socket" : "socket"; }

}  // namespace se::http

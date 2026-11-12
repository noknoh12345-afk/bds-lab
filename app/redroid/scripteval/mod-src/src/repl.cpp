#include "repl.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <chrono>
#include <string>
#include <thread>

#include "common.h"
#include "config.h"
#include "session.h"
#include "jsengine.h"
#include "platform.h"
#include "ui.h"

namespace se::repl {

namespace {
const char* kHelp =
    "ScriptEval REPL - every line is evaluated as JavaScript inside the game client.\n"
    "  .help            this text\n"
    "  .ml / .end       multi-line input (or end a line with \\ to continue it)\n"
    "  .run <file>      run scripts/<file>.js\n"
    "  .status          world / hook status\n"
    "  .stop            interrupt the running script (also works while waiting for a result)\n"
    "  .quit            close the connection\n"
    "Lines starting with '#B64 ' carry base64 encoded code (used by tools/scripteval-repl.py).\n"
    ".frame switches to framed responses (each ends with \\x04 instead of a prompt);\n"
    ".complete <text> lists completions for the end of <text>.\n";

bool sendAll(int fd, const std::string& s) {
    size_t done = 0;
    while (done < s.size()) {
        ssize_t n = send(fd, s.data() + done, s.size() - done, MSG_NOSIGNAL);
        if (n <= 0) return false;
        done += (size_t)n;
    }
    return true;
}

std::string b64decode(const std::string& in) {
    static int T[256];
    static bool init = false;
    if (!init) {
        for (int& t : T) t = -1;
        const char* a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (int i = 0; i < 64; i++) T[(unsigned char)a[i]] = i;
        init = true;
    }
    std::string out;
    int val = 0, bits = -8;
    for (unsigned char c : in) {
        if (T[c] == -1) continue;
        val = (val << 6) + T[c];
        bits += 6;
        if (bits >= 0) {
            out.push_back((char)((val >> bits) & 0xFF));
            bits -= 8;
        }
    }
    return out;
}

// Removes complete ".stop" lines from buf; returns true when one was found.
bool takeStopLines(std::string& buf) {
    bool found = false;
    size_t start = 0;
    while (start < buf.size()) {
        size_t nl = buf.find('\n', start);
        if (nl == std::string::npos) break;
        std::string line = buf.substr(start, nl - start);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line == ".stop") {
            buf.erase(start, nl - start + 1);
            found = true;
            continue;
        }
        start = nl + 1;
    }
    return found;
}

class Session {
public:
    explicit Session(int fd) : fd_(fd) {}

    void run() {
        authed_ = !config().replAuth;
        if (authed_ && !sendBanner()) return;
        streamSeq_ = js::consoleSeq();
        while (!quit_) {
            streamAsync();
            pollfd p{fd_, POLLIN, 0};
            int pr = poll(&p, 1, 200);
            if (pr < 0) break;
            if (pr == 0) continue;
            char tmp[4096];
            ssize_t n = recv(fd_, tmp, sizeof(tmp), 0);
            if (n <= 0) break;
            buf_.append(tmp, (size_t)n);
            size_t nl;
            while (!quit_ && (nl = buf_.find('\n')) != std::string::npos) {
                std::string line = buf_.substr(0, nl);
                buf_.erase(0, nl + 1);
                if (!line.empty() && line.back() == '\r') line.pop_back();
                handleLine(line);
            }
        }
    }

private:
    int fd_;
    std::string buf_, pending_;
    bool multiline_ = false;
    bool framed_ = false;
    bool quit_ = false;
    bool firstLine_ = true;
    bool authed_ = false;
    uint64_t streamSeq_ = 0;

    bool sendBanner() {
        std::string banner = std::string("ScriptEval ") + kVersion + " REPL - Minecraft " + platform::gameVersion() +
                             "\nType .help for help.\n";
        return sendAll(fd_, banner + prompt());
    }

    std::string prompt() const { return framed_ ? std::string("\x04\n") : std::string("> "); }

    void reply(const std::string& text) {
        std::string s = text;
        if (!s.empty() && s.back() != '\n') s += '\n';
        if (!sendAll(fd_, s + prompt())) quit_ = true;
    }

    // forward asynchronous console output (system.runInterval, events...)
    void streamAsync() {
        if (!authed_) return;  // nothing leaks to a client that has not authenticated
        auto lines = js::consoleSince(streamSeq_, 200);
        if (lines.empty()) return;
        std::string out;
        for (auto& l : lines) {
            streamSeq_ = l.seq;
            if (l.level <= 3) out += l.text + "\n";
        }
        if (!out.empty() && !sendAll(fd_, out)) quit_ = true;
    }

    static bool looksLikeHttp(const std::string& l) {
        static const char* methods[] = {"GET ", "POST ", "PUT ", "HEAD ", "OPTIONS ", "DELETE ", "PATCH ", "CONNECT ", "TRACE "};
        for (auto m : methods)
            if (startsWith(l, m)) return true;
        return l.find(" HTTP/1.") != std::string::npos;
    }

    void handleLine(std::string line) {
        if (firstLine_) {
            firstLine_ = false;
            // A web page can make the browser connect here and send an HTTP request whose body
            // would otherwise be evaluated line by line. Real REPL clients never start like that.
            if (looksLikeHttp(line)) {
                SE_LOGW("repl: rejected a connection that looks like an HTTP request");
                quit_ = true;
                return;
            }
        }
        if (!authed_) {
            // "#AUTH <token>" with the token from <dataDir>/session.token (changes at every launch)
            if (startsWith(line, "#AUTH ") && session::tokenEquals(line.substr(6), session::token())) {
                authed_ = true;
                if (!sendBanner()) quit_ = true;
            } else {
                sendAll(fd_, "ScriptEval REPL: authentication required. Send \"#AUTH <token>\" first; the token is in " +
                                 platform::dataDir() + "/session.token (tools/scripteval-repl.py does this).\n");
                SE_LOGW("repl: rejected a client without a valid token");
                quit_ = true;
            }
            return;
        }
        std::string code;
        if (multiline_) {
            if (line != ".end") {
                pending_ += line + "\n";
                return;
            }
            multiline_ = false;
            code = pending_;
            pending_.clear();
        } else if (line == ".ml") {
            multiline_ = true;
            pending_.clear();
            sendAll(fd_, "(multi-line mode, finish with .end)\n");
            return;
        } else if (line == ".help") {
            reply(kHelp);
            return;
        } else if (line == ".quit" || line == ".exit") {
            quit_ = true;
            return;
        } else if (line == ".stop") {
            js::interrupt();
            reply("interrupt requested");
            return;
        } else if (line == ".frame") {
            framed_ = true;
            reply("framed mode");
            return;
        } else if (startsWith(line, ".complete ")) {
            auto fut = js::submit("__complete(" + jsonQuote(line.substr(10)) + ")", "<complete>", js::Echo::Silent);
            std::string r;
            if (fut.wait_for(std::chrono::seconds(5)) == std::future_status::ready) r = fut.get();
            reply(r);
            return;
        } else if (line == ".status") {
            code = "client.status()";
        } else if (startsWith(line, ".run ")) {
            code = "runScript(" + jsonQuote(line.substr(5)) + ")";
        } else if (startsWith(line, "#B64 ")) {
            code = b64decode(line.substr(5));
        } else if (!line.empty() && line.back() == '\\') {
            line.pop_back();
            pending_ += line + "\n";
            return;
        } else {
            code = pending_ + line;
            pending_.clear();
        }
        if (code.find_first_not_of(" \t\n") == std::string::npos) {
            reply("");
            return;
        }
        evaluate(code);
    }

    void evaluate(const std::string& code) {
        // flush output produced before this evaluation
        streamAsync();
        uint64_t before = js::consoleSeq();
        auto fut = js::submit(code, "<repl>", true);
        std::string result;
        uint64_t start = nowMs();
        while (true) {
            if (fut.wait_for(std::chrono::milliseconds(100)) == std::future_status::ready) {
                result = fut.get();
                break;
            }
            // a form waiting for the user may legitimately take a while
            uint64_t limit = ui::formsOpen() > 0 ? 600000 : 75000;
            if (nowMs() - start > limit) {
                result = "(no result yet - is the script stuck? use .stop)";
                break;
            }
            // accept ".stop" while waiting; other input stays queued
            pollfd p{fd_, POLLIN, 0};
            if (poll(&p, 1, 0) > 0) {
                char tmp[4096];
                ssize_t n = recv(fd_, tmp, sizeof(tmp), 0);
                if (n <= 0) {
                    quit_ = true;
                    return;
                }
                buf_.append(tmp, (size_t)n);
                if (takeStopLines(buf_)) {
                    js::interrupt();
                    result = "(stopped waiting; an interrupted script reports its error in the console)";
                    break;
                }
            }
        }
        // asynchronous output produced while we were waiting (timers, events, warnings)
        std::string async;
        for (auto& l : js::consoleSince(before, 400))
            if (l.level <= 3) async += l.text + "\n";
        streamSeq_ = js::consoleSeq();  // the result already contains the task's own output
        if (!result.empty() && result.back() != '\n') result += "\n";
        if (!sendAll(fd_, async + result + prompt())) quit_ = true;
    }
};

void acceptLoop(int srv) {
    while (true) {
        sockaddr_in addr{};
        socklen_t len = sizeof(addr);
        int fd = accept(srv, (sockaddr*)&addr, &len);
        if (fd < 0) {
            sleepMs(200);
            continue;
        }
        std::thread([fd] {
            try {
                Session(fd).run();
            } catch (...) {
            }
            close(fd);
        }).detach();
    }
}
}  // namespace

bool start(const char* bindAddr, int port) {
    if (port <= 0) return false;
    int srv = socket(AF_INET, SOCK_STREAM, 0);
    if (srv < 0) {
        SE_LOGE("repl: socket() failed");
        return false;
    }
    int one = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, bindAddr, &addr.sin_addr) != 1) addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(srv, (sockaddr*)&addr, sizeof(addr)) != 0 || listen(srv, 4) != 0) {
        SE_LOGE("repl: cannot listen on %s:%d (port in use?)", bindAddr, port);
        close(srv);
        return false;
    }
    std::thread(acceptLoop, srv).detach();
    SE_LOGI("REPL listening on %s:%d", bindAddr, port);
    return true;
}

}  // namespace se::repl

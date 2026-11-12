// Host test harness: loads the mock game + the mod, then drives the TCP REPL.
//
//   scripteval_test <commands.txt>
// Each line of commands.txt is sent to the REPL. Special lines:
//   !sleep <ms>      wait
//   !expect <text>   fail if the previous response does not contain <text>
//   !reject <text>   fail if the previous response contains <text>
//   # comment
#include <arpa/inet.h>
#include <dlfcn.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

static int g_port = 25611;

static std::string readUntilPrompt(int fd, int timeoutMs = 90000) {
    std::string out;
    auto start = std::chrono::steady_clock::now();
    while (true) {
        char buf[8192];
        timeval tv{0, 200000};
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
        ssize_t n = recv(fd, buf, sizeof(buf), 0);
        if (n > 0) out.append(buf, (size_t)n);
        if (out.size() >= 2 && out.compare(out.size() - 2, 2, "> ") == 0) break;
        if (std::chrono::steady_clock::now() - start > std::chrono::milliseconds(timeoutMs)) {
            out += "\n<<timeout>>";
            break;
        }
        if (n == 0) break;
    }
    return out;
}

int main(int argc, char** argv) {
    // data directory of the mod under test (config.json, scripts/, log.txt)
    std::string dirStr = getenv("SCRIPTEVAL_TEST_DIR") ? getenv("SCRIPTEVAL_TEST_DIR") : "/tmp/scripteval-test";
    const char* dir = dirStr.c_str();
    mkdir(dir, 0755);
    setenv("SCRIPTEVAL_DIR", dir, 1);
    {
        std::ofstream cfg(std::string(dir) + "/config.json");
        const char* studioPort = getenv("STUDIO_PORT") ? getenv("STUDIO_PORT") : "0";
        const char* safe = getenv("SAFE_MODE") ? getenv("SAFE_MODE") : "off";
        // games/com.mojang of the "game" (resource pack tests); defaults to a folder inside the test dir
        std::string comMojang = getenv("COM_MOJANG") ? getenv("COM_MOJANG") : dirStr + "/fake-mcpelauncher/games/com.mojang";
        cfg << "{ \"replPort\": " << g_port << ", \"tickSampleMs\": 1500, \"evalTimeoutMs\": 5000, \"studioPort\": "
            << studioPort << ", \"safeMode\": \"" << safe << "\", \"comMojangDir\": \"" << comMojang << "\" }\n";
    }
    setenv("SCRIPTEVAL_NO_BROWSER", "1", 1);
    if (!getenv("KEEP_MARKER")) unlink((std::string(dir) + "/running.marker").c_str());
    const char* gameLib = getenv("MOCK_GAME_LIB") ? getenv("MOCK_GAME_LIB") : "./libminecraftpe.so";
    void* game = dlopen(gameLib, RTLD_NOW | RTLD_GLOBAL);
    if (!game) {
        fprintf(stderr, "dlopen game: %s\n", dlerror());
        return 1;
    }
    ((void (*)())dlsym(game, "mock_start_game"))();
    void* menu = nullptr;
    void* gw = nullptr;
    if (getenv("FAKE_LAUNCHER")) {
        menu = dlopen("./libmcpelauncher_menu.so", RTLD_NOW | RTLD_GLOBAL);
        gw = dlopen("./libmcpelauncher_gamewindow.so", RTLD_NOW | RTLD_GLOBAL);
        dlopen("./libmcpelauncher_mod.so", RTLD_NOW | RTLD_GLOBAL);
        if (!menu || !gw) fprintf(stderr, "fake launcher libs missing: %s\n", dlerror());
    }
    void* mod = dlopen("./libscripteval.so", RTLD_NOW);
    if (!mod) {
        fprintf(stderr, "dlopen mod: %s\n", dlerror());
        return 1;
    }
    ((void (*)())dlsym(mod, "mod_preinit"))();
    ((void (*)())dlsym(mod, "mod_init"))();
    if (gw) ((void (*)())dlsym(gw, "fake_create_window"))();
    std::this_thread::sleep_for(std::chrono::milliseconds(300));

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(g_port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (connect(fd, (sockaddr*)&addr, sizeof(addr)) != 0) {
        perror("connect");
        return 1;
    }
    {
        // the REPL wants "#AUTH <token>" first (token from <dataDir>/session.token)
        std::ifstream tf(std::string(dir) + "/session.token");
        std::string tok;
        std::getline(tf, tok);
        std::string auth = getenv("BAD_AUTH") ? "#AUTH 0000\n" : "#AUTH " + tok + "\n";
        send(fd, auth.data(), auth.size(), 0);
    }
    printf("%s", readUntilPrompt(fd).c_str());
    std::ifstream in(argc > 1 ? argv[1] : "commands.txt");
    std::string line, last;
    int failures = 0;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        if (line.rfind("!sleep ", 0) == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(atoi(line.c_str() + 7)));
            continue;
        }
        if (line.rfind("!mock ", 0) == 0) {
            std::string fn = "mock_" + line.substr(6);
            auto f = (void (*)())dlsym(game, fn.c_str());
            if (f) f();
            printf("[%s %s]\n", fn.c_str(), f ? "done" : "missing");
            continue;
        }
        if (line.rfind("!key ", 0) == 0 && gw) {
            bool c = ((bool (*)(int))dlsym(gw, "fake_key"))(atoi(line.c_str() + 5));
            printf("[key %s -> %s]\n", line.c_str() + 5, c ? "consumed" : "passed");
            continue;
        }
        if (line.rfind("!uitype ", 0) == 0 && menu) {
            bool ok = ((bool (*)(const char*, const char*))dlsym(menu, "fake_type"))("ScriptEval Console", line.c_str() + 8);
            printf("[typed: %s]\n", ok ? "ok" : "no input control");
            continue;
        }
        if (line.rfind("!uiclick ", 0) == 0 && menu) {
            bool ok = ((bool (*)(const char*, const char*))dlsym(menu, "fake_click"))("ScriptEval Console", line.c_str() + 9);
            printf("[clicked %s: %s]\n", line.c_str() + 9, ok ? "ok" : "not found");
            continue;
        }
        if (line.rfind("!ui ", 0) == 0 && menu) {
            // !ui click|input|slide|close <title>|<label>|<value>
            std::string rest = line.substr(4);
            std::string op = rest.substr(0, rest.find(' '));
            std::string args = rest.size() > op.size() ? rest.substr(op.size() + 1) : "";
            std::vector<std::string> a;
            size_t pos = 0;
            while (true) {
                size_t bar = args.find('|', pos);
                a.push_back(args.substr(pos, bar == std::string::npos ? std::string::npos : bar - pos));
                if (bar == std::string::npos) break;
                pos = bar + 1;
            }
            while (a.size() < 3) a.push_back("");
            bool ok = false;
            if (op == "click") ok = ((bool (*)(const char*, const char*))dlsym(menu, "fake_click"))(a[0].c_str(), a[1].c_str());
            else if (op == "input") ok = ((bool (*)(const char*, const char*, const char*))dlsym(menu, "fake_input"))(a[0].c_str(), a[1].c_str(), a[2].c_str());
            else if (op == "slide") ok = ((bool (*)(const char*, const char*, double))dlsym(menu, "fake_slide"))(a[0].c_str(), a[1].c_str(), atof(a[2].c_str()));
            else if (op == "close") ok = ((bool (*)(const char*))dlsym(menu, "fake_close"))(a[0].c_str());
            printf("[ui %s %s: %s]\n", op.c_str(), args.c_str(), ok ? "ok" : "NOT FOUND");
            last = ok ? "ok" : "NOT FOUND";
            continue;
        }
        if (line.rfind("!menu ", 0) == 0 && menu) {
            bool ok = ((bool (*)(const char*))dlsym(menu, "fake_menu"))(line.c_str() + 6);
            printf("[menu %s: %s]\n", line.c_str() + 6, ok ? "ok" : "not found");
            continue;
        }
        if (line.rfind("!uidump", 0) == 0 && menu) {
            static char buf[1 << 16];
            std::string title = line.size() > 8 ? line.substr(8) : "ScriptEval Console";
            ((void (*)(const char*, char*, size_t))dlsym(menu, "fake_dump"))(title.c_str(), buf, sizeof(buf));
            last = buf;
            printf("%s", buf);
            continue;
        }
        if (line.rfind("!expect ", 0) == 0) {
            std::string want = line.substr(8);
            if (last.find(want) == std::string::npos) {
                printf("\n*** EXPECTATION FAILED: missing \"%s\"\n", want.c_str());
                failures++;
            }
            continue;
        }
        if (line.rfind("!reject ", 0) == 0) {
            std::string bad = line.substr(8);
            if (last.find(bad) != std::string::npos) {
                printf("\n*** EXPECTATION FAILED: unexpected \"%s\"\n", bad.c_str());
                failures++;
            }
            continue;
        }
        printf("%s\n", line.c_str());
        fflush(stdout);
        std::string msg = line + "\n";
        send(fd, msg.data(), msg.size(), 0);
        last = readUntilPrompt(fd);
        printf("%s", last.c_str());
        fflush(stdout);
    }
    printf("\n==== %d expectation failure(s)\n", failures);
    fflush(stdout);
    close(fd);
    _exit(failures ? 2 : 0);
}

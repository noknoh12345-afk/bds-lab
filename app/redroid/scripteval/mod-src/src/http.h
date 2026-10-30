// Minimal outbound HTTP(S) client for ScriptEval.
// 優先: libcurl を dlopen(http+https・リダイレクト・chunked を任せる。デスクトップ mcpelauncher には大抵ある)。
// フォールバック: 生ソケットの HTTP/1.1(http:// のみ・どこでも動く)。https はフォールバックでは不可。
#pragma once

#include <string>
#include <utility>
#include <vector>

namespace se::http {

struct Request {
    std::string method = "GET";
    std::string url;
    std::vector<std::pair<std::string, std::string>> headers;
    std::string body;
    int timeoutMs = 15000;
    bool followRedirects = true;
};

struct Response {
    bool ok = false;      // トランスポート成功(HTTP ステータスは status 参照)
    int status = 0;
    std::vector<std::pair<std::string, std::string>> headers;
    std::string body;
    std::string error;    // ok=false のときの理由
    std::string backend;  // "curl" | "socket"
};

Response request(const Request& req);

// どのバックエンドが使えるか("curl+socket" / "socket")。
std::string backends();

}  // namespace se::http

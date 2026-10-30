// ScriptEval Studio server: serves the browser IDE, its WebSocket (JSON-RPC)
// and the MCP endpoint (/mcp) on 127.0.0.1:<studioPort>.
//
// Security model
//  - binds to 127.0.0.1 by default
//  - Host must be localhost or an IP literal (DNS rebinding), Origin (when
//    present) must be this server
//  - WebSocket: subprotocol "token.<session token>" (changes every launch)
//  - MCP: "Authorization: Bearer <mcp token or session token>"
//  - no CORS headers, ever
#pragma once

#include <cstdint>

namespace se::studio {

bool start(const char* bindAddr, int port);
int port();          // 0 when not running
int clients();       // open WebSocket connections
uint64_t mcpCalls();  // MCP requests served since start

}  // namespace se::studio

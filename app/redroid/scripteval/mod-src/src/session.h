// Per-launch state shared by the servers: access tokens, the crash marker
// (safe mode) and a few host helpers.
#pragma once

#include <string>

namespace se::session {

// Creates the tokens and checks the crash marker. Call once the data
// directory exists (preinit).
void init();

// Random token generated at every launch (REPL, Studio). Stored in
// <dataDir>/session.token with mode 0600.
const std::string& token();
// Long-lived token for MCP clients (<dataDir>/mcp.token), so a registration
// in Claude Code keeps working across launches.
const std::string& mcpToken();
std::string regenerateMcpToken();
// Constant-time comparison.
bool tokenEquals(const std::string& a, const std::string& b);
// Random lower-case hex string of 2 * bytes characters (/dev/urandom).
std::string randomId(size_t bytes);

// Safe mode: the previous launch did not survive its first minute (crash
// loop protection). Autorun and the tick hook stay off until leaveSafeMode().
bool safeMode();
std::string safeModeReason();
void leaveSafeMode();

// "mac" | "linux" (the host the launcher runs on)
const char* hostOs();
// Opens a URL in the default browser of the host (open / xdg-open).
bool openUrl(const std::string& url);
// Studio address including the token fragment (empty when Studio is off).
std::string studioUrl(bool withToken = true);

}  // namespace se::session

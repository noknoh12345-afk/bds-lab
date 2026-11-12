#!/usr/bin/env python3
"""Integration test for the Studio server (HTTP, WebSocket JSON-RPC, MCP) and the
REPL's authentication. Starts the host harness with the mock game, then talks to
it over real sockets. With --ui it also drives the Studio page in headless
Chromium (Playwright).

    cd build-host && python3 ../test/studio_test.py [--ui]
"""
import base64, gzip, io, json, os, shutil, socket, struct, subprocess, sys, time, urllib.request, zipfile

PORT, REPL = 25612, 25611
DIR = os.environ.get("SCRIPTEVAL_TEST_DIR", "/tmp/scripteval-test")
failures = 0


def check(name, ok, detail=""):
    global failures
    print(("  ok   " if ok else "*** EXPECTATION FAILED: ") + name + ("" if ok else f"  -- {detail}"))
    if not ok:
        failures += 1


def http(method, path, headers=None, body=None, host=f"127.0.0.1:{PORT}"):
    s = socket.create_connection(("127.0.0.1", PORT), timeout=10)
    h = {"Host": host, **(headers or {})}
    data = body.encode() if isinstance(body, str) else (body or b"")
    if data:
        h["Content-Length"] = str(len(data))
    req = f"{method} {path} HTTP/1.1\r\n" + "".join(f"{k}: {v}\r\n" for k, v in h.items()) + "\r\n"
    s.sendall(req.encode() + data)
    buf = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
    s.close()
    head, _, rest = buf.partition(b"\r\n\r\n")
    lines = head.decode().split("\r\n")
    status = int(lines[0].split()[1])
    hdrs = {l.split(":", 1)[0].lower(): l.split(":", 1)[1].strip() for l in lines[1:] if ":" in l}
    return status, hdrs, rest


class WS:
    def __init__(self, protocols, origin=f"http://127.0.0.1:{PORT}"):
        self.s = socket.create_connection(("127.0.0.1", PORT), timeout=20)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: {protocols}\r\n")
        if origin:
            req += f"Origin: {origin}\r\n"
        self.s.sendall((req + "\r\n").encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            c = self.s.recv(4096)
            if not c:
                break
            resp += c
        self.status = int(resp.split(b" ")[1]) if resp else 0
        self.extra = resp.partition(b"\r\n\r\n")[2]
        self.id = 0
        self.events = []

    def send(self, obj):
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        n = len(data)
        hdr = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    @staticmethod
    def _mask(data, mask):
        n = len(data)
        if not n:
            return b""
        m = (mask * (n // 4 + 1))[:n]
        return (int.from_bytes(data, "big") ^ int.from_bytes(m, "big")).to_bytes(n, "big")

    def send_bin(self, payload):
        mask = os.urandom(4)
        n = len(payload)
        hdr = bytes([0x82]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.s.sendall(hdr + mask + self._mask(payload, mask))

    def call_bin(self, method, params, data, timeout=30):
        self.id += 1
        my = self.id
        head = json.dumps({"jsonrpc": "2.0", "id": my, "method": method, "params": params}).encode()
        self.send_bin(struct.pack(">I", len(head)) + head + data)
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv()
            if m.get("id") == my:
                return m
            self.events.append(m)
        raise TimeoutError(method)

    def _recv_exact(self, n):
        out = b""
        while len(out) < n:
            if self.extra:
                take = self.extra[: n - len(out)]
                self.extra = self.extra[len(take):]
                out += take
                continue
            c = self.s.recv(n - len(out))
            if not c:
                raise EOFError
            out += c
        return out

    def recv(self):
        h = self._recv_exact(2)
        n = h[1] & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._recv_exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._recv_exact(8))[0]
        return json.loads(self._recv_exact(n))

    def call(self, method, params=None, timeout=30):
        self.id += 1
        my = self.id
        self.send({"jsonrpc": "2.0", "id": my, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv()
            if m.get("id") == my:
                return m
            self.events.append(m)
        raise TimeoutError(method)

    def wait_event(self, pred, timeout=10):
        for m in self.events:
            if pred(m):
                return m
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv()
            self.events.append(m)
            if pred(m):
                return m
        return None


def mcp(body, token=None, origin=None):
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if origin:
        h["Origin"] = origin
    st, hd, b = http("POST", "/mcp", h, json.dumps(body))
    return st, (json.loads(b) if b.strip() and "json" in hd.get("content-type", "") else None)


def repl_first(line):
    s = socket.create_connection(("127.0.0.1", REPL), timeout=10)
    s.sendall(line.encode())
    out = b""
    try:
        while True:
            c = s.recv(4096)
            if not c:
                break
            out += c
            if out.endswith(b"> "):
                break
    except socket.timeout:
        pass
    s.close()
    return out.decode(errors="replace")


def start_harness():
    env = dict(os.environ, STUDIO_PORT=str(PORT), SCRIPTEVAL_TEST_DIR=DIR, COM_MOJANG=CM)
    log = open(os.path.join(os.environ.get("LOGS", "/tmp"), "studio_harness.log"), "ab")
    h = subprocess.Popen(["./scripteval_test", "../test/hold.txt"], env=env, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(150):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    return h


def main():
    setup_packs()
    harness = start_harness()
    try:
        token = open(f"{DIR}/session.token").read().strip()
        mtok = open(f"{DIR}/mcp.token").read().strip()
        print("HTTP")
        st, h, b = http("GET", "/health")
        check("health", st == 200 and json.loads(b)["name"] == "scripteval", b)
        st, h, b = http("GET", "/")
        page = gzip.decompress(b).decode()
        check("page is gzip html", st == 200 and h.get("content-encoding") == "gzip" and "ScriptEval Studio" in page)
        check("page has a strict CSP", "frame-ancestors 'none'" in h.get("content-security-policy", ""))
        check("no CORS header", "access-control-allow-origin" not in h)
        st, _, _ = http("GET", "/", host=f"attacker.example:{PORT}")
        check("foreign Host rejected (DNS rebinding)", st == 403, st)
        st, _, _ = http("GET", "/", host="127.0.0.1:1")
        check("wrong port in Host rejected", st == 403, st)
        st, _, _ = http("OPTIONS", "/mcp", {"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
        check("CORS preflight refused", st in (401, 403, 405), st)
        st, _, _ = http("GET", "/nope")
        check("unknown path 404", st == 404, st)

        print("WebSocket")
        check("no token -> 403", WS("scripteval.v1").status == 403)
        check("wrong token -> 403", WS("scripteval.v1, token." + "0" * 32).status == 403)
        check("foreign Origin -> 403", WS(f"scripteval.v1, token.{token}", origin="http://evil.example").status == 403)
        ws = WS(f"scripteval.v1, token.{token}")
        check("valid token -> 101", ws.status == 101, ws.status)
        r = ws.call("hello")["result"]
        check("hello", r["version"] == "0.3.0", r)
        r = ws.call("eval", {"code": "console.log('a'); 20 + 22"})["result"]
        check("eval captures logs and result", r["logs"] == ["a"] and r["result"] == "42", r)
        r = ws.call("eval", {"code": "await system.waitTicks(2); 'later'"})["result"]
        check("eval with top-level await", r["result"] == '"later"' or r["result"] == "later", r)
        r = ws.call("eval", {"code": "null.x"})["result"]
        check("eval error is reported", "TypeError" in (r.get("error") or ""), r)
        r = ws.call("complete", {"text": "client.doc"})["result"]
        check("live completion", any(o["label"] == "doctor" for o in r["options"]), r)
        r = ws.call("scripts.write", {"name": "studio_t.js", "content": "import { system } from '@minecraft/server';\nsystem.runInterval(() => console.log('tick-from-module'), 5);\n"})
        check("scripts.write", r.get("result", {}).get("ok") is True, r)
        r = ws.call("scripts.write", {"name": "../escape.js", "content": "x"})
        check("path traversal refused", "invalid script name" in r.get("error", {}).get("message", ""), r)
        r = ws.call("scripts.list")["result"]
        check("scripts.list", any(f["name"] == "studio_t.js" for f in r), r)
        ws.call("subscribe", {"topics": ["console", "status"]})
        r = ws.call("module.run", {"name": "scripts/studio_t.js", "code": open(f"{DIR}/scripts/studio_t.js").read()})["result"]
        check("module.run", r["ok"] and r["resources"]["timers"] == 1, r)
        ev = ws.wait_event(lambda m: m.get("method") == "event" and m["params"]["topic"] == "console" and any("tick-from-module" in l["text"] for l in m["params"]["lines"]))
        check("console events stream", ev is not None)
        ev = ws.wait_event(lambda m: m.get("method") == "event" and m["params"]["topic"] == "status", timeout=5)
        check("status events stream", ev is not None and ev["params"]["data"]["inWorld"] is True, ev)
        r = ws.call("module.list")["result"]
        check("module.list", any(m["name"] == "scripts/studio_t.js" for m in r), r)
        r = ws.call("module.stop", {"name": "scripts/studio_t.js"})["result"]
        check("module.stop releases the timer", r["released"]["timers"] == 1, r)
        r = ws.call("scripts.delete", {"name": "studio_t.js"})["result"]
        check("scripts.delete", r["ok"], r)
        r = ws.call("doctor")["result"]
        check("doctor line", r["line"].startswith("SE-DOC 0.3.0") and "studio=ok:" in r["line"], r["line"])
        r = ws.call("mcp.info")["result"]
        check("mcp.info gives a register command", r["token"] == mtok and "claude mcp add" in r["command"], r)
        r = ws.call("interrupt")
        check("interrupt (native)", r.get("result", {}).get("ok") is True, r)
        r = ws.call("nope")
        check("unknown method", r.get("error", {}).get("code") == -32601, r)

        print("MCP")
        st, _ = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        check("no bearer -> 401", st == 401, st)
        st, _ = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}, token="0" * 48)
        check("wrong bearer -> 401", st == 401, st)
        st, _ = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}, token=mtok, origin="http://evil.example")
        check("foreign Origin -> 403", st == 403, st)
        st, r = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}}, token=mtok)
        check("initialize", st == 200 and r["result"]["serverInfo"]["name"] == "scripteval" and "tools" in r["result"]["capabilities"], r)
        st, r = mcp({"jsonrpc": "2.0", "method": "notifications/initialized"}, token=mtok)
        check("notification -> 202", st == 202, st)
        st, r = mcp({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, token=mtok)
        names = [t["name"] for t in r["result"]["tools"]]
        check("tools/list", {"status", "eval", "api_search", "script_run"} <= set(names), names)
        check("tools have input schemas", all(t["inputSchema"]["type"] == "object" for t in r["result"]["tools"]))
        st, r = mcp({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "status", "arguments": {}}}, token=mtok)
        check("tools/call status", r["result"]["content"][0]["text"].startswith("SE-DOC"), r)
        st, r = mcp({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "eval", "arguments": {"code": "world.getLocalPlayer().name"}}}, token=mtok)
        check("tools/call eval", "Steve_Dev" in r["result"]["content"][0]["text"] and r["result"]["isError"] is False, r)
        st, r = mcp({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "api_search", "arguments": {"query": "entity location"}}}, token=mtok)
        check("tools/call api_search", "Entity#location" in r["result"]["content"][0]["text"], r)
        st, r = mcp({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "logs", "arguments": {"lines": 20}}}, token=mtok)
        check("tools/call logs", "--- log ---" in r["result"]["content"][0]["text"], r)
        st, r = mcp({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "nope"}}, token=mtok)
        check("unknown tool -> error", r.get("error", {}).get("code") == -32602, r)
        ws.call("ai.pause", {"paused": True})
        st, r = mcp({"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "eval", "arguments": {"code": "1"}}}, token=mtok)
        check("pause in Studio blocks AI calls", r["result"]["isError"] is True and "Paused" in r["result"]["content"][0]["text"], r)
        ws.call("ai.pause", {"paused": False})
        r = ws.call("ai.recent")["result"]
        check("AI calls are logged for Studio", len(r["calls"]) >= 5, len(r["calls"]))
        st, r = mcp({"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "eval", "arguments": {"code": "1"}}}, token=token)
        check("session token also works for MCP", st == 200 and r["result"]["isError"] is False, r)

        print("REPL")
        out = repl_first("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\nclient.save('pwned', 1)\n")
        check("HTTP-looking client is dropped without output", "ScriptEval" not in out and "pwned" not in out, out)
        out = repl_first("1+1\n")
        check("no auth -> refused", "authentication required" in out and "> " not in out[-3:], out)
        out = repl_first("#AUTH " + "f" * 32 + "\n")
        check("wrong token -> refused", "authentication required" in out, out)
        out = repl_first(f"#AUTH {token}\n")
        check("valid token -> banner", "ScriptEval 0.3.0 REPL" in out, out)
        check("nothing was written by the attack", not os.path.exists(f"{DIR}/out/pwned"))

        packs_test(ws)
        ws.s.close()

        print("Resource packs across a restart")
        harness.kill()
        harness.wait()
        # the game (or the user in its settings) dropped the forced pack while ScriptEval was not running
        g = read_global()
        write_global([e for e in g if e["pack_id"] != T])
        harness = start_harness()
        g = read_global()
        check("startup puts the forced pack back (on top)", g and g[-1]["pack_id"] == T, g)
        token = open(f"{DIR}/session.token").read().strip()
        ws = WS(f"scripteval.v1, token.{token}")
        st = ws.call("rp.list")["result"]
        check("no restart needed right after the startup check", st["restartNeeded"] is False, st)
        r = ws.call("rp.remove", {"id": T})
        check("rp.remove", "result" in r and not os.path.exists(f"{CM}/resource_packs/{FOLDER[0]}") and all(e["pack_id"] != T for e in read_global()), r)
        check("removed pack is no longer forced", T not in open(f"{DIR}/packs.json").read())
        ws.s.close()

        if "--ui" in sys.argv:
            ui_test(token)
    finally:
        harness.kill()
        harness.wait()
    print(f"{failures} failure(s)")
    return 1 if failures else 0


# ---------------------------------------------------------------- resource packs
PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
CM = f"{DIR}/fake-mcpelauncher/games/com.mojang"
U0 = "99999999-0000-4000-8000-000000000000"           # a pack the user had before
T = "12345678-aaaa-4bbb-8ccc-1234567890ab"            # the pack uploaded by the test
FOLDER = [None]
GLOBAL0 = [{"pack_id": U0, "version": [1, 0, 0], "keep_me": 5}]


def manifest(uuid, name, kind="resources", version=(1, 2, 3)):
    return json.dumps({"format_version": 2, "header": {"name": name, "description": "d", "uuid": uuid, "version": list(version), "min_engine_version": [1, 20, 0]},
                       "modules": [{"type": kind, "uuid": "00000000-0000-4000-8000-0000000000aa", "version": [1, 0, 0]}],
                       "subpacks": [{"folder_name": "low", "name": "Low"}]})


def read_global():
    try:
        return json.load(open(f"{CM}/minecraftpe/global_resource_packs.json"))
    except Exception:
        return None


def write_global(entries):
    with open(f"{CM}/minecraftpe/global_resource_packs.json", "w") as f:
        json.dump(entries, f)


def setup_packs():
    shutil.rmtree(f"{DIR}/fake-mcpelauncher", ignore_errors=True)
    for f in ("packs.json",):
        try:
            os.remove(f"{DIR}/{f}")
        except FileNotFoundError:
            pass
    os.makedirs(f"{CM}/minecraftpe")
    os.makedirs(f"{CM}/resource_packs/UserPack")
    open(f"{CM}/resource_packs/UserPack/manifest.json", "w").write(manifest(U0, "User Pack", version=(1, 0, 0)))
    write_global(GLOBAL0)


def upload(ws, files, commit=None):
    up = ws.call("rp.begin")["result"]["upload"]
    for path, data in files:
        off = 0
        while True:
            r = ws.call_bin("rp.put", {"upload": up, "path": path, "offset": off}, data[off:off + (1 << 20)])
            if "error" in r:
                return up, r
            off += 1 << 20
            if off >= len(data):
                break
    if commit is None:
        return up, None
    return up, ws.call("rp.commit", {"upload": up, **commit})


def packs_test(ws):
    print("Resource packs")
    st = ws.call("rp.list")["result"]
    check("rp.list sees com.mojang and the user's pack", st["found"] and [p["id"] for p in st["active"]] == [U0] and st["restartNeeded"] is False, st)
    big = os.urandom(2_500_000)  # three chunks
    icon = b"\x89PNG\r\n\x1a\n" + os.urandom(64)
    files = [("manifest.json", manifest(T, "Test Pack").encode()), ("pack_icon.png", icon), ("textures/blocks/big.png", big),
             ("subpacks/low/x.txt", b"low"), ("empty.txt", b"")]
    _, r = upload(ws, files, {"activate": True, "force": True})
    res = r.get("result", {})
    check("upload + commit", res.get("ok") and res.get("activated") and res.get("id") == T and res.get("replaced") is False, r)
    FOLDER[0] = res.get("folder")
    check("folder name from the pack name", FOLDER[0] == "Test_Pack_12345678", FOLDER[0])
    d = f"{CM}/resource_packs/{FOLDER[0]}"
    check("files land in resource_packs (chunks in order)", open(f"{d}/textures/blocks/big.png", "rb").read() == big and os.path.getsize(f"{d}/empty.txt") == 0)
    g = read_global()
    check("activated on top (= last in the file) with the manifest version", g[-1] == {"pack_id": T, "version": [1, 2, 3]} and g[0]["pack_id"] == U0, g)
    check("unknown keys of other entries survive", g[0].get("keep_me") == 5, g)
    check("the original file is backed up once", json.load(open(f"{CM}/minecraftpe/global_resource_packs.json.scripteval-backup")) == GLOBAL0)
    forced = json.load(open(f"{DIR}/packs.json"))["forced"]
    check("remembered as forced", [f["uuid"] for f in forced] == [T], forced)
    st = res["state"]
    check("state: highest priority first, forced, restart needed",
          [p["id"] for p in st["active"]] == [T, U0] and st["active"][0]["forced"] and st["restartNeeded"], st["active"])
    check("subpacks are listed", st["active"][0]["subpacks"] == [{"folder_name": "low", "name": "Low"}], st["active"][0])
    staging = os.listdir(f"{DIR}/tmp") if os.path.isdir(f"{DIR}/tmp") else []
    check("staging folder cleaned up", not [n for n in staging if n.startswith("rp-")], staging)

    up, r = upload(ws, [("../evil.txt", b"x")])
    check("'..' in an upload path is refused", "error" in r and not os.path.exists(f"{DIR}/tmp/evil.txt"), r)
    for bad in ["/abs.txt", "a/../../b", "a\\b", "a//b", ".", "x/./y"]:
        _, r = upload(ws, [(bad, b"x")])
        check(f"bad path refused: {bad!r}", "error" in r, r)
    ws.call("rp.abort", {"upload": up})
    _, r = upload(ws, [("manifest.json", manifest("abcdefab-aaaa-4bbb-8ccc-1234567890ab", "BP", kind="data").encode())], {"activate": True, "force": True})
    check("behavior pack refused", "error" in r and "ビヘイビアー" in r["error"]["message"], r)
    check("refused pack was not installed", not any("BP" in n for n in os.listdir(f"{CM}/resource_packs")))
    _, r = upload(ws, [("readme.txt", b"no manifest")], {"activate": True})
    check("upload without a manifest refused", "error" in r and "manifest" in r["error"]["message"], r)

    r = ws.call("rp.icon", {"id": T})["result"]
    check("rp.icon", base64.b64decode(r["png"]) == icon)
    r = ws.call("rp.subpack", {"id": T, "subpack": "low"})
    check("rp.subpack", read_global()[-1].get("subpack") == "low", r)
    r = ws.call("rp.subpack", {"id": T, "subpack": "nope"})
    check("unknown subpack refused", "error" in r, r)
    r = ws.call("rp.move", {"id": T, "delta": -1})
    check("rp.move -1 lowers the priority", [e["pack_id"] for e in read_global()] == [T, U0], read_global())
    ws.call("rp.move", {"id": T, "delta": 1})
    check("rp.move +1 raises it again", [e["pack_id"] for e in read_global()] == [U0, T], read_global())

    # the game's settings screen switches the pack off -> the watcher puts it back
    write_global([e for e in read_global() if e["pack_id"] != T])
    back = False
    for _ in range(40):
        time.sleep(0.25)
        g = read_global() or []
        if any(e["pack_id"] == T for e in g):
            back = g[-1]["pack_id"] == T and g[-1].get("subpack") == "low"
            break
    check("forced pack is put back after the file lost it", back, read_global())
    r = ws.call("eval", {"code": "client.packs.list().map(p => `${p.name}:${p.active}:${p.forced}`).join(',')"})["result"]
    check("client.packs.list()", "Test Pack:true:true" in (r.get("result") or "") and "User Pack:true:false" in r["result"], r)
    r = ws.call("eval", {"code": "client.doctor().line"})["result"]
    check("doctor reports packs", "packs=ok:1/2" in (r.get("result") or ""), r)
    r = ws.call("eval", {"code": "client.packs.force('Test Pack', false)"})["result"]
    check("client.packs.force(name, false)", "強制を外しました" in (r.get("result") or ""), r)
    write_global([e for e in read_global() if e["pack_id"] != T])
    time.sleep(5)
    check("not forced -> not put back", all(e["pack_id"] != T for e in read_global()), read_global())
    r = ws.call("rp.enable", {"id": "Test Pack", "force": True})
    check("rp.enable by name", "result" in r and read_global()[-1]["pack_id"] == T and r["result"]["active"][0]["forced"], r)
    open(f"{CM}/minecraftpe/global_resource_packs.json", "w").write("[ { broken")
    r = ws.call("rp.disable", {"id": T})
    check("broken global file: refuses to edit it", "error" in r and "読めません" in r["error"]["message"], r)
    time.sleep(5)
    check("the watcher leaves a broken file alone", open(f"{CM}/minecraftpe/global_resource_packs.json").read() == "[ { broken")
    write_global([{"pack_id": U0, "version": [1, 0, 0]}, {"pack_id": T, "version": [1, 2, 3], "subpack": "low"}])
    # re-upload of the same pack replaces it in place
    _, r = upload(ws, [("Wrapper/manifest.json", manifest(T, "Test Pack", version=(1, 3, 0)).encode()), ("Wrapper/new.txt", b"v2")], {"activate": True, "force": True})
    res = r.get("result", {})
    check("re-upload replaces the old folder (wrapped in a sub folder)", res.get("replaced") and res.get("folder") == FOLDER[0]
          and os.path.exists(f"{CM}/resource_packs/{FOLDER[0]}/new.txt") and not os.path.exists(f"{CM}/resource_packs/{FOLDER[0]}/empty.txt"), r)
    check("version follows the new manifest", read_global()[-1]["version"] == [1, 3, 0], read_global())


def ui_test(token):
    print("Studio UI (headless Chromium)")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{PORT}/")
        page.wait_for_selector("#gate.on", timeout=5000)
        check("without a token the gate is shown", page.is_visible("#gate-token"))
        page.goto(f"http://127.0.0.1:{PORT}/#t={token}")
        page.reload()
        page.wait_for_selector("#conn.on", timeout=10000)
        check("connects with the token", True)
        check("token removed from the address bar", "#t=" not in page.url, page.url)
        page.locator("#where", has_text="Steve_Dev").wait_for(timeout=10000)
        check("top bar shows the player", True)
        page.locator("#ticks i.full").first.wait_for(timeout=10000)
        check("tick strip lights up", True)
        page.click("#btn-new")
        page.fill("#new-name", "ui_probe.ts")
        page.click("#new-file button")
        page.wait_for_selector(".tab.active >> text=ui_probe.ts", timeout=5000)
        check("new TypeScript file opens in a tab", True)
        page.click(".cm-content")
        page.keyboard.press("Control+a")
        page.keyboard.type("const n: number = 6 * 7;\nconsole.log('ui-run', n);\n")
        page.keyboard.press("Control+s")
        page.locator("#out .l", has_text="ui-run 42").first.wait_for(timeout=10000)
        check("save runs the TS module (types stripped)", True)
        page.keyboard.press("Control+a")
        page.keyboard.type("world.getLocalPlayer().name")
        page.keyboard.press("Control+a")
        page.keyboard.press("Control+Enter")
        page.wait_for_selector(".cm-inline-result", timeout=10000)
        check("inline result for a selection", "Steve_Dev" in page.inner_text(".cm-inline-result"), page.inner_text(".cm-inline-result"))
        page.click("#repl .cm-content")
        page.keyboard.type("client.doc")
        page.wait_for_selector(".cm-tooltip-autocomplete", timeout=5000)
        check("live completion in the console input", "doctor" in page.inner_text(".cm-tooltip-autocomplete"))
        page.keyboard.press("Escape")
        page.keyboard.press("Control+a")
        page.keyboard.type("1 + 41")
        page.keyboard.press("Enter")
        page.locator("#out .res", has_text="42").first.wait_for(timeout=10000)
        check("console input evaluates", True)
        page.click("#rtabs button[data-tab=doctor]")
        page.wait_for_selector(".docline code", timeout=5000)
        check("doctor tab shows the line", page.inner_text(".docline code").startswith("SE-DOC"))
        page.click("#rtabs button[data-tab=ai]")
        page.wait_for_selector(".cmdbox", timeout=5000)
        check("AI tab shows the register command", "claude mcp add" in page.inner_text(".cmdbox"))
        page.click("#rtabs button[data-tab=state]")
        page.wait_for_timeout(1500)
        page.screenshot(path="/tmp/studio.png")

        # resource packs: pick a .mcpack, toggle "forced", drop another one on the editor
        def mcpack(uuid, name, wrap=""):
            b2 = io.BytesIO()
            with zipfile.ZipFile(b2, "w") as z:
                z.writestr(wrap + "manifest.json", "// comment\n" + manifest(uuid, name), compress_type=zipfile.ZIP_DEFLATED)
                z.writestr(wrap + "pack_icon.png", base64.b64decode(PNG_1PX), compress_type=zipfile.ZIP_STORED)
                z.writestr(wrap + "textures/blocks/stone.png", os.urandom(200_000) + b"z" * 300_000, compress_type=zipfile.ZIP_DEFLATED)
                z.writestr("__MACOSX/._x", b"junk")
            return b2.getvalue()
        path = "/tmp/se-ui-pack.mcpack"
        open(path, "wb").write(mcpack("0a0a0a0a-aaaa-4bbb-8ccc-1234567890ab", "UI Pack", wrap="UI Pack/"))
        page.click("#packs-btn")
        page.wait_for_selector("#packs-dlg[open] >> text=有効なパック", timeout=5000)
        check("pack dialog opens", True)
        page.set_input_files("#packs-file", path)
        row = page.locator("#packs-active .pack", has_text="UI Pack")
        row.wait_for(timeout=20000)
        check("picked .mcpack is unpacked in the browser, uploaded and active", row.locator(".chip.force").count() == 1)
        page.wait_for_function("() => [...document.querySelectorAll('#packs-active img.icon')].some(i => i.src.startsWith('data:image/png'))", timeout=5000)
        check("pack icon is shown", True)
        check("restart banner", page.locator("#packs-body .banner", has_text="再起動").count() == 1)
        row.locator("label", has_text="強制").locator("input").uncheck()
        page.wait_for_function("() => ![...document.querySelectorAll('#packs-active .pack')].find(r => r.textContent.includes('UI Pack')).querySelector('.chip.force')", timeout=5000)
        check("forced toggle", "0a0a0a0a" not in open(f"{DIR}/packs.json").read())
        page.click("#packs-close")
        data = base64.b64encode(mcpack("0b0b0b0b-aaaa-4bbb-8ccc-1234567890ab", "Dropped Pack")).decode()
        page.evaluate("""b64 => {
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const dt = new DataTransfer();
            dt.items.add(new File([bytes], "dropped.mcpack"));
            const target = document.querySelector("#editor");
            target.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
            target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
        }""", data)
        page.locator("#packs-active .pack", has_text="Dropped Pack").wait_for(timeout=20000)
        check("a .mcpack dropped on the editor is installed", any(e["pack_id"] == "0b0b0b0b-aaaa-4bbb-8ccc-1234567890ab" for e in read_global()), read_global())
        page.wait_for_timeout(500)
        page.screenshot(path="/tmp/studio-packs.png")
        check("no page errors", not errors, errors)
        b.close()


if __name__ == "__main__":
    sys.exit(main())

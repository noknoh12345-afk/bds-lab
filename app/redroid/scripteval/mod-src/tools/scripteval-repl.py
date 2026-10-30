#!/usr/bin/env python3
"""ScriptEval REPL client.

Connects to the ScriptEval mod running inside Minecraft (mcpelauncher) and
evaluates JavaScript in the game client.

  scripteval-repl.py                    interactive (history, multi-line, Tab completion)
  scripteval-repl.py -e 'world.getAllPlayers().map(p => p.name)'
  scripteval-repl.py -f myscript.js     run a local file and exit
  scripteval-repl.py --port 25599 --host 127.0.0.1

Interactive keys: Ctrl+C interrupts a running script (or clears the input),
Ctrl+D exits. Lines with unbalanced brackets continue on the next line; an
empty line forces evaluation. Local commands: :load <file>, :help, :quit.
"""

import argparse
import base64
import os
import socket
import sys
import threading
import time

try:
    import readline  # noqa: F401  (line editing + history on Linux/macOS)
except ImportError:  # Windows without pyreadline3
    readline = None

EOT = b"\x04\n"
PROMPT = "js> "
CONT_PROMPT = "... "
HISTORY = os.path.expanduser("~/.scripteval_history")


class Connection:
    """Framed connection: every response ends with \\x04\\n (see `.frame`)."""

    def __init__(self, host, port, token, timeout=10.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        # ScriptEval 0.2+: authenticate first (the token changes at every game launch)
        if token:
            self.sock.sendall(b"#AUTH " + token.encode() + b"\n")
        self.sock.settimeout(None)
        self.lock = threading.Lock()
        self.cond = threading.Condition(self.lock)
        self.frames = 0          # number of terminators received so far
        self.capture = None      # list collecting text instead of printing it
        self.closed = False
        self.idle = True         # no request outstanding (async output may need a prompt redraw)
        self.prompt = PROMPT
        banner = self._read_until(b"> ")
        if b"authentication required" in banner:
            raise PermissionError(banner.decode("utf-8", "replace").strip())
        self.banner = banner.decode("utf-8", "replace").rstrip("> \n")
        self.sock.sendall(b".frame\n")
        self._read_until(EOT)
        self.reader = threading.Thread(target=self._reader, daemon=True)
        self.reader.start()

    def _read_until(self, marker):
        data = b""
        while not data.endswith(marker):
            chunk = self.sock.recv(4096)
            if not chunk:
                if b"authentication required" in data:
                    raise PermissionError(data.decode("utf-8", "replace").strip())
                raise ConnectionError("connection closed by the game")
            data += chunk
        return data

    def _emit(self, text):
        if not text:
            return
        if self.capture is not None:
            self.capture.append(text)
            return
        if self.idle and readline is not None and sys.stdout.isatty():
            # asynchronous output while the user is typing: keep the prompt intact
            buf = readline.get_line_buffer()
            sys.stdout.write("\r\x1b[K" + text + self.prompt + buf)
        else:
            sys.stdout.write(text)
        sys.stdout.flush()

    def _reader(self):
        carry = b""
        try:
            while True:
                chunk = self.sock.recv(65536)
                if not chunk:
                    break
                data = carry + chunk
                carry = b""
                while True:
                    i = data.find(EOT)
                    if i < 0:
                        break
                    with self.lock:
                        self._emit(data[:i].decode("utf-8", "replace"))
                        self.frames += 1
                        self.cond.notify_all()
                    data = data[i + len(EOT):]
                # keep a possibly split terminator / UTF-8 sequence for the next chunk
                keep = 0
                if data.endswith(b"\x04"):
                    keep = 1
                else:
                    # do not cut a multi-byte UTF-8 character in half
                    for back in range(1, min(4, len(data)) + 1):
                        b = data[-back]
                        if b & 0xC0 == 0x80:
                            continue
                        if b >= 0xC0:
                            need = 2 if b < 0xE0 else 3 if b < 0xF0 else 4
                            if need > back:
                                keep = back
                        break
                if keep:
                    carry = data[-keep:]
                    data = data[:-keep]
                with self.lock:
                    self._emit(data.decode("utf-8", "replace"))
        except OSError:
            pass
        with self.lock:
            self.closed = True
            self.cond.notify_all()

    def request(self, line, capture=False, on_interrupt=None):
        """Send one protocol line and wait for its terminator."""
        with self.lock:
            if self.closed:
                raise ConnectionError("connection closed by the game")
            target = self.frames + 1
            self.capture = [] if capture else None
            self.idle = False
        self.sock.sendall(line.encode("utf-8") + b"\n")
        stopped = False
        with self.lock:
            while self.frames < target and not self.closed:
                try:
                    self.cond.wait(0.2)
                except KeyboardInterrupt:
                    if not stopped:
                        stopped = True
                        self.sock.sendall(b".stop\n")
                        if on_interrupt:
                            on_interrupt()
            out = "".join(self.capture) if capture else None
            self.capture = None
            self.idle = True
            if self.closed and self.frames < target:
                raise ConnectionError("connection closed by the game")
        return out

    def evaluate(self, code):
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        self.request("#B64 " + b64, on_interrupt=lambda: sys.stdout.write("\n(interrupt sent)\n"))

    def complete(self, text):
        out = self.request(".complete " + text.replace("\n", " "), capture=True)
        return [c for c in out.splitlines() if c.startswith(text)]


def needs_more(code):
    """True while brackets, a template literal or a block comment are still open."""
    stack = []  # "(", "[", "{" or "${" (placeholder inside a template literal)
    quote = None
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if quote == "`" and c == "$" and code[i + 1:i + 2] == "{":
                stack.append("${")
                quote = None
                i += 2
                continue
            if c == quote:
                quote = None
            elif c == "\n" and quote != "`":
                quote = None  # unterminated string: let the engine report it
            i += 1
            continue
        if c in "\"'`":
            quote = c
        elif c == "/" and code[i + 1:i + 2] == "/":
            j = code.find("\n", i)
            i = n if j < 0 else j
            continue
        elif c == "/" and code[i + 1:i + 2] == "*":
            j = code.find("*/", i + 2)
            if j < 0:
                return True
            i = j + 2
            continue
        elif c in "([{":
            stack.append(c)
        elif c in ")]}" and stack:
            if stack.pop() == "${" and c == "}":
                quote = "`"  # back inside the template literal
        i += 1
    return bool(stack) or quote == "`" or code.rstrip().endswith("\\")


def setup_readline(conn):
    if readline is None:
        return
    try:
        readline.read_history_file(HISTORY)
    except (OSError, IOError):
        pass
    readline.set_history_length(2000)
    readline.set_completer_delims(" \t\n;,=+-*/%&|^!~?:<>{}[]")
    cache = {"text": None, "items": []}

    def completer(text, state):
        if state == 0:
            line = readline.get_line_buffer()[: readline.get_endidx()]
            try:
                items = conn.complete(line) if line.strip() else []
            except Exception:  # noqa: BLE001
                items = []
            # readline replaces only the current token: strip what precedes it
            start = len(line) - len(text)
            cache["items"] = [c[start:] for c in items]
        items = cache["items"]
        return items[state] if state < len(items) else None

    readline.set_completer(completer)
    if "libedit" in (readline.__doc__ or ""):
        readline.parse_and_bind("bind ^I rl_complete")
    else:
        readline.parse_and_bind("tab: complete")


def save_history():
    if readline is not None:
        try:
            readline.write_history_file(HISTORY)
        except OSError:
            pass


def read_statement(conn):
    lines = []
    while True:
        prompt = PROMPT if not lines else CONT_PROMPT
        conn.prompt = prompt
        line = input(prompt)
        if not lines and not line.strip():
            continue
        if lines and not line.strip():
            break  # empty line: evaluate what we have
        lines.append(line)
        code = "\n".join(lines)
        if not needs_more(code):
            break
    code = "\n".join(lines)
    if code.endswith("\\"):
        code = code[:-1]
    return code


LOCAL_HELP = """Local commands:
  :load <file>   evaluate a local JavaScript file (import/export -> ES module)
  :help          this text (server commands: .help)
  :quit          exit (or Ctrl+D)
Ctrl+C interrupts a running script; Tab completes globals and properties."""


def interactive(conn):
    setup_readline(conn)
    print(conn.banner)
    print("Type :help for local commands, .help for server commands.")
    while True:
        try:
            code = read_statement(conn)
        except KeyboardInterrupt:
            sys.stdout.write("\n")
            continue
        except EOFError:
            sys.stdout.write("\n")
            break
        stripped = code.strip()
        if stripped in (":quit", ":q", ".quit", ".exit"):
            break
        if stripped == ":help":
            print(LOCAL_HELP)
            continue
        if stripped.startswith(":load "):
            path = os.path.expanduser(stripped[6:].strip())
            try:
                with open(path, encoding="utf-8") as f:
                    code = f.read()
            except OSError as e:
                print(f"cannot read {path}: {e}")
                continue
        if stripped in (".ml", ".end"):
            print("multi-line input works directly here: open brackets continue the statement, an empty line ends it")
            continue
        try:
            if stripped.startswith(".") and "\n" not in stripped and not stripped.startswith(".."):
                conn.request(stripped)  # server command (.status, .run x, .help ...)
            else:
                conn.evaluate(code)
        except ConnectionError as e:
            print(f"\n{e}")
            break
    save_history()


# Where mcpelauncher keeps its data (ScriptEval lives in <root>/scripteval).
DATA_ROOTS = [
    "~/.local/share/mcpelauncher",
    "~/.var/app/io.mrarm.mcpelauncher/data/mcpelauncher",
    "~/Library/Application Support/mcpelauncher",
]


def find_token(explicit=None, data_dir=None):
    if explicit:
        return explicit.strip()
    if os.environ.get("SCRIPTEVAL_TOKEN"):
        return os.environ["SCRIPTEVAL_TOKEN"].strip()
    dirs = [data_dir] if data_dir else [os.path.join(os.path.expanduser(r), "scripteval") for r in DATA_ROOTS]
    if os.environ.get("SCRIPTEVAL_DIR"):
        dirs.insert(0, os.environ["SCRIPTEVAL_DIR"])
    best = None
    for d in dirs:
        p = os.path.join(d, "session.token")
        if os.path.isfile(p):
            m = os.path.getmtime(p)
            if best is None or m > best[0]:
                best = (m, p)
    if best:
        with open(best[1], encoding="utf-8") as f:
            return f.read().strip()
    return None


def main():
    ap = argparse.ArgumentParser(description="ScriptEval REPL client (JavaScript inside the Minecraft client)")
    ap.add_argument("--host", default=os.environ.get("SCRIPTEVAL_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SCRIPTEVAL_PORT", "25599")))
    ap.add_argument("-e", "--eval", dest="expr", help="evaluate CODE, print the result and exit")
    ap.add_argument("-f", "--file", help="evaluate a local .js file and exit")
    ap.add_argument("--wait", type=float, default=0, help="keep retrying the connection for N seconds")
    ap.add_argument("--token", help="session token (default: read <data dir>/scripteval/session.token)")
    ap.add_argument("--data-dir", help="ScriptEval data directory that holds session.token")
    args = ap.parse_args()
    token = find_token(args.token, args.data_dir)

    deadline = time.time() + args.wait
    while True:
        try:
            conn = Connection(args.host, args.port, token)
            break
        except PermissionError as e:
            print(f"{e}\nPass --token, or --data-dir pointing at the folder with session.token.", file=sys.stderr)
            return 1
        except OSError as e:
            if time.time() < deadline:
                time.sleep(0.5)
                continue
            print(f"cannot connect to {args.host}:{args.port}: {e}\n"
                  "Is Minecraft running with the ScriptEval mod (and replPort enabled in config.json)?",
                  file=sys.stderr)
            return 1

    try:
        if args.expr is not None or args.file:
            code = args.expr
            if args.file:
                with open(args.file, encoding="utf-8") as f:
                    code = f.read()
            conn.evaluate(code)
            return 0
        interactive(conn)
    except KeyboardInterrupt:
        pass
    except ConnectionError as e:
        print(e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

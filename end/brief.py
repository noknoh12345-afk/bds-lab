"""The Endstone lab's reading of a plugin without running it (`node lab.mjs import`, `node lab.mjs brief`).

python brief.py <src dir> <package> [<class>] [<declared dependency> ...]  ->  one JSON object on stdout:
  plugin   the main class (file, line), api_version, prefix, version, load, depend, where its metadata came from
  commands each declared command: name, usages, aliases, permissions, description, where it is declared, and how it is answered
           (on_command branch / a CommandExecutor registered for it / nothing found)
  perms    each declared permission and its default
  events   each @event_handler: the event class, the method, its file:line, and whether the class it is in is registered
  tasks    scheduler.run_task calls (file:line, repeating or once)
  risky    what the code could do outside the game (processes, network, files, eval ...), file:line
  thread   calls that block the server thread (time.sleep, requests.*), file:line
  imports  third-party top-level modules it imports, and the ones no declared dependency provides
  data     the non-Python files in the package (configs the plugin copies with save_default_config)
  notes    anything else worth a line (a command declared twice, a handler in a class never registered ...)
Only the standard library: it runs on any Python 3.9+ (the lab's venv, or the host's).
"""
import ast
import json
import os
import re
import sys
import warnings

SRC, PKG = sys.argv[1], sys.argv[2]
CLS = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
DEPS = [d for d in sys.argv[4:] if d]
ROOT = os.path.join(SRC, PKG)

# import name -> the PyPI distribution that provides it, for the common ones whose names differ
DIST_OF = {"yaml": "pyyaml", "PIL": "pillow", "cv2": "opencv-python", "bs4": "beautifulsoup4", "dateutil": "python-dateutil",
           "dotenv": "python-dotenv", "jwt": "pyjwt", "sklearn": "scikit-learn", "Crypto": "pycryptodome", "google": "google-api-python-client",
           "websocket": "websocket-client", "serial": "pyserial", "attr": "attrs", "magic": "python-magic", "OpenSSL": "pyopenssl",
           "socks": "pysocks", "markdown": "markdown", "toml": "toml", "tomli": "tomli", "mysql": "mysql-connector-python",
           "psycopg2": "psycopg2-binary", "redis": "redis", "pymongo": "pymongo", "discord": "discord.py", "aiohttp": "aiohttp",
           "requests": "requests", "httpx": "httpx", "numpy": "numpy", "pydantic": "pydantic", "qrcode": "qrcode", "flask": "flask"}
STDLIB = set(getattr(sys, "stdlib_module_names", ())) or {
    "abc", "argparse", "array", "ast", "asyncio", "base64", "bisect", "calendar", "collections", "concurrent", "configparser", "contextlib",
    "copy", "csv", "ctypes", "dataclasses", "datetime", "decimal", "difflib", "enum", "errno", "functools", "gc", "glob", "gzip", "hashlib",
    "heapq", "hmac", "html", "http", "importlib", "inspect", "io", "ipaddress", "itertools", "json", "logging", "math", "mimetypes",
    "multiprocessing", "operator", "os", "pathlib", "pickle", "platform", "pprint", "queue", "random", "re", "secrets", "select", "shlex",
    "shutil", "signal", "socket", "sqlite3", "ssl", "statistics", "string", "struct", "subprocess", "sys", "tempfile", "textwrap",
    "threading", "time", "timeit", "tomllib", "traceback", "types", "typing", "unicodedata", "urllib", "uuid", "warnings", "weakref",
    "xml", "zipfile", "zlib", "zoneinfo", "__future__"}


def rel(f):
    return os.path.relpath(f, os.path.dirname(SRC)).replace(os.sep, "/")


def pyfiles():
    out = []
    for d, ds, fs in os.walk(ROOT):
        ds[:] = sorted(x for x in ds if x != "__pycache__")
        out += [os.path.join(d, f) for f in sorted(fs) if f.endswith(".py")]
    return out


def literal(node):
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


def dotted(node):
    """a.b.c for Name/Attribute chains, else None"""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def small_yaml(text):
    """The plugin.yml shape Endstone plugins use (maps, [a, b] lists, "strings"), for when PyYAML is not installed."""
    root, stack = {}, [(-1, None)]
    stack[0] = (-1, root)
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        ind, line = len(raw) - len(raw.lstrip()), raw.strip()
        if line.startswith("- "):
            while stack and stack[-1][0] >= ind and len(stack) > 1:
                stack.pop()
            cur = stack[-1][1]
            if isinstance(cur, dict) and cur.get("__list__") is None:
                pass
            continue
        k, _, v = line.partition(":")
        k, v = k.strip().strip("\"'"), v.strip()
        while len(stack) > 1 and stack[-1][0] >= ind:
            stack.pop()
        cur = stack[-1][1]
        if not isinstance(cur, dict):
            continue
        if v == "":
            cur[k] = {}
            stack.append((ind, cur[k]))
        elif v.startswith("["):
            cur[k] = [x.strip().strip("\"'") for x in v.strip("[]").split(",") if x.strip()]
        elif v in ("true", "false", "True", "False"):
            cur[k] = v.lower() == "true"
        else:
            cur[k] = v.strip("\"'")
    return root


def read_meta_file(path):
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    if path.endswith((".yml", ".yaml")):
        try:
            import yaml  # noqa: the plugin's own reader, when the lab's Python has it
            return yaml.safe_load(text)
        except Exception:
            return small_yaml(text)
    if path.endswith(".toml"):
        try:
            import tomllib
            return tomllib.loads(text)
        except Exception:
            return None
    if path.endswith(".json"):
        try:
            return json.loads(text)
        except Exception:
            return None
    return None


trees = {}
for f in pyfiles():
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            with open(f, encoding="utf-8") as fh:
                trees[f] = ast.parse(fh.read(), f)
        for w in [x for x in caught if issubclass(x.category, (SyntaxWarning, DeprecationWarning))]:   # (an invalid escape such as 'plugins\endstone_x': Python warns, the string is not what was meant)
            print(json.dumps({"warning": {"at": f"{rel(f)}:{w.lineno}", "msg": f"{w.category.__name__}: {w.message}"}}), file=sys.stderr)
    except SyntaxError as e:
        trees[f] = None
        print(json.dumps({"syntax": [rel(f), e.lineno, e.msg]}), file=sys.stderr)

res = {"plugin": None, "commands": [], "perms": [], "events": [], "tasks": [], "risky": [], "thread": [], "imports": [], "missing": [],
       "data": [], "notes": [], "executors": [], "registered": [], "handled": []}

# ---- the plugin class: the entry point's class, else the one class that extends Plugin
classes = []
for f, t in trees.items():
    if t is None:
        continue
    for n in ast.walk(t):
        if isinstance(n, ast.ClassDef):
            classes.append((f, n))
main = next(((f, c) for f, c in classes if c.name == CLS), None) or next(((f, c) for f, c in classes if any((dotted(b) or "").split(".")[-1] == "Plugin" for b in c.bases)), None)
if main:
    f, c = main
    attrs, where = {}, {}
    for st in c.body:
        if isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name):
            attrs[st.targets[0].id], where[st.targets[0].id] = literal(st.value), st.lineno
        elif isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name) and st.value is not None:
            attrs[st.target.id], where[st.target.id] = literal(st.value), st.lineno
    source = "class"
    # metadata from a file through a class decorator (@plugin_metadata("plugin.yml")): what Endstone will see once it runs
    for d in c.decorator_list:
        if isinstance(d, ast.Call):
            for a in d.args:
                v = literal(a)
                if isinstance(v, str) and re.search(r"\.(ya?ml|toml|json)$", v):
                    m = read_meta_file(os.path.join(os.path.dirname(f), v))
                    if isinstance(m, dict):
                        for k, val in m.items():
                            if k not in attrs or attrs[k] is None:
                                attrs[k], where[k] = val, None
                        source = f"{v} (through @{dotted(d.func) or 'decorator'})"
    res["plugin"] = {"class": c.name, "file": rel(f), "line": c.lineno, "source": source,
                     **{k: attrs.get(k) for k in ("api_version", "prefix", "version", "load", "depend", "soft_depend", "description")}}
    cmds = attrs.get("commands") if isinstance(attrs.get("commands"), dict) else {}
    if attrs.get("commands") is not None and not isinstance(attrs.get("commands"), dict):
        res["notes"].append(f"{rel(f)}:{where.get('commands')} commands is not a plain dict literal: the lab cannot read it before the server does (node lab.mjs brief --live reads it from the running plugin)")
    for name, spec in cmds.items():
        spec = spec if isinstance(spec, dict) else {}
        res["commands"].append({"name": str(name), "usages": [str(u) for u in spec.get("usages") or [f"/{name}"]], "aliases": [str(a) for a in spec.get("aliases") or []],
                                "permissions": [str(p) for p in spec.get("permissions") or []], "description": spec.get("description") or "",
                                "at": f"{rel(f)}:{where.get('commands')}" if where.get("commands") else res["plugin"]["source"]})
    perms = attrs.get("permissions") if isinstance(attrs.get("permissions"), dict) else {}
    for name, spec in perms.items():
        spec = spec if isinstance(spec, dict) else {}
        res["perms"].append({"name": str(name), "default": spec.get("default", "op"), "children": sorted((spec.get("children") or {}).keys()) if isinstance(spec.get("children"), dict) else []})

# ---- the rest: every file
RISK = {"subprocess": "starts other programs", "os.system": "runs a shell command", "os.popen": "runs a shell command", "os.exec": "replaces the server process",
        "eval": "runs text as code", "exec": "runs text as code", "compile": "compiles text as code", "__import__": "imports a module by name",
        "pickle.loads": "unpickles data (runs code from it)", "pickle.load": "unpickles a file (runs code from it)", "marshal.loads": "loads code objects",
        "shutil.rmtree": "deletes folders", "os.remove": "deletes files", "os.unlink": "deletes files", "ctypes": "calls native code",
        "socket": "opens network sockets", "urllib.request": "downloads from the internet", "http.client": "talks HTTP", "requests": "talks HTTP",
        "httpx": "talks HTTP", "aiohttp": "talks HTTP", "ftplib": "talks FTP", "smtplib": "sends mail", "webbrowser": "opens a browser"}
own = {PKG}
handled_names, registered_classes = set(), set()
for f, t in trees.items():
    if t is None:
        continue
    imported = {}
    for n in ast.walk(t):
        if isinstance(n, ast.Import):
            for a in n.names:
                imported[a.asname or a.name.split(".")[0]] = a.name
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            for a in n.names:
                imported[a.asname or a.name] = f"{n.module}.{a.name}"
    for full in set(imported.values()):
        top = full.split(".")[0]
        if top not in STDLIB and top != "endstone" and top not in own and top not in res["imports"]:
            res["imports"].append(top)
        for k, why in RISK.items():
            if (full == k or full.startswith(k + ".")) and "." in k or (top == k and "." not in k and k in ("subprocess", "socket", "ctypes", "requests", "httpx", "aiohttp", "ftplib", "smtplib", "webbrowser")):
                ln = next((x.lineno for x in ast.walk(t) if isinstance(x, (ast.Import, ast.ImportFrom)) and full in [((x.module + ".") if isinstance(x, ast.ImportFrom) and x.module else "") + a.name for a in x.names]), 1)
                res["risky"].append({"at": f"{rel(f)}:{ln}", "what": f"imports {full}: {why}"})
    for n in ast.walk(t):
        if isinstance(n, ast.Call):
            name = dotted(n.func) or ""
            base = name.split(".")[0]
            resolved = (imported.get(base, base) + name[len(base):]) if base else name
            for k, why in RISK.items():
                if resolved == k or (resolved.startswith(k + ".") and k in ("subprocess", "os.exec")) or (k in ("eval", "exec", "compile", "__import__") and name == k):
                    res["risky"].append({"at": f"{rel(f)}:{n.lineno}", "what": f"{name}(): {why}"})
            if name == "open" and len(n.args) > 1 and isinstance(literal(n.args[1]), str) and re.search(r"[wax+]", literal(n.args[1]) or ""):
                res["risky"].append({"at": f"{rel(f)}:{n.lineno}", "what": "open(..., write): writes a file (Endstone's place for a plugin's files: self.data_folder)"})
            if resolved in ("time.sleep",) or re.match(r"^requests\.(get|post|put|delete|request|head)$", resolved):
                res["thread"].append({"at": f"{rel(f)}:{n.lineno}", "what": f"{name}()"})
            last = name.split(".")[-1]
            if last == "run_task":
                kw = {k.arg: k.value for k in n.keywords}
                res["tasks"].append({"at": f"{rel(f)}:{n.lineno}", "repeat": "period" in kw})
            if last == "register_events" and n.args:
                a0 = n.args[0]
                registered_classes.add("self" if isinstance(a0, ast.Name) and a0.id == "self" else (dotted(a0.func) if isinstance(a0, ast.Call) else dotted(a0)) or "?")
            if last == "register_command" and n.args:
                v = literal(n.args[0])
                names = v if isinstance(v, list) else [v] if isinstance(v, str) else []
                res["executors"].append({"at": f"{rel(f)}:{n.lineno}", "commands": [str(x) for x in names]})
                handled_names.update(str(x) for x in names)
            if last == "get_command" and n.args and isinstance(literal(n.args[0]), str):
                handled_names.add(literal(n.args[0]))   # (self.get_command("x").executor = ...)
        # on_command: the names it answers (match command.name / if command.name == "x" / in ("a", "b"))
        if isinstance(n, ast.Compare) and isinstance(n.left, ast.Attribute) and n.left.attr in ("name", "label") and not isinstance(n.left.value, ast.Attribute):
            for c in n.comparators:
                v = literal(c)
                for x in (v if isinstance(v, (list, tuple, set)) else [v]):
                    if isinstance(x, str):
                        handled_names.add(x)
        if isinstance(n, ast.Match) and isinstance(n.subject, ast.Attribute) and n.subject.attr == "name":
            for case in n.cases:
                for p in ast.walk(case.pattern):
                    if isinstance(p, ast.MatchValue) and isinstance(literal(p.value), str):
                        handled_names.add(literal(p.value))
    # event handlers: methods with @event_handler, the event class from the annotation of their argument
    for c in [x for x in ast.walk(t) if isinstance(x, ast.ClassDef)]:
        for m in c.body:
            if not isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            decs = [d.func if isinstance(d, ast.Call) else d for d in m.decorator_list]
            if not any((dotted(d) or "").split(".")[-1] == "event_handler" for d in decs):
                continue
            args = m.args.args[1:]
            ev = (dotted(args[0].annotation) or "?").split(".")[-1] if args and args[0].annotation is not None else "?"
            kw = {}
            for d in m.decorator_list:
                if isinstance(d, ast.Call):
                    kw.update({k.arg: literal(k.value) if literal(k.value) is not None else dotted(k.value) for k in d.keywords})
            res["events"].append({"event": ev, "method": f"{c.name}.{m.name}", "at": f"{rel(f)}:{m.lineno}", "cls": c.name, "priority": kw.get("priority"),
                                  "ignore_cancelled": kw.get("ignore_cancelled")})
            if m.name == "on_command":
                res["notes"].append(f"{rel(f)}:{m.lineno} an event handler named on_command shadows the plugin's command method")

# which handlers can run: the plugin class registers itself (register_events(self)) or another class by name
main_cls = res["plugin"]["class"] if res["plugin"] else None
for e in res["events"]:
    e["registered"] = (e["cls"] == main_cls and "self" in registered_classes) or e["cls"] in {r.split(".")[-1] for r in registered_classes}
    if not e["registered"]:
        res["notes"].append(f"{e['at']} {e['method']} handles {e['event']}, but nothing calls register_events with {e['cls']}: it never runs")
# an on_command that never looks at command.name answers every command the plugin declares
answers_all = falls = False
if main:
    oc = next((m for m in main[1].body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)) and m.name == "on_command"), None)
    if oc is not None:
        # (command.name / command.label, the second argument's: sender.location.dimension.name is not a look at the command)
        cp = oc.args.args[2].arg if len(oc.args.args) > 2 else "command"
        looks = any(isinstance(x, ast.Attribute) and x.attr in ("name", "label") and isinstance(x.value, ast.Name) and x.value.id == cp for x in ast.walk(oc))
        answers_all = not looks
        # if command.name == "a": ... return; <the rest answers the other command>: code after the last look that does more
        # than return False answers whatever the looks did not name
        body = oc.body
        last = max((i for i, st in enumerate(body) if any(isinstance(x, ast.Attribute) and x.attr in ("name", "label") and isinstance(x.value, ast.Name) and x.value.id == cp for x in ast.walk(st))), default=-1)
        rest = body[last + 1:] if last >= 0 else []
        falls = bool(rest) and not (len(rest) == 1 and isinstance(rest[0], ast.Return) and literal(rest[0].value) in (False, None))
for c in res["commands"]:
    c["handled"] = "on_command" if answers_all or c["name"] in handled_names or any(a in handled_names for a in c["aliases"]) else "on_command (after the named branches)" if falls else None
    if c["name"] in {n for x in res["executors"] for n in x["commands"]}:
        c["handled"] = "executor"
res["registered"] = sorted(registered_classes)
res["handled"] = sorted(handled_names)
names = [c["name"] for c in res["commands"]]
for n in sorted({x for x in names if names.count(x) > 1}):
    res["notes"].append(f"/{n} is declared twice")
declared = {p["name"] for p in res["perms"]}
for c in res["commands"]:
    for p in c["permissions"]:
        if p not in declared and declared:
            res["notes"].append(f"/{c['name']} needs permission {p}, which permissions does not declare (Endstone gives an undeclared permission to operators only)")

# third-party imports no declared dependency provides: by what the installed distributions say they provide (a dependency's
# modules can have other names: bedrock-protocol-packets-ng gives bedrock_protocol, rapidnbt, bstream), else by the usual names
norm = lambda x: re.sub(r"[-_.]+", "-", x).lower()
have = {norm(re.split(r"[=<>~!\[; (]", d)[0].strip()) for d in DEPS}
try:
    from importlib.metadata import packages_distributions, distribution
    provided = {k: [norm(d) for d in v] for k, v in packages_distributions().items()}
except Exception:
    provided = {}
def requires(dist, seen):   # a declared dependency's own dependencies count too (installed ones only)
    if dist in seen:
        return
    seen.add(dist)
    try:
        for r in distribution(dist).requires or []:
            if "extra ==" not in r:
                requires(norm(re.split(r"[=<>~!\[; (]", r)[0].strip()), seen)
    except Exception:
        pass
closure = set()
for d in have:
    requires(d, closure)
closure |= have
for m in res["imports"]:
    by = provided.get(m)
    if by is not None:
        if not set(by) & closure:
            res["missing"].append({"module": m, "dist": by[0], "sure": True})
        continue
    dist = norm(DIST_OF.get(m, m))
    if dist in closure or norm(m) in closure:
        continue
    # not installed here: sure only when every declared dependency is installed (none of them gives it)
    # (a well-known package not installed here gives only its own module — requests gives requests — so it cannot be the one)
    known = {norm(v): k for k, v in DIST_OF.items()}
    unknown = [d for d in have if d not in {x for v in provided.values() for x in v} and not (d in known and known[d] != m)]
    res["missing"].append({"module": m, "dist": DIST_OF.get(m, m), "sure": not unknown})

# the package's data files (what save_default_config copies: config.toml ...)
for d, ds, fs in os.walk(ROOT):
    ds[:] = [x for x in ds if x != "__pycache__"]
    res["data"] += [rel(os.path.join(d, f)) for f in sorted(fs) if not f.endswith((".py", ".pyc"))]

print(json.dumps(res, ensure_ascii=False))

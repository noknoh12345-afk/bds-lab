#include "respack.h"

#include <dirent.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <map>
#include <mutex>
#include <set>
#include <thread>
#include <vector>

#include "common.h"
#include "http.h"
#include "platform.h"
#include "session.h"
#include "ziputil.h"

namespace se::respack {

namespace {
std::recursive_mutex g_mu;
std::string g_dir;               // detected com.mojang folder (cached)
std::string g_startSig;          // active list right after the startup enforcement
bool g_startSigSet = false;
std::string g_lastParseError;    // last complaint about an unreadable global_resource_packs.json
uint64_t g_writes = 0;           // bumped by every change ScriptEval makes (invalidates the summary cache)

constexpr uint64_t kMaxUploadBytes = 2ull << 30;  // per pack
constexpr size_t kMaxUploadFiles = 100000;
constexpr size_t kMaxChunk = 8u << 20;
constexpr uint64_t kUploadTtlMs = 60 * 60 * 1000;

// ------------------------------------------------------------------ filesystem
bool statOf(const std::string& p, struct stat& st) { return ::stat(p.c_str(), &st) == 0; }
bool isDir(const std::string& p) {
    struct stat st;
    return statOf(p, st) && S_ISDIR(st.st_mode);
}
bool isFile(const std::string& p) {
    struct stat st;
    return statOf(p, st) && S_ISREG(st.st_mode);
}
bool exists(const std::string& p) {
    struct stat st;
    return ::lstat(p.c_str(), &st) == 0;
}
std::string parentOf(const std::string& p) {
    size_t s = p.rfind('/');
    return s == std::string::npos ? std::string() : p.substr(0, s);
}
std::vector<std::string> listNames(const std::string& dir) {
    std::vector<std::string> out;
    if (DIR* d = opendir(dir.c_str())) {
        while (dirent* e = readdir(d)) {
            std::string n = e->d_name;
            if (n != "." && n != "..") out.push_back(n);
        }
        closedir(d);
    }
    std::sort(out.begin(), out.end());
    return out;
}
// Deletes a file or a directory tree; symbolic links are removed, never followed.
bool removeTree(const std::string& p, int depth = 0) {
    struct stat st;
    if (::lstat(p.c_str(), &st) != 0) return true;
    if (S_ISDIR(st.st_mode) && depth < 64) {
        for (auto& n : listNames(p)) removeTree(p + "/" + n, depth + 1);
        return ::rmdir(p.c_str()) == 0;
    }
    return ::unlink(p.c_str()) == 0;
}
bool copyFile(const std::string& from, const std::string& to) {
    FILE* in = fopen(from.c_str(), "rb");
    if (!in) return false;
    FILE* out = fopen(to.c_str(), "wb");
    if (!out) {
        fclose(in);
        return false;
    }
    std::vector<char> buf(1 << 16);
    bool ok = true;
    size_t n;
    while ((n = fread(buf.data(), 1, buf.size(), in)) > 0)
        if (fwrite(buf.data(), 1, n, out) != n) {
            ok = false;
            break;
        }
    fclose(in);
    if (fclose(out) != 0) ok = false;
    return ok;
}
bool copyTree(const std::string& from, const std::string& to, int depth = 0) {
    struct stat st;
    if (::lstat(from.c_str(), &st) != 0) return false;
    if (S_ISDIR(st.st_mode)) {
        if (depth > 64 || !platform::mkdirs(to)) return false;
        for (auto& n : listNames(from))
            if (!copyTree(from + "/" + n, to + "/" + n, depth + 1)) return false;
        return true;
    }
    if (!S_ISREG(st.st_mode)) return true;  // skip anything that is not a plain file
    return copyFile(from, to);
}
// Moves a tree (rename, or copy + delete across file systems).
bool moveTree(const std::string& from, const std::string& to) {
    if (::rename(from.c_str(), to.c_str()) == 0) return true;
    if (!copyTree(from, to)) {
        removeTree(to);
        return false;
    }
    removeTree(from);
    return true;
}

// ------------------------------------------------------------------ small helpers
const JsonValue* field(const JsonValue& o, const char* k) {
    if (o.type != JsonValue::Object) return nullptr;
    auto it = o.obj.find(k);
    return it == o.obj.end() ? nullptr : &it->second;
}
std::string strField(const JsonValue& o, const char* k, const std::string& def = "") {
    auto* f = field(o, k);
    return f && f->type == JsonValue::String ? f->s : def;
}
bool boolField(const JsonValue& o, const char* k, bool def) {
    auto* f = field(o, k);
    return f && f->type == JsonValue::Bool ? f->b : def;
}
double numField(const JsonValue& o, const char* k, double def) {
    auto* f = field(o, k);
    return f && f->type == JsonValue::Number ? f->n : def;
}
JsonValue jstr(const std::string& s) {
    JsonValue v;
    v.type = JsonValue::String;
    v.s = s;
    return v;
}
JsonValue jnum(double n) {
    JsonValue v;
    v.type = JsonValue::Number;
    v.n = n;
    return v;
}
std::string q(const std::string& s) { return jsonQuote(utf8Sanitize(s)); }

bool normUuid(const std::string& in, std::string& out) {
    if (in.size() != 36) return false;
    std::string u = toLower(in);
    for (size_t k = 0; k < 36; k++) {
        char c = u[k];
        if (k == 8 || k == 13 || k == 18 || k == 23) {
            if (c != '-') return false;
        } else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
            return false;
        }
    }
    out = u;
    return true;
}

struct Ver {
    int v[3] = {0, 0, 0};
    bool ok = false;
};
Ver parseVer(const JsonValue& j) {
    Ver r;
    if (j.type == JsonValue::Array && !j.arr.empty() && j.arr.size() <= 4) {
        r.ok = true;
        for (size_t k = 0; k < 3 && k < j.arr.size(); k++) {
            if (j.arr[k].type != JsonValue::Number) r.ok = false;
            else r.v[k] = (int)j.arr[k].n;
        }
    } else if (j.type == JsonValue::String) {
        r.ok = sscanf(j.s.c_str(), "%d.%d.%d", &r.v[0], &r.v[1], &r.v[2]) >= 1;
    }
    for (int& x : r.v)
        if (x < 0) x = 0;
    return r;
}
JsonValue verJson(const Ver& v) {
    JsonValue a;
    a.type = JsonValue::Array;
    for (int x : v.v) a.arr.push_back(jnum(x));
    return a;
}
std::string verText(const Ver& v) { return strprintf("%d.%d.%d", v.v[0], v.v[1], v.v[2]); }

// "§l§6Fancy §rPack" -> "Fancy Pack"
std::string stripFormat(const std::string& s) {
    std::string o;
    for (size_t i = 0; i < s.size(); i++) {
        if ((unsigned char)s[i] == 0xC2 && i + 1 < s.size() && (unsigned char)s[i + 1] == 0xA7) {
            i += 2;  // skip "§" and the code character
            continue;
        }
        o += s[i];
    }
    size_t a = o.find_first_not_of(" \t\r\n"), b = o.find_last_not_of(" \t\r\n");
    return a == std::string::npos ? std::string() : o.substr(a, b - a + 1);
}

// ------------------------------------------------------------------ packs on disk
struct Pack {
    std::string folder;  // relative to resource_packs ("Name_1a2b3c4d" or "group/Name")
    std::string path;    // absolute
    std::string uuid, name, description, error;
    std::vector<std::string> types;
    std::vector<std::pair<std::string, std::string>> subpacks;  // folder_name, display name
    Ver ver;
    bool hasIcon = false;
    bool isResource() const { return std::find(types.begin(), types.end(), "resources") != types.end(); }
    bool isBehavior() const {
        for (auto& t : types)
            if (t == "data" || t == "script" || t == "javascript") return true;
        return false;
    }
};

// pack.name style keys are looked up in texts/<lang>.lang
std::string langLookup(const std::string& dir, const std::string& key) {
    for (const char* lang : {"ja_JP", "en_US"}) {
        std::string text;
        if (!platform::readFile(dir + "/texts/" + lang + ".lang", text)) continue;
        size_t pos = 0;
        while (pos < text.size()) {
            size_t nl = text.find('\n', pos);
            if (nl == std::string::npos) nl = text.size();
            std::string line = text.substr(pos, nl - pos);
            pos = nl + 1;
            if (line.compare(0, 3, "\xEF\xBB\xBF") == 0) line = line.substr(3);
            if (line.size() <= key.size() || line.compare(0, key.size(), key) != 0 || line[key.size()] != '=') continue;
            std::string v = line.substr(key.size() + 1);
            size_t c = v.find("\t#");
            if (c != std::string::npos) v = v.substr(0, c);
            while (!v.empty() && (v.back() == '\r' || v.back() == ' ' || v.back() == '\t')) v.pop_back();
            if (!v.empty()) return v;
        }
    }
    return "";
}
bool looksLikeLangKey(const std::string& s) {
    if (s.empty() || s.find(' ') != std::string::npos || s.find('.') == std::string::npos) return false;
    for (unsigned char c : s)
        if (!(isalnum(c) || c == '.' || c == '_' || c == '-')) return false;
    return true;
}

bool readPack(const std::string& dir, Pack& p) {
    std::string text;
    if (!platform::readFile(dir + "/manifest.json", text)) {
        p.error = "manifest.json がありません";
        return false;
    }
    JsonValue m;
    std::string err;
    if (!parseJson(text, m, &err) || m.type != JsonValue::Object) {
        p.error = "manifest.json を読めません（" + err + "）";
        return false;
    }
    const JsonValue* h = field(m, "header");
    if (!h || h->type != JsonValue::Object) {
        p.error = "manifest.json に header がありません";
        return false;
    }
    if (!normUuid(strField(*h, "uuid"), p.uuid)) {
        p.error = "header.uuid が UUID ではありません";
        return false;
    }
    if (auto* v = field(*h, "version")) p.ver = parseVer(*v);
    if (!p.ver.ok) {
        p.error = "header.version がありません";
        return false;
    }
    p.name = strField(*h, "name");
    p.description = strField(*h, "description");
    if (looksLikeLangKey(p.name)) {
        std::string t = langLookup(dir, p.name);
        if (!t.empty()) p.name = t;
    }
    if (looksLikeLangKey(p.description)) {
        std::string t = langLookup(dir, p.description);
        if (!t.empty()) p.description = t;
    }
    p.name = stripFormat(p.name);
    p.description = stripFormat(p.description);
    if (p.name.empty()) p.name = p.folder.empty() ? p.uuid.substr(0, 8) : p.folder;
    if (auto* mods = field(m, "modules"); mods && mods->type == JsonValue::Array)
        for (auto& mod : mods->arr) {
            std::string t = toLower(strField(mod, "type"));
            if (!t.empty()) p.types.push_back(t);
        }
    if (auto* subs = field(m, "subpacks"); subs && subs->type == JsonValue::Array)
        for (auto& s : subs->arr) {
            std::string f = strField(s, "folder_name");
            if (f.empty()) continue;
            std::string n = stripFormat(strField(s, "name", f));
            if (looksLikeLangKey(n)) {
                std::string t = langLookup(dir, n);
                if (!t.empty()) n = stripFormat(t);
            }
            p.subpacks.emplace_back(f, n.empty() ? f : n);
        }
    p.hasIcon = isFile(dir + "/pack_icon.png");
    return true;
}

std::string dirLocked();
std::string packsRoot() { return dirLocked() + "/resource_packs"; }
std::string globalFile() { return dirLocked() + "/minecraftpe/global_resource_packs.json"; }
std::string forcedFile() { return platform::dataDir() + "/packs.json"; }
std::string tmpRoot() { return platform::dataDir() + "/tmp"; }

std::vector<Pack> scanInstalled() {
    std::vector<Pack> out;
    const std::string root = packsRoot();
    for (auto& n : listNames(root)) {
        if (n.empty() || n[0] == '.') continue;
        const std::string d = root + "/" + n;
        if (!isDir(d)) continue;
        if (isFile(d + "/manifest.json")) {
            Pack p;
            p.folder = n;
            p.path = d;
            readPack(d, p);
            out.push_back(std::move(p));
            continue;
        }
        for (auto& m : listNames(d)) {  // one level of grouping folders
            if (m.empty() || m[0] == '.') continue;
            const std::string d2 = d + "/" + m;
            if (!isDir(d2) || !isFile(d2 + "/manifest.json")) continue;
            Pack p;
            p.folder = n + "/" + m;
            p.path = d2;
            readPack(d2, p);
            out.push_back(std::move(p));
        }
    }
    return out;
}
const Pack* findPack(const std::vector<Pack>& list, const std::string& idOrFolder) {
    std::string u;
    bool isUuid = normUuid(idOrFolder, u);
    for (auto& p : list)
        if ((isUuid && p.uuid == u && p.error.empty()) || (!isUuid && p.folder == idOrFolder)) return &p;
    return nullptr;
}

// ------------------------------------------------------------------ com.mojang detection
std::string detectDir() {
    std::string cfg = config().comMojangDir;
    while (cfg.size() > 1 && cfg.back() == '/') cfg.pop_back();
    if (!cfg.empty()) return cfg;
    std::vector<std::string> cands;
    std::string parent = parentOf(platform::dataDir());
    if (!parent.empty()) cands.push_back(parent + "/games/com.mojang");
    cands.push_back("/data/data/com.mojang.minecraftpe/games/com.mojang");
    cands.push_back("/storage/emulated/0/Android/data/com.mojang.minecraftpe/files/games/com.mojang");
    cands.push_back("/storage/emulated/0/games/com.mojang");
    int best = -1;
    std::string pick;
    for (auto& d : cands) {
        int s = 0;
        if (isFile(d + "/minecraftpe/global_resource_packs.json")) s += 4;
        if (isFile(d + "/minecraftpe/options.txt")) s += 2;
        if (isDir(d + "/resource_packs")) s += 1;
        if (isDir(d + "/minecraftWorlds")) s += 1;
        if (isDir(d)) s += 1;
        if (s > best) {
            best = s;
            pick = d;
        }
    }
    return pick;
}
std::string dirLocked() {
    if (g_dir.empty() || (!isDir(g_dir) && config().comMojangDir.empty())) g_dir = detectDir();
    return g_dir;
}

// ------------------------------------------------------------------ global_resource_packs.json
struct Entry {
    std::string uuid;  // lower case (or the raw pack_id when it is not a UUID)
    Ver ver;
    std::string subpack;
    JsonValue raw;  // the object as read: unknown keys survive a rewrite
};

bool readGlobal(std::vector<Entry>& out, std::string& err) {
    out.clear();
    std::string text;
    if (!platform::readFile(globalFile(), text)) return true;  // no file = nothing active
    if (text.find_first_not_of(" \t\r\n") == std::string::npos) return true;
    JsonValue v;
    if (!parseJson(text, v, &err)) return false;
    if (v.type != JsonValue::Array) {
        err = "the root is not an array";
        return false;
    }
    for (auto& o : v.arr) {
        if (o.type != JsonValue::Object) continue;
        Entry e;
        e.raw = o;
        std::string id = strField(o, "pack_id");
        if (!normUuid(id, e.uuid)) e.uuid = id;
        if (auto* ver = field(o, "version")) e.ver = parseVer(*ver);
        e.subpack = strField(o, "subpack");
        out.push_back(std::move(e));
    }
    return true;
}

JsonValue entryJson(const Entry& e) {
    JsonValue o = e.raw;
    o.type = JsonValue::Object;
    o.obj["pack_id"] = jstr(e.uuid);
    o.obj["version"] = verJson(e.ver);
    if (!e.subpack.empty()) o.obj["subpack"] = jstr(e.subpack);
    else o.obj.erase("subpack");
    return o;
}

bool writeGlobal(const std::vector<Entry>& list) {
    const std::string path = globalFile();
    platform::mkdirs(parentOf(path));
    // keep one copy of the file as it was before ScriptEval first touched it
    const std::string bak = path + ".scripteval-backup";
    std::string cur;
    if (!exists(bak) && platform::readFile(path, cur)) platform::writeFile(bak, cur);
    JsonValue arr;
    arr.type = JsonValue::Array;
    for (auto& e : list) arr.arr.push_back(entryJson(e));
    const std::string text = toJson(arr, 3) + "\n";
    g_writes++;
    const std::string tmp = path + ".scripteval-tmp";
    if (platform::writeFile(tmp, text) && ::rename(tmp.c_str(), path.c_str()) == 0) return true;
    ::unlink(tmp.c_str());
    return platform::writeFile(path, text);
}

std::string signature(const std::vector<Entry>& list) {
    std::string s;
    for (auto& e : list) s += e.uuid + "@" + verText(e.ver) + "/" + e.subpack + ";";
    return s;
}

// ------------------------------------------------------------------ forced list (<dataDir>/packs.json)
struct Forced {
    std::string uuid, subpack, name;
    Ver ver;
};

std::vector<Forced> loadForced() {
    std::vector<Forced> out;
    std::string text;
    if (!platform::readFile(forcedFile(), text)) return out;
    JsonValue v;
    if (!parseJson(text, v, nullptr)) return out;
    auto* arr = field(v, "forced");
    if (!arr || arr->type != JsonValue::Array) return out;
    for (auto& o : arr->arr) {
        Forced f;
        if (!normUuid(strField(o, "uuid"), f.uuid)) continue;
        if (auto* ver = field(o, "version")) f.ver = parseVer(*ver);
        f.subpack = strField(o, "subpack");
        f.name = strField(o, "name");
        out.push_back(std::move(f));
    }
    return out;
}

bool saveForced(const std::vector<Forced>& list) {
    JsonValue root;
    root.type = JsonValue::Object;
    JsonValue arr;
    arr.type = JsonValue::Array;
    for (auto& f : list) {
        JsonValue o;
        o.type = JsonValue::Object;
        o.obj["uuid"] = jstr(f.uuid);
        o.obj["version"] = verJson(f.ver);
        if (!f.subpack.empty()) o.obj["subpack"] = jstr(f.subpack);
        if (!f.name.empty()) o.obj["name"] = jstr(f.name);
        arr.arr.push_back(std::move(o));
    }
    root.obj["forced"] = std::move(arr);
    g_writes++;
    return platform::writeFile(forcedFile(), toJson(root, 2) + "\n");
}

// Makes sure every forced pack is in the active list. Returns true when the file was rewritten.
bool enforceLocked(const char* why) {
    if (!config().forcePacks) return false;
    auto forced = loadForced();
    if (forced.empty()) return false;
    std::vector<Entry> global;
    std::string err;
    if (!readGlobal(global, err)) {
        if (err != g_lastParseError)
            SE_LOGW("packs: %s is not valid JSON (%s) - leaving it alone", globalFile().c_str(), err.c_str());
        g_lastParseError = err;
        return false;
    }
    g_lastParseError.clear();
    auto installed = scanInstalled();
    bool changed = false;
    std::vector<Entry> missing;
    for (auto& f : forced) {
        Ver want = f.ver;
        if (auto* p = findPack(installed, f.uuid)) want = p->ver;
        auto it = std::find_if(global.begin(), global.end(), [&](const Entry& e) { return e.uuid == f.uuid; });
        if (it == global.end()) {
            Entry e;
            e.uuid = f.uuid;
            e.ver = want;
            e.subpack = f.subpack;
            e.raw.type = JsonValue::Object;
            missing.push_back(std::move(e));
            continue;
        }
        if (verText(it->ver) != verText(want)) {
            it->ver = want;
            changed = true;
        }
        if (!f.subpack.empty() && it->subpack != f.subpack) {
            it->subpack = f.subpack;
            changed = true;
        }
    }
    if (!missing.empty()) {
        // the end of the list is the top of the stack (applied last, highest priority)
        global.insert(global.end(), missing.begin(), missing.end());
        changed = true;
    }
    if (!changed) return false;
    bool ok = writeGlobal(global);
    SE_LOGI("packs: %s global_resource_packs.json (%s, %zu forced pack(s) put back)", ok ? "updated" : "COULD NOT WRITE", why,
            missing.size());
    return ok;
}

// ------------------------------------------------------------------ uploads
struct Upload {
    std::string dir;
    uint64_t bytes = 0, touched = 0;
    std::set<std::string> paths;
};
std::map<std::string, Upload> g_uploads;

// relative path inside an upload: no absolute paths, no "..", no backslashes or control characters
bool safeRelPath(const std::string& p) {
    if (p.empty() || p.size() > 480 || p[0] == '/') return false;
    int depth = 0;
    size_t pos = 0;
    while (pos <= p.size()) {
        size_t s = p.find('/', pos);
        if (s == std::string::npos) s = p.size();
        std::string seg = p.substr(pos, s - pos);
        if (seg.empty() || seg == "." || seg == ".." || seg.size() > 160) return false;
        for (unsigned char c : seg)
            if (c < 0x20 || c == 0x7f || c == '\\' || c == ':') return false;
        if (++depth > 32) return false;
        pos = s + 1;
    }
    return true;
}

void dropStaleUploads() {
    uint64_t now = nowMs();
    for (auto it = g_uploads.begin(); it != g_uploads.end();) {
        if (now - it->second.touched > kUploadTtlMs) {
            removeTree(it->second.dir);
            it = g_uploads.erase(it);
        } else {
            ++it;
        }
    }
}

// ------------------------------------------------------------------ result JSON
std::string packJson(const std::string& uuid, const Entry* entry, const Pack* pack, bool forced, const std::string& forcedName) {
    std::string s = "{\"id\":" + q(uuid);
    Ver ver = entry ? entry->ver : pack ? pack->ver : Ver{};
    s += ",\"version\":" + q(verText(ver));
    if (entry) s += ",\"subpack\":" + q(entry->subpack);
    s += strprintf(",\"active\":%s,\"forced\":%s,\"installed\":%s", entry ? "true" : "false", forced ? "true" : "false",
                   pack ? "true" : "false");
    std::string name = pack ? pack->name : forcedName;
    s += ",\"name\":" + q(name.empty() ? uuid.substr(0, 8) : name);
    if (pack) {
        s += ",\"folder\":" + q(pack->folder) + ",\"description\":" + q(pack->description);
        s += ",\"installedVersion\":" + q(verText(pack->ver));
        s += strprintf(",\"hasIcon\":%s", pack->hasIcon ? "true" : "false");
        s += ",\"subpacks\":[";
        for (size_t k = 0; k < pack->subpacks.size(); k++)
            s += (k ? "," : "") + std::string("{\"folder_name\":") + q(pack->subpacks[k].first) + ",\"name\":" +
                 q(pack->subpacks[k].second) + "}";
        s += "]";
        if (!pack->error.empty()) s += ",\"error\":" + q(pack->error);
        else if (pack->isBehavior()) s += ",\"error\":" + q("ビヘイビアーパックです（グローバルにはできません）");
        else if (!pack->isResource()) s += ",\"error\":" + q("リソースパックではありません");
    }
    return s + "}";
}

std::string listJsonLocked() {
    auto installed = scanInstalled();
    std::vector<Entry> global;
    std::string gerr;
    bool gok = readGlobal(global, gerr);
    auto forced = loadForced();
    std::map<std::string, const Forced*> forcedBy;
    for (auto& f : forced) forcedBy[f.uuid] = &f;
    const std::string dir = dirLocked();
    std::string s = "{\"dir\":" + q(dir) + strprintf(",\"found\":%s", isDir(dir) ? "true" : "false");
    s += ",\"dataDir\":" + q(platform::dataDir());
    s += ",\"globalFile\":" + q(globalFile());
    s += strprintf(",\"fileOk\":%s", gok ? "true" : "false");
    if (!gok) s += ",\"fileError\":" + q(gerr);
    s += strprintf(",\"forcePacks\":%s", config().forcePacks ? "true" : "false");
    s += strprintf(",\"restartNeeded\":%s", gok && g_startSigSet && signature(global) != g_startSig ? "true" : "false");
    std::set<std::string> shown;
    // highest priority first (the game applies the file from the first to the last entry)
    s += ",\"active\":[";
    bool first = true;
    for (auto rit = global.rbegin(); rit != global.rend(); ++rit) {
        const Entry& e = *rit;
        const Pack* p = findPack(installed, e.uuid);
        auto f = forcedBy.find(e.uuid);
        s += (first ? "" : ",") + packJson(e.uuid, &e, p, f != forcedBy.end(), f != forcedBy.end() ? f->second->name : "");
        first = false;
        shown.insert(e.uuid);
    }
    s += "],\"inactive\":[";
    first = true;
    for (auto& p : installed) {
        if (shown.count(p.uuid) && p.error.empty()) continue;
        auto f = forcedBy.find(p.uuid);
        s += (first ? "" : ",") +
             packJson(p.error.empty() ? p.uuid : p.folder, nullptr, &p, f != forcedBy.end() && p.error.empty(), "");
        first = false;
        if (p.error.empty()) shown.insert(p.uuid);
    }
    s += "],\"missing\":[";
    first = true;
    for (auto& f : forced) {
        if (findPack(installed, f.uuid)) continue;
        s += (first ? "" : ",") + std::string("{\"id\":") + q(f.uuid) + ",\"name\":" + q(f.name) + "}";
        first = false;
    }
    return s + "]}";
}

// ------------------------------------------------------------------ operations
bool resolveId(const JsonValue& params, const std::vector<Pack>& installed, std::string& uuid, std::string& err) {
    std::string id = strField(params, "id");
    if (normUuid(id, uuid)) return true;
    if (auto* p = findPack(installed, id)) {
        uuid = p->uuid;
        return true;
    }
    // a pack name (for client.packs.enable("My Pack"))
    std::string want = toLower(id);
    for (auto& p : installed)
        if (p.error.empty() && toLower(p.name) == want) {
            uuid = p.uuid;
            return true;
        }
    err = "パックが見つかりません: " + id;
    return false;
}

// force: 1 on, 0 off, -1 keep as it is
bool activateLocked(const std::string& uuid, const std::vector<Pack>& installed, int force, const std::string* subpack,
                    std::string& err) {
    const Pack* p = findPack(installed, uuid);
    if (!p) {
        err = "インストールされていないパックは有効にできません";
        return false;
    }
    if (p->isBehavior() || !p->isResource()) {
        err = "リソースパックではないので有効にできません";
        return false;
    }
    if (subpack && !subpack->empty() &&
        std::none_of(p->subpacks.begin(), p->subpacks.end(), [&](auto& s) { return s.first == *subpack; })) {
        err = "サブパックがありません: " + *subpack;
        return false;
    }
    std::vector<Entry> global;
    std::string perr;
    if (!readGlobal(global, perr)) {
        err = "global_resource_packs.json を読めません（" + perr + "）";
        return false;
    }
    auto it = std::find_if(global.begin(), global.end(), [&](const Entry& e) { return e.uuid == uuid; });
    if (it == global.end()) {
        Entry e;
        e.uuid = uuid;
        e.ver = p->ver;
        e.raw.type = JsonValue::Object;
        if (subpack) e.subpack = *subpack;
        global.push_back(std::move(e));  // newly activated packs go on top (= the end of the file)
    } else {
        it->ver = p->ver;
        if (subpack) it->subpack = *subpack;
    }
    if (!writeGlobal(global)) {
        err = "global_resource_packs.json を書き込めません";
        return false;
    }
    auto forced = loadForced();
    auto fit = std::find_if(forced.begin(), forced.end(), [&](const Forced& f) { return f.uuid == uuid; });
    bool was = fit != forced.end();
    if (force == 1 || (force == -1 && was)) {
        std::string sp = subpack ? *subpack : was ? fit->subpack : std::string();
        if (was) forced.erase(fit);
        Forced f;
        f.uuid = uuid;
        f.ver = p->ver;
        f.subpack = sp;
        f.name = p->name;
        // keep the forced list in the same order as the active list
        size_t pos = 0;
        for (auto& e : global) {
            if (e.uuid == uuid) break;
            if (std::any_of(forced.begin(), forced.end(), [&](const Forced& x) { return x.uuid == e.uuid; })) pos++;
        }
        forced.insert(forced.begin() + (long)std::min(pos, forced.size()), std::move(f));
        saveForced(forced);
    } else if (force == 0 && was) {
        forced.erase(fit);
        saveForced(forced);
    }
    return true;
}

bool deactivateLocked(const std::string& uuid, std::string& err) {
    std::vector<Entry> global;
    std::string perr;
    if (!readGlobal(global, perr)) {
        err = "global_resource_packs.json を読めません（" + perr + "）";
        return false;
    }
    size_t before = global.size();
    global.erase(std::remove_if(global.begin(), global.end(), [&](const Entry& e) { return e.uuid == uuid; }), global.end());
    if (global.size() != before && !writeGlobal(global)) {
        err = "global_resource_packs.json を書き込めません";
        return false;
    }
    auto forced = loadForced();
    size_t fb = forced.size();
    forced.erase(std::remove_if(forced.begin(), forced.end(), [&](const Forced& f) { return f.uuid == uuid; }), forced.end());
    if (forced.size() != fb) saveForced(forced);
    return true;
}

bool commitLocked(const JsonValue& params, std::string& out, std::string& err) {
    std::string id = strField(params, "upload");
    auto it = g_uploads.find(id);
    if (it == g_uploads.end()) {
        err = "アップロードが見つかりません（時間切れ？）";
        return false;
    }
    const std::string staging = it->second.dir;
    auto fail = [&](const std::string& m) {
        removeTree(staging);
        g_uploads.erase(id);
        err = m;
        return false;
    };
    // the pack root: the staging folder, or its only sub folder
    std::string root = staging;
    if (!isFile(root + "/manifest.json")) {
        std::vector<std::string> dirs;
        for (auto& n : listNames(staging))
            if (n != "__MACOSX" && isDir(staging + "/" + n)) dirs.push_back(n);
        if (dirs.size() == 1 && isFile(staging + "/" + dirs[0] + "/manifest.json")) root = staging + "/" + dirs[0];
    }
    Pack p;
    if (!readPack(root, p)) return fail(p.error);
    if (p.isBehavior()) return fail("ビヘイビアーパック（data / script モジュール）はグローバルにできません。リソースパックだけを入れてください");
    if (!p.isResource()) return fail("リソースパック（modules の type が \"resources\"）ではありません");
    const std::string rp = packsRoot();
    if (!platform::mkdirs(rp)) return fail("resource_packs フォルダを作れません: " + rp);
    auto installed = scanInstalled();
    std::string folder;
    bool replaced = false;
    for (auto& q2 : installed)
        if (q2.uuid == p.uuid && q2.error.empty()) {
            folder = q2.folder;
            replaced = true;
            break;
        }
    if (folder.empty()) {
        std::string base;
        for (unsigned char c : p.name) {
            if (isalnum(c) || c == '-' || c == '_') base += (char)c;
            else if ((c == ' ' || c == '.' || c == '(' || c == ')') && !base.empty() && base.back() != '_') base += '_';
        }
        while (!base.empty() && base.back() == '_') base.pop_back();
        if (base.size() > 40) base.resize(40);
        if (base.empty()) base = "pack";
        folder = base + "_" + p.uuid.substr(0, 8);
        for (int k = 2; exists(rp + "/" + folder) && k < 1000; k++) folder = base + "_" + p.uuid.substr(0, 8) + "_" + std::to_string(k);
    }
    const std::string dest = rp + "/" + folder;
    const std::string old = dest + ".scripteval-old-" + id;
    if (exists(dest) && ::rename(dest.c_str(), old.c_str()) != 0) return fail("既存のパックを置き換えられません: " + dest);
    if (!moveTree(root, dest)) {
        if (exists(old)) ::rename(old.c_str(), dest.c_str());
        return fail("パックを resource_packs に移せません（空き容量？）");
    }
    removeTree(old);
    removeTree(staging);
    g_uploads.erase(id);
    g_writes++;
    // __MACOSX folders and .DS_Store files are useless to the game
    removeTree(dest + "/__MACOSX");
    removeTree(dest + "/.DS_Store");
    SE_LOGI("packs: installed \"%s\" %s (%s) into %s", p.name.c_str(), verText(p.ver).c_str(), p.uuid.c_str(), dest.c_str());
    installed = scanInstalled();
    std::string aerr;
    bool activated = false;
    if (boolField(params, "activate", true)) {
        std::string sp = strField(params, "subpack");
        activated = activateLocked(p.uuid, installed, boolField(params, "force", true) ? 1 : 0, field(params, "subpack") ? &sp : nullptr, aerr);
    }
    out = "{\"ok\":true,\"id\":" + q(p.uuid) + ",\"name\":" + q(p.name) + ",\"version\":" + q(verText(p.ver)) + ",\"folder\":" +
          q(folder) + strprintf(",\"replaced\":%s,\"activated\":%s", replaced ? "true" : "false", activated ? "true" : "false");
    if (!aerr.empty()) out += ",\"warning\":" + q(aerr);
    out += ",\"state\":" + listJsonLocked() + "}";
    return true;
}

bool moveLocked(const std::string& uuid, int delta, std::string& err) {
    std::vector<Entry> global;
    std::string perr;
    if (!readGlobal(global, perr)) {
        err = "global_resource_packs.json を読めません（" + perr + "）";
        return false;
    }
    auto it = std::find_if(global.begin(), global.end(), [&](const Entry& e) { return e.uuid == uuid; });
    if (it == global.end()) {
        err = "有効になっていないパックです";
        return false;
    }
    long i = it - global.begin();
    long j = std::max(0L, std::min((long)global.size() - 1, i + delta));
    if (i == j) return true;
    Entry e = std::move(global[(size_t)i]);
    global.erase(global.begin() + i);
    global.insert(global.begin() + j, std::move(e));
    if (!writeGlobal(global)) {
        err = "global_resource_packs.json を書き込めません";
        return false;
    }
    // forced packs follow the order of the active list
    auto forced = loadForced();
    std::stable_sort(forced.begin(), forced.end(), [&](const Forced& a, const Forced& b) {
        auto pa = std::find_if(global.begin(), global.end(), [&](const Entry& x) { return x.uuid == a.uuid; });
        auto pb = std::find_if(global.begin(), global.end(), [&](const Entry& x) { return x.uuid == b.uuid; });
        return pa < pb;
    });
    saveForced(forced);
    return true;
}
}  // namespace

std::string comMojangDir() {
    std::lock_guard<std::recursive_mutex> lk(g_mu);
    return dirLocked();
}

void enforceAtStartup() {
    std::lock_guard<std::recursive_mutex> lk(g_mu);
    try {
        for (auto& n : listNames(tmpRoot()))  // uploads left over by an earlier launch
            if (startsWith(n, "rp-")) removeTree(tmpRoot() + "/" + n);
        enforceLocked("startup");
        std::vector<Entry> g;
        std::string err;
        if (readGlobal(g, err)) {
            g_startSig = signature(g);
            g_startSigSet = true;
        }
        SE_LOGI("packs: com.mojang = %s (%zu active, %zu forced)", dirLocked().c_str(), g.size(), loadForced().size());
    } catch (...) {
        SE_LOGE("packs: exception during the startup check");
    }
}

void startWatcher() {
    static std::atomic<bool> started{false};
    if (started.exchange(true)) return;
    std::thread([] {
        bool have = false;
        struct stat last {};
        uint64_t lastFull = nowMs();
        while (true) {
            sleepMs(4000);
            try {
                std::lock_guard<std::recursive_mutex> lk(g_mu);
                dropStaleUploads();
                if (!config().forcePacks) continue;
                struct stat st {};
                bool present = statOf(globalFile(), st);
                if (!present) st = {};
                bool changed = !have || st.st_mtime != last.st_mtime || st.st_size != last.st_size || st.st_ino != last.st_ino;
                if (changed || nowMs() - lastFull > 60000) {
                    lastFull = nowMs();
                    if (enforceLocked(changed ? "the file changed" : "periodic check") && !statOf(globalFile(), st)) st = {};
                }
                last = st;
                have = true;
            } catch (...) {
            }
        }
    }).detach();
}

bool call(const std::string& method, const JsonValue& params, std::string& out, std::string& err) {
    std::lock_guard<std::recursive_mutex> lk(g_mu);
    try {
        if (method == "list") {
            out = listJsonLocked();
            return true;
        }
        if (method == "begin") {
            dropStaleUploads();
            if (g_uploads.size() >= 8) {
                err = "同時に進めているアップロードが多すぎます";
                return false;
            }
            std::string id = session::randomId(8);
            Upload u;
            u.dir = tmpRoot() + "/rp-" + id;
            u.touched = nowMs();
            if (!platform::mkdirs(u.dir)) {
                err = "作業フォルダを作れません: " + u.dir;
                return false;
            }
            g_uploads[id] = std::move(u);
            out = "{\"upload\":" + q(id) + "}";
            return true;
        }
        if (method == "abort") {
            auto it = g_uploads.find(strField(params, "upload"));
            if (it != g_uploads.end()) {
                removeTree(it->second.dir);
                g_uploads.erase(it);
            }
            out = "{\"ok\":true}";
            return true;
        }
        if (method == "commit") return commitLocked(params, out, err);
        // Web から .mcpack / .zip をダウンロードして強制導入(download → unzip → commit)。
        // params: {url, activate?(既定true), force?(既定true)}
        if (method == "install_url" || method == "web") {
            std::string url = strField(params, "url");
            if (url.empty()) { err = "url が必要です"; return false; }
            se::http::Request hr;
            hr.url = url;
            hr.timeoutMs = 60000;
            se::http::Response hres = se::http::request(hr);
            if (!hres.ok) { err = "ダウンロード失敗: " + hres.error; return false; }
            if (hres.status >= 400) { err = "ダウンロード HTTP " + std::to_string(hres.status); return false; }
            if (hres.body.size() < 22) { err = "空/短すぎるレスポンス"; return false; }
            dropStaleUploads();
            std::string id = session::randomId(8);
            Upload u;
            u.dir = tmpRoot() + "/rp-" + id;
            u.touched = nowMs();
            if (!platform::mkdirs(u.dir)) { err = "作業フォルダを作れません: " + u.dir; return false; }
            std::string zerr;
            int nf = se::zip::extract(hres.body, u.dir, zerr);
            if (nf <= 0) { removeTree(u.dir); err = nf < 0 ? ("解凍失敗: " + zerr) : "アーカイブが空です"; return false; }
            g_uploads[id] = std::move(u);
            JsonValue cp;
            cp.type = JsonValue::Object;
            JsonValue vid; vid.type = JsonValue::String; vid.s = id; cp.obj["upload"] = vid;
            JsonValue va; va.type = JsonValue::Bool; va.b = boolField(params, "activate", true); cp.obj["activate"] = va;
            JsonValue vf; vf.type = JsonValue::Bool; vf.b = boolField(params, "force", true); cp.obj["force"] = vf;
            return commitLocked(cp, out, err);
        }

        auto installed = scanInstalled();
        std::string uuid;
        if (method == "icon") {
            if (!resolveId(params, installed, uuid, err)) return false;
            const Pack* p = findPack(installed, uuid);
            std::string png;
            if (!p || !p->hasIcon || !platform::readFile(p->path + "/pack_icon.png", png) || png.size() > (2u << 20)) {
                out = "{\"png\":null}";
                return true;
            }
            out = "{\"png\":\"" + base64Encode((const unsigned char*)png.data(), png.size()) + "\"}";
            return true;
        }
        if (!resolveId(params, installed, uuid, err)) {
            // disabling / un-forcing a pack that is not installed any more still has to work
            if ((method == "disable" || method == "force") && normUuid(strField(params, "id"), uuid)) err.clear();
            else return false;
        }
        bool ok;
        if (method == "enable") {
            std::string sp = strField(params, "subpack");
            int force = field(params, "force") ? (boolField(params, "force", false) ? 1 : 0) : -1;
            ok = activateLocked(uuid, installed, force, field(params, "subpack") ? &sp : nullptr, err);
        } else if (method == "disable") {
            ok = deactivateLocked(uuid, err);
        } else if (method == "force") {
            bool on = boolField(params, "on", true);
            if (on) {
                ok = activateLocked(uuid, installed, 1, nullptr, err);
            } else {
                auto forced = loadForced();
                forced.erase(std::remove_if(forced.begin(), forced.end(), [&](const Forced& f) { return f.uuid == uuid; }),
                             forced.end());
                ok = saveForced(forced);
                if (!ok) err = "packs.json を書き込めません";
            }
        } else if (method == "subpack") {
            std::string sp = strField(params, "subpack");
            ok = activateLocked(uuid, installed, -1, &sp, err);
        } else if (method == "move") {
            ok = moveLocked(uuid, (int)numField(params, "delta", 0), err);
        } else if (method == "remove") {
            const Pack* p = findPack(installed, uuid);
            ok = deactivateLocked(uuid, err);
            if (ok && p) {
                const std::string root = packsRoot() + "/";
                if (!startsWith(p->path, root) || p->path.find("/../") != std::string::npos) {
                    err = "resource_packs の外にあるパックは消せません";
                    ok = false;
                } else if (!removeTree(p->path)) {
                    err = "フォルダを消せませんでした: " + p->path;
                    ok = false;
                } else {
                    g_writes++;
                    SE_LOGI("packs: removed %s", p->path.c_str());
                }
            }
        } else {
            err = "unknown packs method: " + method;
            return false;
        }
        if (!ok) return false;
        out = listJsonLocked();
        return true;
    } catch (const std::exception& e) {
        err = std::string("internal error: ") + e.what();
        return false;
    }
}

bool put(const JsonValue& params, const char* data, size_t len, std::string& out, std::string& err) {
    std::lock_guard<std::recursive_mutex> lk(g_mu);
    auto it = g_uploads.find(strField(params, "upload"));
    if (it == g_uploads.end()) {
        err = "アップロードが見つかりません（時間切れ？）";
        return false;
    }
    Upload& u = it->second;
    const std::string path = strField(params, "path");
    if (!safeRelPath(path)) {
        err = "使えないファイル名です: " + utf8Sanitize(path);
        return false;
    }
    double off = numField(params, "offset", 0);
    if (len > kMaxChunk || off < 0 || off > (double)kMaxUploadBytes) {
        err = "不正なチャンクです";
        return false;
    }
    if (u.bytes + len > kMaxUploadBytes) {
        err = "パックが大きすぎます（2 GiB まで）";
        return false;
    }
    bool isNew = !u.paths.count(path);
    if (isNew && u.paths.size() >= kMaxUploadFiles) {
        err = "ファイルが多すぎます（10 万個まで）";
        return false;
    }
    const std::string full = u.dir + "/" + path;
    platform::mkdirs(parentOf(full));
    int fd = ::open(full.c_str(), O_WRONLY | O_CREAT | (off == 0 ? O_TRUNC : 0), 0644);
    if (fd < 0) {
        err = "書き込めません: " + utf8Sanitize(path);
        return false;
    }
    bool ok = off == 0 || ::lseek(fd, (off_t)off, SEEK_SET) == (off_t)off;
    size_t done = 0;
    while (ok && done < len) {
        ssize_t n = ::write(fd, data + done, len - done);
        if (n <= 0) ok = false;
        else done += (size_t)n;
    }
    ::close(fd);
    if (!ok) {
        err = "書き込みに失敗しました（空き容量？）: " + utf8Sanitize(path);
        return false;
    }
    if (isNew) u.paths.insert(path);
    u.bytes += len;
    u.touched = nowMs();
    out = strprintf("{\"ok\":true,\"bytes\":%llu,\"files\":%zu}", (unsigned long long)u.bytes, u.paths.size());
    return true;
}

Summary summary() {
    std::lock_guard<std::recursive_mutex> lk(g_mu);
    // the doctor asks often (and from the game thread): reuse a fresh enough answer
    static Summary cache;
    static uint64_t cacheAt = 0, cacheWrites = ~0ull;
    if (cacheWrites == g_writes && nowMs() - cacheAt < 3000) return cache;
    Summary s;
    try {
        s.found = isDir(dirLocked());
        auto installed = scanInstalled();
        for (auto& p : installed)
            if (p.error.empty() && p.isResource() && !p.isBehavior()) s.installed++;
        std::vector<Entry> g;
        std::string err;
        s.fileOk = readGlobal(g, err);
        s.active = (int)g.size();
        auto forced = loadForced();
        s.forced = (int)forced.size();
        for (auto& f : forced)
            if (!findPack(installed, f.uuid)) s.missing++;
        s.restartNeeded = s.fileOk && g_startSigSet && signature(g) != g_startSig;
    } catch (...) {
    }
    cache = s;
    cacheAt = nowMs();
    cacheWrites = g_writes;
    return s;
}

}  // namespace se::respack

#include "config.h"

#include <cmath>
#include <cstdlib>
#include <vector>

#include "common.h"
#include "platform.h"

namespace se {

Config& config() {
    static Config c;
    return c;
}

namespace {
struct Parser {
    const std::string& t;
    size_t i = 0;
    std::string err;
    explicit Parser(const std::string& s) : t(s) {}
    void ws() {
        while (i < t.size()) {
            char c = t[i];
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t') {
                i++;
            } else if (c == '/' && i + 1 < t.size() && t[i + 1] == '/') {  // allow // comments
                while (i < t.size() && t[i] != '\n') i++;
            } else if (c == '/' && i + 1 < t.size() && t[i + 1] == '*') {  // and /* */ comments
                size_t e = t.find("*/", i + 2);
                i = e == std::string::npos ? t.size() : e + 2;
            } else if (i == 0 && t.compare(0, 3, "\xEF\xBB\xBF") == 0) {  // UTF-8 BOM
                i = 3;
            } else {
                break;
            }
        }
    }
    static void putUtf8(std::string& out, unsigned cp) {
        if (cp < 0x80) {
            out += (char)cp;
        } else if (cp < 0x800) {
            out += (char)(0xC0 | (cp >> 6));
            out += (char)(0x80 | (cp & 0x3F));
        } else if (cp < 0x10000) {
            out += (char)(0xE0 | (cp >> 12));
            out += (char)(0x80 | ((cp >> 6) & 0x3F));
            out += (char)(0x80 | (cp & 0x3F));
        } else {
            out += (char)(0xF0 | (cp >> 18));
            out += (char)(0x80 | ((cp >> 12) & 0x3F));
            out += (char)(0x80 | ((cp >> 6) & 0x3F));
            out += (char)(0x80 | (cp & 0x3F));
        }
    }
    bool hex4(unsigned& cp) {
        if (i + 4 > t.size()) return fail("bad escape");
        cp = 0;
        for (int k = 0; k < 4; k++) {
            char h = t[i + k];
            cp <<= 4;
            if (h >= '0' && h <= '9') cp |= (unsigned)(h - '0');
            else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
            else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
            else return fail("bad \\u escape");
        }
        i += 4;
        return true;
    }
    bool fail(const char* m) {
        if (err.empty()) err = strprintf("%s at offset %zu", m, i);
        return false;
    }
    bool str(std::string& out) {
        if (t[i] != '"') return fail("expected string");
        i++;
        while (i < t.size() && t[i] != '"') {
            char c = t[i++];
            if (c == '\\' && i < t.size()) {
                char e = t[i++];
                switch (e) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        unsigned cp;
                        if (!hex4(cp)) return false;
                        if (cp >= 0xD800 && cp <= 0xDBFF && i + 6 <= t.size() && t[i] == '\\' && t[i + 1] == 'u') {
                            size_t save = i;
                            i += 2;
                            unsigned lo;
                            if (hex4(lo) && lo >= 0xDC00 && lo <= 0xDFFF) {
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            } else {
                                i = save;
                                err.clear();
                            }
                        }
                        if (cp >= 0xD800 && cp <= 0xDFFF) cp = 0xFFFD;  // lone surrogate
                        putUtf8(out, cp);
                        break;
                    }
                    default: out += e;
                }
            } else {
                out += c;
            }
        }
        if (i >= t.size()) return fail("unterminated string");
        i++;
        return true;
    }
    bool value(JsonValue& v) {
        ws();
        if (i >= t.size()) return fail("unexpected end");
        char c = t[i];
        if (c == '{') {
            v.type = JsonValue::Object;
            i++;
            ws();
            if (i < t.size() && t[i] == '}') {
                i++;
                return true;
            }
            while (true) {
                ws();
                std::string k;
                if (!str(k)) return false;
                ws();
                if (i >= t.size() || t[i] != ':') return fail("expected ':'");
                i++;
                JsonValue child;
                if (!value(child)) return false;
                v.obj[k] = std::move(child);
                ws();
                if (i < t.size() && t[i] == ',') {
                    i++;
                    ws();
                    if (i < t.size() && t[i] == '}') {  // trailing comma
                        i++;
                        return true;
                    }
                    continue;
                }
                if (i < t.size() && t[i] == '}') {
                    i++;
                    return true;
                }
                return fail("expected ',' or '}'");
            }
        }
        if (c == '[') {
            v.type = JsonValue::Array;
            i++;
            ws();
            if (i < t.size() && t[i] == ']') {
                i++;
                return true;
            }
            while (true) {
                JsonValue child;
                if (!value(child)) return false;
                v.arr.push_back(std::move(child));
                ws();
                if (i < t.size() && t[i] == ',') {
                    i++;
                    ws();
                    if (i < t.size() && t[i] == ']') {  // trailing comma
                        i++;
                        return true;
                    }
                    continue;
                }
                if (i < t.size() && t[i] == ']') {
                    i++;
                    return true;
                }
                return fail("expected ',' or ']'");
            }
        }
        if (c == '"') {
            v.type = JsonValue::String;
            return str(v.s);
        }
        if (t.compare(i, 4, "true") == 0) {
            v.type = JsonValue::Bool;
            v.b = true;
            i += 4;
            return true;
        }
        if (t.compare(i, 5, "false") == 0) {
            v.type = JsonValue::Bool;
            i += 5;
            return true;
        }
        if (t.compare(i, 4, "null") == 0) {
            i += 4;
            return true;
        }
        char* end = nullptr;
        double d = strtod(t.c_str() + i, &end);
        if (end == t.c_str() + i) return fail("unexpected character");
        v.type = JsonValue::Number;
        v.n = d;
        i = (size_t)(end - t.c_str());
        return true;
    }
};

std::string jsonEscape(const std::string& s) { return jsonQuote(s); }

void writeJson(std::string& o, const JsonValue& v, int indent, int depth) {
    auto nl = [&](int d) {
        if (indent < 0) return;
        o += '\n';
        o.append((size_t)(indent * d), ' ');
    };
    switch (v.type) {
        case JsonValue::Null: o += "null"; break;
        case JsonValue::Bool: o += v.b ? "true" : "false"; break;
        case JsonValue::Number:
            if (std::isfinite(v.n) && v.n == std::floor(v.n) && std::fabs(v.n) < 9e15)
                o += strprintf("%lld", (long long)v.n);
            else if (std::isfinite(v.n))
                o += strprintf("%.17g", v.n);
            else
                o += "null";
            break;
        case JsonValue::String: o += jsonQuote(v.s); break;
        case JsonValue::Array: {
            if (v.arr.empty()) {
                o += "[]";
                break;
            }
            // short arrays of numbers stay on one line, like the game writes versions: [ 1, 0, 0 ]
            bool flat = v.arr.size() <= 4;
            for (auto& x : v.arr) flat = flat && x.type == JsonValue::Number;
            if (flat && indent >= 0) {
                o += "[ ";
                for (size_t k = 0; k < v.arr.size(); k++) {
                    if (k) o += ", ";
                    writeJson(o, v.arr[k], -1, 0);
                }
                o += " ]";
                break;
            }
            o += '[';
            for (size_t k = 0; k < v.arr.size(); k++) {
                if (k) o += ',';
                nl(depth + 1);
                writeJson(o, v.arr[k], indent, depth + 1);
            }
            nl(depth);
            o += ']';
            break;
        }
        case JsonValue::Object: {
            if (v.obj.empty()) {
                o += "{}";
                break;
            }
            o += '{';
            bool first = true;
            for (auto& [k, x] : v.obj) {
                if (!first) o += ',';
                first = false;
                nl(depth + 1);
                o += jsonQuote(k);
                o += indent >= 0 ? " : " : ":";
                writeJson(o, x, indent, depth + 1);
            }
            nl(depth);
            o += '}';
            break;
        }
    }
}
}  // namespace

bool parseJson(const std::string& text, JsonValue& out, std::string* err) {
    Parser p(text);
    p.ws();
    bool ok = p.value(out);
    if (ok) {
        p.ws();
        if (p.i != text.size()) ok = p.fail("trailing characters");
    }
    if (!ok && err) *err = p.err;
    return ok;
}

std::string toJson(const JsonValue& v, int indent) {
    std::string o;
    writeJson(o, v, indent, 0);
    return o;
}

bool Config::load(const std::string& path, std::string* err) {
    std::string text;
    if (!platform::readFile(path, text)) {
        // write defaults so users can discover the options
        platform::writeFile(path, toJson());
        return true;
    }
    JsonValue v;
    if (!parseJson(text, v, err) || v.type != JsonValue::Object) {
        if (err && err->empty()) *err = "config root must be an object";
        return false;
    }
    auto num = [&](const char* k, int& out) {
        auto it = v.obj.find(k);
        if (it != v.obj.end() && it->second.type == JsonValue::Number) out = (int)it->second.n;
    };
    auto str = [&](const char* k, std::string& out) {
        auto it = v.obj.find(k);
        if (it != v.obj.end() && it->second.type == JsonValue::String) out = it->second.s;
    };
    auto boolean = [&](const char* k, bool& out) {
        auto it = v.obj.find(k);
        if (it != v.obj.end() && it->second.type == JsonValue::Bool) out = it->second.b;
    };
    auto intMap = [&](const char* k, std::map<std::string, int>& out) {
        auto it = v.obj.find(k);
        if (it == v.obj.end() || it->second.type != JsonValue::Object) return;
        for (auto& [name, val] : it->second.obj)
            if (val.type == JsonValue::Number) out[name] = (int)val.n;
    };
    num("replPort", replPort);
    str("replBind", replBind);
    str("tickHook", tickHook);
    num("tickHookSlot", tickHookSlot);
    num("tickSampleMs", tickSampleMs);
    num("evalTimeoutMs", evalTimeoutMs);
    num("tickTimeoutMs", tickTimeoutMs);
    str("hotkey", hotkey);
    boolean("autorun", autorun);
    num("consoleLines", consoleLines);
    boolean("gameCalls", gameCalls);
    num("studioPort", studioPort);
    str("studioBind", studioBind);
    boolean("replAuth", replAuth);
    boolean("mcp", mcp);
    str("safeMode", safeMode);
    str("comMojangDir", comMojangDir);
    boolean("forcePacks", forcePacks);
    intMap("offsets", offsets);
    intMap("componentSizes", componentSizes);
    if (tickSampleMs < 500) tickSampleMs = 500;
    if (evalTimeoutMs < 100) evalTimeoutMs = 100;
    if (tickTimeoutMs < 50) tickTimeoutMs = 50;
    return true;
}

std::string Config::toJson() const {
    std::string s = "{\n";
    s += strprintf("  \"replPort\": %d,\n", replPort);
    s += "  \"replBind\": " + jsonEscape(replBind) + ",\n";
    s += "  \"tickHook\": " + jsonEscape(tickHook) + ",\n";
    s += strprintf("  \"tickHookSlot\": %d,\n", tickHookSlot);
    s += strprintf("  \"tickSampleMs\": %d,\n", tickSampleMs);
    s += strprintf("  \"evalTimeoutMs\": %d,\n", evalTimeoutMs);
    s += strprintf("  \"tickTimeoutMs\": %d,\n", tickTimeoutMs);
    s += "  \"hotkey\": " + jsonEscape(hotkey) + ",\n";
    s += strprintf("  \"autorun\": %s,\n", autorun ? "true" : "false");
    s += strprintf("  \"consoleLines\": %d,\n", consoleLines);
    s += strprintf("  \"gameCalls\": %s,\n", gameCalls ? "true" : "false");
    s += strprintf("  \"studioPort\": %d,\n", studioPort);
    s += "  \"studioBind\": " + jsonEscape(studioBind) + ",\n";
    s += strprintf("  \"replAuth\": %s,\n", replAuth ? "true" : "false");
    s += strprintf("  \"mcp\": %s,\n", mcp ? "true" : "false");
    s += "  \"safeMode\": " + jsonEscape(safeMode) + ",\n";
    s += "  \"comMojangDir\": " + jsonEscape(comMojangDir) + ",\n";
    s += strprintf("  \"forcePacks\": %s,\n", forcePacks ? "true" : "false");
    s += "  \"offsets\": {";
    bool first = true;
    for (auto& [k, v] : offsets) {
        s += strprintf("%s\n    %s: %d", first ? "" : ",", jsonEscape(k).c_str(), v);
        first = false;
    }
    s += first ? "},\n" : "\n  },\n";
    s += "  \"componentSizes\": {";
    first = true;
    for (auto& [k, v] : componentSizes) {
        s += strprintf("%s\n    %s: %d", first ? "" : ",", jsonEscape(k).c_str(), v);
        first = false;
    }
    s += first ? "}\n" : "\n  }\n";
    s += "}\n";
    return s;
}

}  // namespace se

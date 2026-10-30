#include "ziputil.h"

#include <dlfcn.h>

#include <cstdint>
#include <cstring>
#include <mutex>

#include "common.h"
#include "platform.h"

namespace se::zip {
namespace {

// zlib の z_stream（LP64 で安定な配置）。inflateInit2_ を dlopen で使う。
struct ZStream {
    const uint8_t* next_in; unsigned avail_in; unsigned long total_in;
    uint8_t* next_out; unsigned avail_out; unsigned long total_out;
    const char* msg; void* state;
    void* (*zalloc)(void*, unsigned, unsigned); void (*zfree)(void*, void*); void* opaque;
    int data_type; unsigned long adler; unsigned long reserved;
};

struct Zlib {
    void* lib = nullptr;
    int (*inflateInit2_)(ZStream*, int, const char*, int) = nullptr;
    int (*inflate)(ZStream*, int) = nullptr;
    int (*inflateEnd)(ZStream*) = nullptr;
    bool ok = false;
};

Zlib& zlib() {
    static Zlib z;
    static std::once_flag once;
    std::call_once(once, [] {
        for (const char* n : {"libz.so.1", "libz.so", "libz.1.dylib", "libz.dylib"}) {
            z.lib = dlopen(n, RTLD_NOW | RTLD_GLOBAL);
            if (z.lib) break;
        }
        if (!z.lib) return;
        z.inflateInit2_ = (decltype(z.inflateInit2_))dlsym(z.lib, "inflateInit2_");
        z.inflate = (decltype(z.inflate))dlsym(z.lib, "inflate");
        z.inflateEnd = (decltype(z.inflateEnd))dlsym(z.lib, "inflateEnd");
        z.ok = z.inflateInit2_ && z.inflate && z.inflateEnd;
    });
    return z;
}

// raw deflate(ZIP method 8)を既知サイズへ一発展開。
bool inflateRaw(const uint8_t* in, size_t inLen, std::string& out, size_t outLen) {
    Zlib& z = zlib();
    if (!z.ok) return false;
    out.resize(outLen);
    ZStream s{};
    s.next_in = in; s.avail_in = (unsigned)inLen;
    s.next_out = (uint8_t*)out.data(); s.avail_out = (unsigned)outLen;
    if (z.inflateInit2_(&s, -15, "1", (int)sizeof(ZStream)) != 0) return false;  // -15 = raw deflate
    int rc = z.inflate(&s, 4 /*Z_FINISH*/);
    z.inflateEnd(&s);
    return rc == 1 /*Z_STREAM_END*/ && s.total_out == outLen;
}

uint16_t rd16(const uint8_t* p) { return (uint16_t)(p[0] | (p[1] << 8)); }
uint32_t rd32(const uint8_t* p) { return (uint32_t)(p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24)); }

// 安全なパス結合: ".." や絶対パス・ドライブを拒否。
bool safeJoin(const std::string& base, const std::string& name, std::string& out) {
    if (name.empty() || name[0] == '/' || name[0] == '\\') return false;
    if (name.find("..") != std::string::npos) return false;
    if (name.size() >= 2 && name[1] == ':') return false;
    out = base + "/" + name;
    return true;
}

}  // namespace

bool haveInflate() { return zlib().ok; }

int extract(const std::string& bytes, const std::string& destDir, std::string& err) {
    const uint8_t* d = (const uint8_t*)bytes.data();
    size_t n = bytes.size();
    if (n < 22) { err = "zip too small"; return -1; }
    // End Of Central Directory を末尾から探す(署名 0x06054b50)
    size_t eocd = std::string::npos;
    for (size_t i = n - 22; ; --i) {
        if (rd32(d + i) == 0x06054b50) { eocd = i; break; }
        if (i == 0 || n - i > 65557) break;
    }
    if (eocd == std::string::npos) { err = "no EOCD (not a zip?)"; return -1; }
    uint16_t count = rd16(d + eocd + 10);
    uint32_t cdOff = rd32(d + eocd + 16);
    if (cdOff >= n) { err = "bad central directory offset"; return -1; }
    if (!platform::mkdirs(destDir)) { err = "mkdir failed: " + destDir; return -1; }

    size_t p = cdOff;
    int wrote = 0;
    for (int e = 0; e < count; ++e) {
        if (p + 46 > n || rd32(d + p) != 0x02014b50) { err = "bad central header"; return -1; }
        uint16_t method = rd16(d + p + 10);
        uint32_t compSize = rd32(d + p + 20);
        uint32_t uncompSize = rd32(d + p + 24);
        uint16_t nameLen = rd16(d + p + 28);
        uint16_t extraLen = rd16(d + p + 30);
        uint16_t commentLen = rd16(d + p + 32);
        uint32_t lhOff = rd32(d + p + 42);
        std::string name((const char*)(d + p + 46), nameLen);
        p += 46 + nameLen + extraLen + commentLen;

        if (lhOff + 30 > n || rd32(d + lhOff) != 0x04034b50) { err = "bad local header: " + name; return -1; }
        uint16_t lhNameLen = rd16(d + lhOff + 26);
        uint16_t lhExtraLen = rd16(d + lhOff + 28);
        size_t dataOff = lhOff + 30 + lhNameLen + lhExtraLen;
        if (dataOff + compSize > n) { err = "truncated entry: " + name; return -1; }

        std::string path;
        if (!safeJoin(destDir, name, path)) { err = "unsafe path in zip: " + name; return -1; }
        if (!name.empty() && name.back() == '/') { platform::mkdirs(path); continue; }  // directory
        size_t slash = path.find_last_of('/');
        if (slash != std::string::npos) platform::mkdirs(path.substr(0, slash));

        std::string content;
        if (method == 0) {  // stored
            content.assign((const char*)(d + dataOff), compSize);
        } else if (method == 8) {  // deflate
            if (!inflateRaw(d + dataOff, compSize, content, uncompSize)) { err = "inflate failed: " + name + " (libz?)"; return -1; }
        } else {
            err = "unsupported compression (" + std::to_string(method) + "): " + name;
            return -1;
        }
        if (!platform::writeFile(path, content)) { err = "write failed: " + path; return -1; }
        ++wrote;
    }
    return wrote;
}

}  // namespace se::zip

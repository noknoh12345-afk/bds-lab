#include "cxxtypes.h"

#include <cmath>
#include <cstring>
#include <unordered_set>

#include "common.h"
#include "memory.h"

namespace se::cxx {

bool readString(uintptr_t addr, std::string& out, size_t maxLen) {
    unsigned char raw[24];
    if (!mem::read(addr, raw, sizeof(raw))) return false;
    if ((raw[0] & 1) == 0) {
        size_t size = raw[0] >> 1;
        if (size > 22) return false;
        if (raw[1 + size] != 0) return false;
        const char* d = reinterpret_cast<const char*>(raw + 1);
        if (!looksLikeText(d, size, true)) return false;
        out.assign(d, size);
        return true;
    }
    uint64_t w0, size;
    uintptr_t data;
    memcpy(&w0, raw, 8);
    memcpy(&size, raw + 8, 8);
    memcpy(&data, raw + 16, 8);
    uint64_t cap = w0 & ~(uint64_t)1;
    if (cap == 0 || cap > (1ULL << 28) || size + 1 > cap || size > maxLen) return false;
    if (!mem::isPlausiblePtr(data & ~(uintptr_t)7) || size == 0) {
        // long strings are never empty in practice (they would be SSO)
        if (size != 0) return false;
    }
    std::string tmp;
    tmp.resize((size_t)size + 1);
    if (!mem::read(data, tmp.data(), (size_t)size + 1)) return false;
    if (tmp[(size_t)size] != 0) return false;
    tmp.resize((size_t)size);
    if (!looksLikeText(tmp.data(), tmp.size(), true)) return false;
    out = std::move(tmp);
    return true;
}

bool readHashedString(uintptr_t addr, std::string& out) {
    uint64_t h;
    if (!mem::read(addr, h)) return false;
    std::string s;
    if (!readString(addr + 8, s)) return false;
    if (bedrockStringHash(s.data(), s.size()) != h) return false;
    out = std::move(s);
    return true;
}

bool readVector(uintptr_t addr, Vec& v, size_t elemSize, size_t maxBytes) {
    uintptr_t w[3];
    if (!mem::read(addr, w, sizeof(w))) return false;
    v.begin = w[0];
    v.end = w[1];
    v.cap = w[2];
    if (v.begin == 0) return v.end == 0 && v.cap == 0;
    if (v.end < v.begin || v.cap < v.end) return false;
    if (v.cap - v.begin > maxBytes) return false;
    if (elemSize > 1 && ((v.end - v.begin) % elemSize || (v.cap - v.begin) % elemSize)) return false;
    if (!mem::isReadable(v.begin, 1)) return false;
    return true;
}

bool readUnorderedMap(uintptr_t addr, UMap& m) {
    unsigned char raw[40];
    if (!mem::read(addr, raw, sizeof(raw))) return false;
    memcpy(&m.buckets, raw, 8);
    memcpy(&m.bucketCount, raw + 8, 8);
    memcpy(&m.first, raw + 16, 8);
    memcpy(&m.size, raw + 24, 8);
    memcpy(&m.maxLoad, raw + 32, 4);
    if (!(m.maxLoad > 0.01f && m.maxLoad <= 64.0f)) return false;
    if (m.size > (1u << 24) || m.bucketCount > (1u << 28)) return false;
    if (m.size == 0) return m.first == 0;
    if (m.bucketCount == 0 || !mem::isPlausiblePtr(m.buckets) || !mem::isPlausiblePtr(m.first)) return false;
    return true;
}

void forEachNode(const UMap& m, const std::function<bool(uintptr_t)>& fn, size_t maxNodes) {
    uintptr_t node = m.first;
    size_t n = 0;
    while (node && n < m.size && n < maxNodes) {
        if (!mem::isPlausiblePtr(node)) break;
        if (!fn(node)) break;
        uintptr_t next;
        if (!mem::read(node, next)) break;
        node = next;
        n++;
    }
}

bool readTree(uintptr_t addr, Tree& t) {
    uintptr_t w[3];
    if (!mem::read(addr, w, sizeof(w))) return false;
    t.beginNode = w[0];
    t.root = w[1];
    t.size = w[2];
    t.endNode = addr + 8;  // &__end_node_ (its left child is the root)
    if (t.size > (1u << 24)) return false;
    if (t.size == 0) return t.root == 0 && t.beginNode == t.endNode;
    return mem::isPlausiblePtr(t.root) && mem::isPlausiblePtr(t.beginNode);
}

void forEachTreeNode(const Tree& t, const std::function<bool(uintptr_t)>& fn, size_t maxNodes) {
    // in-order traversal using parent pointers: node {left, right, parent, ...}
    uintptr_t node = t.beginNode;
    size_t n = 0;
    std::unordered_set<uintptr_t> seen;
    while (node && node != t.endNode && n < t.size && n < maxNodes) {
        if (!seen.insert(node).second) break;
        if (!fn(node)) break;
        n++;
        uintptr_t right = mem::readPtr(node + 8);
        if (right) {
            node = right;
            uintptr_t left;
            while ((left = mem::readPtr(node)) != 0 && seen.size() < maxNodes * 4) node = left;
        } else {
            uintptr_t parent = mem::readPtr(node + 16);
            while (parent && mem::readPtr(parent) != node) {
                node = parent;
                parent = mem::readPtr(node + 16);
            }
            node = parent;
        }
    }
}

bool readVec3(uintptr_t addr, Vec3& v) { return mem::read(addr, &v, sizeof(v)); }

bool plausibleCoord(float v, float limit) { return std::isfinite(v) && std::fabs(v) < limit; }

}  // namespace se::cxx

// Readers for libc++ (NDK) standard library layouts and a few Bedrock basic
// types, all built on the crash-safe memory reader.
#pragma once

#include <cstdint>
#include <functional>
#include <string>

namespace se::cxx {

// libc++ std::string (24 bytes). Validates the representation.
bool readString(uintptr_t addr, std::string& out, size_t maxLen = 1 << 16);
// Bedrock HashedString {uint64 hash; std::string str; const HashedString* lastMatch;} (40 bytes).
// Only succeeds when the stored hash matches the string, which makes false positives practically impossible.
bool readHashedString(uintptr_t addr, std::string& out);

struct Vec {
    uintptr_t begin = 0, end = 0, cap = 0;
    size_t bytes() const { return end - begin; }
    size_t count(size_t elem) const { return elem ? bytes() / elem : 0; }
};
bool readVector(uintptr_t addr, Vec& v, size_t elemSize = 1, size_t maxBytes = 256u << 20);

// libc++ std::unordered_map / unordered_set header (40 bytes).
struct UMap {
    uintptr_t buckets = 0;
    uint64_t bucketCount = 0;
    uintptr_t first = 0;
    uint64_t size = 0;
    float maxLoad = 0;
};
bool readUnorderedMap(uintptr_t addr, UMap& m);
// Node layout: {next, hash, value...}; value starts at node + 16.
void forEachNode(const UMap& m, const std::function<bool(uintptr_t node)>& fn, size_t maxNodes = 200000);

// libc++ std::map / std::set header (24 bytes): {begin_node, end_node.left (root), size}
struct Tree {
    uintptr_t beginNode = 0, root = 0, endNode = 0;
    uint64_t size = 0;
};
bool readTree(uintptr_t addr, Tree& t);
// Node layout: {left, right, parent, is_black(+pad), value...}; value starts at node + 32.
void forEachTreeNode(const Tree& t, const std::function<bool(uintptr_t node)>& fn, size_t maxNodes = 200000);

struct Vec3 {
    float x = 0, y = 0, z = 0;
};
bool readVec3(uintptr_t addr, Vec3& v);
bool plausibleCoord(float v, float limit = 3.1e7f);

}  // namespace se::cxx

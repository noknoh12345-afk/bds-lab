// Crash-safe access to the game's memory.
//
// Every speculative read goes through process_vm_readv() on our own pid (taken
// from the *host* libc because the bionic shim of mcpelauncher does not export
// it). A bad pointer therefore returns false instead of killing the game.
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace se::mem {

struct Region {
    uintptr_t start = 0, end = 0;
    bool r = false, w = false, x = false, priv = false;
    uint64_t offset = 0;
    std::string path;
    size_t size() const { return end - start; }
};
using RegionList = std::vector<Region>;

void init();
const char* backendName();

// All-or-nothing safe read.
bool read(uintptr_t addr, void* out, size_t len);
// Reads as much as possible from the start, returns the number of bytes read.
size_t readPartial(uintptr_t addr, void* out, size_t len);

template <class T>
inline bool read(uintptr_t addr, T& out) {
    return read(addr, &out, sizeof(T));
}
template <class T>
inline T readOr(uintptr_t addr, T def) {
    T v;
    return read(addr, &v, sizeof(T)) ? v : def;
}
inline uintptr_t readPtr(uintptr_t addr) { return readOr<uintptr_t>(addr, 0); }

// Snapshot of /proc/self/maps (sorted by address).
std::shared_ptr<const RegionList> regions(bool refresh = false);
// Refresh the snapshot if it is older than maxAgeMs.
void refreshRegionsIfOlder(unsigned maxAgeMs);

// Region containing addr in the current snapshot (nullptr if none).
const Region* findRegion(const RegionList& list, uintptr_t addr);
bool isReadable(uintptr_t addr, size_t len = 1);
bool isWritableData(uintptr_t addr);  // inside a rw-p mapping (heap, data)
bool isExecutable(uintptr_t addr);
// Canonical, 8-byte aligned, inside a readable mapping.
bool isPlausiblePtr(uintptr_t p);
// Same, but only rw mappings (heap objects).
bool isPlausibleHeapPtr(uintptr_t p);

// mincore() based residency query (host libc). Returns false if unsupported.
bool residency(uintptr_t pageAlignedStart, size_t len, std::vector<unsigned char>& vec);
size_t pageSize();

std::string hexdump(uintptr_t addr, size_t len);

}  // namespace se::mem

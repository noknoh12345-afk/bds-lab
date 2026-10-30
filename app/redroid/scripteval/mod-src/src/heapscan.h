// Brute-force scanning of the process heap (anonymous rw memory).
#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "memory.h"

namespace se::heap {

struct ScanOptions {
    size_t maxHits = 200000;
    bool useResidency = true;         // skip pages that were never touched (mincore)
    size_t maxRegionBytes = 64ULL << 30;  // ignore absurdly large reservations
    std::function<void(double)> progress;  // 0..1
    std::function<bool()> cancelled;
};

struct ScanStats {
    size_t regions = 0;
    size_t bytesScanned = 0;
    size_t hits = 0;
    uint64_t ms = 0;
    std::string toString() const;
};

// Anonymous, private, readable+writable mappings (malloc arenas, [heap], mmap'd chunks).
std::vector<mem::Region> heapRegions();

// Finds every 8-byte aligned word equal to one of `values`.
// Returns the addresses of the matching words.
std::vector<uintptr_t> scanValues(std::vector<uint64_t> values, const ScanOptions& opt = {},
                                  ScanStats* stats = nullptr);

// Finds every 4-byte aligned 32-bit word equal to `value` (ints, floats).
std::vector<uintptr_t> scanU32(uint32_t value, const ScanOptions& opt = {}, ScanStats* stats = nullptr);

// Finds byte sequences (e.g. a player name). Unaligned.
std::vector<uintptr_t> scanBytes(const std::string& needle, const ScanOptions& opt = {},
                                 ScanStats* stats = nullptr);

}  // namespace se::heap

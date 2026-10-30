#include "heapscan.h"

#include <sys/mman.h>

#include <algorithm>
#include <cstring>

#include "common.h"

namespace se::heap {

namespace {
constexpr size_t kChunk = 1 << 20;

struct Buffer {
    void* p = nullptr;
    size_t len = 0;
    explicit Buffer(size_t n) : len(n) {
        p = mmap(nullptr, n, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (p == MAP_FAILED) p = nullptr;
    }
    ~Buffer() {
        if (p) munmap(p, len);
    }
    uintptr_t start() const { return (uintptr_t)p; }
    uintptr_t end() const { return (uintptr_t)p + len; }
};

// Calls fn(s, e) for the parts of [s, e) that do not overlap the excluded ranges.
template <class F>
void subtractExcluded(uintptr_t s, uintptr_t e, const std::vector<std::pair<uintptr_t, uintptr_t>>& ex, F&& fn) {
    uintptr_t cur = s;
    while (cur < e) {
        uintptr_t next = e;
        bool skipped = false;
        for (auto& [xs, xe] : ex) {
            if (cur >= xs && cur < xe) {
                cur = xe;
                skipped = true;
                break;
            }
            if (xs > cur && xs < next) next = xs;
        }
        if (skipped) continue;
        fn(cur, next);
        cur = next;
    }
}

// Calls fn(runStart, runEnd) for every resident run of pages in the region.
template <class F>
void forEachResidentRun(const mem::Region& r, bool useResidency, F&& fn) {
    if (!useResidency) {
        fn(r.start, r.end);
        return;
    }
    const size_t ps = mem::pageSize();
    const size_t window = 1ULL << 30;  // query mincore 1GB at a time
    std::vector<unsigned char> vec;
    for (uintptr_t base = r.start; base < r.end; base += window) {
        size_t len = std::min<size_t>(window, r.end - base);
        if (!mem::residency(base, len, vec)) {
            fn(base, base + len);
            continue;
        }
        size_t pages = vec.size();
        size_t i = 0;
        while (i < pages) {
            while (i < pages && !(vec[i] & 1)) i++;
            size_t j = i;
            while (j < pages && (vec[j] & 1)) j++;
            if (j > i) fn(base + i * ps, std::min<uintptr_t>(base + j * ps, r.end));
            i = j;
        }
    }
}
}  // namespace

std::string ScanStats::toString() const {
    return strprintf("%zu regions, %.1f MB scanned, %zu hits, %llu ms", regions, bytesScanned / 1048576.0, hits,
                     (unsigned long long)ms);
}

std::vector<mem::Region> heapRegions() {
    std::vector<mem::Region> out;
    auto list = mem::regions(true);
    for (auto& r : *list) {
        if (!r.r || !r.w || !r.priv) continue;
        bool anon = r.path.empty() || r.path == "[heap]" || startsWith(r.path, "[anon");
        if (!anon) continue;
        if (r.path == "[stack]") continue;
        out.push_back(r);
    }
    return out;
}

std::vector<uintptr_t> scanValues(std::vector<uint64_t> values, const ScanOptions& opt, ScanStats* stats) {
    std::vector<uintptr_t> hits;
    if (values.empty()) return hits;
    std::sort(values.begin(), values.end());
    values.erase(std::unique(values.begin(), values.end()), values.end());
    const uint64_t lo = values.front(), span = values.back() - values.front();
    // Keep the needle list out of the scanned memory: copy it into its own mapping.
    Buffer needles(std::max<size_t>(values.size() * 8, 4096));
    Buffer buf(kChunk);
    if (!needles.p || !buf.p) return hits;
    memcpy(needles.p, values.data(), values.size() * 8);
    const uint64_t* nv = (const uint64_t*)needles.p;
    const size_t nn = values.size();
    // wipe our local copy so the vector's heap buffer does not match either
    std::fill(values.begin(), values.end(), 0);

    uint64_t t0 = nowMs();
    auto regs = heapRegions();
    size_t total = 0;
    for (auto& r : regs) total += std::min(r.size(), opt.maxRegionBytes);
    size_t done = 0;
    ScanStats st;
    const std::vector<std::pair<uintptr_t, uintptr_t>> excluded = {{buf.start(), buf.end()},
                                                                    {needles.start(), needles.end()}};
    for (auto& r : regs) {
        if (r.size() > opt.maxRegionBytes) continue;
        st.regions++;
        forEachResidentRun(r, opt.useResidency, [&](uintptr_t s0, uintptr_t e0) {
          subtractExcluded(s0, e0, excluded, [&](uintptr_t s, uintptr_t e) {
            for (uintptr_t a = s; a < e && hits.size() < opt.maxHits; a += kChunk) {
                if (opt.cancelled && opt.cancelled()) return;
                size_t len = std::min<size_t>(kChunk, e - a);
                size_t got = mem::readPartial(a, buf.p, len);
                st.bytesScanned += got;
                const uint64_t* w = (const uint64_t*)buf.p;
                size_t nw = got / 8;
                if (nn == 1) {
                    for (size_t i = 0; i < nw; i++)
                        if (w[i] == lo) hits.push_back(a + i * 8);
                } else {
                    for (size_t i = 0; i < nw; i++) {
                        uint64_t v = w[i];
                        if (v - lo > span) continue;
                        if (std::binary_search(nv, nv + nn, v)) hits.push_back(a + i * 8);
                    }
                }
            }
          });
        });
        done += r.size();
        if (opt.progress && total) opt.progress((double)done / (double)total);
        if (hits.size() >= opt.maxHits || (opt.cancelled && opt.cancelled())) break;
    }
    if (hits.size() > opt.maxHits) hits.resize(opt.maxHits);
    st.hits = hits.size();
    st.ms = nowMs() - t0;
    if (stats) *stats = st;
    return hits;
}

std::vector<uintptr_t> scanBytes(const std::string& needle, const ScanOptions& opt, ScanStats* stats) {
    std::vector<uintptr_t> hits;
    if (needle.empty() || needle.size() > 4096) return hits;
    Buffer buf(kChunk + 4096);
    Buffer nd(4096 * 2);
    if (!buf.p || !nd.p) return hits;
    memcpy(nd.p, needle.data(), needle.size());
    const char* n = (const char*)nd.p;
    const size_t nl = needle.size();
    uint64_t t0 = nowMs();
    ScanStats st;
    const std::vector<std::pair<uintptr_t, uintptr_t>> excluded = {{buf.start(), buf.end()},
                                                                    {nd.start(), nd.end()}};
    for (auto& r : heapRegions()) {
        if (r.size() > opt.maxRegionBytes) continue;
        st.regions++;
        forEachResidentRun(r, opt.useResidency, [&](uintptr_t s0, uintptr_t e0) {
          subtractExcluded(s0, e0, excluded, [&](uintptr_t s, uintptr_t e) {
            for (uintptr_t a = s; a < e && hits.size() < opt.maxHits; a += kChunk) {
                size_t len = std::min<size_t>(kChunk + nl - 1, e - a);
                size_t got = mem::readPartial(a, buf.p, len);
                st.bytesScanned += std::min(got, kChunk);
                const char* h = (const char*)buf.p;
                size_t pos = 0;
                while (got >= nl && pos + nl <= got) {
                    const void* f = memchr(h + pos, n[0], got - nl + 1 - pos);
                    if (!f) break;
                    size_t at = (size_t)((const char*)f - h);
                    if (at >= kChunk) break;  // belongs to the next chunk
                    if (memcmp(h + at, n, nl) == 0) hits.push_back(a + at);
                    pos = at + 1;
                }
            }
          });
        });
        if (hits.size() >= opt.maxHits) break;
    }
    if (hits.size() > opt.maxHits) hits.resize(opt.maxHits);
    st.hits = hits.size();
    st.ms = nowMs() - t0;
    if (stats) *stats = st;
    return hits;
}

std::vector<uintptr_t> scanU32(uint32_t value, const ScanOptions& opt, ScanStats* stats) {
    std::vector<uintptr_t> hits;
    Buffer buf(kChunk);
    if (!buf.p) return hits;
    uint64_t t0 = nowMs();
    ScanStats st;
    const std::vector<std::pair<uintptr_t, uintptr_t>> excluded = {{buf.start(), buf.end()}};
    for (auto& r : heapRegions()) {
        if (r.size() > opt.maxRegionBytes) continue;
        st.regions++;
        forEachResidentRun(r, opt.useResidency, [&](uintptr_t s0, uintptr_t e0) {
          subtractExcluded(s0, e0, excluded, [&](uintptr_t s, uintptr_t e) {
            for (uintptr_t a = s; a < e && hits.size() < opt.maxHits; a += kChunk) {
                if (opt.cancelled && opt.cancelled()) return;
                size_t len = std::min<size_t>(kChunk, e - a);
                size_t got = mem::readPartial(a, buf.p, len);
                st.bytesScanned += got;
                const uint32_t* w = (const uint32_t*)buf.p;
                size_t nw = got / 4;
                for (size_t i = 0; i < nw; i++)
                    if (w[i] == value) hits.push_back(a + i * 4);
            }
          });
        });
        if (hits.size() >= opt.maxHits || (opt.cancelled && opt.cancelled())) break;
    }
    if (hits.size() > opt.maxHits) hits.resize(opt.maxHits);
    st.hits = hits.size();
    st.ms = nowMs() - t0;
    if (stats) *stats = st;
    return hits;
}

}  // namespace se::heap

#include "ecs.h"

#include <algorithm>
#include <unordered_set>

#include "common.h"
#include "cxxtypes.h"
#include "memory.h"
#include "rtti.h"

namespace se::ecs {

std::string componentFromStorageName(const std::string& n) {
    static const std::string prefix = "entt::basic_storage<";
    size_t at = n.find(prefix);
    if (at == std::string::npos) return "";
    int depth = 0;
    size_t i = at + prefix.size();
    size_t start = i;
    for (; i < n.size(); i++) {
        char c = n[i];
        if (c == '<' || c == '(' || c == '[') depth++;
        else if (c == '>' || c == ')' || c == ']') {
            if (depth == 0) break;
            depth--;
        } else if (c == ',' && depth == 0)
            break;
    }
    std::string comp = n.substr(start, i - start);
    while (!comp.empty() && comp.back() == ' ') comp.pop_back();
    return comp;
}

bool Registry::readLayout(Storage& s) const {
    cxx::Vec sparse, packed, payload;
    bool sparseOk = cxx::readVector(s.addr + s.sparseOff, sparse, 8);
    bool packedOk = cxx::readVector(s.addr + s.packedOff, packed, 4);
    if (!sparseOk || !packedOk) {
        // search for a different layout: two consecutive vectors (pointers, then uint32)
        bool found = false;
        for (uint32_t off = 8; off + 48 <= 200 && !found; off += 8) {
            if (cxx::readVector(s.addr + off, sparse, 8) && cxx::readVector(s.addr + off + 24, packed, 4) &&
                (sparse.begin || packed.begin)) {
                s.sparseOff = off;
                s.packedOff = off + 24;
                s.payloadOff = off + 24 + 48;
                found = true;
            }
        }
        if (!found) return false;
    }
    if (cxx::readVector(s.addr + s.payloadOff, payload, 8) && (payload.begin == 0 || mem::isReadable(payload.begin))) {
        size_t n = packed.count(4);
        size_t pages = payload.count(8);
        size_t need = (n + traits.packedPage - 1) / traits.packedPage;
        s.empty = !(pages >= need && pages <= need + 4096);
        if (n == 0 && pages == 0) s.empty = false;
    } else {
        s.empty = true;
    }
    return true;
}

bool Registry::load(uintptr_t registryAddr) {
    addr = registryAddr;
    storages.clear();
    byName.clear();
    auto& rt = rtti();
    if (!rt.ready()) return false;
    // The pools live in ONE vector of the registry (dense_map<id, shared_ptr<base>> packed nodes).
    // Look at the vectors referenced by the first words of the registry and keep the one that
    // references the most component storages. (Scanning further could run into a neighbouring
    // registry allocated right after this one.)
    // A registry has one pool per component type: a "vector" that lists the same component twice
    // is a misread spanning into another registry's nodes (e.g. a UI preview player's registry
    // allocated next to this one), so such candidates only win when nothing clean was found.
    std::vector<uintptr_t> buf;
    std::vector<Storage> best;
    bool bestClean = false;
    for (uint32_t k = 0; k < 40; k++) {
        cxx::Vec v;
        if (!cxx::readVector(registryAddr + k * 8, v, 8, 1u << 22)) continue;
        if (!v.begin || v.bytes() < 8) continue;
        buf.resize(v.bytes() / 8);
        size_t got = mem::readPartial(v.begin, buf.data(), v.bytes());
        std::vector<Storage> found;
        std::unordered_set<uintptr_t> seen;
        for (size_t i = 0; i < got / 8; i++) {
            uintptr_t p = buf[i];
            if (!mem::isPlausibleHeapPtr(p) || seen.count(p)) continue;
            seen.insert(p);
            Rtti::Classified c;
            if (!rt.classify(p, c) || c.object != p) continue;
            // the storage itself (or an entt mixin wrapping it) - not e.g. the shared_ptr control block
            if (!startsWith(c.ti->name, "entt::") || c.ti->name.find("basic_storage<") == std::string::npos) continue;
            Storage s;
            s.addr = p;
            s.storageType = c.ti->name;
            s.component = componentFromStorageName(c.ti->name);
            if (s.component.empty()) continue;
            // skip the entity storage itself (basic_storage<EntityId, EntityId>)
            if (contains(s.storageType, "basic_storage<" + s.component + ", " + s.component)) continue;
            found.push_back(std::move(s));
        }
        std::unordered_set<std::string> names;
        bool clean = true;
        for (auto& s : found) clean = names.insert(s.component).second && clean;
        if ((clean && !bestClean && !found.empty()) || (clean == bestClean && found.size() > best.size())) {
            best = std::move(found);
            bestClean = clean;
        }
    }
    for (auto& s : best) {
        if (!readLayout(s)) continue;
        // entt::type_info alias (seq, id, string_view)
        uintptr_t desc = mem::readPtr(s.addr + s.packedOff + 24);
        if (desc && mem::isPlausiblePtr(desc)) {
            uintptr_t aptr = mem::readPtr(desc + 8);
            uint64_t alen = mem::readOr<uint64_t>(desc + 16, 0);
            if (aptr && alen > 0 && alen < 512) {
                std::string a(alen, '\0');
                if (mem::read(aptr, a.data(), alen) && looksLikeText(a.data(), a.size())) s.alias = a;
            }
        }
        storages.push_back(std::move(s));
    }
    std::sort(storages.begin(), storages.end(), [](auto& a, auto& b) { return a.component < b.component; });
    for (size_t i = 0; i < storages.size(); i++) byName.emplace(storages[i].component, i);
    return !storages.empty();
}

const Storage* Registry::find(std::string_view component) const {
    auto it = byName.find(component);
    if (it != byName.end()) return &storages[it->second];
    // allow lookups without namespace / "struct " prefix
    for (auto& s : storages) {
        std::string_view c = s.component;
        size_t p = c.rfind("::");
        if (p != std::string_view::npos && c.substr(p + 2) == component) return &s;
    }
    return nullptr;
}

size_t Registry::size(const Storage& s) const {
    cxx::Vec packed;
    if (!cxx::readVector(s.addr + s.packedOff, packed, 4)) return 0;
    return packed.count(4);
}

bool Registry::entityAt(const Storage& s, size_t index, uint32_t& e) const {
    uintptr_t begin = mem::readPtr(s.addr + s.packedOff);
    return begin && mem::read(begin + index * 4, e);
}

int64_t Registry::indexOf(const Storage& s, uint32_t entity) const {
    // fast path: sparse array lookup
    uint32_t idx = entity & traits.entityMask;
    cxx::Vec sparse;
    if (cxx::readVector(s.addr + s.sparseOff, sparse, 8)) {
        size_t page = idx / traits.sparsePage;
        if (page < sparse.count(8)) {
            uintptr_t pagePtr = mem::readPtr(sparse.begin + page * 8);
            if (pagePtr) {
                uint32_t v = 0;
                if (mem::read(pagePtr + (idx % traits.sparsePage) * 4, v)) {
                    uint32_t pos = v & traits.entityMask;
                    uint32_t e = 0;
                    if (pos != traits.entityMask && entityAt(s, pos, e) && e == entity) return pos;
                }
            }
        }
    }
    // slow path: linear search of the packed array
    cxx::Vec packed;
    if (!cxx::readVector(s.addr + s.packedOff, packed, 4)) return -1;
    size_t n = packed.count(4);
    if (n == 0 || n > (1u << 22)) return -1;
    std::vector<uint32_t> ids(n);
    if (mem::readPartial(packed.begin, ids.data(), n * 4) != n * 4) return -1;
    for (size_t i = 0; i < n; i++)
        if (ids[i] == entity) return (int64_t)i;
    return -1;
}

uintptr_t Registry::componentAt(const Storage& s, size_t index) const {
    if (s.empty || !s.elemSize) return 0;
    cxx::Vec payload;
    if (!cxx::readVector(s.addr + s.payloadOff, payload, 8)) return 0;
    size_t page = index / traits.packedPage;
    if (page >= payload.count(8)) return 0;
    uintptr_t pagePtr = mem::readPtr(payload.begin + page * 8);
    if (!pagePtr) return 0;
    return pagePtr + (index % traits.packedPage) * s.elemSize;
}

uintptr_t Registry::get(const Storage& s, uint32_t entity) const {
    int64_t i = indexOf(s, entity);
    return i < 0 ? 0 : componentAt(s, (size_t)i);
}

uintptr_t Registry::get(std::string_view component, uint32_t entity) const {
    auto* s = find(component);
    return s ? get(*s, entity) : 0;
}

bool Registry::has(std::string_view component, uint32_t entity) const {
    auto* s = find(component);
    return s && indexOf(*s, entity) >= 0;
}

std::vector<uint32_t> Registry::entities(const Storage& s, size_t limit) const {
    std::vector<uint32_t> out;
    cxx::Vec packed;
    if (!cxx::readVector(s.addr + s.packedOff, packed, 4)) return out;
    size_t n = std::min(packed.count(4), limit);
    out.resize(n);
    if (mem::readPartial(packed.begin, out.data(), n * 4) != n * 4) out.clear();
    out.erase(std::remove_if(out.begin(), out.end(), [&](uint32_t e) { return isTombstone(e); }), out.end());
    return out;
}

bool Registry::locate(uintptr_t addr, Location& out) const {
    for (auto& s : storages) {
        if (s.empty || !s.elemSize) continue;
        cxx::Vec payload;
        if (!cxx::readVector(s.addr + s.payloadOff, payload, 8, 1u << 16)) continue;
        const size_t pageBytes = (size_t)traits.packedPage * s.elemSize;
        size_t pages = payload.count(8);
        std::vector<uintptr_t> ptrs(pages);
        if (pages && mem::readPartial(payload.begin, ptrs.data(), pages * 8) != pages * 8) continue;
        for (size_t p = 0; p < pages; p++) {
            uintptr_t page = ptrs[p];
            if (!page || addr < page || addr >= page + pageBytes) continue;
            size_t index = p * traits.packedPage + (addr - page) / s.elemSize;
            if (index >= size(s)) return false;  // free slot at the end of the last page
            cxx::Vec packed;
            uint32_t e = 0;
            if (!cxx::readVector(s.addr + s.packedOff, packed, 4) || !mem::read(packed.begin + index * 4, e))
                return false;
            out.storage = &s;
            out.entity = e;
            out.index = index;
            out.component = page + ((addr - page) / s.elemSize) * s.elemSize;
            out.offset = (uint32_t)(addr - out.component);
            return true;
        }
    }
    return false;
}

std::vector<const Storage*> Registry::componentsOf(uint32_t entity) const {
    std::vector<const Storage*> out;
    for (auto& s : storages)
        if (indexOf(s, entity) >= 0) out.push_back(&s);
    return out;
}

void Registry::setElemSize(std::string_view component, uint32_t size) {
    auto it = byName.find(component);
    if (it == byName.end()) return;
    auto& s = storages[it->second];
    s.elemSize = size;
    s.sizeKnown = size != 0;
}

bool Registry::inferElemSize(Storage& s) const {
    if (s.empty || !allocatorHeadersUsable) return false;
    cxx::Vec payload;
    if (!cxx::readVector(s.addr + s.payloadOff, payload, 8) || payload.count(8) == 0) return false;
    uintptr_t page = mem::readPtr(payload.begin);
    if (!page) return false;
    uint64_t hdr = mem::readOr<uint64_t>(page - 8, 0);
    if (hdr & 2) return false;  // mmapped chunk: size includes page rounding
    uint64_t cs = hdr & ~(uint64_t)7;
    if (cs < 32 || cs > (64u << 20)) return false;
    uint64_t P = traits.packedPage;
    uint64_t S = (cs - 8) / P;
    if (S == 0 || S * P <= cs - 24 || S > 65536) return false;
    s.elemSize = (uint32_t)S;
    s.sizeKnown = true;
    return true;
}

}  // namespace se::ecs

// Reader for Bedrock's EnTT based entity component system.
//
// Bedrock keeps most per-entity state (position, rotation, identifiers,
// synched data, attributes...) in EnTT component pools. Every pool is an
// `entt::basic_storage<Component, EntityId, ...>` object, which is polymorphic,
// so its RTTI name tells us the component type. From an actor's EntityContext we
// get the registry, enumerate its pools, and can then read any component of any
// entity by name.
#pragma once

#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <string_view>
#include <vector>

namespace se::ecs {

struct Storage {
    uintptr_t addr = 0;
    std::string component;   // "StateVectorComponent"
    std::string storageType; // demangled storage class
    std::string alias;       // entt::type_info alias, if readable
    uint32_t elemSize = 0;   // bytes per component, 0 = empty/unknown
    bool sizeKnown = false;
    bool empty = false;      // tag component (no payload)
    // offsets of the internal vectors inside the storage object
    uint32_t sparseOff = 8, packedOff = 32, payloadOff = 80;
};

struct EntityTraits {
    uint32_t entityMask = 0x3FFFF;  // 18 bits (Bedrock EntityIdTraits)
    uint32_t versionShift = 18;
    uint32_t versionMask = 0x3FFF;
    uint32_t sparsePage = 2048;  // ENTT_SPARSE_PAGE
    uint32_t packedPage = 128;   // ENTT_PACKED_PAGE
};

class Registry {
public:
    uintptr_t addr = 0;
    EntityTraits traits;
    std::vector<Storage> storages;
    std::map<std::string, size_t, std::less<>> byName;

    // Discovers all pools of the registry. Requires the RTTI index.
    bool load(uintptr_t registryAddr);
    const Storage* find(std::string_view component) const;

    size_t size(const Storage& s) const;
    bool entityAt(const Storage& s, size_t index, uint32_t& e) const;
    bool isTombstone(uint32_t e) const { return ((e >> traits.versionShift) & traits.versionMask) == traits.versionMask; }
    // Packed index of the entity, -1 if absent.
    int64_t indexOf(const Storage& s, uint32_t entity) const;
    uintptr_t componentAt(const Storage& s, size_t index) const;
    // Address of the component for the entity (0 if absent / empty type).
    uintptr_t get(const Storage& s, uint32_t entity) const;
    uintptr_t get(std::string_view component, uint32_t entity) const;
    bool has(std::string_view component, uint32_t entity) const;
    // All live entities of a pool.
    std::vector<uint32_t> entities(const Storage& s, size_t limit = 1u << 20) const;
    std::vector<const Storage*> componentsOf(uint32_t entity) const;

    // Which component (of which entity) contains `addr`, if any.
    struct Location {
        const Storage* storage = nullptr;
        uint32_t entity = 0;
        size_t index = 0;
        uintptr_t component = 0;  // start of the component
        uint32_t offset = 0;      // addr - component
    };
    bool locate(uintptr_t addr, Location& out) const;

    // Element size management
    void setElemSize(std::string_view component, uint32_t size);
    // Try to infer the element size from the allocator chunk header (glibc).
    bool inferElemSize(Storage& s) const;
    bool allocatorHeadersUsable = false;

private:
    bool readLayout(Storage& s) const;
};

std::string componentFromStorageName(const std::string& demangled);

}  // namespace se::ecs

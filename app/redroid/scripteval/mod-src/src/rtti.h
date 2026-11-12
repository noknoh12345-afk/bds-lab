// Index of every polymorphic class in libminecraftpe.so, built from the
// Itanium C++ ABI RTTI records (type_info objects + vtables).
//
// This is the backbone of ScriptEval: with it we can tell the dynamic type of
// any object in memory ("this pointer is a LocalPlayer"), find vtables by
// class name and walk the inheritance graph - without any symbols.
#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "module.h"

namespace se {

enum class TiKind : uint8_t { Class = 0, Si = 1, Vmi = 2 };

struct TypeInfoRec {
    uintptr_t addr = 0;      // address of the type_info object
    uintptr_t nameAddr = 0;  // mangled name (in .rodata)
    std::string mangled;     // "11LocalPlayer"
    std::string name;        // "LocalPlayer" (demangled)
    TiKind kind = TiKind::Class;
    std::vector<uintptr_t> bases;  // direct bases (type_info addresses)
    std::vector<long> baseFlags;   // vmi offset_flags (offset << 8 | flags)
    std::vector<uint32_t> children;  // indices of direct subclasses
};

// The raw vptr values are stored XOR-encoded so that heap scans for vptrs do
// not find our own index structures.
constexpr uintptr_t kPtrKey = 0x5ec1a55e5ec1a55eULL;

struct VTableRec {
    uintptr_t apEnc = 0;  // address point (encoded) - what objects store as their vptr
    uintptr_t typeInfo = 0;
    int64_t offsetToTop = 0;
    uint32_t slots = 0;  // number of consecutive code pointers
    uintptr_t addressPoint() const { return apEnc ^ kPtrKey; }
};

class Rtti {
public:
    bool build(const Module& m);
    bool ready() const { return ready_.load(); }
    const Module& module() const { return mod_; }

    const TypeInfoRec* byAddr(uintptr_t ti) const;
    const TypeInfoRec* byMangled(std::string_view mangled) const;
    // Exact demangled name ("LocalPlayer", "entt::basic_storage<...>")
    const TypeInfoRec* byName(std::string_view name) const;
    // Mangled ("11LocalPlayer") or demangled name.
    const TypeInfoRec* find(std::string_view nameOrMangled) const;
    std::vector<const TypeInfoRec*> search(std::string_view substr, size_t limit) const;

    const VTableRec* vtableAt(uintptr_t vptr) const;
    std::vector<const VTableRec*> vtablesOf(uintptr_t ti) const;
    const VTableRec* primaryVtable(uintptr_t ti) const;

    bool derivesFrom(uintptr_t ti, uintptr_t baseTi) const;
    bool derivesFrom(uintptr_t ti, std::string_view baseName) const;
    // ti of the base and every class deriving from it.
    std::vector<uintptr_t> withDerived(uintptr_t baseTi) const;
    std::vector<std::string> baseChain(uintptr_t ti) const;

    struct Classified {
        const TypeInfoRec* ti = nullptr;
        const VTableRec* vt = nullptr;
        uintptr_t object = 0;  // full object address (addr + offsetToTop)
    };
    // Reads the vptr at `addr` and resolves it. Works for sub-objects too.
    bool classify(uintptr_t addr, Classified& out) const;
    // Quick test for a value that may be a vptr.
    bool isVptr(uintptr_t v) const;

    size_t typeCount() const { return types_.size(); }
    size_t vtableCount() const { return vtables_.size(); }
    std::string summary() const;
    uintptr_t tiVptr(TiKind k) const { return tiVptr_[(int)k]; }

private:
    bool scanTypeInfos();
    void scanVtables();
    void linkHierarchy();

    Module mod_;
    std::atomic<bool> ready_{false};
    std::vector<TypeInfoRec> types_;
    std::unordered_map<uintptr_t, uint32_t> tiIndex_;
    std::unordered_map<std::string, uint32_t> mangledIndex_;
    std::unordered_map<std::string, uint32_t> nameIndex_;
    std::vector<VTableRec> vtables_;
    std::unordered_map<uintptr_t, uint32_t> vtIndex_;
    std::unordered_map<uintptr_t, std::vector<uint32_t>> vtByType_;
    uintptr_t vtMinEnc_ = 0, vtMaxEnc_ = 0;  // encoded bounds
    uintptr_t tiVptr_[3] = {0, 0, 0};
};

Rtti& rtti();
// Builds the global index once (thread-safe). Returns false if the game library is missing.
bool ensureRtti(std::string* error = nullptr);
std::string demangle(const std::string& mangledTypeName);

}  // namespace se

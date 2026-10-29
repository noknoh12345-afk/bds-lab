// Location and layout of libminecraftpe.so in memory.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace se {

struct Range {
    uintptr_t start = 0, end = 0;
    bool contains(uintptr_t a) const { return a >= start && a < end; }
    size_t size() const { return end - start; }
};

struct Module {
    std::string path;
    uintptr_t base = 0;  // load bias
    std::vector<Range> loads;
    std::vector<Range> exec;    // executable code
    std::vector<Range> rodata;  // read-only data (type name strings)
    std::vector<Range> relro;   // .data.rel.ro / .data (typeinfo objects, vtables)
    std::vector<Range> writable;
    bool fromSections = false;

    bool inExec(uintptr_t a) const;
    bool inRodata(uintptr_t a) const;
    bool inRelro(uintptr_t a) const;
    bool inModule(uintptr_t a) const;
    std::string describe() const;
};

// Finds a loaded library by file name (e.g. "libminecraftpe.so").
bool findModule(const char* soname, Module& out);

}  // namespace se

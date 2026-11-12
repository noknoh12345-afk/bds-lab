#include "module.h"

#include <elf.h>
#include <fcntl.h>
#include <link.h>
#include <unistd.h>

#include <algorithm>
#include <cstring>

#include "common.h"
#include "memory.h"

namespace se {

static bool inAny(const std::vector<Range>& v, uintptr_t a) {
    for (auto& r : v)
        if (r.contains(a)) return true;
    return false;
}

bool Module::inExec(uintptr_t a) const { return inAny(exec, a); }
bool Module::inRodata(uintptr_t a) const { return inAny(rodata, a); }
bool Module::inRelro(uintptr_t a) const { return inAny(relro, a); }
bool Module::inModule(uintptr_t a) const { return inAny(loads, a); }

std::string Module::describe() const {
    auto sum = [](const std::vector<Range>& v) {
        size_t s = 0;
        for (auto& r : v) s += r.size();
        return s;
    };
    return strprintf("%s base=%s text=%zuKB rodata=%zuKB relro=%zuKB (%s)", path.c_str(), hex(base).c_str(),
                     sum(exec) / 1024, sum(rodata) / 1024, sum(relro) / 1024,
                     fromSections ? "sections" : "segments");
}

namespace {
struct IterCtx {
    const char* soname;
    Module* mod;
    bool found;
    std::vector<ElfW(Phdr)> phdrs;
};

const char* baseName(const char* p) {
    if (!p) return "";
    const char* s = strrchr(p, '/');
    return s ? s + 1 : p;
}

int phdrCallback(struct dl_phdr_info* info, size_t, void* data) {
    auto* ctx = static_cast<IterCtx*>(data);
    if (!info->dlpi_name || strcmp(baseName(info->dlpi_name), ctx->soname) != 0) return 0;
    ctx->mod->path = info->dlpi_name;
    ctx->mod->base = (uintptr_t)info->dlpi_addr;
    ctx->phdrs.assign(info->dlpi_phdr, info->dlpi_phdr + info->dlpi_phnum);
    ctx->found = true;
    return 1;
}

bool preadAll(int fd, void* buf, size_t len, off_t off) {
    size_t done = 0;
    while (done < len) {
        ssize_t r = pread(fd, (char*)buf + done, len - done, off + (off_t)done);
        if (r <= 0) return false;
        done += (size_t)r;
    }
    return true;
}

bool loadSections(Module& m) {
    int fd = open(m.path.c_str(), O_RDONLY);
    if (fd < 0) return false;
    ElfW(Ehdr) eh;
    bool ok = preadAll(fd, &eh, sizeof(eh), 0) && memcmp(eh.e_ident, ELFMAG, SELFMAG) == 0 && eh.e_shoff &&
              eh.e_shnum && eh.e_shentsize == sizeof(ElfW(Shdr)) && eh.e_shstrndx < eh.e_shnum;
    if (!ok) {
        close(fd);
        return false;
    }
    std::vector<ElfW(Shdr)> sh(eh.e_shnum);
    if (!preadAll(fd, sh.data(), sh.size() * sizeof(ElfW(Shdr)), (off_t)eh.e_shoff)) {
        close(fd);
        return false;
    }
    auto& strsh = sh[eh.e_shstrndx];
    std::vector<char> strtab(strsh.sh_size + 1, 0);
    if (!preadAll(fd, strtab.data(), strsh.sh_size, (off_t)strsh.sh_offset)) {
        close(fd);
        return false;
    }
    close(fd);
    for (auto& s : sh) {
        if (s.sh_name >= strsh.sh_size || !(s.sh_flags & SHF_ALLOC) || s.sh_size == 0) continue;
        std::string name = strtab.data() + s.sh_name;
        Range r{m.base + (uintptr_t)s.sh_addr, m.base + (uintptr_t)s.sh_addr + (uintptr_t)s.sh_size};
        if (name == ".text") m.exec.push_back(r);
        else if (name == ".rodata" || startsWith(name, ".rodata.")) m.rodata.push_back(r);
        else if (name == ".data.rel.ro" || startsWith(name, ".data.rel.ro.") || name == ".data")
            m.relro.push_back(r);
    }
    m.fromSections = !m.exec.empty() && !m.rodata.empty() && !m.relro.empty();
    if (!m.fromSections) {
        m.exec.clear();
        m.rodata.clear();
        m.relro.clear();
    }
    return m.fromSections;
}
}  // namespace

bool findModule(const char* soname, Module& out) {
    out = Module{};
    IterCtx ctx{soname, &out, false, {}};
    dl_iterate_phdr(phdrCallback, &ctx);

    if (ctx.found) {
        uintptr_t relroStart = 0, relroEnd = 0;
        for (auto& p : ctx.phdrs)
            if (p.p_type == PT_GNU_RELRO) {
                relroStart = out.base + (uintptr_t)p.p_vaddr;
                relroEnd = relroStart + (uintptr_t)p.p_memsz;
            }
        for (auto& p : ctx.phdrs) {
            if (p.p_type != PT_LOAD) continue;
            Range r{out.base + (uintptr_t)p.p_vaddr, out.base + (uintptr_t)p.p_vaddr + (uintptr_t)p.p_memsz};
            out.loads.push_back(r);
            if (p.p_flags & PF_W) out.writable.push_back(r);
        }
        if (!loadSections(out)) {
            for (auto& p : ctx.phdrs) {
                if (p.p_type != PT_LOAD) continue;
                Range r{out.base + (uintptr_t)p.p_vaddr, out.base + (uintptr_t)p.p_vaddr + (uintptr_t)p.p_memsz};
                if (p.p_flags & PF_X) out.exec.push_back(r);
                else if (p.p_flags & PF_W) out.relro.push_back(r);
                else out.rodata.push_back(r);
            }
            if (relroEnd > relroStart) {
                // prefer the precise RELRO range when it exists
                out.relro.insert(out.relro.begin(), Range{relroStart, relroEnd});
            }
        }
    } else {
        // Fallback: /proc/self/maps
        auto list = mem::regions(true);
        for (auto& r : *list) {
            if (!endsWith(r.path, std::string("/") + soname)) continue;
            if (out.path.empty()) {
                out.path = r.path;
                out.base = r.start - (uintptr_t)r.offset;
            }
            Range rg{r.start, r.end};
            out.loads.push_back(rg);
            if (r.x) out.exec.push_back(rg);
            else if (r.w) {
                out.writable.push_back(rg);
                out.relro.push_back(rg);
            } else out.rodata.push_back(rg);
        }
        if (out.path.empty()) return false;
    }
    // Clip ranges to what is actually mapped & readable.
    auto clip = [](std::vector<Range>& v) {
        std::vector<Range> res;
        auto list = mem::regions();
        if (list->empty()) return;  // no region info on this host: keep the ELF ranges as they are
        for (auto& r : v) {
            uintptr_t a = r.start;
            while (a < r.end) {
                const mem::Region* reg = mem::findRegion(*list, a);
                if (!reg) {
                    // skip to the next mapped region
                    uintptr_t next = r.end;
                    for (auto& x : *list)
                        if (x.start > a) {
                            next = std::min(next, x.start);
                            break;
                        }
                    a = next;
                    continue;
                }
                uintptr_t e = std::min(r.end, reg->end);
                if (reg->r) res.push_back(Range{a, e});
                a = e;
            }
        }
        v = std::move(res);
    };
    clip(out.exec);
    clip(out.rodata);
    clip(out.relro);
    // .data may contain vtables too (when not split); also accept writable segments without RELRO
    return !out.loads.empty();
}

}  // namespace se

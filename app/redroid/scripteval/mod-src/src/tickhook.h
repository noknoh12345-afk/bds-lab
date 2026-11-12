// Main-thread "tick" hook.
//
// To run scripts at a well defined point of the game loop (consistent reads,
// safe calls into the game, real ticks for system.runInterval) we need a
// callback on the client thread once per game tick. There are no symbols, so we
// find one empirically: every slot of the LocalPlayer vtable is temporarily
// replaced by a tiny counting stub, and after a short sampling window the slot
// that is called ~20 times per second (the tick rate) is kept with a
// transparent pre-call hook. All other slots are restored.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace se::tick {

struct SlotStat {
    int slot = -1;
    uint64_t calls = 0;
    uintptr_t thread = 0;
    double hz = 0;
};

struct ProfileResult {
    bool ok = false;
    int chosen = -1;
    double seconds = 0;
    std::vector<SlotStat> busy;  // slots that were called at all
    std::string report;
};

// Profiles the primary vtable `vptr` (with `slots` entries) and installs the
// hook on the best ~20 Hz slot. Only calls whose `this` is `target` are counted
// (other objects sharing the vtable, e.g. a UI preview player, are ignored).
// Blocks for ~sampleMs.
ProfileResult installOnVtable(uintptr_t vptr, uint32_t slots, unsigned sampleMs, uintptr_t excludeThread,
                              uintptr_t target);

// Install the pre-hook directly on a known slot.
bool installOnSlot(uintptr_t vptr, int slot);

bool installed();
int installedSlot();
// A tick was observed during the last `ms` milliseconds.
bool tickingRecently(unsigned ms = 400);
uint64_t ticks();
uintptr_t mainThread();
bool onMainThread();

// Called once per game tick on the game thread (inside the hooked function).
using TickFn = void (*)(void* self);
void setTickCallback(TickFn fn);

// Remember the render thread (from the swap buffers callback) so it can be excluded.
void noteRenderThread(uintptr_t tag);
uintptr_t renderThread();

}  // namespace se::tick

// Experimental block access (dimension.getBlock) by calling the game's own
// IConstBlockSource::getBlock(BlockPos const&) virtual function on the game
// thread. Only used when the tick hook is active.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace se::blocks {

struct BlockInfo {
    uintptr_t block = 0;
    std::string typeId;
    uint32_t runtimeId = 0;
    std::vector<std::string> tags;
};

bool getBlock(int x, int y, int z, BlockInfo& out, std::string* err);
// Index of getBlock(BlockPos const&) in the BlockSource vtable (default 2).
void setGetBlockSlot(int slot);

}  // namespace se::blocks

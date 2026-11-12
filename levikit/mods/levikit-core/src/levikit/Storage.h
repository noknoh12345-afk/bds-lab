#pragma once
// LevelDB のキー操作（Reset.cpp / Import.cpp で共有）
// キー形式・ID・パッケージの純粋な処理は Format.h（BDS に依存しない）

#include "levikit/Format.h"

#include <cstdint>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

class DBStorage;

namespace levikit {

struct DimScan {
    std::vector<std::string> keys;
    std::vector<std::string> values; // withValues=true のときだけ
    std::set<std::string>    actorIds; // digp に載っているエンティティのストレージキー(8byte)
    size_t                   scanned = 0;
};

using fmt_::chunkKeyDim;
using fmt_::digpKeyDim;
using fmt_::digpWithDim;
using fmt_::withDim;

DimScan                scanDimensions(DBStorage& storage, std::set<int32_t> const& dims, bool withValues);
size_t                 deleteDimensions(DBStorage& storage, std::set<int32_t> const& dims);
int                    bumpEpoch(std::string const& name, std::string const& kind, size_t changedKeys);
std::optional<int32_t> recordedDimId(std::string const& name);

} // namespace levikit

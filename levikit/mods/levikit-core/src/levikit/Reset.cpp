// ワールド(ディメンション)リセットと、ディメンション単位のデータ削除（取り込み・複製でも使う）
//
// pendingResets に書かれたディメンションについて、起動直後（そのディメンションが生成される前）に
//   1) LevelDB からそのディメンション ID のチャンクキーと、そこにいたエンティティ(digp/actorprefix)を削除
//   2) MoreDimensions の dimension_config.json からエントリを消す
//      → 次の登録で「新規」扱いになり、config.json の generator / seed で作り直される
//      （ディメンション ID は BDS の名前→ID 表に残っているので同じ ID が再利用される）
//   3) リセット回数(epoch)を増やす → そのワールドでログアウトした人は次回参加時にスポーンへ移動
//
// キーの形式は Format.h を参照
#include "levikit/Common.h"
#include "levikit/Storage.h"

#include "ll/api/io/Logger.h"
#include "ll/api/service/Bedrock.h"
#include "ll/api/service/ServerInfo.h"

#include "mc/world/level/storage/DBStorage.h"
#include "mc/world/level/storage/db_helpers/Category.h"

namespace levikit {

namespace {

std::unordered_map<std::string, Json> gResets; // name -> {epoch, resetAt, kind, deletedKeys}

std::filesystem::path resetsPath() { return worldData() / u8"resets.json"; }

void saveResets() {
    Json out = Json::object();
    for (auto& [k, v] : gResets) out[k] = v;
    writeJson(resetsPath(), out);
}

} // namespace

DimScan scanDimensions(DBStorage& storage, std::set<int32_t> const& dims, bool withValues) {
    DimScan out;
    storage.forEachKeyWithPrefix(std::string_view{}, DBHelpers::Category::All, [&](std::string_view key, std::string_view value) {
        ++out.scanned;
        if (auto d = chunkKeyDim(key); d && dims.contains(*d)) {
            out.keys.emplace_back(key);
            if (withValues) out.values.emplace_back(value);
            return;
        }
        if (auto d = digpKeyDim(key); d && dims.contains(*d)) {
            out.keys.emplace_back(key);
            if (withValues) out.values.emplace_back(value);
            for (size_t off = 0; off + 8 <= value.size(); off += 8) out.actorIds.insert(std::string(value.substr(off, 8)));
        }
    });
    return out;
}

size_t deleteDimensions(DBStorage& storage, std::set<int32_t> const& dims) {
    if (dims.empty()) return 0;
    auto scan = scanDimensions(storage, dims, false);
    for (auto const& k : scan.keys) storage.deleteData(k, DBHelpers::Category::Chunk);
    for (auto const& id : scan.actorIds) storage.deleteData("actorprefix" + id, DBHelpers::Category::Actor);
    return scan.keys.size() + scan.actorIds.size();
}

void loadResetState() {
    gResets.clear();
    if (auto j = readJson(resetsPath()); j && j->is_object()) {
        for (auto& [k, v] : j->items()) gResets[k] = v;
    }
}

int resetEpoch(std::string const& name) {
    auto it = gResets.find(name);
    if (it == gResets.end() || !it->second.contains("epoch")) return 0;
    return it->second["epoch"].get<int>();
}

int bumpEpoch(std::string const& name, std::string const& kind, size_t changedKeys) {
    auto& r          = gResets[name];
    int   epoch      = (r.contains("epoch") ? r["epoch"].get<int>() : 0) + 1;
    r["epoch"]       = epoch;
    r["resetAt"]     = nowUnix();
    r["kind"]        = kind;
    r["deletedKeys"] = changedKeys;
    saveResets();
    return epoch;
}

std::filesystem::path dimensionConfigPath() {
    if (auto w = ll::getWorldPath()) return *w / u8"dimension_config.json";
    return {};
}

std::optional<int32_t> recordedDimId(std::string const& name) {
    auto dc = readJson(dimensionConfigPath());
    if (!dc || !dc->contains("dimensionList") || !(*dc)["dimensionList"].contains(name)) return std::nullopt;
    auto const& info = (*dc)["dimensionList"][name];
    if (!info.contains("dimId")) return std::nullopt;
    return info["dimId"].get<int32_t>();
}

void performPendingResets() {
    auto& c = cfg();
    if (c.limboMode || c.pendingResets.empty()) return;

    auto storage = ll::service::getDBStorage();
    if (!storage) {
        logger().error("リセット: DBStorage を取得できません");
        return;
    }

    std::set<int32_t> targets;
    for (auto const& name : c.pendingResets) {
        if (auto id = recordedDimId(name)) targets.insert(*id);
    }

    auto t0 = Clock::now();
    if (!targets.empty()) {
        logger().warn("ワールドリセット: {} 個のディメンションのデータを削除します（ワールドの大きさによって数十秒〜数分かかります）", targets.size());
    }
    size_t deleted = deleteDimensions(*storage, targets);
    if (deleted) storage->flushToPermanentStorage();

    // MoreDimensions の記録から外す → 新しい generator/seed で再登録される
    auto dcPath = dimensionConfigPath();
    if (auto dc = readJson(dcPath); dc && dc->contains("dimensionList")) {
        for (auto const& name : c.pendingResets) (*dc)["dimensionList"].erase(name);
        writeJson(dcPath, *dc);
    }

    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t0).count();
    for (auto const& name : c.pendingResets) {
        int epoch = bumpEpoch(name, "reset", deleted);
        emitMachine("RESET", {{"name", name}, {"epoch", epoch}, {"deletedKeys", deleted}, {"ms", ms}});
    }
    logger().warn("ワールドリセット完了: {} キーを削除（{} ms）", deleted, ms);
    c.pendingResets.clear();
    saveConfigNow();
}

} // namespace levikit

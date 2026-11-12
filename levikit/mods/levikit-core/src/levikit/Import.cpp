// ディメンション単位の取り込み・複製（起動直後、ディメンションが生成される前に実行）
//
// 取り込み (pendingImports): パネルが作ったパッケージ(.lkdim)を読み、登録済みのカスタムディメンションの ID を付けて書き込む
//   - .mcworld の取り込み（別ワールドを新しいワールドとして追加）
//   - バックアップからワールド単位の復元
// 複製 (pendingClones): 既存ディメンションのチャンク/エンティティを別のカスタムディメンションへコピー
//   エンティティ ID は振り直す（NBT の UniqueID / StorageKey、digp、actorprefix のキー、乗り物・リードの参照を揃える）
//
// キー・エンティティ ID・パッケージの形式は Format.h を参照
#include "levikit/Common.h"
#include "levikit/Core.h"
#include "levikit/Storage.h"

#include "ll/api/io/Logger.h"
#include "ll/api/service/Bedrock.h"

#include "mc/deps/nbt/CompoundTag.h"
#include "mc/deps/nbt/CompoundTagVariant.h"
#include "mc/deps/nbt/Int64Tag.h"
#include "mc/deps/nbt/ListTag.h"
#include "mc/deps/nbt/StringTag.h"
#include "mc/world/level/dimension/VanillaDimensions.h"
#include "mc/world/level/storage/DBStorage.h"
#include "mc/world/level/storage/db_helpers/Category.h"

#include <fstream>
#include <random>

namespace levikit {

namespace {

std::optional<int32_t> dimIdOf(std::string const& name) {
    if (name == "overworld") return 0;
    if (name == "nether") return 1;
    if (name == "the_end") return 2;
    for (auto const& r : registeredDims()) {
        if (r.name == name) return static_cast<int32_t>(r.id);
    }
    return std::nullopt;
}

std::mt19937_64& rng() {
    static std::mt19937_64 g{std::random_device{}() ^ static_cast<uint64_t>(nowUnix())};
    return g;
}

using UidMap = std::unordered_map<int64_t, int64_t>;

void fixRef(CompoundTagVariant& v, UidMap const& uidMap) {
    if (!v.hold(Tag::Type::Int64)) return;
    if (auto it = uidMap.find(v.get<Int64Tag>().data); it != uidMap.end()) v = Int64Tag{it->second};
}

/// 乗り物(LinksTag)・リード(LeasherID)の参照を新しい ID に
void fixRefs(CompoundTag& tag, UidMap const& uidMap) {
    if (tag.contains("LinksTag", Tag::Type::List)) {
        for (auto& link : tag["LinksTag"].get<ListTag>()) {
            if (!link.hold<CompoundTag>()) continue;
            auto& c = link.get<CompoundTag>();
            if (c.contains("entityID")) fixRef(c["entityID"], uidMap);
        }
    }
    if (tag.contains("LeasherID")) fixRef(tag["LeasherID"], uidMap);
}

struct ImportResult {
    size_t written = 0;
    size_t deleted = 0;
};

std::optional<std::string> importPackage(DBStorage& storage, std::filesystem::path const& file, int32_t dim, bool clearFirst, ImportResult& res) {
    std::ifstream in(file, std::ios::binary);
    if (!in) return "パッケージを開けません: " + file.string();
    // 先にヘッダーだけ確かめてから既存データを消す
    char head[6];
    if (!in.read(head, 6) || std::string_view(head, 6) != std::string_view("LKDIM\x02", 6)) return "パッケージの形式が違います";
    in.seekg(0);
    if (clearFirst) res.deleted = deleteDimensions(storage, {dim});

    fmt_::PackageInfo info;
    auto              err = fmt_::readPackage(
        in,
        [&](fmt_::EntryKind kind, std::string_view key, std::string& value) {
            switch (kind) {
            case fmt_::EntryKind::Chunk:
                storage.saveData(withDim(key, dim), std::move(value), DBHelpers::Category::Chunk);
                break;
            case fmt_::EntryKind::Digp:
                storage.saveData(digpWithDim(key, dim), std::move(value), DBHelpers::Category::Chunk);
                break;
            case fmt_::EntryKind::Actor:
                storage.saveData("actorprefix" + std::string(key), std::move(value), DBHelpers::Category::Actor);
                break;
            }
            ++res.written;
        },
        info
    );
    // 途中で失敗しても書いた分はそのまま（次の取り込みで clearFirst により消える）
    return err;
}

std::optional<std::string> cloneDimension(DBStorage& storage, int32_t from, int32_t to, ImportResult& res) {
    res.deleted = deleteDimensions(storage, {to});
    auto scan   = scanDimensions(storage, {from}, true);

    // 1) エンティティを読み、新しい ID を決める（参照の付け替えのため先に全部決める）
    struct Actor {
        std::string oldKey;
        CompoundTag tag;
        int64_t     uid;
    };
    std::set<int64_t>                            used;
    UidMap                                       uidMap;
    std::unordered_map<std::string, std::string> keyMap; // 旧ストレージキー -> 新
    std::vector<Actor>                           actors;
    for (auto const& oldKey : scan.actorIds) {
        std::string value;
        if (!storage.loadData("actorprefix" + oldKey, value, DBHelpers::Category::Actor)) continue;
        auto tag = CompoundTag::fromBinaryNbt(value);
        if (!tag) continue; // 読めないものは複製しない
        int64_t uid = fmt_::newUniqueId(rng(), used);
        if (tag->contains("UniqueID", Tag::Type::Int64)) uidMap[(*tag)["UniqueID"].get<Int64Tag>().data] = uid;
        keyMap[oldKey] = fmt_::storageKeyOf(uid);
        actors.push_back(Actor{oldKey, std::move(*tag), uid});
    }

    // 2) エンティティを書き込む
    for (auto& a : actors) {
        auto const& key = keyMap[a.oldKey];
        try {
            a.tag["UniqueID"]                                                  = Int64Tag{a.uid};
            a.tag["internalComponents"]["EntityStorageKeyComponent"]["StorageKey"] = StringTag{key};
            fixRefs(a.tag, uidMap);
        } catch (std::exception const& e) {
            logger().warn("複製: エンティティの NBT を更新できません ({})", e.what());
            keyMap.erase(a.oldKey);
            continue;
        }
        storage.saveData("actorprefix" + key, a.tag.toBinaryNbt(), DBHelpers::Category::Actor);
        ++res.written;
    }

    // 3) チャンクと digp
    for (size_t i = 0; i < scan.keys.size(); ++i) {
        std::string_view key   = scan.keys[i];
        std::string      value = std::move(scan.values[i]);
        if (chunkKeyDim(key)) {
            bool        hasDim = key.size() >= 13;
            std::string rest   = std::string(key.substr(0, 8)) + std::string(key.substr(hasDim ? 12 : 8));
            if (static_cast<uint8_t>(rest[8]) == 50 && !value.empty()) fmt_::patchLegacyUniqueIds(value, rng(), used);
            storage.saveData(withDim(rest, to), std::move(value), DBHelpers::Category::Chunk);
        } else {
            std::string list;
            for (size_t off = 0; off + 8 <= value.size(); off += 8) {
                if (auto it = keyMap.find(value.substr(off, 8)); it != keyMap.end()) list += it->second;
            }
            if (list.empty()) continue;
            storage.saveData(digpWithDim(key.substr(4, 8), to), std::move(list), DBHelpers::Category::Chunk);
        }
        ++res.written;
    }
    return std::nullopt;
}

bool safeRelative(std::string const& p) {
    return !p.empty() && p.find("..") == std::string::npos && p.find(':') == std::string::npos && p[0] != '/' && p[0] != '\\';
}

} // namespace

void performPendingTransfers() {
    auto& c = cfg();
    if (c.limboMode || (c.pendingImports.empty() && c.pendingClones.empty())) return;
    auto storage = ll::service::getDBStorage();
    if (!storage) {
        logger().error("取り込み/複製: DBStorage を取得できません");
        return;
    }
    auto dataDir = Core::getInstance().getSelf().getDataDir();

    for (auto const& job : c.pendingImports) {
        auto t0  = Clock::now();
        auto dim = dimIdOf(job.name);
        if (!dim || *dim <= 2) {
            emitMachine("IMPORT_FAILED", {{"name", job.name}, {"error", "取り込み先は登録済みのカスタムワールドだけです"}});
            continue;
        }
        if (!safeRelative(job.file)) {
            emitMachine("IMPORT_FAILED", {{"name", job.name}, {"error", "ファイルのパスが不正です"}});
            continue;
        }
        auto         file = dataDir / std::filesystem::path(job.file);
        ImportResult res;
        logger().warn("取り込み: {} → {}（ID {}）", job.file, job.name, *dim);
        if (auto err = importPackage(*storage, file, *dim, job.clearFirst, res)) {
            logger().error("取り込み失敗 {}: {}", job.name, *err);
            emitMachine("IMPORT_FAILED", {{"name", job.name}, {"error", *err}});
            continue;
        }
        int  epoch = bumpEpoch(job.name, "import", res.written);
        auto ms    = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t0).count();
        emitMachine("IMPORT", {{"name", job.name}, {"written", res.written}, {"deleted", res.deleted}, {"epoch", epoch}, {"ms", ms}});
        std::error_code ec;
        std::filesystem::remove(file, ec);
    }

    // 書き込みキャッシュを LevelDB へ（大きな取り込みでメモリを抱えないように・続く複製が読めるように）
    if (!c.pendingImports.empty()) storage->flushToPermanentStorage();

    for (auto const& job : c.pendingClones) {
        auto t0   = Clock::now();
        auto from = dimIdOf(job.from);
        auto to   = dimIdOf(job.to);
        if (!from || !to || *to <= 2 || *from == *to) {
            emitMachine("CLONE_FAILED", {{"from", job.from}, {"to", job.to}, {"error", "複製元/先が不正です（複製先は登録済みのカスタムワールド）"}});
            continue;
        }
        ImportResult res;
        logger().warn("複製: {} → {}", job.from, job.to);
        if (auto err = cloneDimension(*storage, *from, *to, res)) {
            emitMachine("CLONE_FAILED", {{"from", job.from}, {"to", job.to}, {"error", *err}});
            continue;
        }
        int  epoch = bumpEpoch(job.to, "clone", res.written);
        auto ms    = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t0).count();
        emitMachine("CLONE", {{"from", job.from}, {"to", job.to}, {"written", res.written}, {"deleted", res.deleted}, {"epoch", epoch}, {"ms", ms}});
    }

    if (!c.pendingClones.empty()) storage->flushToPermanentStorage();
    c.pendingImports.clear();
    c.pendingClones.clear();
    saveConfigNow();
}

} // namespace levikit

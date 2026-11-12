#pragma once
// LevelDB のキー形式・エンティティ ID・パッケージ(.lkdim) の読み込み
// LeviLamina / BDS に依存しない（標準ライブラリと zlib だけ）→ test/native でネイティブにテストできる
//
// チャンクキー: [x:i32][z:i32][dim:i32 (オーバーワールド以外)][tag:u8][subchunk:i8 (tag=47 のとき)]
// digp キー   : "digp" [x][z][dim (0以外)] → 値はそのチャンクのエンティティのストレージキー(8byte)の並び
// エンティティ: "actorprefix" + ストレージキー(8byte)
//
// 統合版のエンティティ ID
//   UniqueID (i64)    = [上位32bit: worldStartCount（負・起動ごとに 1 減る）][下位32bit: カウンタ]
//   ストレージキー(8B) = big-endian の ((-上位) << 32 | 下位)
//                        … actorprefix の後ろ・digp の中身・internalComponents.EntityStorageKeyComponent.StorageKey
//   振り直す ID は上位を正の値にする → ゲームが作る ID（上位が負）と絶対にぶつからない
//   （panel/lib/worldio.js の storageKeyOf / remapEntities と同じ規則）
//
// パッケージ (panel/lib/worldio.js の writePackage が作る)
//   header 16B: "LKDIM\x02\0\0" u32 version=2 u32 count
//   frame     : u32 compressedLen u32 rawLen bytes(zlib)
//   entry     : u8 kind(1=chunk 2=digp 3=actor) u32 klen key u32 vlen value
//               chunk の key は dim を除いた形（x z tag [sub]）、digp は x z、actor は 8byte のストレージキー

#include <zlib.h>

#include <cstdint>
#include <cstring>
#include <functional>
#include <istream>
#include <optional>
#include <random>
#include <set>
#include <string>
#include <string_view>

namespace levikit::fmt_ {

inline int32_t readI32(std::string_view s, size_t off) {
    int32_t v = 0;
    std::memcpy(&v, s.data() + off, sizeof(v)); // キーはリトルエンディアン（x64 と同じ）
    return v;
}

inline bool isChunkTag(uint8_t tag) { return (tag >= 43 && tag <= 65) || tag == 118; }

/// チャンクキーならそのディメンション ID
inline std::optional<int32_t> chunkKeyDim(std::string_view key) {
    auto size = key.size();
    if (size != 9 && size != 10 && size != 13 && size != 14) return std::nullopt;
    bool hasDim = size >= 13;
    auto tag    = static_cast<uint8_t>(key[hasDim ? 12 : 8]);
    if (!isChunkTag(tag)) return std::nullopt;
    if ((size == 10 || size == 14) && tag != 47) return std::nullopt;
    int32_t x = readI32(key, 0);
    int32_t z = readI32(key, 4);
    if (x > 1875000 || x < -1875000 || z > 1875000 || z < -1875000) return std::nullopt; // 文字列キーの誤判定よけ
    for (std::string_view prefix : {"actorprefix", "digp", "map_", "player", "VILLAGE", "tickingarea", "portals", "game_"}) {
        if (key.substr(0, prefix.size()) == prefix) return std::nullopt;
    }
    return hasDim ? readI32(key, 8) : 0;
}

/// digp キーならそのディメンション ID
inline std::optional<int32_t> digpKeyDim(std::string_view key) {
    if ((key.size() != 12 && key.size() != 16) || key.substr(0, 4) != "digp") return std::nullopt;
    return key.size() == 16 ? readI32(key, 12) : 0;
}

/// rest = x z tag [sub] → x z [dim] tag [sub]
inline std::string withDim(std::string_view rest, int32_t dim) {
    std::string k(rest.substr(0, 8));
    if (dim != 0) k.append(reinterpret_cast<char const*>(&dim), 4);
    k.append(rest.substr(8));
    return k;
}

inline std::string digpWithDim(std::string_view xz, int32_t dim) {
    std::string k = "digp";
    k.append(xz);
    if (dim != 0) k.append(reinterpret_cast<char const*>(&dim), 4);
    return k;
}

inline std::string storageKeyOf(int64_t uid) {
    auto        u = static_cast<uint64_t>(uid);
    uint64_t    k = ((0ULL - (u >> 32)) << 32) | (u & 0xffffffffULL);
    std::string s(8, '\0');
    for (int i = 0; i < 8; ++i) s[i] = static_cast<char>((k >> (56 - 8 * i)) & 0xff);
    return s;
}

template <class Rng>
int64_t newUniqueId(Rng& rng, std::set<int64_t>& used) {
    std::uniform_int_distribution<uint32_t> hi(0x10000000u, 0x3fffffffu);
    std::uniform_int_distribution<uint32_t> lo(1u, 0xffffffffu);
    for (;;) {
        auto id = static_cast<int64_t>((static_cast<uint64_t>(hi(rng)) << 32) | lo(rng));
        if (used.insert(id).second) return id;
    }
}

/// 旧形式（1.18.30 より前・チャンク tag 50 に連結）のエンティティ: Long タグ "UniqueID" をバイト列で探して振り直す
///   [0x04][0x08 0x00]["UniqueID"][8 byte LE]
template <class Rng>
void patchLegacyUniqueIds(std::string& nbt, Rng& rng, std::set<int64_t>& used) {
    constexpr std::string_view tag{"\x04\x08\x00UniqueID", 11};
    size_t                     p = 0;
    while ((p = nbt.find(tag, p)) != std::string::npos) {
        if (p + tag.size() + 8 > nbt.size()) break;
        int64_t id = newUniqueId(rng, used);
        std::memcpy(nbt.data() + p + tag.size(), &id, 8);
        p += tag.size() + 8;
    }
}

enum class EntryKind : uint8_t { Chunk = 1, Digp = 2, Actor = 3 };

struct PackageInfo {
    uint32_t declared = 0; // ヘッダーのエントリ数
    uint32_t read     = 0; // 実際に読めた数
};

/// パッケージを読み、エントリごとに visit(kind, key, value) を呼ぶ
///   value は呼び出し側で std::move してよい
/// 戻り値: エラーメッセージ（成功なら nullopt）
inline std::optional<std::string>
readPackage(std::istream& in, std::function<void(EntryKind, std::string_view, std::string&)> const& visit, PackageInfo& info) {
    char head[16];
    if (!in.read(head, 16) || std::string_view(head, 6) != std::string_view("LKDIM\x02", 6)) return "パッケージの形式が違います";
    std::memcpy(&info.declared, head + 12, 4);

    std::string comp, raw, value;
    while (true) {
        uint32_t fh[2];
        if (!in.read(reinterpret_cast<char*>(fh), 8)) break;
        if (fh[0] > (256u << 20) || fh[1] > (256u << 20)) return "パッケージのフレームが大きすぎます";
        comp.resize(fh[0]);
        raw.resize(fh[1]);
        if (!in.read(comp.data(), fh[0])) return "パッケージが途中で切れています";
        uLongf rawLen = fh[1];
        if (uncompress(reinterpret_cast<Bytef*>(raw.data()), &rawLen, reinterpret_cast<Bytef const*>(comp.data()), fh[0]) != Z_OK
            || rawLen != fh[1]) {
            return "パッケージの展開に失敗しました";
        }
        size_t p = 0;
        while (p < raw.size()) {
            if (p + 9 > raw.size()) return "パッケージのエントリが壊れています";
            auto     kind = static_cast<uint8_t>(raw[p]);
            uint32_t kl   = 0;
            std::memcpy(&kl, raw.data() + p + 1, 4);
            if (p + 5 + size_t{kl} + 4 > raw.size()) return "パッケージのエントリが壊れています";
            std::string_view key(raw.data() + p + 5, kl);
            p += 5 + size_t{kl};
            uint32_t vl = 0;
            std::memcpy(&vl, raw.data() + p, 4);
            if (p + 4 + size_t{vl} > raw.size()) return "パッケージのエントリが壊れています";
            value.assign(raw.data() + p + 4, vl);
            p += 4 + size_t{vl};
            bool ok = (kind == 1 && kl >= 9 && kl <= 10) || (kind == 2 && kl == 8) || (kind == 3 && kl == 8);
            if (!ok) return "パッケージに不明なエントリがあります";
            visit(static_cast<EntryKind>(kind), key, value);
            ++info.read;
        }
    }
    if (info.read != info.declared) return "パッケージのエントリ数が一致しません";
    return std::nullopt;
}

} // namespace levikit::fmt_

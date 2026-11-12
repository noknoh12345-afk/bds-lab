// levikit-core の Format.h をネイティブ(Linux)でテストするための小さなプログラム
// BDS / LeviLamina 不要。test/toolkit.js がビルドして、JS 側（panel/lib/worldio.js）の結果と突き合わせる
//
//   format_test pkg <file>   … パッケージを読み、エントリごとに "kind keyhex fnv64 len" を出力
//   format_test skey         … 標準入力の UniqueID(10進) ごとにストレージキー(hex)
//   format_test classify     … 標準入力のキー(hex) ごとに "chunkDim digpDim"（該当しなければ -）
//   format_test withdim      … 標準入力の "c|d hex dim" ごとに withDim / digpWithDim の結果(hex)
//   format_test newids N     … 新しい UniqueID を N 個（"uid keyhex"）
//   format_test legacy       … 標準入力の NBT(hex) の UniqueID を振り直して hex で出力
#include "levikit/Format.h"

#include <fstream>
#include <iostream>
#include <sstream>

using namespace levikit::fmt_;

namespace {

std::string hex(std::string_view s) {
    static char const* d = "0123456789abcdef";
    std::string        out;
    out.reserve(s.size() * 2);
    for (unsigned char c : s) {
        out += d[c >> 4];
        out += d[c & 15];
    }
    return out;
}

std::string unhex(std::string const& h) {
    std::string out;
    for (size_t i = 0; i + 1 < h.size(); i += 2) out += static_cast<char>(std::stoi(h.substr(i, 2), nullptr, 16));
    return out;
}

uint64_t fnv64(std::string_view s) {
    uint64_t h = 1469598103934665603ULL;
    for (unsigned char c : s) {
        h ^= c;
        h *= 1099511628211ULL;
    }
    return h;
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 2) return 2;
    std::string mode = argv[1];
    std::string line;
    if (mode == "pkg" && argc >= 3) {
        std::ifstream in(argv[2], std::ios::binary);
        PackageInfo   info;
        auto          err = readPackage(
            in,
            [](EntryKind kind, std::string_view key, std::string& value) {
                std::cout << static_cast<int>(kind) << ' ' << hex(key) << ' ' << std::hex << fnv64(value) << std::dec << ' ' << value.size() << '\n';
            },
            info
        );
        if (err) std::cout << "ERR " << *err << '\n';
        else std::cout << "OK " << info.declared << ' ' << info.read << '\n';
        return err ? 1 : 0;
    }
    if (mode == "skey") {
        while (std::getline(std::cin, line)) {
            if (line.empty()) continue;
            std::cout << hex(storageKeyOf(std::stoll(line))) << '\n';
        }
        return 0;
    }
    if (mode == "classify") {
        while (std::getline(std::cin, line)) {
            auto key = unhex(line);
            auto c   = chunkKeyDim(key);
            auto d   = digpKeyDim(key);
            std::cout << (c ? std::to_string(*c) : "-") << ' ' << (d ? std::to_string(*d) : "-") << '\n';
        }
        return 0;
    }
    if (mode == "withdim") {
        while (std::getline(std::cin, line)) {
            std::istringstream ss(line);
            std::string        t, h;
            int32_t            dim = 0;
            ss >> t >> h >> dim;
            auto k = unhex(h);
            std::cout << hex(t == "c" ? withDim(k, dim) : digpWithDim(k, dim)) << '\n';
        }
        return 0;
    }
    if (mode == "newids" && argc >= 3) {
        std::mt19937_64   rng{12345};
        std::set<int64_t> used;
        int               n = std::stoi(argv[2]);
        for (int i = 0; i < n; ++i) {
            auto id = newUniqueId(rng, used);
            std::cout << id << ' ' << hex(storageKeyOf(id)) << '\n';
        }
        return 0;
    }
    if (mode == "legacy") {
        std::mt19937_64   rng{777};
        std::set<int64_t> used;
        while (std::getline(std::cin, line)) {
            auto nbt = unhex(line);
            patchLegacyUniqueIds(nbt, rng, used);
            std::cout << hex(nbt) << '\n';
        }
        return 0;
    }
    return 2;
}

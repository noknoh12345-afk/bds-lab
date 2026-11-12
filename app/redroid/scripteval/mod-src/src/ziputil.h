// Minimal ZIP extractor (store + deflate) used to install a .mcpack downloaded from the web.
// deflate は libz を dlopen して inflate する(zlib は Linux/macOS/Android bionic いずれにもある)。
#pragma once
#include <string>

namespace se::zip {
// bytes(ZIP アーカイブ)を destDir 以下に展開する。パストラバーサル(../ や絶対パス)は拒否。
// 返り: 展開したファイル数(>=0)。失敗は -1 で err 設定。
int extract(const std::string& bytes, const std::string& destDir, std::string& err);
bool haveInflate();  // libz が使えるか
}  // namespace se::zip

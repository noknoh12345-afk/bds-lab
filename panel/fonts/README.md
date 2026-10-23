# パネルのフォント（panel/fonts/）

パネルの字（OreUI のように: 英数字はドットの字、日本語は Noto Sans）。どれも SIL Open Font License 1.1 で、パネルの中に置いて
外からは読みません（ページの CSP は `font-src 'self'`）。ゲーム（Mojang）のフォントは入っていません。

| ファイル | もと | ライセンス |
|---|---|---|
| `pixel/pixel-regular.otf` | [IdreesInc/Minecraft-Font](https://github.com/IdreesInc/Minecraft-Font) の `Minecraft.otf`（コミット 261ac77、2023-02-11）。ゲームの字をファンが作り直したもの。Latin（U+0000–00FF） | `pixel/OFL.txt`（そのリポジトリの LICENSE） |
| `noto-sans-jp/*.woff2`（124） | npm の [`@fontsource-variable/noto-sans-jp`](https://fontsource.org/fonts/noto-sans-jp) 5.3.1 の `files/`（Noto Sans JP の可変フォント 100–900 を unicode-range で 124 に分けたもの。ブラウザは画面の字の分だけ読みます） | `noto-sans-jp/OFL.txt`（そのパッケージの LICENSE） |
| `fonts.css` | 上の 2 つの `@font-face`。ドットの字は太さ 1 つ（OreUI のドットの字は太字にしないので、700 も同じファイル） | — |

## 作り直すとき

```sh
# Noto Sans JP: パッケージを取って、files/ と LICENSE をそのまま置く
npm pack @fontsource-variable/noto-sans-jp@5.3.1 && tar xzf fontsource-variable-noto-sans-jp-5.3.1.tgz
cp package/files/*.woff2 panel/fonts/noto-sans-jp/ && cp package/LICENSE panel/fonts/noto-sans-jp/OFL.txt
# fonts.css の「Ore Sans JP」の部分 = package/index.css の注釈を除き、名前と置き場所を替えたもの
node -e "const fs=require('fs');process.stdout.write(fs.readFileSync('package/index.css','utf8').replace(/\/\*[\s\S]*?\*\/\n?/g,'').replace(/'Noto Sans JP Variable'/g,'\"Ore Sans JP\"').replace(/url\(\.\/files\//g,'url(noto-sans-jp/').replace(/\n\n+/g,'\n').trim()+'\n')" > /tmp/ore-sans-jp.css
# → fonts.css の先頭の注釈と「Ore Pixel」の 2 つの @font-face の後ろを、/tmp/ore-sans-jp.css に替える
```

ドットの字は、IdreesInc/Minecraft-Font の `Minecraft.otf` を `pixel/pixel-regular.otf` に、`LICENSE` を `pixel/OFL.txt` に。
替えたら `node lab.mjs panel check`（`tests/ore-offline.mjs` がファイルとライセンスを確かめます）。

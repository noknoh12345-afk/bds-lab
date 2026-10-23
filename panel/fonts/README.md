# パネルのフォント（panel/fonts/）

パネルの字は、どの言語もマイクラと同じドットの字だけです。英数字はゲームの字をファンが作り直したもの、日本語・韓国語・中国語
などほかの字は、マイクラ自身がその字を描くのに使っている GNU Unifont です。どれも SIL Open Font License 1.1 で、パネルの中に
置いて外からは読みません（ページの CSP は `font-src 'self'`）。ゲーム（Mojang）のフォントのファイルは入っていません — 統合版を
持っている人は、「設定」の「マイクラのフォント」でゲームのフォントのファイルを選べば、その端末ではその字で出ます（ブラウザの
中だけに置きます: `panel/ui/look.mjs`）。

| ファイル | もと | ライセンス |
|---|---|---|
| `pixel/pixel-regular.otf` | [IdreesInc/Minecraft-Font](https://github.com/IdreesInc/Minecraft-Font) の `Minecraft.otf`（コミット 261ac77、2023-02-11）。ゲームの字をファンが作り直したもの。Latin（U+0000–00FF）。「Ore Pixel」: 9 ドットの em を 16px で 2 倍に（`size-adjust: 112.5%`） | `pixel/OFL.txt`（そのリポジトリの LICENSE） |
| `unifont/*.woff2` | [GNU Unifont](https://unifoundry.com/unifont/) 18.0.01 の `unifont-18.0.01.otf`（[font-builds](https://unifoundry.com/pub/unifont/unifont-18.0.01/font-builds/)）。「Ore Unifont」: どの字も。16 ドットの em を 16px で 1 倍に | `unifont/OFL-1.1.txt` |
| `unifont-jp/*.woff2` | 同じ版の `unifont_jp-18.0.01.otf`。「Ore Unifont JP」: 日本語の字形（ページが日本語のとき） | 同上 |
| `unifont-t/*.woff2` | 同じ版の `unifont_t-18.0.01.otf`。「Ore Unifont T」: 台湾の字形（繁體中文のとき） | 同上 |
| `unifont-upper/*.woff2` | 同じ版の `unifont_upper-18.0.01.otf`。「Ore Unifont Upper」: 絵文字などの絵の字 | 同上 |
| `fonts.css` | 上の `@font-face`（`node lab.mjs panel fonts` が書きます。手で直しません） | — |

Unifont は字の範囲ごとの小さなファイル（`unicode-range`）に分けてあり、ブラウザは画面に出る字の分だけ読みます。それぞれの言語で
よく使う字（日本語は JIS 第 1 水準、簡体字は GB 2312 第 1 水準、繁体字は Big5 の常用字、韓国語は KS X 1001 のハングル）は「core」の
1 つのファイルにまとめ、いちばん先に読みます（日本語 96 KB・簡体字 100 KB・繁体字 168 KB・ハングル 28 KB）。パネルの文言の字が
core に入っているかは `tests/ore-offline.mjs` が確かめ、入っていない字は `common/panel-fonts.mjs` の `EXTRA` に足します。

## 作り直すとき

```sh
# GNU Unifont の font-builds から 4 つの .otf を 1 つのフォルダに（unifont-<版>.otf・unifont_jp-…・unifont_t-…・unifont_upper-…）と
# OFL-1.1.txt を置き、Python の fontTools で切り出す（pip install fonttools brotli）
node lab.mjs panel fonts <そのフォルダ>
```

ドットの字は、IdreesInc/Minecraft-Font の `Minecraft.otf` を `pixel/pixel-regular.otf` に、`LICENSE` を `pixel/OFL.txt` に。
替えたら `node lab.mjs panel check`（`tests/ore-offline.mjs` がファイル・ライセンス・`fonts.css` が書いたとおりか・core を確かめます）。

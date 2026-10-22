# GeoUI タイムライン（動画編集ソフト並み・osu! が作れる水準）の計画

目標: GeoUI Builder を、osu! のようなリズムゲームの画面が作れるほどの動画編集ソフト並みのアニメーションの道具にする（トラック・クリップ・キーフレーム・イージング・トランジション・BPM と拍・テンプレートと多数の実体・道に沿った動き・当たり外れに応じた動き・文字・連番画像・音・再生・動画の書き出し・ゲームの中で動く Bedrock への書き出し）

並行なしで、上から 1 段ずつ作る（各段の試験と `node tests/lint-offline.mjs` が通ってから commit、次の段へ）。各段の後に、その段を読む見直し（下の「見直す観点」）を 1 回。

## 全段に共通の約束

- 置き場所と形: 新しいコードは bds/geoui/timeline/<部品>.js。どれも同じ形 `(function (root) { 'use strict'; const T = root.GeoUITimeline = root.GeoUITimeline || {}; … T.<部品> = {…}; if (typeof module === 'object' && module && module.exports) module.exports = T.<部品>; })(typeof globalThis !== 'undefined' ? globalThis : this);`。読み込みのときに他の部品を require しない（使う時に GeoUITimeline.<部品> から。Node の試験では、先にその部品のファイルを require する）。プラグインに npm の物は入れない（Blockbench がそのまま読む）
- データの形（全レーン共通・変えない）: 文書 = { version: 1, sequences: [Seq] }。Seq = { id, name, duration(秒), fps(既定 20), loop: 'once'|'loop'|'hold'|'pingpong', inOut: [入, 出]|null, markers: [{ id, t, name, event? }], tracks: [Track] }。Track = { id, kind: 'layer'|'audio', target(layer のとき GeoUI の要素の名前 = ボーン名), name, muted, locked, solo, clips: [Clip] }（上のトラックほど手前）。Clip = { id, start, end(秒。同じトラックで重ならない), offset(素材の時間), transitionIn?/transitionOut?: { kind: 'fade'|'slide-left'|'slide-right'|'slide-up'|'slide-down'|'zoom'|'pop', duration, ease }, channels: { x?, y?, scaleX?, scaleY?, rotation?, opacity?, value?, fill?, frame?: [Key] }, 音のクリップは sound, volume, pitch }。Key = { t(クリップの頭からの秒), v, ease }。ease はその鍵から次の鍵までの区間: 'linear'|'step'|'<sine|quad|cubic|quart|quint|expo|circ|back|elastic|bounce>-<in|out|inout>'|{ bezier: [x1, y1, x2, y2] }。x・y はモデル単位の、要素を置いた位置からのずれ。rotation は度、scale は倍、opacity・fill は 0〜1、value は数字の要素の値、frame は連番画像のコマ。クリップの無いトラック（とトラックの無い要素）は今のまま（いつも見える）。クリップのあるトラックの要素は、クリップの間だけ見える。osu! のための追加（同じく全レーン共通）: Seq に tempo: [{ t, bpm, meter }]（拍の格子と吸い付き。BPM が途中で変わってよい）、paths: [{ id, kind: 'linear'|'bezier'|'catmull'|'arc', points: [[x, y]] }]、templates: [{ id, name, lead(秒: 本番の時刻より前に出る長さ), tail(秒: 後に残る長さ), params: [名前], tracks: [Track] }]（テンプレートの中の時刻は本番の時刻からの秒。鍵の v は数か式の文字列: param.<名前>・四則・math.* だけ）、instances: [{ id, template, t(本番の時刻), params: { … } }]（何百個でもよい）。channels に path: [Key]（道の上の進み 0〜1。道は clip.path の id、長さに比例して等速）。Clip に trigger?: 'hit'|'miss'|名前（その出来事が起きた時刻から再生する。evaluate は opts.events = [{ instance, name, t }] で決める）。evaluate の states で、実体の要素の名前は「<要素>#<実体の id>」
- 部品どうしの約束（全レーン共通）: 画面の部品（timeline・inspector）は文書を書き換えず store.dispatch(intent) だけ。intent = { type, seq, … }: seq.add/remove/set, track.add/remove/set/move, clip.add / clip.remove{ids, ripple} / clip.move{ids, dt, dTrack, snap} / clip.trim{id, edge: 'start'|'end', t, ripple} / clip.split{ids, t} / clip.duplicate{ids, at} / clip.set{id, patch}, key.add{clip, prop, t, v?, ease?} / key.remove{keys} / key.move{keys, dt, dv} / key.set{clip, prop, index, patch}, marker.add/remove/set, preset.apply{track?, at, preset}（snap のとき snapTol 秒）。store = { doc(), dispatch(intent) → { ok, error? }, selection() → { seq, clips, keys: [{ clip, prop, index }], markers }, select(sel), time(), seek(t), subscribe(cb) → 外す関数, elements() → [{ name, kind: 'image'|'number'|'gauge'|'text', w, h }], media() → [{ id, kind: 'image'|'sequence'|'sound'|'font', name, frames?, duration? }], transport: { play, pause, toggle, stop, step(n), rate(r), playing() } }。host（プレビューの相手。bridge が作る）= { elements(), apply(states), render(), canvas(), frameRect() → { x, y, w, h }, playSound(id, { volume, pitch, offset }), stopSounds() }。states = model.evaluate の返り値 { 要素の名前: { visible, x, y, scaleX, scaleY, rotation, opacity, value?, fill?, frame? } }。足す intent: tempo.add/remove/set, path.add/remove/set（points の点の追加・移動）, template.add/remove/set, instance.add/remove/move{ids, dt, dx, dy}/set, instances.import{instances, templates?, tempo?, tracks?}（osu! の譜面などから一度に）
- 試験: tests/tl-<レーン>-offline.mjs は Node の標準ライブラリだけ（CI の offline が自動で拾う: ブラウザも Blockbench も無い所で通ること）。ブラウザでの確かめは bds/geoui/timeline/check-<レーン>.mjs に分ける（CI では走らない）: Playwright は GEOUI_NODE_MODULES=/opt/npm-tools/node_modules、Chromium は CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome（このコンテナにある）。本物の Blockbench 5.2.2（web 版）は BLOCKBENCH_DIR=<git clone --branch v5.2.2 https://github.com/JannisX11/blockbench → npm ci --ignore-scripts → npm run build-web した所>（bds/geoui/blockbench-check.mjs の動かし方を手本に）
- 画面の文字は日本語（今のプラグインの言い方に合わせる）、コードのコメントは英語（このリポジトリの書き方）。bds/geoui/geoui_builder.js を変えてよいのは bridge だけ。今ある試験は変えない・緩めない。各レーンは自分の試験のあと node tests/lint-offline.mjs も通す
- 本物のゲームでしか分からないこと（Molang の式の長さの上限、q.life_time の進み方、render controller を重ねたときの描く順、uv_anim のふるまい）は決めつけない。確かめる区切り（app.txt）を残し、報告に「要実測」と書く（実機の CI は司令塔が回す）
- ゲームの中の約束（model の contract.js が決め、compile・runtime・bridge が使う）: 時間はプロパティ <ns>:seq・<ns>:seq_gen・<ns>:seq_from(ms)・<ns>:seq_pause。多数の実体は「枠」（テンプレートのボーンを k 個複製）に順に割り当てる。少なければ焼き込み（Molang に全部）、多ければ流し込み（runtime のスクリプトが、出る少し前に枠 k のプロパティ <ns>:s<k>t（本番の時刻 ms、-1 = 空き）と <ns>:s<k>p（x・y・種類などを 24 bit 以下に詰めた整数。Molang の数は float で 2^24 まで正確）を入れる）。出来事（hit・miss）は <ns>:s<k>g を +1 して <ns>:s<k>r に結果。プロパティの数の上限は既定 32（要実測。設定で変えられる）

## 1. tl-model: タイムラインの中身（データ・イージング・BPM・道・テンプレートと実体・出来事・ある時刻の値・編集の操作）と、ゲームの中の約束（枠の割り当て・プロパティの詰め方）を純粋な関数で

持ち物: `bds/geoui/timeline/model.js`、`bds/geoui/timeline/contract.js`、`tests/tl-model-offline.mjs`

試験: `node tests/tl-model-offline.mjs`

- normalize(doc) と validate(doc)（日本語の問題の一覧）。時間の道具: toFrames・fromFrames・timecode(t, fps) = 'mm:ss:ff'・parseTimecode。拍: beatAt(seq, t)・timeAtBeat(seq, b)・snapToBeat(seq, t, div)（div は 1・2・3・4・6・8・12・16。BPM が途中で変わる所も）
- ease(e, x): rules の全イージング（Penner の式。back は s = 1.70158、elastic・bounce も）と { bezier }（媒介変数をニュートン法＋二分法で 1e-6 まで）。ease(e, 0) = 0、ease(e, 1) = 1。名前の一覧 EASES
- evaluate(doc, seqId, t, { events }) → states と channelAt(clip, prop, tInClip, params): 鍵の補間（最初より前は最初の値、最後より後は最後の値）、トランジション（fade は opacity に掛ける、slide は 40 単位外から、zoom は scale 0→1、pop は 0→1.1→1）、loop・hold・pingpong・inOut、muted・solo、テンプレートの実体（本番の時刻 − lead 〜 + tail の間だけ。式の v は param で）、道（pathPoint(path, u): 弧長で等速。bezier は折れ線で弧長の表、arc は 3 点を通る円、catmull は中心の形）、trigger のクリップは events の時刻から。境目は「t1 ちょうどは次の区間」（compile がこの式を Molang で写す）
- reduce(doc, intent) → { doc, ok, error }: rules の intent すべて。元の文書は変えない。移動・トリムは同じトラックの隣と重ならない（一番近い空きへ）、snap は鍵・クリップの端・マーカー・再生位置（intent.playhead）・拍の格子（intent.beatDiv）・1/fps へ、ripple・split（境目に鍵）・preset.apply・instances.import（何千個でも 1 回で）
- contract.js: allocateSlots(instances, template, { maxSlots }) → 実体ごとの枠（[t − lead, t + tail] の区間の彩色。足りなければ溢れた物を warnings に）と slotsNeeded、プロパティの名前、pack / unpack（x・y・種類・結果を 24 bit 以下に。範囲と丸めは設定から）、budget(doc, { propertyLimit: 32 }) → { properties, slots, mode: 'baked'|'streamed', warnings }（焼き込みか流し込みかを、実体の数と式の長さの見込みで決める）
- 試験（Node だけ）: 各イージングの端と中点・ベジェの既知の値・evaluate の境目（鍵の時刻ちょうど・クリップの端・ループの継ぎ目・pingpong の折り返し・実体の出入り・trigger）・道の等速（弧長の誤差 0.5% 以内）・拍の吸い付き（BPM の変わり目）・reduce が元を変えない・重ならない・ripple・split・枠の割り当てで同じ枠の実体が重ならない・pack と unpack の往復・JSON の往復

## 2. tl-assets: 素材の道具（アトラス・連番・文字・音・波形・道の線）と osu! の譜面の取り込み・プリセットを、純粋な関数で

持ち物: `bds/geoui/timeline/media.js`、`bds/geoui/timeline/osu.js`、`bds/geoui/timeline/presets.js`、`tests/tl-assets-offline.mjs`

試験: `node tests/tl-assets-offline.mjs`

- media.js: packAtlas(items, { maxSize: 2048, padding: 1, pow2: true }) → { w, h, rects }（MaxRects。入らなければ理由を投げる）、flipbook(n, frameW, frameH, { cols }) → uv(i) = { offset, scale }（render controller の uv_anim の値）、fontAtlas(chars, measure)（測る・描く関数は注入）と layoutText(text, font, { align, letterSpacing, lineHeight, maxWidth })
- media.js: oggInfo・wavInfo（長さ・rate・channels）、makeWav(pcm, rate)（試験と見本の音を作る）、peaks(pcm, buckets)（タイムラインの波形）、soundDefinitions(sounds, ns)（format_version 1.20.20、category ui、sounds/<ns>/<id>.ogg|wav）、zipStore・unzipStore（無圧縮、CRC32）、sortSequence（連番を数で並べる）
- media.js: strokePath(points, width) → 太い線の輪郭の多角形（つなぎ目は丸く、端は丸く）と rasterizePath(points, width, { draw })（描く関数は注入）: osu! のスライダーの体を 1 枚の絵にしてアトラスへ
- osu.js: parseOsu(text) → { general, metadata, difficulty, timing, colours, objects }（osu file format v14: 円・スライダー B/C/L/P と往復と長さ・スピナー、継承・非継承のタイミング、コンボの色と new combo）。式: AR → preempt・fade in（ms）、CS → 半径、OD → 判定の幅（300・100・50）、スライダーの長さ → 時間（SV と BPM から）
- osu.js: toDocument(map, { frame }) → 文書（rules の形）: テンプレート（円・接近の輪・番号・スライダーの体と玉と折り返しの矢印・スピナー・判定の 300/100/50/miss の表示）、実体（譜面の物すべて）、道（スライダー）、tempo（非継承のタイミングから）、音楽の audio トラック、プレイ領域 512 x 384 を 4:3 のまま画面の枠へ。試験の譜面は自分で作った物（実在の譜面・音楽は使わない）
- presets.js: タイトル（フェードイン・保つ・フェードアウト）、下に出る名前、点数のポップ（value の数え上げ＋pop）、カウントダウン、通知、進むゲージ、点滅、揺れ、ヒットの弾け、コンボのポップ、判定の文字。presetList()・makePreset(id, opts) → preset.apply の preset。試験（Node だけ）: アトラスが重ならず入る、ZIP と WAV を読み戻せる、OGG の長さ、線の輪郭が閉じる、譜面の読み取りと式の既知の値、取り込んだ文書とプリセットが GeoUITimeline.model.validate を通る（model.js が無い所では形だけ確かめる）

## 3. tl-anim: シーケンスをゲームの中で動く RP（アニメーション・render controller・複製した枠のボーン）へ書き出す。プレビューと同じ値になることを Molang の評価で証明する

持ち物: `bds/geoui/timeline/compile.js`、`tests/tl-anim-offline.mjs`

試験: `node tests/tl-anim-offline.mjs`

難しい所: Molang の式がすべての時刻で model.evaluate と同じ値になること（テンプレートの枠・道・出来事・流し込みを含む）と、buildPack の出力（ジオメトリ・player.entity.json・render controller）に矛盾なく足すこと

- extendPack(files, doc, ctx) → { files, warnings, stats }（ctx = { ns, rpDir, bpDir, S, elements: [{ name, bone, kind }] }。GeoUICore.buildPack の出力に足す。BP 側は runtime の仕事なので触らない）: シーケンスごとのアニメーション（ボーンの position・rotation・scale を v.<ns>_st の Molang 式で）、レイヤーごとの render controller（part_visibility で自分のボーンだけ、color.a に opacity × v.geoui_alpha、uv_anim に連番のコマ）、player.entity.json の animations・scripts.animate・pre_animation への追加、音は sound_effects と sound_definitions（GeoUITimeline.media で）
- 時間: pre_animation で <ns>:seq_gen が変わった時の q.life_time を覚え、v.<ns>_st = 経過 + seq_from（止めている間は from のまま）、loop・hold・pingpong もこの式の上で。代入と三項演算だけで（GeoUICore.runPre で動く形）
- テンプレートと実体: contract.budget の mode に従う。枠の数だけテンプレートのボーンをジオメトリに複製（名前は <ボーン>_s<k>）。焼き込みは枠ごとの区間の入れ子の式、流し込みは <ns>:s<k>t・<ns>:s<k>p を contract の unpack と同じ式で読む。出来事は <ns>:s<k>g が変わった時の時刻を覚えて trigger のクリップを再生。道は弧長の表を折れ線にした式
- 式: 区間ごとの (t < t1 ? … : …) の入れ子、イージングは math.pow・math.sin などで正確に（bezier は 16 の折れ線にして誤差を warnings に）、同じ値の続きはまとめ、数は 4 桁に丸める。1 つの式の長さに上限（既定 8000 文字。超えたら折れ線に落として warnings）。stats に式の長さ・ボーンの数・枠の数
- 試験（いちばん大事）: 作った Molang を GeoUICore.molang・runPre で 0〜duration を 1/60 秒ごとに評価し、GeoUITimeline.model.evaluate と 1e-3 で一致（全イージング・トランジション・ループの継ぎ目・pingpong・止め・シーク・実体の出入り・道・出来事・流し込み（プロパティを偽で入れて））。300 個の実体で式の長さが上限に収まる。JSON がすべて読め、置き場所と format_version が今の書き出しと同じ

## 4. tl-runtime: ゲームの中の動かし手（BP: 再生の命令・実体の流し込み・入力と判定・点数とコンボ）と、osu! 風の見本のアドオン

持ち物: `bds/geoui/timeline/runtime.js`、`bds/geoui/timeline/demo.mjs`、`bds/addons/geoui_rhythm/**`、`tests/tl-runtime-offline.mjs`

試験: `node tests/tl-runtime-offline.mjs`

難しい所: サーバーの tick（50 ms）とネットワークの遅れの上で、実体を出る前に枠へ流し込み、入力の時刻で判定すること。Script API はこの BDS にある物だけ

- runtime.js: extendBehavior(files, doc, ctx) → { files, warnings }: player.json に contract のプロパティ、scripts に命令（今の scriptOf と同じ書き方）: scriptevent <ns>:play <seq> [from 秒]・stop・pause・resume・seek <秒>・offset <ms>（音と見た目のずれの補正）。マーカーの event は /scriptevent <ns>:marker <seq>:<id> に
- 流し込み: 毎 tick、これから出る実体を contract.allocateSlots の枠へ、出る lead + 余裕（既定 250 ms）前に <ns>:s<k>t・<ns>:s<k>p を入れ、終わった枠は空ける。シーク・止め・速さ・ループで正しく入れ直す。プレイヤーごと
- 入力と判定: ボタン（ジャンプ・スニークの playerButtonInput、使う・叩く）と、狙い（向き → プレイ領域のカーソル。感度は設定）。判定の幅は譜面の OD から（osu.js の式）、結果を <ns>:s<k>g・<ns>:s<k>r へ、点数・コンボ・正確さ・体力を数字とゲージの要素へ。Script API の名前はこの BDS で確かめる（node lab.mjs api <名前>）
- demo.mjs と bds/addons/geoui_rhythm/（geoui_bb と同じ形: TASK.md・app.txt・bp・rp・imported.json・tests.txt）: 自分で作った短い譜面（120 BPM・円・スライダー・スピナー・40 個ほど）と、media.makeWav で作ったクリックの音。GeoUITimeline.compile が無い所では RP のアニメーション無しで書き、統合の後に司令塔が回し直す。tests.txt は本物の BDS と本物のクライアント（@A）で再生・シーク・判定の命令（node lab.mjs go が動けば）、app.txt は本物のアプリで再生して 0.25 秒ごとに shot と measure diff（実機の CI は司令塔が回す）
- 試験（Node）: 流し込みが出る前に間に合う・同じ枠で重ならない・シークの後に正しい・判定の幅の境目・点数とコンボ・命令の読み取り・BP の JSON が読める

## 5. tl-timeline: 動画編集ソフトのようなタイムラインのパネル（トラック・クリップ・鍵・拍の格子・音の波形・実体の並び・再生ヘッド・マーカー・キー操作）

持ち物: `bds/geoui/timeline/view.js`、`bds/geoui/timeline/timeline.js`、`tests/tl-timeline-offline.mjs`、`bds/geoui/timeline/check-timeline.mjs`

試験: `node tests/tl-timeline-offline.mjs && <ブラウザの環境> node bds/geoui/timeline/check-timeline.mjs`

- view.js（純粋）: 時刻 ↔ px（拡大・横スクロール）、トラックの行、クリップ・鍵・マーカー・実体の四角、hitTest(x, y)（クリップの体・左右の端 6 px・鍵・マーカー・実体・ルーラー・トラックの頭）、吸い付く候補（拍の格子も）、ドラッグの状態機械（down・move・up → intent。Alt で吸い付きを外す、Shift で足して選ぶ、空いた所からの枠で選ぶ）。何千個の実体でも見えている所だけ（二分探索）
- timeline.js（DOM と canvas）: mount(el, store) → { unmount }。ルーラー（タイムコードと小節・拍）、拍の格子（1/1〜1/16、3 連）、音の波形（store.media の peaks）、トラックの頭（名前・目・鍵・ソロ・ミュート）、クリップ（名前・鍵の印・トランジションの三角）、テンプレートの実体の列（印をドラッグで時刻を動かす）、ダブルクリックでテンプレートの中へ（上にパンくず）、再生ヘッド、入・出、マーカー。描くのは変わった時だけ requestAnimationFrame で
- キー（パネルに焦点がある時だけ）: Space 再生/停止、J・K・L、← → 1 コマ、Shift+← → 1 拍、S 切る、Delete 消す、Shift+Delete 詰めて消す、Ctrl+D 複製、K 鍵、, . 前後の鍵、I・O 入・出、M マーカー、1〜6 で拍の分け方、Ctrl+ホイール・+/- 拡大、\ 全体。右クリックのメニュー（Blockbench の Menu があればそれ、無ければ自前の div）
- 試験: view の当たり判定・ドラッグが出す intent・拡大の往復・1 万個の実体で見えている所だけを数える速さ（Node）。check-timeline.mjs は Chromium で偽の store に mount し、ドラッグ・端を伸ばす・キーを送って dispatch された intent と再描画を確かめる

## 6. tl-editors: インスペクタ・イージングの曲線エディタ・実体の表・画面の上で道と位置を直す道具

持ち物: `bds/geoui/timeline/inspector.js`、`bds/geoui/timeline/curve.js`、`bds/geoui/timeline/instances.js`、`bds/geoui/timeline/pathedit.js`、`tests/tl-editors-offline.mjs`、`bds/geoui/timeline/check-editors.mjs`

試験: `node tests/tl-editors-offline.mjs && <ブラウザの環境> node bds/geoui/timeline/check-editors.mjs`

- inspector.js: mount(el, store) → { unmount }。選んだもの（シーケンス・トラック・クリップ・鍵・マーカー・テンプレート・実体・道・tempo）に合わせた欄。変えると store.dispatch（*.set）。複数を選んだら共通の欄だけ（値の違う欄は「—」）。プリセット（GeoUITimeline.presets、無ければ空）とトランジションの一覧: クリックで選んだクリップの頭・尻へ、プリセットは再生位置へ
- curve.js: 3 次ベジェの曲線エディタ（canvas。2 点のドラッグ、名前付きのイージングを並べて選ぶ、動く点のプレビュー）。純粋な部分（曲線の点・当たり判定・名前付きのイージングに一番近いベジェ）は Node で試験
- instances.js: mount(el, store) → 実体の表（時刻・テンプレート・param の列。並べ替え・絞り込み・何千行でも見えている行だけ描く・TSV/CSV の貼り付けで足す・行を選ぶと再生位置がそこへ）。osu! の取り込みのボタン（.osu を読む → GeoUITimeline.osu.toDocument → instances.import。osu.js が無ければボタンを出さない）
- pathedit.js: attach(host, store) → { detach }。プレビューの canvas の上の重ね絵（host.frameRect でモデル単位 ↔ px）: 道の点の追加・移動・削除・種類の切り替え、選んだ実体の位置（param.x・param.y）のドラッグ、拍に合わせた点の格子。出すのは intent だけ
- 試験: 曲線と当たり判定・表の並べ替えと絞り込み・貼り付けの読み取り・モデル単位 ↔ px（Node）。check-editors.mjs は Chromium で偽の store と偽の host に付け、欄の変更・曲線のドラッグ・道の点のドラッグで dispatch された intent を確かめる

## 7. tl-bridge: 全部を GeoUI Builder につなぐ（パネル・保存・取り消し・プレビューの再生と音・実体のプレビュー・動画の書き出し・パックの書き出し・1 ファイルのプラグイン）

持ち物: `bds/geoui/geoui_builder.js`、`bds/geoui/timeline/store.js`、`bds/geoui/timeline/player.js`、`bds/geoui/build.mjs`、`bds/geoui/dist/**`、`bds/geoui/blockbench-check.mjs`、`bds/geoui/timeline/check-bridge.mjs`、`tests/tl-bridge-offline.mjs`、`bds/geoui/TIMELINE.md`

試験: `node tests/tl-bridge-offline.mjs && node tests/geoui-builder-offline.mjs && node bds/geoui/build.mjs --check && <ブラウザの環境> node bds/geoui/timeline/check-bridge.mjs`

難しい所: Blockbench の中での待ち合わせ（パネル・Undo・プロジェクトの保存・プレビューの描画と音）と後始末

- store.js: createStore({ getDoc, setDoc, undo, elements, media, player }) → rules の store。dispatch は GeoUITimeline.model.reduce を通し、Blockbench の Undo（取り消し・やり直しで文書が戻る）。player.js: createPlayer({ store, host, evaluate, clock }) → transport と seekTo・setLoop・setRange・dispose。時刻は「始めた時からの経過 × 速さ」（コマが抜けても遅れない）、音楽はその時刻に合わせて WebAudio で（ずれを測って直す）、効果音は頭を通った時に
- player.js の renderFrames({ from, to, fps }) と exportVideo({ format: 'webm'|'png-zip', fps, from, to, scale, onProgress, signal }): webm は canvas.captureStream(0) と requestFrame をコマごとに（音楽も載せる）、png-zip は frameRect で切り出して GeoUITimeline.media.zipStore で
- geoui_builder.js: Project.geoui_sequences を .bbmodel に保存・読み込み。パネル（下にタイムライン、右にインスペクタと実体の表）と道の重ね絵を GeoUI の形式の時だけ。メニュー（シーケンス・プリセット・素材の取り込み（画像・連番・音）・osu! の取り込み・動画の書き出し）。host: 要素のボーン・メッシュへ置いた位置の上から動き・不透明度・値・ゲージ・コマを当て、同時に見える実体の数だけテンプレートのボーンの見た目だけの複製を作る（保存しない、消す時に必ず片付ける）。build で GeoUITimeline.compile.extendPack と GeoUITimeline.runtime.extendBehavior を通す（無ければ今のまま）。teardown で全部外す
- build.mjs: timeline/*.js と geoui_builder.js を 1 つの bds/geoui/dist/geoui_builder.js に（順: model, contract, media, osu, presets, view, timeline, curve, inspector, instances, pathedit, player, compile, runtime, store, 本体。無いファイルは飛ばす）。--check は dist が最新か
- blockbench-check.mjs は dist を読む（今の 10 項目はそのまま通る）。check-bridge.mjs: 本物の Blockbench 5.2.2 で、シーケンスを作る → クリップと鍵 → 再生で絵が動く → 取り消しで戻る → .bbmodel の往復 → 500 個の実体を取り込んで再生が 30 fps 以上 → 動画の書き出しのコマ数 → パックの書き出しにアニメーション。偽の時計での再生位置・速さ・ループ・音の呼び出しは tests/tl-bridge-offline.mjs（Node）で
- TIMELINE.md（日本語の使い方）: 画面の見方・キー操作・拍と BPM・テンプレートと実体・道・出来事（当たり外れ）・osu! の取り込み・プリセット・書き出し（パックと動画）・ゲームの中での再生と判定（scriptevent）・できないこと（要実測を含む）

## 見直す観点

### rv-game（tl-model・tl-anim・tl-runtime の後）

- model.evaluate と compile の Molang が食い違う時刻（鍵の時刻ちょうど・長さ 0 の区間・step・ループの継ぎ目・pingpong の折り返し・実体の出入り・出来事・シークと一時停止）
- 枠が足りない・同じ枠に 2 つ・流し込みが間に合わない道（速い譜面・シーク・ループ・プレイヤーが入り直した時）
- プロパティの数・範囲・24 bit の詰め方の誤り、Molang の式の長さ・数の丸めで見た目が変わる所
- サーバーの tick とネットワークの遅れの上での判定の誤り、Script API の名前の誤り

### rv-editor（tl-timeline・tl-editors・tl-bridge の後）

- プラグインを外した・プロジェクトを閉じた・切り替えた時に残る物（イベント・パネル・重ね絵・requestAnimationFrame・MediaRecorder・音・見た目だけの複製のボーン）
- Blockbench のショートカット・Undo・保存との食い違い（取り消せない操作・保存されない状態・別のプロジェクトへ漏れる状態）
- 何千個の実体・長い曲での重さ（毎フレームの再描画・評価・表）
- 音楽と絵のずれ、書き出した動画のコマの時刻のずれ

## 最後に回す試験

- `node tests/geoui-builder-offline.mjs`
- `for f in tests/tl-*-offline.mjs; do node $f || exit 1; done`
- `node bds/geoui/build.mjs --check`
- `node tests/lint-offline.mjs`
- `<ブラウザの環境> node bds/geoui/blockbench-check.mjs --out <絵の置き場所>`
- `for f in bds/geoui/timeline/check-*.mjs; do <ブラウザの環境> node $f || exit 1; done`

ブラウザの環境: `GEOUI_NODE_MODULES`（playwright）・`CHROMIUM`・`BLOCKBENCH_DIR`（本物の Blockbench の web 版。bds/geoui/blockbench-check.mjs と同じ）。

## 進み具合

- 1. tl-model: **できた**。model.js: イージング 32 種と 3 次ベジェ、タイムコード、拍（tempo の点で格子が整数の拍から）、道（直線・ベジェ・Catmull・円弧を弧長で等速、osu! の長さ）、
  式（param・四則・Molang の math。eval しない）、normalize・validate（日本語）、evaluate（鍵・トランジション・loop/hold/pingpong・in/out・muted/solo・道・
  テンプレートの実体（出ている間だけ、二分探索）・出来事（trigger・until））、reduce（rules の intent すべて。元の文書は変えない・重ならない一番近い所・吸い付き・
  ripple・split・locked）。contract.js: 枠の割り当て（区間の彩色・gap・溢れ）、24 bit の詰め方と同じ式の Molang、プロパティの名前と定義、予算（焼き込み／流し込み、
  上限 32 は要実測）。試験 `node tests/tl-model-offline.mjs`。
  追加: テンプレートのクリップの始まり・終わりを式に（param.d）、式の中で t（クリップが始まってからの秒）、実体ごとの道（`path: '@instance'`）と tail、道の長さ（osu! の長さ）。
- 2. tl-assets: **できた**。できた: osu.js（.osu v14 の読み取り、AR・CS・OD・スライダーの長さの式、コンボの番号と色、文書へ: 円・スライダー（体・頭・玉の往復）・
  スピナーのテンプレート、実体、道、tempo、音楽のトラック）、media.js（MaxRects のアトラス・連番の uv_anim・文字の配置（折り返し・揃え）・WAV を作る/読む・OGG の長さ・
  波形・sound_definitions・無圧縮 ZIP と読み戻し・連番の並べ方・スライダーの体の線と絵の描き方）、presets.js（タイトル・名前のテロップ・点数のポップ・カウントダウン・
  通知・進むゲージ・点滅・揺れ・ヒットの弾け・コンボのポップ・判定の文字）。試験 `node tests/tl-assets-offline.mjs`。
- 3. tl-anim: **できた**。compile.js（extendPack）: 値はすべて pre_animation の変数で（シーケンスの時間＝seq_gen が変わった時の q.life_time から、
  loop/hold/pingpong/in-out、一時停止とシーク）、各シーケンスのアニメーションはボーンをその変数で動かすだけ。全イージング（expo・elastic は端で飛ばない形に model と
  そろえた）、ベジェは 16 の折れ線（誤差を warnings に）、トランジション、式（param・t）、道（折れ線を弧長で、osu! の長さ）、テンプレートの枠（ボーンの複製・焼き込み／
  流し込み・24 bit のプロパティ）、出来事（g・r で時刻を覚え、trigger・until）、要素ごとの不透明度とコマ（専用の render controller と part_visibility）、数字の
  値（桁の変数を作り直す）、ゲージの量（transform の fill を譲る）、音（sound_effects と sound_definitions）。試験 `node tests/tl-anim-offline.mjs`（1.2 秒）:
  ゲームの Molang を 1/60 秒ごとに GeoUI Builder の評価器で回し（変数はフレームをまたいで残す）、全要素を model.evaluate と 1e-3 で比べる — 自分のトラック（全イージ
  ング・トランジション・loop の 4 種・シーク）、osu! の焼き込みと流し込み（スクリプトが入れるのと同じプロパティ）、当たり・外れ。
  要実測: プロパティの数の上限（32 と見込む）・Molang の式の長さの上限・アニメーションを重ねた時のスケールの掛け算と回転の向き・render controller の描く順・
  シークの後の音。osu! のテンプレートは円の大きさを数で持ち、流し込みの詰め方（x 8 bit・y 7 bit・番号 6 bit・色 3 bit）を持つ。
- 4. tl-runtime: **できた**。できた: runtime.js — エンジン（1 つの関数。パックのスクリプトがその源を持ち、試験は同じコードを偽の世界で回す）: scriptevent の
  play・stop・pause・resume・seek・offset、流し込みの枠を出る 250 ms 前に入れ・終わったら空ける、押した（ジャンプ・スニーク・アイテムを使う）時刻を osu! の幅で判定
  （300/100/50・外れ）し枠へ g・r、点数（コンボで増える）・コンボ・正確さ・体力を v0〜v3 へ、マーカーの event を scriptevent で。extendBehavior: プレイヤーの
  プロパティ（contract）とスクリプト（main.js から読む）。試験 `node tests/tl-runtime-offline.mjs`。
  見本 bds/addons/geoui_rhythm（`node bds/geoui/timeline/demo.mjs` が作る。譜面・絵・クリックの音はラボの物）: 円 17・スライダー 1（往復）・スピナー 1、
  点数・コンボ・体力のゲージ、コンボの色は uv_anim のコマ。本物の BDS で tests.txt 6/6（再生・シーク・一時停止・止める）。app.txt は本物のアプリで写す（司令塔が CI で）。
  枠の複製は、重なる面から 0.02 以上離れた奥行きへ（同じ面に 2 枚を作らない: ラボの z-fight の確かめも通る）。
- 5. tl-timeline: **できた**。view.js（純粋: 時刻 ↔ px・拡大（指した時刻を保つ）・行・当たり判定（体・端・鍵・マーカー・実体・頭のミュート/ソロ/固定）・
  1 万個の実体でも見えている所だけ（二分探索）・ドラッグの状態機械 → intent）、timeline.js（ツールバー（再生・タイムコード・吸い付き・拍の分け方・拡大）、
  ルーラー、拍の格子（BPM から・小節の線）、in/out、クリップ（トランジションの三角・trigger/until の印・音の波形）、鍵、実体の列、マーカー、再生ヘッド、
  キー: Space・J/K/L・←→（Shift で 1 拍）・Home・S・Delete（Shift で詰める）・Ctrl+D・K・, .・I/O・M・1〜6・+/-・\・Esc、右クリックのメニュー、
  ダブルクリックで実体のテンプレートの中へ・空いた所にクリップ）。試験 `node tests/tl-timeline-offline.mjs`（Node）と
  `bds/geoui/timeline/check-timeline.mjs`（本物の Chromium: ドラッグ・端・鍵・キー・メニュー・描いた色・外すと何も残らない）。
- 6. tl-editors: **できた**。curve.js（3 次ベジェの 2 点のドラッグ・名前付きのイージングの一覧・動く点・名前付きに一番近いベジェ（最小二乗、
  bounce と elastic は近い形が無いと言う））、inspector.js（シーケンス・テンポ・テンプレート・道・クリップとそのトラック・鍵・マーカー・実体の欄、
  複数を選ぶと共通の欄だけ・違う値は「—」、変更は intent（複数は batch で 1 回の取り消し）、数の欄はラベルを横にドラッグ、イージングは曲線を開く、
  トランジションを選んだクリップの頭・尻へ、プリセットを再生位置へ（選んだクリップのトラックが同じ要素ならそこへ））、instances.js（実体の表:
  並べ替え・絞り込み（x>0 template=名前 語）・見えている行だけ描く・行で選んで再生位置へ・セルを直す・TSV/CSV の貼り付け・TSV でコピー・
  osu! の取り込み）、pathedit.js（プレビューの上に道と実体の位置: 点をドラッグ・Ctrl+クリックで足す・Alt+クリックで消す、実体の点をドラッグ、
  格子と 1 拍の距離の輪に吸い付く。こちらの物の上でなければポインタはプレビューへ）。model に batch の intent（全部か何もしないか）、取り込みで
  実体の道（instance.path）も新しい id に。試験 `node tests/tl-editors-offline.mjs`（Node）と `bds/geoui/timeline/check-editors.mjs`（本物の Chromium）。
  要実測: サーバーの tick は 50 ms 刻み（判定の細かさ）・押してから届くまでの遅れ（offset で補正）・loop と流し込みの 2 周目。

- 7. tl-bridge: **できた**。store.js（rules の store: dispatch は model.reduce を通して 1 回が Blockbench の Undo の 1 手（履歴に「GeoUI: クリップを動かす」など）、
  選びは文書に無い物を名指さない、購読者へ何が変わったか（doc・selection・time。再生中の毎フレームは time だけ: インスペクタと表は描き直さない））、
  player.js（時刻 = 始めた所 + 時計の経過 × 速さ。音がある間は **音の時計**（WebAudio の currentTime。出力の遅れの分は絵が待つ）: 絵は聞こえる音に
  合い、ずれは溜まらない。ループ・範囲・逆再生・コマ送り、音のクリップは 3 秒先まで予約（途中からも・高さ・音量・ミュート/ソロ）、プレビューの
  当たり（オート / 外れ / なし）、renderFrames と exportVideo: PNG の zip（透明）と webm（MediaRecorder: 最初のコマを先に描き、録る前に少し待ち、
  音は全部読んでから。背景は黒・緑・白・透明（VP9 のアルファ）））、bridge.js（Blockbench の中: 文書と音を .bbmodel に（Project.geoui_timeline・
  geoui_media）、Undo の create_undo_save / load_undo_save に文書をそのまま（reduce は元を変えない: 手ごとの写しは要らない）、パネル 3 つ
  （Blockbench が全部のボタン・入力を自分の形にするので、パネルの中はブラウザの形に戻す）、プレビューは display_animation_frame で Blockbench の
  ポーズの上に当てる（x は Blockbench の鏡に合わせて、回転・大きさ・不透明度とコマ（Blockbench のシェーダーに alpha と uv のずらしを足した、
  その要素だけの材質）・数字の桁・ゲージの量）、実体はテンプレートのボーンの複製（シーンだけ、出入りで作って消す）、道の重ね絵、素材（音・画像・連番 →
  1 枚のテクスチャとコマのクリップ）、osu!（.osu・.osz、足りない要素を描く: コンボ色のコマ・番号・弾け・×・スピナー・玉・スライダーの体のアトラス）、
  動画の書き出し、書き出しに compile と runtime、外すと何も残らない）、model の batch に `$0`（前の intent が作った id）。build.mjs が 1 ファイルに
  （各部は自分のスコープ: デスクトップ版の `module` を取らない）。試験 `node tests/tl-bridge-offline.mjs`（Node: store・偽の時計と WebAudio の player・
  bridge の純粋な部分・dist が最新）、`bds/geoui/blockbench-check.mjs`（dist で 10/10）、`bds/geoui/timeline/check-bridge.mjs`（本物の Blockbench 5.2.2:
  パネル・Undo・シークで要素の位置と不透明度・実体の複製の位置・+90 度は画面で時計回り・音が鳴る・.bbmodel の往復・パックの中身・osu! の要素・
  500 実体で 1 フレーム 2〜3 ms・PNG 10 コマ・webm のコマ数と音・外して何も残らない）、使い方 `bds/geoui/TIMELINE.md`。
- 見直し（rv-game・rv-editor）: **できた**。
  - rv-game: model.evaluate とゲームの Molang を、鍵の時刻ちょうどの前後 1 ms（16 か所）・ループの継ぎ目（2.4・4.8 秒）・往復の折り返し（2・3.5・5 秒）・
    最後で止める所で比べる試験を足した（tl-anim 14/14: 食い違いなし）。GeoUI 本体の `alpha` プロパティはゲームで効かない（2 回目の確かめ）ので、
    0 のときは根のボーンの大きさも 0 にして隠す（`v.geoui_scale*(v.geoui_alpha>0.004?1:0)`。途中の濃さは timeline の fade の材質で）。
    作り直したのは probe 3 つと geoui_rhythm。geoui_bb・geoui_calib* は前の確かめの物なので作り直していない（次に GeoUI Builder で書き出せば入る）。
  - rv-editor: 再生中に音のクリップを動かすと、鳴っている音を止めて今の時刻から置き直す（前は古い位置で鳴り続けた）。デザインを直したら（テンプレートの
    ボーンを動かした・大きさや絵を変えた）実体の複製を次のフレームで作り直す（前は古い形の複製が残った）。名前からボーンを探すのを 1 フレーム 1 回の表に
    （何百の実体でも線形に探さない）。動画のコマの大きさは Blockbench のプレビューの画素の比（その設定）で測る（画面の比では倍率の設定でずれた）。
  - osu! のスライダーの体: 前は譜面の点（制御点）を折れ線で結んで描いていた（ベジェは V の字、円弧は山形になり、玉は体の端を走った。osu! の長さも
    見ていなかった）→ 玉の通る線（model.pathTable の折れ線を osu! の長さで切る・延ばす。osu.lineOf → bodies[].line）で描き、体の要素はその線の
    真ん中（bx・by）に置く。media.rasterOps（キャンバス無しで bodyImage の線を描く）で、見本 geoui_rhythm にも体を入れた（アトラス 128 x 256。
    demo --check の「sliderbody がありません」の注意が消えた）。試験 tl-assets 29/29（玉の通る所が線の上・制御点は外・画素で体と縁）。
    check-bridge.mjs に、本物の Blockbench のプレビューの画素で体を確かめる項目を足した → 回した（2026-10-22、Blockbench 5.2.2 の web 版）: 初回で通った
    （check-bridge 20/20）。体の複製は線の真ん中（bx・by）にずれ 0.05 未満で置かれ、いちばん低い所の 7.5 単位上に白い縁、真ん中の制御点の 7.5 単位下と
    線から離れた所には何も無い（プレビューで 1 単位 1.67 px）。全部の試験も通った（Node の tl-* と geoui-builder と lint、build・probe・demo の --check、
    blockbench-check 10/10、check-editors 26/26、check-timeline 15/15）。
- 作り直し（本物の大きさの譜面）: **できた**（2026-10-22）。osu.sampleMap の 300 個の譜面で、前の書き出しは Molang 181 万文字・1 行最長 50 万文字・
  プロパティ 63 個（GeoUI の 11 個を含む。上限 32）で、ゲームで動かない大きさだった（9 割がスライダーの玉の道: 実体ごとの折れ線を 1 行の入れ子に）。
  - contract.js: プロパティを 4 + 4×枠 → 2 + 流し込みの枠ごとに 2 + 当たり外れ 8 枠ごとに 1 に。`<ns>:seq` = シーケンス + 1024 × 止め +
    2048 × 世代（8192 で回る）、`<ns>:seq_from`、`<ns>:<tag><k>t`・`p`（流し込み）、`<ns>:<tag>e<g>`（枠 8g〜8g+7 の結果、3 bit ずつ。スクリプトは
    次の実体が枠を取ると 0 に戻す）。budget はシーケンスどうしで共有する数（タグごとの最大）と、GeoUI の分（base）を足した数で注意。
  - compile.js: 焼き込みが既定（bakedMax 2000。超えて param が pack に入るテンプレートだけ流し込み）。枠の今の実体は searchLines（16 個ずつの組と
    二分木: 三項演算子は選ばない枝を計算しないので、1 フレームは数回の比べ）、値は tableLines（実体の番号 → 値、同じ値の続きはまとめる）。
    実体ごとの道はその実体のアニメーション（pathKeys: pathM と同じ折れ線の鍵を長さの半分に並べ、anim_time_update = 進み × 0.5。ループの継ぎ目に
    時刻が来ない）、条件はその枠がその実体を見せている間だけ。できた行はすべて splitLines（1000 文字・括弧 24 段）。注意: ボーン 600・
    render controller 70・アニメーション 1200 を超えたら（確かめた所まで）。変数名: param は `_p<名前>` なので、書き出し自身の変数は `_p` で始めない
    （前は `_pr` が param r とぶつかっていた）。
  - runtime.js: 新しいプロパティ、loop・pingpong は回るたびに流し込み直して判定し直す（前は 2 周目を流さなかった）、pingpong の戻りは判定と
    音が無い（前は戻りで毎 tick 音を鳴らし直す道があった）、シーク・再開で全部の枠の結果を 0 に。
  - 300 個の譜面: プロパティ 15 個（GeoUI の 11 個を含む）、1079 行・20 万文字・最長 653 文字・括弧 9 段・ボーン 405 本・要素ごとの render controller 59 個・
    アニメーション 106 個（見本 geoui_rhythm_big の数）。1000 個でも 15 個・43 万文字・最長 677 文字。
  - 試験: tl-anim 17/17（ボーンの位置を、流れているアニメーションすべての和で計算して比べる形に強めた: 実体ごとの道のアニメーションも、
    その鍵・anim_time_update・条件ごと確かめる。300 個の譜面の全要素を 1/20 秒ごと 40 秒・当たり外れ 89 個で一致）、tl-model 67/67（予算・
    seq と結果の詰め方を Molang の評価で）、tl-runtime 31/31（次の実体で結果が 0 に戻る・シークで 0・loop の 2 周目・pingpong）、
    tl-probe 18/18。見本に `bds/addons/geoui_rhythm_big`（300 個・音楽なし・アトラス 1024 x 1024 にスライダーの体 104 本）。本物の BDS で
    geoui_rhythm・geoui_rhythm_big とも tests.txt 8/8、`go` も DONE（qa clean）。
  - ついでに直した: 実体の表でセルをダブルクリックした直後に、前のクリックの描き直しが入力欄を消すことがあった（check-editors が時々 25/26。
    変更前のコードでも落ちた）→ 入力中は描き直さない。5 回続けて 26/26。
  - probe_m を作り直し: 2・3 回目（6000〜16000 文字の行・括弧 54 と 100 段を入れた物）はアプリがワールドに 3 回とも入れなかった
    （join-lan-missing・join-play-unreached。同じ時の他の probe は入れた。BDS は読み込み、手元のクライアントは入れた）。書き出しはその形を
    もう出さないので、書き出しが出す形だけにした: splitLines の行・1000 文字の 1 行・括弧 24 段・2000 個の引き方（searchLines・tableLines）・
    3000 行 45 万文字。

### 本物のアプリで確かめたこと（probe.mjs → bds/addons/geoui_probe*、app.yml で写して `node bds/geoui/timeline/probe.mjs read <summary.json>`）

- 1 回目（2026-10-21、run 39601130957 ほか）: ボーンは #248 まで描かれる。自分の render controller（共有のジオメトリを part_visibility で分ける）は
  31 個目も描かれる。アニメーションの中の q.anim_time は秒で進む。**pre_animation で一度も入れていない変数を `??` なしで読むと、その行から後が毎フレーム
  全部されない**（コンテンツログに Molang の行）。compile.js の時計がそれをしていたので、geoui_rhythm の枠の複製は 1 つも出なかった → `??` で直した。
- 2 回目（run 39605771908・39605779539）: 直した時計で後のカナリアが全部描かれ、わざと入れた未設定の読みの後だけ描かれない（止まる規則の確かめ）。
  pre_animation の q.life_time は秒で進む（アニメーションの q.anim_time と同じ速さ）。uv_anim は定数でも変数でも効く（連番のコマ）。compile.js の
  枠の複製（#140）・トラックの動き・実体の点は、止めた 4 秒・6 秒と再生中に正しい所へ出る。**render controller の color.a は GeoUI の blend の
  マテリアルでは何も変えない**（0 でも描かれる。GeoUI 自身の `alpha` プロパティも同じ: geoui_bb の alpha 0 の画は消えていない）→ 不透明度は
  色のマスク（USE_COLOR_MASK）を持つ fade のマテリアルで描く形に変えた（3 回目で確かめる）。止めた 2 秒が 2.64 秒だったのは、play の直後の pause が
  一瞬遅れるため（3 回目は止めたまま seek で時刻を決める）。probe_tl のコンテンツログに「molang」「variable」の行: ポーズ画面などの人形
  （paper doll）はプロパティを持たず、compile.js の q.property がそこで Molang のエラーになり後が止まる、と見て `variable.is_paperdoll ? 0 :` で守り、
  外から読む変数（seq・不透明度・コマ）は initialize でも入れる（3 回目はログの行を細かい正規表現で分けて確かめる）。
- 音: シーケンスのアニメーションは 1 秒で回る（loop）ので、そこに置いた sound_effects は毎秒鳴っていた → 音のクリップはビヘイビアパックの
  スクリプトがシーケンスの時刻で鳴らし（Player.playSound・クリップの音量と高さ）、一時停止・シーク・停止で止める（/stopsound）。途中からは鳴らせない
  （シークや再開の時に頭を過ぎた音は鳴らない）。プレイヤーが入り直したら、その時刻から送り直す（クライアントの q.life_time は入った時から）。
  世代（seq_gen）はプレイヤーの持つ値から続ける（サーバーを立て直しても、同じ番号で「変わっていない」と見られない）。
- 3 回目（2026-10-22）: geoui_probe（run 39699374650）の答えはコミット 79417e3 に（fade の材質で不透明度が効く・+90 は時計回り・同じボーンの
  scale は掛け算・position は足し算・initialize が効く・anim_time_update が効く）。**geoui_probe_b**（run 39700777530）: ボーン #250・#255・#256・#257・
  #300・#511・#512・#599 の板はどれも動いた（番号が 1 バイトで 256 で回ることは無い: 600 本まで効く）。#400 の板だけ見つからなかった（前後の番号は
  動くので番号の上限ではない）→ 理由が分かった: #400 だけが右端の列（x 50 単位）にあり、選ぶと +20 動いて 70 単位
  （画面で約 1075〜1105 px）へ出る。測る範囲は一人称の手の手前の 1030 px までなので、動いた板は写っていても測られなかった。probe_b を
  6 列に並べ直し、どの probe でも測る範囲の外を見に行く並べ方なら probe.mjs が作る時に止まるようにした。自分の render controller の 40・70 個目が描き、1200 個目のアニメーション
  （anim_time_update）が動かした。何も選ばない画面は何も出ない。コンテンツログの molang・variable・unknown 系の行は item_use・main_hand・holding・
  spear の名前の節にだけ当たり（バニラのプレイヤーの変数）、パックの名前空間・geoui_ には無い。**geoui_probe_m**（run 39734548973・39739198496）:
  アプリがワールドに入れず、何も測れなかった（上の「作り直し」の probe_m を参照）。
- 4 回目（2026-10-22、作り直した書き出し。写真と録画は Discord にも: app/lib/feed.mjs）:
  - **geoui_rhythm**（run 39751822092、19 個）: 参加（210 秒）・再生 1〜12.5 秒の写真 10 枚・シーク 6 秒・一時停止・止めまで、手順はすべて
    通った。どの時刻でも演奏の場所が変わり（measure diff の範囲と数が時刻ごとに違う）、シーク 6 秒は再生 6.5 秒と同じ範囲。落ちたのは
    コンテンツログの molang の行の確かめだけ（probe_b で分かったバニラのプレイヤーの変数の行）→ 見本はパックの変数（geoui_）の行だけを見る。
  - **geoui_rhythm_big**（run 39753045902、300 個・プロパティ 15 個・pre_animation 1079 行）: **74 手順すべて通った**（参加 223 秒、
    再生 2〜112 秒の写真 10 枚・シーク 60 秒・一時停止・止め、コンテンツログに geoui_ の行なし）。どの時刻でも演奏の場所が変わり、止めると
    何も残らない（diff 0）。本物の大きさの譜面が本物のゲームで動く。Discord には 18 個（写真と録画）送れて失敗 0（summary.json の media）。
  - **geoui_probe_m**（run 39754604919）: 今回はワールドに入れた（2・3 回目の 3 回とも入れなかったのは、極端に長く深い行のせいだった）。
    splitLines で 16000 文字を 17 行に分けた物・1000 文字の 1 行・括弧 24 段・2000 個の焼き込みの引き方（1500 個目とその値）は、
    どれも描かれ、後ろのカナリアも描かれた: **書き出しが出す形はゲームで動く**。3000 行に 1 つずつ作った変数の最後を読む板だけ
    描かれない。カナリアは自分の時（その行を読まない時）に描かれるので、3309 行目・57 万文字目までの行は動く: 行の数でも文字数でも
    なく、変数の数の限度（906 個と 3055 個の間）が濃い → geoui_probe_vc・geoui_probe_lc で分ける。
  - **geoui_probe_tl**（run 39755766019、新しいプロパティの約束）: 止めた 0・2・4・6 秒でバーが +0・+20・+40・+60 単位、実体の点も
    その時刻の物、fader の不透明度 0・0.51・1.00、再生中は 2.5 秒後 +23.3・4 秒後 +46.8（写す時の遅れのぶん）: seq（シーケンス・
    止め・世代を 1 つの数に）と seq_from で、時計・止め・シークがゲームで正しく動く。落ちたのはバニラのコンテンツログの行だけ。
    Discord に 15 個。
- 5 回目（2026-10-22）: **geoui_probe_vc**（run 39769056136）: 1 行に 1 つ作った 3000 個の変数（パック全体で約 3023 個・3030 行。?? で
  読む）は、500〜3000 個目のどれも効いた。**geoui_probe_lc**（run 39770003767）: 1 つの変数を 5000 行（5029 行目）まで数えて合った。
  → 行の数も 3000 個の変数も限度ではない。probe_m の 3000 行（1 行 150 文字・変数を 10 回読む）の最後の変数だけが合わなかったので、
  大きさ（58 万文字）を **geoui_probe_sz**（同じ長い行で 1 つの変数を 4000 行・61 万文字まで数える）で測ることにした。
- 6 回目（2026-10-22）: **geoui_probe_sz**（run 39775140906）と **geoui_rhythm_huge**（1000 個・6 分・3.2 MB のパック。既定の枝には
  入れず addon/geoui_rhythm_huge。run 39778443343）は、どちらも参加の待ち（300 秒）で、サーバーの Player connected が無いまま落ちた
  （joined-no-connection。それまでの参加は 93〜223 秒）。封じた結果のほかに手がかりが無かったので、until joined が見た画面をラボの語の
  道筋に（summary.json の join_trail・failed_trails）、Player connected までの秒を join_connect_seconds に出すようにした
  （app/lib/scenario.mjs・client.mjs joinScreen・failcodes.mjs。接続の行が無いまま時間切れなら、最後の画面で joined-packs-slow・
  joined-loading・joined-connecting・joined-back-out に分ける）。600 KB を超えるパックの probe と見本は参加を 900 秒待つ。
- 7 回目（2026-10-22、参加の道筋つき）:
  - **geoui_probe_sz**（run 39785700040）: 参加 71.9 秒。**500〜4000 行のどれも数えて合った（4029 行目・61 万文字目まで）**: 大きさは
    限度ではない。参加の道筋は `srv-connected play-lan prompt-packs srv-spawned connecting loading*3 world`（Player connected まで
    56.3 秒）: **BDS の Player connected は、ゲームがパックのダウンロードを尋ねるより前（ログインの時）に出る**。だから 6 回目の
    2 本は、パックが遅かったのではなく、ログインまで行っていない（1 本はこの回入れた）。
  - 変数の数: エンティティの中で 3032 個目（probe_vc の 3000 個目、?? で読む）は効き、probe_m の 3053 個目（gpm_l2999、?? なしで
    読む）は値が合わず、止まりもしなかった。行（5029 行）と大きさ（61 万文字）は効いたので、残るのは変数の数（3032〜3053 個の間、
    要実測）→ **geoui_probe_vx**（3000〜5000 個を細かく、?? ありとなしで、最後に 1・2000 個目をもう一度）を作った（まだ回していない）。
    書き出しの注意は、pre_animation が 61 万文字・5029 行を超えたら、変数がプレイヤーの分も込みで 3000 個を超えたら（compile.js。
    stats.entityVariables）。300 個の見本は約 910 個・20 万文字、1000 個の見本は約 1020 個・43 万文字で、どちらも注意は出ない。
  - **geoui_rhythm_huge**（run 39787331657）: また入れなかった（join-refused）。道筋は `play-lan other*9[error+more+select+back+menu]
    refused[…]`: LAN のワールドを押すと、ゲームが「An error has occurred」を出していた（サーバーに Player connected は来ない）。
    300 個（1.4 MB）は最後まで動き、1000 個（3.2 MB）は 2 回とも入れない（要実測: パックの大きさか、BDS の起動直後の重さか）→
    until joined は、Player connected の前のゲームのエラーなら、LAN のワールドに入り直す（2 回まで、APP_JOIN_RETRIES）。エラーの
    種類も道筋に（refused-error・refused-timeout・refused-unable ほか: client.mjs refusalKind）、ゲームのエラーの語も道筋の語に。
- 8 回目（2026-10-22〜23、入り直しと参加 900 秒の待ちつき）:
  - 対照 **geoui_probe_lc**（run 39801374609）: 参加 106.6 秒（Player connected まで 89.1 秒）、9 か所すべて描かれた: 端末も参加も
    いつもどおり（6 回目の 2 本が入れなかったのは、その時の端末か参加の画面の側）。
  - **geoui_rhythm_huge**（run 39803242567、1000 個・6 分・3.2 MB・pre_animation 43 万文字・変数約 1020 個）: **74 手順すべて通った**。
    再生 2・10・30・60・120・180・240・300・350・375 秒のどれでも演奏の場所が変わり（measure diff の範囲が時刻ごとに違う）、シーク 300 秒・
    一時停止・止め（diff 0: 何も残らない）まで。**本物の大きさの譜面（1000 個）が本物のゲームで最後まで動く**。参加は 402.5 秒かかり、
    そのうち Player connected までが 386.7 秒（300 個は 223 秒、小さい probe は 62〜106 秒）: 前の 300 秒の待ちでは落ちていた。
    道筋 `play-lan srv-connected prompt-packs srv-spawned connecting*2 loading*3 world` に入り直しは無い。なぜつなぐまでが遅いかは
    要実測（パックの大きさは、クライアントがつなぐ前には知らない）。Discord に 18 個。
  - **geoui_probe_vx**（run 39806483703、変数 5000 個）: 19 か所すべて描かれた — 3000・3030・3045・3060・3100・3500・4096・5000 個目
    （パックの中で約 5023 個目まで）を ?? ありでも、geoui_probe_m と同じ ?? なしでも、最後に 1・2000 個目をもう一度読んでも。
    **変数の数は限度ではない**（少なくとも 5000 個まで）。行（5029 行）・大きさ（61 万文字）・変数（5000 個）のどれも限度でないので、
    probe_m の 3000 行の最後の変数が合わなかった理由は分からないまま（要実測。書き出しはその形を出さない）。書き出しの注意は、変数が
    プレイヤーの分も込みで 5000 個を超えたら、に直した（compile.js）。
- 参加の時間（2026-10-23、公開の summary.json 50 本と手元の本物の BDS から）: huge の「Player connected まで 386.7 秒」は join の段の
  始め（タイトル）からの秒だった。押した後の until joined の道筋は `play-lan`（1 回）→ `srv-connected`（OCR は 4 秒ごと）なので、押して
  から接続までは数秒、待ちは押す前。参加まで行った 31 本のうち、パックが 110 KB 未満の 19 本でも参加は 84〜319 秒（中央 131 秒、同じ
  geoui_calib で 97 秒と 319 秒）、300 個（1.4 MB）は 223 秒。手元の BDS 1.26.52 では 19・300・1000 個の見本で、up（約 4 秒）・
  待っている CPU（1 コアの 11〜12 %）・ボットの LAN の参加（接続まで約 1.4 秒）が同じ。→ **パックの大きさで参加が遅いとは言えない**。
  押す前のどこ（PLAY に着く・LAN のワールドが出る・焦点）で待ったかは要実測 → app の join の段が、PLAY が出た・LAN のワールドが出た・
  押した時と通った画面を、公開の summary.json の `join_lan_seconds`・`join_lan_trail` に出すようにした（次に本物のアプリを回すと分かる）。
  6 回目の huge が入れなかったのは、OCR（tesseract）がまだ入っていなかったため（ワークフローの裏の apt が手順の始まりの後まで動いて
  いた。app はいま手順の前に待つ: app/DESIGN.md）。6 回目の probe_sz は分からない。7 回目の huge で押した後にゲームが「An error has
  occurred」を 2 回出した理由は要実測。

# GeoUI タイムライン（動画編集ソフト並み・osu! が作れる水準）の計画

目標: GeoUI Builder を、osu! のようなリズムゲームの画面が作れるほどの動画編集ソフト並みのアニメーションの道具にする（トラック・クリップ・キーフレーム・イージング・トランジション・BPM と拍・テンプレートと多数の実体・道に沿った動き・当たり外れに応じた動き・文字・連番画像・音・再生・動画の書き出し・ゲームの中で動く Bedrock への書き出し）

並行なしで、上から 1 段ずつ作る（各段の試験と `node tests/lint-offline.mjs` が通ってから commit、次の段へ）。各段の後に、その段を読む見直し（下の「見直す観点」）を 1 回。

## 全段に共通の約束

- 置き場所と形: 新しいコードは bds/geoui/timeline/<部品>.js。どれも同じ形 `(function (root) { 'use strict'; const T = root.GeoUITimeline = root.GeoUITimeline || {}; … T.<部品> = {…}; if (typeof module === 'object' && module && module.exports) module.exports = T.<部品>; })(typeof globalThis !== 'undefined' ? globalThis : this);`。読み込みのときに他の部品を require しない（使う時に GeoUITimeline.<部品> から。Node の試験では、先にその部品のファイルを require する）。プラグインに npm の物は入れない（Blockbench がそのまま読む）
- データの形（全レーン共通・変えない）: 文書 = { version: 1, sequences: [Seq] }。Seq = { id, name, duration(秒), fps(既定 20), loop: 'once'|'loop'|'hold'|'pingpong', inOut: [入, 出]|null, markers: [{ id, t, name, event? }], tracks: [Track] }。Track = { id, kind: 'layer'|'audio', target(layer のとき GeoUI の要素の名前 = ボーン名), name, muted, locked, solo, clips: [Clip] }（上のトラックほど手前）。Clip = { id, start, end(秒。同じトラックで重ならない), offset(素材の時間), transitionIn?/transitionOut?: { kind: 'fade'|'slide-left'|'slide-right'|'slide-up'|'slide-down'|'zoom'|'pop', duration, ease }, channels: { x?, y?, scaleX?, scaleY?, rotation?, opacity?, value?, fill?, frame?: [Key] }, 音のクリップは sound, volume, pitch }。Key = { t(クリップの頭からの秒), v, ease }。ease はその鍵から次の鍵までの区間: 'linear'|'step'|'<sine|quad|cubic|quart|quint|expo|circ|back|elastic|bounce>-<in|out|inout>'|{ bezier: [x1, y1, x2, y2] }。x・y はモデル単位の、要素を置いた位置からのずれ。rotation は度、scale は倍、opacity・fill は 0〜1、value は数字の要素の値、frame は連番画像のコマ。クリップの無いトラック（とトラックの無い要素）は今のまま（いつも見える）。クリップのあるトラックの要素は、クリップの間だけ見える。osu! のための追加（同じく全レーン共通）: Seq に tempo: [{ t, bpm, meter }]（拍の格子と吸い付き。BPM が途中で変わってよい）、paths: [{ id, kind: 'linear'|'bezier'|'catmull'|'arc', points: [[x, y]] }]、templates: [{ id, name, lead(秒: 本番の時刻より前に出る長さ), tail(秒: 後に残る長さ), params: [名前], tracks: [Track] }]（テンプレートの中の時刻は本番の時刻からの秒。鍵の v は数か式の文字列: param.<名前>・四則・math.* だけ）、instances: [{ id, template, t(本番の時刻), params: { … } }]（何百個でもよい）。channels に path: [Key]（道の上の進み 0〜1。道は clip.path の id、長さに比例して等速）。Clip に trigger?: 'hit'|'miss'|名前（その出来事が起きた時刻から再生する。evaluate は opts.events = [{ instance, name, t }] で決める）。evaluate の states で、実体の要素の名前は「<要素>#<実体の id>」
- 部品どうしの約束（全レーン共通）: 画面の部品（timeline・inspector）は文書を書き換えず store.dispatch(intent) だけ。intent = { type, seq, … }: seq.add/remove/set, track.add/remove/set/move, clip.add / clip.remove{ids, ripple} / clip.move{ids, dt, dTrack, snap} / clip.trim{id, edge: 'start'|'end', t, ripple} / clip.split{ids, t} / clip.duplicate{ids, at} / clip.set{id, patch}, key.add{clip, prop, t, v?, ease?} / key.remove{keys} / key.move{keys, dt, dv} / key.set{clip, prop, index, patch}, marker.add/remove/set, preset.apply{track?, at, preset}（snap のとき snapTol 秒）。store = { doc(), dispatch(intent) → { ok, error? }, selection() → { seq, clips, keys: [{ clip, prop, index }], markers }, select(sel), time(), seek(t), subscribe(cb) → 外す関数, elements() → [{ name, kind: 'image'|'number'|'gauge'|'text', w, h }], media() → [{ id, kind: 'image'|'sequence'|'sound'|'font', name, frames?, duration? }], transport: { play, pause, toggle, stop, step(n), rate(r), playing() } }。host（プレビューの相手。bridge が作る）= { elements(), apply(states), render(), canvas(), frameRect() → { x, y, w, h }, playSound(id, { volume, pitch, offset }), stopSounds() }。states = model.evaluate の返り値 { 要素の名前: { visible, x, y, scaleX, scaleY, rotation, opacity, value?, fill?, frame? } }。足す intent: tempo.add/remove/set, path.add/remove/set（points の点の追加・移動）, template.add/remove/set, instance.add/remove/move{ids, dt, dx, dy}/set, instances.import{instances, templates?, tempo?, tracks?}（osu! の譜面などから一度に）
- 試験: tests/tl-<レーン>-offline.mjs は Node の標準ライブラリだけ（CI の offline が自動で拾う: ブラウザも Blockbench も無い所で通ること）。ブラウザでの確かめは bds/geoui/timeline/check-<レーン>.mjs に分ける（CI では走らない）: Playwright は GEOUI_NODE_MODULES=/opt/npm-tools/node_modules、Chromium は CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome（このコンテナにある）。本物の Blockbench 5.2.2（web 版）は BLOCKBENCH_DIR=/tmp/claude-0/-home-claude/31b6f006-5fb5-5f8a-b55c-61b09e2fcf52/scratchpad/bb/bbsrc（bds/geoui/blockbench-check.mjs の動かし方を手本に）
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
- `<ブラウザの環境> node bds/geoui/blockbench-check.mjs --out /tmp/claude-0/-home-claude/31b6f006-5fb5-5f8a-b55c-61b09e2fcf52/scratchpad/bbout`
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
- 6. tl-editors: 次（インスペクタ・曲線エディタ・実体の表・画面の上で道と位置）。
  要実測: サーバーの tick は 50 ms 刻み（判定の細かさ）・押してから届くまでの遅れ（offset で補正）・loop と流し込みの 2 周目。

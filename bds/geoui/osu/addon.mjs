// The two osu! sample add-ons (demo.mjs makes them with the timeline's other samples): bds/addons/geoui_osu_pixel (pixel art of
// cubes, the chip arrangement and blips) and bds/addons/geoui_osu_skin (osu!'s Legacy skin, CC-BY-NC 4.0 — the synth arrangement
// and the skin's hitsounds) — the same song and the same rhythm (bds/geoui/osu/music.mjs), GeoUI Builder's export with the
// timeline's RP and BP (osukit.js builds the design and the timeline, osugame.js is what the game plays by), a preview picture
// (render.mjs: not the game), tests.txt for a real BDS (the script plays it by itself: score, combo, accuracy, rank) and app.txt
// for the real app. makeOsu(V, { check }) → the files (a Map of path → bytes) and what it says.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../png.mjs';
import { renderFrame } from './render.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const G = require('../geoui_builder.js');
const Mo = require('../timeline/model.js');
require('../timeline/contract.js'); require('../timeline/media.js');
const O = require('../timeline/osu.js'), OG = require('../timeline/osugame.js'), K = require('../timeline/osukit.js'), C = require('../timeline/compile.js'), R = require('../timeline/runtime.js');
const NS = 'geoui';
const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';

export const OSU_SAMPLES = [
  { name: 'geoui_osu_pixel', skin: 'pixel', map: 'cubic_pulse_pixel.osu', music: 'cubic_pulse_chip.ogg', title: 'GeoUI osu! Pixel', description: 'GeoUI timeline: osu! in pixel art of cubes, its own song (bds-lab)', shots: [2.2, 10, 22.3, 30, 45, 52, 60, 67.5, 70] },
  { name: 'geoui_osu_skin', skin: 'skin', map: 'cubic_pulse_skin.osu', music: 'cubic_pulse.ogg', title: 'GeoUI osu! Skin', description: 'GeoUI timeline: osu! with its Legacy skin (CC-BY-NC 4.0, ppy), its own song (bds-lab)', shots: [2.2, 10, 22.3, 30, 45, 52, 60, 67.5, 70] },
];

/** the sounds of a look: the music, and osu!'s sample names → their files (the chip set's blips, or the Legacy skin's) */
function soundSet(V) {
  const A = path.join(HERE, 'assets'), S = path.join(HERE, 'skin-legacy'), files = {};
  if (V.skin === 'pixel') for (const f of fs.readdirSync(A).filter((x) => x.startsWith('chip-') && x.endsWith('.ogg'))) files[f.slice(5, -4)] = path.join(A, f);
  else for (const f of fs.readdirSync(S).filter((x) => x.endsWith('.ogg'))) files[f.slice(0, -4)] = path.join(S, f);
  return files;
}

export function makeOsu(V, top) {
  const OUT = path.join(top, 'bds', 'addons', V.name), out = new Map(), warnings = [];
  const map = O.parseOsu(fs.readFileSync(path.join(HERE, 'assets', V.map), 'utf8'));
  const images = {};
  if (V.skin === 'skin') for (const f of fs.readdirSync(path.join(HERE, 'skin-legacy'))) if (f.endsWith('@2x.png')) images[f.replace('@2x.png', '')] = decodePng(fs.readFileSync(path.join(HERE, 'skin-legacy', f)));
  // ---- the sounds: an osu! sample name → its id in the pack (soft / drum fall back on normal where the set has none)
  const have = soundSet(V), used = new Set();
  const sound = (n) => { const k = have[n] ? n : have[n.replace(/^(soft|drum)-/, 'normal-')] ? n.replace(/^(soft|drum)-/, 'normal-') : null; if (!k) return null; used.add(k); return `${NS}.${clean(k)}`; };
  const built0 = K.build(map, { skin: V.skin, images, music: 'music', sound, ns: NS, title: V.title, description: V.description, seed: V.name, settings: { calibration: G.MEASURED.id } });
  warnings.push(...built0.warnings);
  const { design, doc, info } = built0;
  design.textures.atlas.png = encodePng(built0.atlas.image).toString('base64');
  const atlasImage = design.textures.atlas.image; delete design.textures.atlas.image;
  const sounds = [{ id: 'music', ext: 'ogg', data: fs.readFileSync(path.join(HERE, 'assets', V.music)) }, ...[...used].map((k) => ({ id: k, ext: 'ogg', data: fs.readFileSync(have[k]) }))];
  // ---- the pack: GeoUI Builder's export, the timeline's RP and BP
  const built = G.buildPack(design);
  const rp = C.extendPack(built.files, doc, { design, core: G, sounds, extraSounds: [...used] });
  const bp = R.extendBehavior(rp.files, doc, { stats: rp.stats, windows: info.difficulty.windows, mode: 'aim', sens: 2.4, field: [96, 72] });
  warnings.push(...built.warnings, ...rp.warnings, ...bp.warnings);
  for (const [f, v] of Object.entries(bp.files)) {
    const rel = f.replace(`${NS}_RP/`, 'rp/').replace(`${NS}_BP/`, 'bp/');
    out.set(rel, v && v.base64 ? Buffer.from(v.base64, 'base64') : v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v)));
  }
  if (V.skin === 'skin') {
    out.set('rp/textures/geoui/LICENCE-osu-resources.md', fs.readFileSync(path.join(HERE, 'skin-legacy', 'LICENCE.md')));
    out.set('rp/textures/geoui/SOURCE.md', fs.readFileSync(path.join(HERE, 'skin-legacy', 'SOURCE.md')));
  }
  const props = Object.keys(JSON.parse(bp.files[`${NS}_BP/entities/player.json`])['minecraft:entity'].description.properties).length;
  const st = rp.stats, auto = OG.autoplay(built0.game, { fps: 20 }), fin = auto.states[auto.states.length - 1];
  // ---- a preview: the lab's own drawing of four moments (render.mjs — not the game; the real app is app.txt)
  {
    const nd = Mo.normalize(doc), ap = OG.autoplay(built0.game), w = 640, h = 360, at = [V.shots[2], V.shots[4], V.shots[6], V.shots[7]];
    const sheet = { width: w * 2, height: h * 2, data: new Uint8Array(w * 2 * h * 2 * 4) };
    design.textures.atlas.image = atlasImage;
    at.forEach((t, k) => { const f = renderFrame(design, nd, t, { w, h, events: ap.events, state: ap.at(t) }); for (let y = 0; y < h; y++) sheet.data.set(f.data.subarray(y * w * 4, (y + 1) * w * 4), (((k >> 1) * h + y) * w * 2 + (k & 1) * w) * 4); });
    delete design.textures.atlas.image;
    out.set('preview.png', encodePng(sheet));
  }
  out.set('imported.json', Buffer.from(`${JSON.stringify({ from: 'bds/geoui/timeline/demo.mjs (bds/geoui/osu/addon.mjs)', rp: [1, 0, 0], bp: [1, 0, 0], request: V.skin === 'pixel' ? 'GeoUI のタイムラインで作った osu!（ドット絵をキューブで: 角度のついた 3D の盤面・曲つき）: 譜面・絵・曲・音はラボの物' : 'GeoUI のタイムラインで作った osu!（osu! の Legacy スキンの素材: CC-BY-NC 4.0・曲つき）: 譜面・曲はラボの物' }, null, 2)}\n`));
  const W = info.difficulty.windows;
  out.set('TASK.md', Buffer.from(`# ${V.name} — GeoUI のタイムラインで作った osu!（${V.skin === 'pixel' ? 'ドット絵をキューブで' : 'osu! の公式の素材（Legacy スキン）で'}）

## Request
osu! を GeoUI のタイムラインで丸ごと再現する（曲・判定・点数・画面の揺れ・盤面全体の動き）。${V.skin === 'pixel' ? '低解像度のドット絵を、画像ではなくキューブのモデルで（角度をつけて立体に見せる）。' : 'osu! の素材（ppy/osu-resources の Legacy スキン、CC-BY-NC 4.0）を高解像度のアトラスで。'}
作り方: \`node bds/geoui/timeline/demo.mjs\`（bds/geoui/osu/addon.mjs）。曲と譜面はラボの物（bds/geoui/osu/music.mjs が作る「${info.title}」${info.bpm} BPM）。

## What it is
- 譜面: 円 ${info.counts.circles}・スライダー ${info.counts.sliders}・スピナー ${info.counts.spinners}（ティック ${info.counts.ticks}・フォローポイント ${info.counts.followpoints}）、AR ${info.difficulty.ar}・OD ${info.difficulty.od}・CS ${info.difficulty.cs}・HP ${info.difficulty.hp}（判定 ${W.great}/${W.good}/${W.meh} ms）、${Math.round(info.duration)} 秒、キアイ 2 回・休み 1 回。
- 見た目: ${V.skin === 'pixel' ? '円・接近の輪・番号・判定・ボール・スピナー・カーソル・点数がどれもキューブ（前の面がドット、横の面が同じドットの暗い色）。盤面はキューブの枠で、斜めに立ち、カーソルで傾き、キアイで揺れる。円は弾けてキューブが飛ぶ' : '円（コンボ色で染めて重ね絵）・接近の輪・default の数字・300/100/50/×・転がるスライダーボール・フォローサークル・折り返しの矢印・ティック・フォローポイント・スピナー（RPM）・点数と精度と体力・ランク'}。
- 動き: ミスで盤面が揺れる・キアイの拍で脈打つ・カーソルで傾く（視差）・早押しで円が震える（osu! のノートロック）・コンボで数字が跳ねる・休みに PASS/FAIL・終わりにランク。
- 遊び方: \`/scriptevent ${NS}:mode auto\`（ひとりでに遊ぶ）・\`aim\`（見ている所がカーソル、ジャンプ・スニーク・アイテムで押す）・\`relax\`（狙わなくてよい）→ \`/scriptevent ${NS}:play 1\`。\`/scriptevent ${NS}:sens 2.4\`（1 度で動くカーソル）。
- 大きさ: プロパティ ${props} 個（GeoUI の 11 個を含む）・pre_animation ${st.lines} 行（最長 ${st.longest} 文字）・ボーン ${st.counts.bones} 本・要素ごとの render controller ${st.counts.renderControllers} 個・アニメーション ${st.counts.animations} 個・アトラス ${built0.atlas.width}x${built0.atlas.height}。
- ひとりでに遊ぶと（osugame.js、20 tick/秒）: 点数 ${fin.score}・最大コンボ ${fin.maxcombo}・精度 ${fin.acc}%・ランク ${['', 'D', 'C', 'B', 'A', 'S', 'SS'][fin.rank]}。
- preview.png はラボの描き方（bds/geoui/osu/render.mjs）で描いた 4 つの時刻（本物のゲームではない: 本物は app.txt）。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] auto でひとりでに遊ぶ: 点数とコンボが増え、精度 100 %、ミス 0、出来事の数（コンボ）が進む
- [ ] aim で何も押さないと: ミスが増え、コンボ 0、体力が減る（ミスの出来事で盤面が揺れる）
- [ ] seek・pause・resume・stop
`));
  const SEQ = 'const q = (v) => [v % 1024, Math.floor(v / 1024) % 2 === 1, Math.floor(v / 2048)];';
  const RES = `const res = (v) => [v % 8, Math.floor(v / 8) % 2048, Math.floor(v / 16384) % 1024];`;
  const gl = rp.stats.budget.global, geK = gl.events.indexOf('combo'), geM = gl.events.indexOf('miss');
  const geRead = (k) => `Math.floor(e.getProperty('${NS}:${k >= 4 ? 'ge1' : 'ge'}') / ${2 ** (6 * (k % 4))}) % 64`;
  const firstHit = Math.min(...built0.game.objects.map((o) => o.t)) / 1000;
  out.set('tests.txt', Buffer.from(`# ${V.name}（bds/geoui/osu/addon.mjs が作る）: osu! の BP（scripts/timeline.js と osugame.js）が本物の BDS で遊ばれ、点数・コンボ・判定がプロパティに出るか。
# 描画は app.txt（本物のアプリ）。res = [ランク, 最大コンボ, ミス]（contract.js の詰め方）。最初の物は ${firstHit} 秒。

## 読み込める（タイムラインのプロパティが既定値）
@A join
wait 2000
js const e = p('A'); ${SEQ} JSON.stringify([...q(e.getProperty('${NS}:seq')), e.getProperty('${NS}:ge'), e.getProperty('${NS}:res')])
= [0,false,0,0,0]

## auto でひとりでに遊ぶ: 点数とコンボが増え、精度 100 %、ミス 0、出来事の数（コンボ）が進む
scriptevent ${NS}:mode auto
scriptevent ${NS}:play 1
wait ${Math.round((firstHit + 7) * 1000)}
js const e = p('A'); ${RES} const r = res(e.getProperty('${NS}:res')); JSON.stringify([e.getProperty('${NS}:v0') > 1000, e.getProperty('${NS}:v1') > 3, e.getProperty('${NS}:v2'), r[0] > 4, r[1] > 3, r[2], ${geRead(geK)} > 3])
= [true,true,10000,true,true,0,true]
scriptevent ${NS}:stop
wait 300

## aim で何も押さないと: ミスが増え、コンボ 0、体力が減る（ミスの出来事で盤面が揺れる）
scriptevent ${NS}:mode aim
scriptevent ${NS}:play 1
wait ${Math.round((firstHit + 4) * 1000)}
js const e = p('A'); ${RES} const r = res(e.getProperty('${NS}:res')); JSON.stringify([r[2] > 2, e.getProperty('${NS}:v1'), e.getProperty('${NS}:v3') < 100, ${geRead(geM)} > 2, e.getProperty('${NS}:v0')])
= [true,0,true,true,0]

## seek・pause・resume・stop
scriptevent ${NS}:seek 40
wait 300
js ${SEQ} JSON.stringify([q(p('A').getProperty('${NS}:seq'))[0], p('A').getProperty('${NS}:seq_from')])
= [1,40000]
scriptevent ${NS}:pause
wait 300
js ${SEQ} q(p('A').getProperty('${NS}:seq'))[1]
= true
scriptevent ${NS}:resume
wait 300
js ${SEQ} q(p('A').getProperty('${NS}:seq'))[1]
= false
scriptevent ${NS}:stop
wait 300
js ${SEQ} q(p('A').getProperty('${NS}:seq'))[0]
= 0
`));
  const REGION = '0 0 1560 720';
  out.set('app.txt', Buffer.from(`# ${V.name} を本物のアプリで: ひとりでに遊ばせて（mode auto）、決まった時刻に写し、全部を録る（GeoUI のタイムラインが描く osu!）
# 時刻は再生を始めてからの目安（サーバーの命令が届くまでの遅れがある）。比べる基準は再生前の画面（world--before-play）。

section title
launch
until title 600000
shot title

section join
join
until joined 900000
wait 3000
do time set noon
do gamerule dodaylightcycle false
do gamerule sendcommandfeedback false
do gamerule commandblockoutput false
do weather clear
do tp @a 0 -60 0 0 90
do hud @a hide paperdoll
do hud @a hide touch_controls
do hud @a hide hotbar
do hud @a hide crosshair
wait 6000
shot world--before-play
absent clientlog \\bERROR\\b

section play
# (the whole play recorded: recordings/rec-1.mp4 — the person's Discord gets it at the end, made to fit: app/lib/feed.mjs)
record start
do scriptevent ${NS}:mode auto
do scriptevent ${NS}:play 1
${V.shots.map((t, i) => `wait ${Math.round((t - (i ? V.shots[i - 1] : 0)) * 1000)}\nshot play-${String(t).replace('.', '_')}s\nmeasure diff play-${String(t).replace('.', '_')}s ${REGION}`).join('\n')}
wait 4000
shot rank
record stop
absent clientlog \\bERROR\\b

section stop
do scriptevent ${NS}:stop
wait 2000
shot stopped
measure diff stopped ${REGION}

section log-molang
# (a content error of Molang in the pack's own lines (geoui_): a pre_animation line the game cannot run stops the lines after it)
absent clientlog (?i)geoui_
`));
  return { out, OUT, warnings, stats: { props, lines: st.lines, longest: st.longest, counts: st.counts, atlas: [built0.atlas.width, built0.atlas.height], auto: fin } };
}

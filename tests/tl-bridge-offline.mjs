#!/usr/bin/env node
// GeoUI timeline's bridge (bds/geoui/timeline/store.js, player.js), no browser: the store over model.reduce with a host's
// undo (one step an edit, its words), the selection kept to what the document has, what subscribers hear; the player on a fake
// clock and a fake WebAudio — its time from the clock (frames dropped do not slow it), loops, rates, steps, the audio clips
// scheduled where they lie (look-ahead, part-way, pitch, muted / solo, latency, stopped at a pause / seek / turn), the
// autoplay's hits, frames for a video (PNGs in a zip). node tests/tl-bridge-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../bds/geoui/timeline/model.js');
const Me = require('../bds/geoui/timeline/media.js');
const S = require('../bds/geoui/timeline/store.js');
const P = require('../bds/geoui/timeline/player.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).slice(0, 1500)}`}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const DOC = {
  version: 1,
  sequences: [{
    id: 's1', name: 'one', duration: 10, fps: 20, loop: 'once', markers: [{ id: 'm1', t: 2, name: 'mark' }], tempo: [], paths: [],
    tracks: [
      { id: 'tA', kind: 'layer', target: 'logo', name: 'logo', clips: [{ id: 'c1', start: 0, end: 4, channels: { x: [{ t: 0, v: 0, ease: 'linear' }, { t: 4, v: 40 }] } }, { id: 'c2', start: 5, end: 8, channels: { y: [{ t: 0, v: 3 }] } }] },
      { id: 'tM', kind: 'audio', name: 'music', clips: [{ id: 'a1', start: 1, end: 9, sound: 'music', volume: 0.5 }] },
      { id: 'tF', kind: 'audio', name: 'fx', clips: [{ id: 'a2', start: 6, end: 6.5, sound: 'fx', pitch: 2 }] },
    ],
    templates: [{ id: 'tp', name: 'note', lead: 0.5, tail: 0.5, params: ['x'], tracks: [{ id: 'tt', kind: 'layer', target: 'dot', name: 'dot', clips: [{ id: 'cf', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }] } }, { id: 'ch', trigger: 'hit', start: 0, end: 0.3, channels: { y: [{ t: 0, v: 9 }] } }] }] }],
    instances: [{ id: 'i1', template: 'tp', t: 3, params: { x: 5 } }, { id: 'i2', template: 'tp', t: 7, params: { x: -5 } }],
  }],
};

// ---------------------------------------------------------------------------------------------------------------- store
{
  let saved = M.normalize(DOC), edits = [];
  const undo = { edit(label, apply) { edits.push(label); apply(); } };
  const st = S.createStore({ getDoc: () => saved, setDoc: (d) => { saved = d; }, undo, elements: () => [{ name: 'logo', x: 0, y: 140 }], media: () => [{ id: 'music', kind: 'sound' }] });
  const heard = [];
  st.subscribe((w) => heard.push(w));
  ok(st.selection().seq === 's1' && st.doc().sequences[0].tracks.length === 3 && st.elements()[0].name === 'logo' && st.media()[0].id === 'music', 'the store: the host\'s document (normalized), the first sequence chosen, the design\'s elements and the media');
  const r = st.dispatch({ seq: 's1', type: 'clip.set', id: 'c1', patch: { name: 'in' } });
  ok(r.ok && saved.sequences[0].tracks[0].clips[0].name === 'in' && st.doc() === saved && edits.join() === 'クリップを変える' && heard.length === 1 && heard[0].doc && !heard[0].selection,
    'an edit: through model.reduce, kept by the host (setDoc), one undo step with its words, the editors told (the document)', JSON.stringify({ edits, heard }));
  const bad = st.dispatch({ seq: 's1', type: 'clip.set', id: 'nope', patch: {} });
  ok(!bad.ok && /nope/.test(bad.error) && edits.length === 1 && heard.length === 1, 'an edit that cannot be: its reason, nothing kept, no undo step, nobody told', bad.error);
  st.dispatch({ type: 'batch', intents: [{ seq: 's1', type: 'clip.set', id: 'c1', patch: { name: 'a' } }, { seq: 's1', type: 'clip.set', id: 'c2', patch: { name: 'b' } }] });
  ok(edits.length === 2 && edits[1] === 'クリップを変える（2 件）', 'a batch: one undo step', edits.join(' | '));
  st.select({ clips: ['c1', 'c2'], instances: ['i1'], keys: [{ clip: 'c1', prop: 'x', index: 1 }], markers: ['m1'] });
  ok(heard.at(-1).selection && !heard.at(-1).doc && st.selection().clips.length === 2, 'a selection: told as a selection');
  const before = heard.length;
  st.select({ clips: ['c1', 'c2'] });
  ok(heard.length === before, 'the same selection again: nobody told');
  st.dispatch({ seq: 's1', type: 'clip.remove', ids: ['c1'] });
  ok(st.selection().clips.join() === 'c2' && st.selection().keys.length === 0 && st.selection().instances.join() === 'i1' && heard.at(-1).selection,
    'a clip removed: no longer selected, nor its keys (the selection never names what the document does not have)', JSON.stringify(st.selection()));
  // (an undo in the host: the document goes back under the store, refresh tells everyone)
  saved = M.normalize(DOC);
  st.refresh();
  ok(st.doc() === saved || st.doc().sequences[0].tracks[0].clips.length === 2, 'refresh: the host\'s document again (an undo)');
  ok(heard.at(-1).external && S.needsDraw(heard.at(-1)) && !S.needsDraw({ time: true }) && S.needsDraw(undefined), 'what to draw again for: an outside change yes, the time alone no');
  const added = st.dispatch({ type: 'seq.add', name: 'two' });
  ok(added.ok && st.selection().seq === added.id && st.doc().sequences.length === 2, 'a new sequence is the one shown');
  st.seek(3.25);
  ok(st.time() === 3.25 && heard.at(-1).time && !S.needsDraw(heard.at(-1)), 'without a player: the store\'s own time, told as the time');
  ok(S.labelOf({ type: 'key.move' }) === '鍵を動かす' && S.labelOf({ type: 'x.y' }) === 'x.y' && S.labelOf({ type: 'clip.set', label: '名前' }) === '名前', 'undo words: known, unknown (its type), given');
}

// ---------------------------------------------------------------------------------------------------------------- player
/** a fake clock (seconds) whose frames run when told */
function fakeClock() {
  const c = { t: 100, q: new Map(), id: 0 };
  c.now = () => c.t; c.raf = (f) => { c.id++; c.q.set(c.id, f); return c.id; }; c.caf = (id) => c.q.delete(id);
  c.wait = async (s) => { c.t += s; };
  c.frame = (dt) => { c.t += dt; const fs = [...c.q.values()]; c.q.clear(); for (const f of fs) f(c.t); };
  return c;
}
/** a fake WebAudio: its clock, the sources started and stopped */
function fakeAudio(clock, { latency = 0, decoded = ['music', 'fx'] } = {}) {
  const a = { started: [], stopped: 0, running: true, ctx: { state: 'running' } };
  return Object.assign(a, {
    context: a.ctx, now: () => clock.t, running: () => a.running, resume: () => { a.running = true; return Promise.resolve(); }, latency: () => latency,
    buffer: (id) => (decoded.includes(id) ? { id } : null), tap() {},
    start(o) { a.started.push(Object.assign({ at: clock.t }, o, { buffer: o.buffer.id })); return {}; },
    stopAll() { a.stopped++; }, dispose() {},
  });
}
function rig(opts = {}) {
  const clock = fakeClock(), audio = opts.audio === false ? null : fakeAudio(clock, opts), applied = [];
  const st = S.createStore({ getDoc: () => M.normalize(opts.doc || DOC) });
  const host = { apply(states, t) { applied.push({ t, states }); }, clear() { applied.push('clear'); }, capture: async () => new Uint8Array([137, 80, 78, 71, applied.length & 255]) };
  const pl = P.createPlayer({ store: st, host, clock, audio, events: opts.events });
  st.setPlayer(pl);
  return { clock, audio, applied, st, pl, last: () => applied.filter((x) => x !== 'clear').at(-1) };
}
{
  const { clock, applied, st, pl, last } = rig({ audio: false });
  st.seek(2);
  ok(st.time() === 2 && near(last().t, 2) && near(last().states.logo.x, 20, 1e-6), 'paused: a seek draws that time (the evaluated states: logo at x 20 at 2 s)', JSON.stringify(last()));
  st.transport.play();
  clock.frame(0.5); clock.frame(0.5);
  ok(near(st.time(), 3) && near(last().t, 3), 'playing: the time is the clock\'s time since play (2 + 1 s)', st.time());
  clock.t += 2.7; clock.frame(0.0);   // (frames dropped: the clock went on)
  ok(near(last().t, 5.7, 1e-9), 'frames dropped: the time is not behind (5.7, not 3 + one frame)', last().t);
  st.transport.rate(2); clock.frame(0.5);
  ok(near(st.time(), 6.7), 'rate 2: twice as fast from where it was', st.time());
  clock.frame(1.8);   // (to 10.3: past the end of a sequence that does not loop by default? the player loops its range)
  ok(near(st.time(), 0.3, 1e-9) && pl.playing(), 'the end of the range: round again (a loop over the range)', st.time());
  pl.setLoop(false); st.transport.rate(1);
  clock.frame(9.9);
  ok(!pl.playing() && near(st.time(), 10), 'no loop: stops at the end of the range', st.time());
  pl.setRange([2, 4]); pl.setLoop(true); st.transport.play();
  ok(near(st.time(), 2), 'play at the end: from the start of the range', st.time());
  clock.frame(2.5);
  ok(near(st.time(), 2.5), 'a range [2, 4]: round within it (2 + 2.5 → 2.5)', st.time());
  st.transport.pause(); st.transport.rate(-1); st.transport.play(); clock.frame(0.75);
  ok(near(st.time(), 3.75), 'rate −1 (J): backwards, round within the range (2.5 − 0.75 → 3.75 after the turn)', st.time());
  st.transport.pause(); st.transport.rate(1); pl.setRange(null);
  st.seek(1); st.transport.step(3);
  ok(near(st.time(), 1.15), 'step: by frames of the sequence (3 at 20 fps)', st.time());
  st.transport.stop();
  ok(!pl.playing() && st.time() === 0, 'stop: paused at the start');
  pl.dispose();
  ok(applied.at(-1) === 'clear' && clock.q.size === 0, 'dispose: the host cleared, no frame pending');
}
{
  const { clock, audio, st, pl } = rig({ latency: 0.02 });
  st.seek(0.5); st.transport.play();
  ok(pl.state.clock.now === audio.now, 'with sound: the audio\'s clock is the player\'s', '');
  clock.frame(0.016);
  const music = audio.started.find((x) => x.buffer === 'music');
  // (played at 100 from 0.5 s, the output 20 ms late: the picture waits those 20 ms, and the music for 1 s starts at 100.5 — heard
  //  at 100.52, when the picture shows 0.5 + (100.52 − 100 − 0.02) = 1 s)
  ok(music && near(music.when, 100 + 0.5, 1e-9) && near(music.offset, 0) && near(music.duration, 8) && near(music.volume, 0.5) && near(music.rate, 1) && near(pl.time(), 0.5),
    'the music: scheduled ahead to be heard when the picture shows its start (the picture waits out the output latency), its volume, all its length', JSON.stringify(music));
  ok(!audio.started.some((x) => x.buffer === 'fx'), 'the effect at 6 s: not yet (beyond the look-ahead)');
  clock.frame(3);
  const fx = audio.started.find((x) => x.buffer === 'fx');
  ok(fx && near(fx.rate, 2) && near(fx.duration, 0.5 * 2) && audio.started.filter((x) => x.buffer === 'music').length === 1, 'the effect: scheduled once it is within the look-ahead, its pitch as speed (2 x: half a second is a second of the sound), the music not again', JSON.stringify(fx));
  const stops = audio.stopped;
  st.seek(4);
  const again = audio.started.filter((x) => x.buffer === 'music').at(-1);
  ok(audio.stopped === stops + 1 && near(again.offset, 3) && near(again.duration, 5) && near(again.when, clock.t), 'seek while playing: everything stopped, the music again from 3 s into it (part-way)', JSON.stringify(again));
  st.transport.pause();
  ok(audio.stopped === stops + 2, 'pause: the sound stops');
  // (a muted track is silent; a solo one alone sounds)
  const doc2 = JSON.parse(JSON.stringify(DOC)); doc2.sequences[0].tracks[1].muted = true;
  const r2 = rig({ doc: doc2 }); r2.st.seek(5.9); r2.st.transport.play(); r2.clock.frame(0.016);
  ok(!r2.audio.started.some((x) => x.buffer === 'music') && r2.audio.started.some((x) => x.buffer === 'fx'), 'a muted audio track: silent');
  const doc3 = JSON.parse(JSON.stringify(DOC)); doc3.sequences[0].tracks[2].solo = true;
  const r3 = rig({ doc: doc3 }); r3.st.seek(5.9); r3.st.transport.play(); r3.clock.frame(0.016);
  ok(!r3.audio.started.some((x) => x.buffer === 'music') && r3.audio.started.some((x) => x.buffer === 'fx'), 'a solo audio track: only it sounds');
  const r4 = rig({ decoded: [] }); r4.st.seek(1); r4.st.transport.play(); r4.clock.frame(0.016);
  ok(r4.audio.started.length === 0 && r4.pl.playing(), 'a sound not decoded yet: the picture plays on, the sound starts when it is there');
}
{
  // the autoplay: i1 hit at 3 s — its trigger clip (y 9) shows just after; with 'none' it does not
  const a = rig({ audio: false }); a.st.seek(3.1);
  const b = rig({ audio: false, events: 'none' }); b.st.seek(3.1);
  ok(a.last().states['dot#i1'] && near(a.last().states['dot#i1'].y, 9) && b.last().states['dot#i1'] && !near(b.last().states['dot#i1'].y, 9),
    'the autoplay\'s hits: an instance\'s hit clip shows at its time (none: it does not)', JSON.stringify([a.last().states['dot#i1'], b.last().states['dot#i1']]));
  const ev = P.autoEvents(M.normalize(DOC).sequences[0], 'miss');
  ok(ev.length === 2 && ev[0].name === 'miss' && near(ev[0].t, 3.15), 'misses: each instance a little after its time');
}
{
  const { st, pl, applied } = rig({ audio: false });
  st.seek(1);
  const ts = [];
  const nf = await pl.renderFrames({ from: 0, to: 1, fps: 10, each: (i, t) => { ts.push(t); } });
  ok(nf === 10 && near(ts[3], 0.3) && near(ts.at(-1), 0.9), 'renderFrames: every frame of [from, to) at its time', ts.join(' '));
  const progress = [];
  const out = await pl.exportVideo({ format: 'png-zip', fps: 5, from: 0, to: 2, onProgress: (d, all) => progress.push(`${d}/${all}`) });
  const files = Me.unzipStore(out.data);
  ok(out.frames === 10 && files.length === 11 && files[0].name === 'frame_00000.png' && files[9].name === 'frame_00009.png' && /10 frames at 5 fps/.test(new TextDecoder().decode(files[10].data)) && progress.at(-1) === '10/10' && near(st.time(), 1),
    'a video as PNGs in a zip: one a frame (named in order), a note of the frames, the progress, the time put back after', files.map((f) => f.name).slice(0, 3).join(' '));
  let e1 = null; try { await pl.exportVideo({ format: 'webm', fps: 5, from: 0, to: 1 }); } catch (e) { e1 = e; }
  ok(e1 && /webm/.test(e1.message), 'webm without MediaRecorder: said (use the PNGs)', e1 && e1.message);
  const ac = { aborted: false }, done = [];
  let e2 = null; try { await pl.exportVideo({ format: 'png-zip', fps: 5, from: 0, to: 4, signal: ac, onProgress: (d) => { done.push(d); if (d === 3) ac.aborted = true; } }); } catch (e) { e2 = e; }
  ok(e2 && e2.name === 'AbortError' && done.length === 3 && applied.length > 0, 'stopped half-way (an AbortSignal): it stops there', e2 && e2.message);
}

// ---------------------------------------------------------------------------------------------------------------- bridge (pure)
{
  const B = require('../bds/geoui/timeline/bridge.js');
  ok(B.digitsOf(42, 5).join() === '-1,-1,-1,4,2' && B.digitsOf(42, 5, false).join() === '0,0,0,4,2' && B.digitsOf(0, 3).join() === '-1,-1,0' && B.digitsOf(123456, 3).join() === '4,5,6' && B.digitsOf(-7.9, 2).join() === '-1,7',
    'a number\'s digits: leading zeros hidden (or not), the last one always, the last digits of a longer value, |floor|');
  const pretty = 'uniform sampler2D map;\nvarying vec2 vUv;\nvoid main(void)\n{\n\tvec4 color = texture2D(map, vUv);\n\tgl_FragColor = color;\n\t#include <clipping_planes_fragment>\n}';
  const mini = '#include <common>\nuniform sampler2D map;uniform bool SHADE;centroid varying vec2 vUv;void main(void){vec4 color=texture2D(map,vUv);gl_FragColor=color;\n#include <clipping_planes_fragment>\n}';
  const p1 = B.patchShader(pretty), p2 = B.patchShader(mini), p3 = B.patchShader(mini.replace('\n#include <clipping_planes_fragment>\n', ''));
  const good = (x) => x && /uniform float GEOUI_ALPHA;/.test(x) && /uniform vec2 GEOUI_UV;/.test(x) && /texture2D\(map, vUv \+ GEOUI_UV\)/.test(x) && /gl_FragColor\.a \*= GEOUI_ALPHA;/.test(x) && x.indexOf('GEOUI_ALPHA;\n') < x.indexOf('texture2D(map, vUv + GEOUI_UV)');
  ok(good(p1) && good(p2) && good(p3) && p2.indexOf('gl_FragColor.a *= GEOUI_ALPHA;') < p2.indexOf('#include <clipping_planes_fragment>') && B.patchShader('void main(){}') === null && B.patchShader(null) === null,
    'Blockbench\'s shader given an alpha and a uv offset — as written and minified (its build), with or without the clipping include; a shader it does not know: null', p2);
  ok(JSON.stringify(B.rectOf([[10, 20], [110, 20], [110, 80], [10, 80]])) === '{"x":10,"y":20,"w":100,"h":60}' && B.rectOf([[10, 20], [110, 30], [100, 90], [0, 80]]) === null && B.rectOf([[110, 20], [10, 20], [10, 80], [110, 80]]) === null && B.rectOf([[0, 0]]) === null,
    'the screen in the canvas: an upright rectangle, or nothing (the camera turned, mirrored, or not four corners)');
  ok(JSON.stringify(B.frameOffset(5, 4, 0.25, 0.5)) === '[0.25,-0.5]' && JSON.stringify(B.frameOffset(2.9, 4, 0.25, 0.5)) === '[0.5,0]' && JSON.stringify(B.frameOffset(-3, 4, 0.25, 0.5)) === '[0,0]', 'a flipbook frame as a uv offset (column, row: three.js\'s v up; frames floored, never below 0)');
  const seq = M.normalize(DOC).sequences[0];
  ok([...B.protosOf(seq)].join() === 'dot' && B.protosOf(null).size === 0, 'the prototypes: the elements the templates move');
  ok(B.soundId('My Song.ogg', []) === 'my_song' && B.soundId('My Song.ogg', ['my_song']) === 'my_song_2' && B.soundId('ハッピー.wav', ['e']) === 'e_2', 'a sound\'s id: the pack\'s name for it, never one taken');
  const bodies = Array.from({ length: 30 }, (_, i) => ({ points: [[0, 0], [40 + i, 10]], width: 8 }));
  const A = B.bodyAtlas(bodies);
  ok(A.w <= 2048 && A.h <= 2048 && A.cols * A.rows >= 30 && A.pxPerUnit <= 4 && A.cell[0] >= (69 + 10) * A.pxPerUnit - 1 && JSON.stringify(A.at(A.cols + 1)) === JSON.stringify([A.cell[0], A.cell[1]]),
    `slider bodies in one flipbook: ${A.cols} x ${A.rows} cells of ${A.cell.join('x')} px (${A.pxPerUnit.toFixed(2)} px a unit), within 2048`, JSON.stringify(A));
  const big = B.bodyAtlas(Array.from({ length: 400 }, () => ({ points: [[0, 0], [120, 90]], width: 10 })));
  ok(big.w <= 2048 && big.h <= 2048 && big.pxPerUnit < 1, `400 long bodies: still within 2048 (${big.pxPerUnit.toFixed(2)} px a unit — the bridge says so)`, JSON.stringify(big));
  const bytes = new Uint8Array(70000).map((_, i) => (i * 7) & 255);
  ok(B.fromB64(B.toB64(bytes)).every((x, i) => x === bytes[i]) && B.toB64(new Uint8Array([1, 2, 3])) === 'AQID', 'sounds kept as base64: there and back');
  const wav = Me.makeWav(new Float32Array(22050), 22050);
  ok(B.soundInfo('a.wav', wav).game && Math.abs(B.soundInfo('a.wav', wav).seconds - 1) < 1e-9 && B.soundInfo('a.mp3', new Uint8Array(4)).game === false && B.soundInfo('a.txt', new Uint8Array(4)) === null && B.soundInfo('b.wav', new Uint8Array(4)) === null,
    'a sound file: .wav / .ogg the game plays (their length), .mp3 the preview only, others not sounds');
}
{
  // (a batch's later intents name what its earlier ones made: '$0' — a track and its first clip, one undo step)
  const r = M.reduce(M.normalize(DOC), { type: 'batch', intents: [{ seq: 's1', type: 'track.add', kind: 'layer', target: 'logo' }, { seq: 's1', type: 'clip.add', track: '$0', start: 9, end: 9.5, clip: { name: 'late' } }] });
  const tr = r.ok && r.doc.sequences[0].tracks.find((t) => t.id === r.ids[0]);
  ok(r.ok && r.ids.length === 2 && tr && tr.clips.length === 1 && tr.clips[0].name === 'late' && r.id === tr.clips[0].id, 'a batch\'s intents may name what the ones before made ($0): its ids, the last as its id', JSON.stringify(r.ids));
  const bad = M.reduce(M.normalize(DOC), { type: 'batch', intents: [{ seq: 's1', type: 'clip.add', track: '$3', start: 0, end: 1 }] });
  ok(!bad.ok, 'a $ that names nothing: the batch fails (all or nothing)');
}

{
  // (the one plugin file: what build.mjs makes of the sources — and it loads in Node with GeoUI Builder's core and every part)
  const { spawnSync } = await import('node:child_process');
  const here = new URL('../bds/geoui/build.mjs', import.meta.url).pathname, r = spawnSync(process.execPath, [here, '--check'], { encoding: 'utf8' });
  ok(r.status === 0, 'bds/geoui/dist/geoui_builder.js is what build.mjs makes', (r.stderr || r.stdout).trim());
  const fs = await import('node:fs'), dist = new URL('../bds/geoui/dist/geoui_builder.js', import.meta.url).pathname, mod = { exports: {} }, g = {};
  new Function('module', 'globalThis', fs.readFileSync(dist, 'utf8'))(mod, g);
  const parts = Object.keys(g.GeoUITimeline || {});
  ok(typeof mod.exports.buildPack === 'function' && ['model', 'contract', 'media', 'osu', 'presets', 'view', 'timeline', 'curve', 'inspector', 'instances', 'pathedit', 'player', 'compile', 'runtime', 'store', 'bridge'].every((p) => parts.includes(p)),
    `the plugin file: GeoUI Builder's core for Node, and all ${parts.length} parts of the timeline (none took the page's module)`, parts.join(' '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-bridge-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);

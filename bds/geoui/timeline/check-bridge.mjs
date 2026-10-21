#!/usr/bin/env node
// GeoUI timeline — the bridge in the real Blockbench (5.2.2, its web build: bds/geoui/bbpage.mjs), the one plugin file
// bds/geoui/dist/geoui_builder.js loaded the way "Load Plugin from File" does:
//   the panels and the menu; a sequence made, its clips and keys — one Undo step each, undone and done again; the preview
//   seeks and plays (the bones where model.evaluate says, see-through as it says, instances by copies that come and go); a
//   sound in, on a track, heard (WebAudio sources) while it plays; the .bbmodel saved and opened again with all of it; an
//   osu! map (its elements drawn); 500 instances played (the time a frame of ours takes); a video (PNGs in a zip, a webm);
//   the pack with the timeline's RP and BP; and unloaded, nothing left (panels, copies, styles, listeners, globals).
// Pictures to --out. Needs what bds/geoui/blockbench-check.mjs needs (BLOCKBENCH_DIR, GEOUI_NODE_MODULES / CHROMIUM).
// node bds/geoui/timeline/check-bridge.mjs [--out <folder>]
/* global window, document, Blockbench, Project, Group, Cube, Modes, Undo, Codecs, Canvas, Panels, BarItems, Plugins, Format */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { openBlockbench, DIST, TOP } from '../bbpage.mjs';
const require = createRequire(import.meta.url);
const Me = require('./media.js');

/** a WebM's frames per track (MediaRecorder's: a Segment and Clusters of unknown size; a frame a SimpleBlock, or a Block in a
 *  BlockGroup — VP9 with its alpha) → { video: n, audio: n } */
function webmFrames(b) {
  let at = 0;
  const vint = (keep) => { const first = b[at]; let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++; let v = keep ? first : first & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + b[at + i]; const unknown = !keep && v === 2 ** (7 * len) - 1; at += len; return { v, len, unknown }; };
  const tracks = {}, counts = {}, CONTAINERS = new Set([0x18538067, 0x1f43b675, 0x1654ae6b, 0xae, 0xa0]);
  let entry = null;
  while (at < b.length) {
    const id = vint(true).v, size = vint(false), start = at;
    if (id === 0xae) entry = {};
    if (CONTAINERS.has(id)) continue;   // (into it: its children follow)
    if (id === 0xd7 && entry) entry.n = b[start];
    if (id === 0x83 && entry) { entry.type = b[start]; if (entry.n) tracks[entry.n] = entry.type === 1 ? 'video' : entry.type === 2 ? 'audio' : 'other'; }
    if (id === 0xa3 || id === 0xa1) { const tn = b[start] & 0x7f, k = tracks[tn] || `track${tn}`; counts[k] = (counts[k] || 0) + 1; }
    at = size.unknown ? at : start + size.v;
  }
  return counts;
}

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', path.join(TOP, 'bds', '.lab', 'geoui-bridge')));
if (!fs.existsSync(DIST)) { console.error('no bds/geoui/dist/geoui_builder.js: node bds/geoui/build.mjs'); process.exit(1); }
let fails = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`${c ? '✔' : '✘'} ${m}${c ? '' : '\n   ' + String(d).slice(0, 1500)}`); if (!c) fails++; };

const BB = await openBlockbench('check-bridge', { out: OUT, args: ['--autoplay-policy=no-user-gesture-required'] });
const { ev, shot, errors } = BB;
const inst = await BB.install(DIST);
const reg = await ev(() => ({ api: !!(window.GeoUIBuilder && window.GeoUIBuilder.timeline), panels: ['geoui_timeline', 'geoui_inspector', 'geoui_instances'].filter((p) => Panels[p]), actions: ['geoui_tl_play', 'geoui_tl_track', 'geoui_tl_media', 'geoui_tl_osu', 'geoui_tl_video'].filter((a) => BarItems[a]), css: !!document.getElementById('geoui-timeline-css') }));
ok(inst.installed && reg.api && reg.panels.length === 3 && reg.actions.length === 5 && reg.css, `Blockbench ${BB.version}: the plugin with its timeline (${Math.round(fs.statSync(DIST).size / 1024)} KB) — 3 panels, 5 actions in GeoUI's menu`, JSON.stringify(reg));

// ---- a project: a logo (20 units, at x −40) and a dot (6 units, in the middle); a sequence: the logo moves 40 units in 4 s,
//      fading in over 1 s; a template "blip" moves the dot by its instance's param.x, two instances at 3 and 3.2 s
const made = await ev(async () => {
  const B = window.GeoUIBuilder, S = B.timeline.store;
  B.newProject();
  const img = (w, h, colour) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = colour; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
  await B.addImage({ name: 'logo', dataUrl: img(16, 16, '#ffffff'), height: 20, width: 20, x: -40, y: 0 });
  await B.addImage({ name: 'dot', dataUrl: img(8, 8, '#ffd040'), height: 6, width: 6, x: 0, y: 0, blend: 'blend' });
  const undo0 = Undo.history.length;
  const s = S.dispatch({ type: 'seq.add', name: 'テスト', duration: 6 });
  const tr = S.dispatch({ type: 'batch', intents: [{ seq: s.id, type: 'track.add', kind: 'layer', target: 'logo', name: 'logo' },
    { seq: s.id, type: 'clip.add', track: '$0', start: 0, end: 4, clip: { channels: { x: [{ t: 0, v: 0, ease: 'linear' }, { t: 4, v: 40 }] }, transitionIn: { kind: 'fade', duration: 1, ease: 'linear' } } }] });
  const tp = S.dispatch({ seq: s.id, type: 'instances.import', templates: [{ id: 'blip', name: 'blip', lead: 0.5, tail: 0.5, params: ['x'], tracks: [{ id: 'tt', kind: 'layer', target: 'dot', name: 'dot', clips: [{ id: 'cd', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }] } }] }] }],
    instances: [{ id: 'i1', template: 'blip', t: 3, params: { x: 10 } }, { id: 'i2', template: 'blip', t: 3.2, params: { x: -10 } }] });
  return { ok: s.ok && tr.ok && tp.ok, steps: Undo.history.length - undo0, last: Undo.history[Undo.history.length - 1].action, saved: !!Project.geoui_timeline && Project.geoui_timeline.sequences.length, seq: s.id };
});
ok(made.ok && made.steps === 3 && /^GeoUI: /.test(made.last) && made.saved === 1, `a sequence, a track with a clip (one batch), a template and its instances: ${made.steps} Undo steps ("${made.last}"), the document in the project`, JSON.stringify(made));
const undone = await ev(() => {
  const S = window.GeoUIBuilder.timeline.store, count = () => S.doc().sequences[0].instances.length;
  const before = count(); Undo.undo(); const after = count(); Undo.redo(); return { before, after, again: count(), project: Project.geoui_timeline.sequences[0].instances.length };
});
ok(undone.before === 2 && undone.after === 0 && undone.again === 2 && undone.project === 2, 'Blockbench\'s Undo takes the instances back and Redo brings them again (the editors see it at once)', JSON.stringify(undone));

// ---- the preview: where Blockbench draws each plane (model units, x as the export's), its material's alpha
const look = (t) => ev((t) => {
  const B = window.GeoUIBuilder, TL = B.timeline;
  TL.store.seek(t);
  const out = { mode: Modes.animate, planes: {}, copies: [] };
  Canvas.scene.updateMatrixWorld(true);
  const box = (mesh) => { const pos = mesh.geometry.attributes.position, v = new window.THREE.Vector3(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); x0 = Math.min(x0, -v.x); x1 = Math.max(x1, -v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; };
  for (const c of Cube.all) { const m = c.mesh, mat = Array.isArray(m.material) ? m.material.find((x) => x.uniforms && x.uniforms.GEOUI_ALPHA) : m.material; out.planes[c.parent.name] = Object.assign(box(m), { alpha: mat && mat.uniforms && mat.uniforms.GEOUI_ALPHA ? mat.uniforms.GEOUI_ALPHA.value : 1 }); }
  Canvas.scene.traverse((o) => { if (/^geoui_copy:/.test(o.name)) { let mesh = null; o.traverse((q) => { if (!mesh && q.isMesh && q.geometry && q.geometry.attributes.position) mesh = q; }); out.copies.push(Object.assign({ name: o.name }, mesh ? box(mesh) : {})); } });
  return out;
}, t);
const L0 = await look(0.5);
ok(L0.mode && Math.abs(L0.planes.logo.cx - (-40 + 5)) < 0.01 && Math.abs(L0.planes.logo.alpha - 0.5) < 0.01, `seek 0.5 s: into the preview (animate mode); the logo 5 units on (x −35) and half see-through (fade in over 1 s: alpha ${L0.planes.logo && L0.planes.logo.alpha})`, JSON.stringify(L0.planes.logo));
const L2 = await look(2);
ok(Math.abs(L2.planes.logo.cx - (-20)) < 0.01 && L2.planes.logo.alpha === 1 && L2.copies.length === 0, 'seek 2 s: the logo at x −20, opaque; no instance out, no copy', JSON.stringify(L2.planes.logo));
const L3 = await look(3.1);
const xs = L3.copies.map((c) => Math.round(c.cx)).sort((a, b) => a - b);
ok(L3.copies.length === 2 && xs.join() === '-10,10' && L3.copies.every((c) => Math.abs(c.w - 6) < 0.01) && L3.planes.dot.w < 0.01, `seek 3.1 s: both instances out — two copies of the dot at x ${xs.join(' / ')} (their param.x), the dot itself hidden (a prototype)`, JSON.stringify({ copies: L3.copies, dot: L3.planes.dot }));
await ev(() => window.GeoUIBuilder.view());
await shot('01-preview-3.1s.png');
const L4 = await look(4.5);
ok(L4.copies.length === 0 && L4.planes.logo.w < 0.01, 'seek 4.5 s: the copies gone; the logo after its clip hidden (a layer is there only in its clip)', JSON.stringify({ copies: L4.copies.length, logo: L4.planes.logo }));

// ---- the direction of a turn: an arm from its pivot to the right, turned +90 by a key — where Blockbench draws it (the game's
//      own way is geoui_probe's rot90: it should be the same)
const turn = await ev(() => {
  const B = window.GeoUIBuilder, S = B.timeline.store, root = Group.all.find((g) => g.name === 'geo_ui'), tex = window.Texture.all[0];
  const g = new Group({ name: 'arm', origin: [-10, 140, -2] }).addTo(root).init();
  g.geoui = { type: 'image', anchor: 'center', blend: 'cutout' };
  const off = { uv: [0, 0, 0, 0], texture: null };
  new Cube({ name: 'arm_plane', from: [-30, 139, -2], to: [-10, 141, -2], origin: [-10, 140, -2], box_uv: false, faces: { north: { uv: [0, 0, 16, 16], texture: tex.uuid }, south: off, east: off, west: off, up: off, down: off } }).addTo(g).init();
  window.Canvas.updateAll();
  const seq = S.selection().seq;
  S.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'layer', target: 'arm', name: 'arm' }, { seq, type: 'clip.add', track: '$0', start: 0, end: 1, clip: { channels: { rotation: [{ t: 0, v: 90 }] } } }] });
  S.seek(0.5);
  window.Canvas.scene.updateMatrixWorld(true);
  const m = Cube.all.find((c) => c.name === 'arm_plane').mesh, pos = m.geometry.attributes.position, v = new window.THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); x0 = Math.min(x0, -v.x); x1 = Math.max(x1, -v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const r = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  S.dispatch({ seq, type: 'track.remove', track: S.doc().sequences[0].tracks.find((t) => t.target === 'arm').id });
  g.remove(); window.Canvas.updateAll();
  return r;
});
// (the preview's layout moves every plane by its centre fix: the logo, designed at y 140, is drawn at ${L2.planes.logo.cy})
ok(Math.abs(turn.cx - 10) < 0.01 && Math.abs(turn.cy - (130 + L2.planes.logo.cy - 140)) < 0.01, `a turn of +90 (rotation key): the arm right of its pivot goes down — clockwise on the screen, as Blockbench shows a Bedrock bone's +z turn (the game's direction: geoui_probe's rot90)`, JSON.stringify(turn));

// ---- a sound: in (its length and waveform), on a track of its own, heard while it plays
const rate = 22050, pcm = new Float32Array(rate * 2); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((i / rate) * 2 * Math.PI * 440) * 0.3;
const wav = Array.from(Me.makeWav(pcm, rate));
const snd = await ev(async (bytes) => {
  const TL = window.GeoUIBuilder.timeline, S = TL.store;
  S.seek(0);
  await TL.addSounds([{ name: 'beep.wav', content: new Uint8Array(bytes).buffer }]);
  const m = Project.geoui_media.find((x) => x.id === 'beep'), seq = S.doc().sequences[0], tr = seq.tracks.find((t) => t.kind === 'audio');
  S.transport.play();
  await new Promise((r) => setTimeout(r, 700));
  const playing = TL.player.playing(), t = S.time(), sources = TL.state.audioCtx ? TL.state.audioCtx.state : '?', live = TL.audioCount();
  S.transport.pause();
  return { media: m && { duration: m.duration, peaks: m.peaks.length, ext: m.ext }, clip: tr && tr.clips[0] && { sound: tr.clips[0].sound, end: tr.clips[0].end }, playing, t, ctx: sources, live };
}, wav);
ok(snd.media && Math.abs(snd.media.duration - 2) < 0.01 && snd.media.peaks === 1000 && snd.clip && snd.clip.sound === 'beep' && Math.abs(snd.clip.end - 2) < 0.01, 'a sound in: kept in the project (2 s, its waveform), on an audio track of its own from the playhead', JSON.stringify(snd));
ok(snd.playing && snd.t > 0.3 && snd.t < 1.6 && snd.ctx === 'running' && snd.live >= 1, `played 0.7 s: the time went on (${snd.t.toFixed(2)} s), WebAudio running with the sound started (${snd.live} source)`, JSON.stringify(snd));

// ---- the .bbmodel: saved and opened again — the sequences, the instances, the sound
const rt = await ev(async () => {
  const B = window.GeoUIBuilder, before = JSON.stringify(Project.geoui_timeline), media = Project.geoui_media.length, text = Codecs.project.compile({ raw: false });
  Codecs.project.load(JSON.parse(text), { path: 'roundtrip.bbmodel', name: 'roundtrip.bbmodel' });
  await new Promise((r) => setTimeout(r, 400));
  const S = B.timeline.store;
  return { same: JSON.stringify(Project.geoui_timeline) === before, store: S.doc().sequences.length === 1 && S.doc().sequences[0].instances.length === 2, media: Project.geoui_media.length === media && !!Project.geoui_media[0].data, size: text.length, format: Format.id };
});
ok(rt.same && rt.store && rt.media && rt.format === 'geoui', `.bbmodel (${Math.round(rt.size / 1024)} KB) saved and opened again: the same document, the store reads it, the sound kept`, JSON.stringify(rt));

// ---- the pack: GeoUI Builder's with the timeline's RP and BP
const pack = await ev(() => {
  const b = window.GeoUIBuilder.build(), f = b.files, ns = b.settings.ns, J = (p) => (f[p] ? JSON.parse(typeof f[p] === 'string' ? f[p] : JSON.stringify(f[p])) : null);
  const anims = J(`${ns}_RP/animations/${ns}.animation.json`), rc = J(`${ns}_RP/render_controllers/${ns}.render_controllers.json`), mat = J(`${ns}_RP/materials/entity.material`);
  return { seq: !!(anims && anims.animations[`animation.${ns}.seq_1`]), fade: !!(rc && Object.keys(rc.render_controllers).some((k) => /_logo$/.test(k))), mat: !!(mat && mat.materials[`${ns}_fade:${ns}_base`]),
    script: !!f[`${ns}_BP/scripts/timeline.js`], sound: !!f[`${ns}_RP/sounds/${ns}/beep.wav`], copies: !!(f[`${ns}_RP/models/entity/${ns}/${Object.keys(f).find((k) => /models\/entity/.test(k)).split('/').pop()}`]), warnings: b.warnings };
});
ok(pack.seq && pack.fade && pack.mat && pack.script && pack.sound, 'the pack: the sequence\'s animation, the logo\'s own controller and the fade material, the BP\'s script, the sound', JSON.stringify(pack));

// ---- osu!: a map's instances in, the elements it needs drawn (circles in its combo colours, ring, number, burst, miss, spinner, ball, bodies)
const MAP = ['osu file format v14', '', '[General]', 'AudioFilename: audio.mp3', '', '[Metadata]', 'Title:Check', 'Version:Bridge', '', '[Difficulty]', 'CircleSize:4', 'OverallDifficulty:7', 'ApproachRate:8', 'SliderMultiplier:1.4', '',
  '[TimingPoints]', '0,500,4,2,0,60,1,0', '', '[Colours]', 'Combo1 : 255,128,64', 'Combo2 : 64,192,255', '', '[HitObjects]',
  '256,192,1000,5,0,0:0:0:0:', '100,100,1500,1,0,0:0:0:0:', '128,240,2000,6,0,B|256:320|384:240,1,140', '256,192,3000,12,0,4000,0:0:0:0:', ''].join('\n');
const osu = await ev(async (text) => {
  const TL = window.GeoUIBuilder.timeline, S = TL.store;
  const r0 = S.doc().sequences[0].instances.length;
  await TL.importOsuText(text);
  await new Promise((r) => setTimeout(r, 1500));
  const seq = S.doc().sequences[0], names = Group.all.map((g) => g.name);
  return { added: seq.instances.length - r0, templates: seq.templates.map((t) => t.name), elements: ['hitcircle', 'approachcircle', 'combonumber', 'hitburst', 'hitmiss', 'spinner', 'sliderball', 'sliderbody'].filter((e) => names.includes(e)),
    frames: (Group.all.find((g) => g.name === 'hitcircle') || {}).geoui };
}, MAP);
ok(osu.added === 4 && osu.templates.includes('osu! 円') && osu.elements.length === 8 && osu.frames && osu.frames.frames && osu.frames.frames.cols === 2, `osu!: 4 objects in (circles, a slider, a spinner), the elements it needs drawn (${osu.elements.join(' ')}), the circles' combo colours as frames`, JSON.stringify(osu));
const L5 = await look(1.0);
ok(L5.copies.some((c) => /hitcircle#/.test(c.name)), 'seek 1 s: the first circle\'s copy out', JSON.stringify(L5.copies.map((c) => c.name)));
await ev(() => window.GeoUIBuilder.view());
await shot('02-osu-1s.png');

// ---- 500 instances: the time a frame of ours takes (evaluate, the copies, Blockbench's own pose)
const perf = await ev(async () => {
  const TL = window.GeoUIBuilder.timeline, S = TL.store, seq = S.doc().sequences[0], blip = seq.templates.find((t) => t.name === 'blip').id;
  const xs = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, template: blip, t: 0.5 + i * 0.01, params: { x: -40 + (i % 80) } }));
  S.dispatch({ seq: seq.id, type: 'instances.import', instances: xs });
  const times = [];
  for (let k = 0; k < 30; k++) { const t0 = performance.now(); TL.player.seekTo(1 + k * 0.1); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  let frames = 0; const tick = () => { frames++; if (TL.player.playing()) requestAnimationFrame(tick); };
  S.seek(0.5); S.transport.play(); requestAnimationFrame(tick);
  await new Promise((r) => setTimeout(r, 2000));
  S.transport.pause();
  TL.player.seekTo(3.0);
  let copies = 0; window.Canvas.scene.traverse((o) => { if (/^geoui_copy:/.test(o.name)) copies++; });
  return { median: times[15], worst: times[29], fps: frames / 2, copies, n: S.doc().sequences[0].instances.length };
});
ok(perf.n >= 500 && perf.median < 33 && perf.copies >= 50, `500 instances (${perf.n} in all, ${perf.copies} out at once at 3 s: a copy each): a frame of ours (evaluate, copies, Blockbench's pose) takes ${perf.median.toFixed(1)} ms (median; worst ${perf.worst.toFixed(1)}): 30 fps and more — the page drew ${perf.fps} frames a second here (SwiftShader, no GPU)`, JSON.stringify(perf));

// ---- a video: PNGs in a zip (clear background), and a webm
const vid = await ev(async () => {
  const TL = window.GeoUIBuilder.timeline, P = TL.player;
  window.GeoUIBuilder.view();
  const zip = await P.exportVideo({ format: 'png-zip', fps: 10, from: 2, to: 3 });
  const files = window.GeoUITimeline ? window.GeoUITimeline.media.unzipStore(zip.data) : [];
  const first = files[0] && new Blob([files[0].data], { type: 'image/png' });
  const bmp = first ? await createImageBitmap(first) : null;
  let webm = null, why = null;
  try { const w = await P.exportVideo({ format: 'webm', fps: 10, from: 0, to: 1.5, background: '#000000' }); webm = { size: w.data.size, type: w.data.type, frames: w.frames, bytes: Array.from(new Uint8Array(await w.data.arrayBuffer())) }; } catch (e) { why = String(e.message || e); }
  const rect = TL.frameRect();
  return { frames: zip.frames, files: files.map((f) => f.name).slice(0, 2).concat(files.length ? [files[files.length - 1].name] : []), count: files.length, png: bmp && [bmp.width, bmp.height], rect: rect && [Math.round(rect.w), Math.round(rect.h)], dpr: window.devicePixelRatio, webm, why };
});
ok(vid.frames === 10 && vid.count === 11 && vid.files[0] === 'frame_00000.png' && vid.png && vid.rect && Math.abs(vid.png[0] - vid.rect[0] * vid.dpr) <= 2, `a video as PNGs: ${vid.frames} frames (1 s at 10 fps) in a zip with a note, each the screen's size (${vid.png && vid.png.join('x')} px)`, JSON.stringify(vid));
const wf = vid.webm ? webmFrames(Uint8Array.from(vid.webm.bytes)) : {};
if (vid.webm) { fs.writeFileSync(path.join(OUT, '03-export.webm'), Buffer.from(vid.webm.bytes)); delete vid.webm.bytes; }
ok(vid.webm && /webm/.test(vid.webm.type) && vid.webm.frames === 15 && Math.abs((wf.video || 0) - 15) <= 1 && (wf.audio || 0) > 10, `a webm of 1.5 s at 10 fps: ${vid.webm ? `${Math.round(vid.webm.size / 1024)} KB — ${wf.video || 0} video frames in the file, ${wf.audio || 0} audio blocks (the sound in it)` : vid.why}`, JSON.stringify({ vid, wf }));

// ---- unloaded: nothing of it left
const gone = await ev(async () => {
  const p = Plugins.all.find((x) => x.id === 'geoui_builder');
  if (p) p.uninstall();
  await new Promise((r) => setTimeout(r, 300));
  let copies = 0; window.Canvas.scene.traverse((o) => { if (/^geoui_copy:/.test(o.name)) copies++; });
  return { panels: ['geoui_timeline', 'geoui_inspector', 'geoui_instances'].filter((x) => Panels[x]), timeline: typeof window.GeoUITimeline, builder: typeof window.GeoUIBuilder, css: !!document.getElementById('geoui-timeline-css'), copies, actions: ['geoui_tl_play', 'geoui_tl_video'].filter((a) => BarItems[a]), dom: document.querySelectorAll('.geoui-timeline, .geoui-instances, .geoui-pathedit').length };
});
ok(!gone.panels.length && gone.timeline === 'undefined' && gone.builder === 'undefined' && !gone.css && !gone.copies && !gone.actions.length && !gone.dom, 'unloaded: no panel, action, copy, style, overlay or global of it left', JSON.stringify(gone));

ok(!errors.length, 'no errors on the page', errors.join('\n'));
await BB.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'} check-bridge (${n - fails}/${n}) — pictures in ${OUT}`);
process.exit(fails ? 1 : 0);

#!/usr/bin/env node
// GeoUI Screen — the device check: one pack that shows, on any screen, whether the formulas of bds/geoui/SPEC.md hold there —
// and what the real client does with every input a form-less UI needs. It is bds/addons/geoui_device (made here; the lab can
// test it: tests.txt on a real BDS with the lab's players, app.txt in the real Android app at many sizes, a person with an
// iPhone by eye — its TASK.md says what to look at).
//   node bds/geoui/screen/device.mjs              write bds/addons/geoui_device
//   node bds/geoui/screen/device.mjs --check      write nothing; fail when the add-on is not what this makes
//   node bds/geoui/screen/device.mjs expect <W>x<H> [--ui <screen px per JSON UI px>]
//                                                 where every mark should be on that screen (px), as `measure marks` reads them
// What it draws (gdev:show bits; each its own colours, so one screenshot's marks are told apart by hue):
//   1 anchors   a square 8 x 8 units at each of the 9 anchors, one renderer each (layout.js): the corner squares touch the corners
//   2 box       the contain box (a 1280 x 720 design, 0.25 units a px): its outline touches two sides of the screen
//   4 gui       a frame the size of the hotbar (182 x 22 JSON UI px) at the bottom, one model unit = one JSON UI px
//   8 over      marks outside the HUD's viewport: they show only where the screen reaches past the HUD's safe area
//   16 clip     a huge square in a renderer inside a clipping panel (30 % x 30 %): clipped or not
//   32 ref      a cross where GeoUI Studio's single renderer (10 % x 10 % at 110 %) puts the screen's middle (measured y 135.04)
//   64 colors   white, grey, red, green, blue, black, half-white (blend): how the renderer lights a plane
//   128 input   the input monitor (move, buttons, slot, the server's pointer) and pointers from the client's own rotation queries
//   256 query   bars of 12 rotation queries (Molang, the client's own values every frame)
//   512 rc      a bar per anchor whose length counts pre_animation runs: all the same if it runs once a frame, else not
//   1024 glyph  an F with a red dot right of it and a blue one left: mirrored or not
//   2048 order  a red plane behind a blue one, the blue one first in the geometry: depth or order
//   4096 text   labels bound to the HUD's title and subtitle (and a JSON UI substring of the title): text the server sends
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
const require = createRequire(import.meta.url);
const LAB_OWN = new Set(['lab.mjs', 'tsconfig.json']);
const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..', '..');
const G = require('../geoui_builder.js');
const L = require('./layout.js'), P = require('./pack.js'), F = require('./font.js');
require('./nav.js'); require('./input.js');
export const NS = 'gdev', NAME = 'geoui_device';
export const OUT = path.join(TOP, 'bds', 'addons', NAME);

// ---- the palette: 11 hues 30° apart (300°, the missing texture's magenta, left out), white, grey, black, half-white, clear
export const HUES = [['red', [255, 0, 0]], ['orange', [255, 128, 0]], ['yellow', [255, 255, 0]], ['chartreuse', [128, 255, 0]], ['green', [0, 255, 0]],
  ['spring', [0, 255, 128]], ['cyan', [0, 255, 255]], ['azure', [0, 128, 255]], ['blue', [0, 0, 255]], ['violet', [128, 0, 255]], ['rose', [255, 0, 128]]];
const PAL = [...HUES, ['white', [255, 255, 255]], ['gray', [128, 128, 128]], ['black', [0, 0, 0]], ['halfwhite', [255, 255, 255, 128]], ['clear', [0, 0, 0, 0]]];
const PI = Object.fromEntries(PAL.map(([n], i) => [n, i]));
export const BITS = { anchors: 1, box: 2, gui: 4, over: 8, clip: 16, ref: 32, colors: 64, input: 128, query: 256, rc: 512, glyph: 1024, order: 2048, text: 4096 };
const ATLAS = [256, 64], LABEL_Y = 8;
// the middle group's marks (local units: x, y, w, h), for the scene and for expected(): the colour swatches (64) and the half-white
// one (blend), the F and its two dots (1024), the two planes of the order test (2048: the blue one nearer, first in the geometry)
const SWATCHES = [['white', -60], ['gray', -48], ['red', -36], ['green', -24], ['blue', -12], ['black', 12]], HALF_X = 0;
const GLYPH = { F: [[30, -40, 2, 14], [30, -40, 10, 2], [30, -34, 7, 2]], red: [43, -40, 3, 3], blue: [25, -29, 3, 3] };
const ORDER = { blue: [-10, 12, 20, 6, -0.5], red: [-20, 10, 20, 10, 0] };
// the query bars (256): bar k at (QUERY_X, -42 + 7k), 4 units long at a value of 0 and 56 more a whole turn
const QUERY_X = 14, QUERY_Y0 = -42, QUERY_DY = 7;

// ---- the scene
export function scene() {
  const groups = [], bones = [], planes = [], anims = [];
  const labels = [];   // [text, atlas x, atlas y] drawn into the atlas below the palette
  let lx = 0, ly = LABEL_Y;
  const labelUv = (text) => {
    const w = F.widthOf(text);
    if (lx + w + 1 > ATLAS[0]) { lx = 0; ly += 7; }
    const at = [lx, ly]; labels.push([text, lx, ly]); lx += w + 2;
    return [at[0], at[1], w, 5];
  };
  const group = (id, anchor, extra) => { groups.push(Object.assign({ id, anchor }, extra || {})); return id; };
  const bone = (name, grp, o = {}) => { bones.push(Object.assign({ name, group: grp }, o)); return name; };
  const rect = (b, x, y, w, h, color, z = 0) => planes.push({ bone: b, texture: 'atlas', rect: { x, y, w, h }, z, uv: [PI[color] + 0.25, 0.25, 0.5, 0.5] });
  const label = (b, x, y, text, z = -0.1) => { const uv = labelUv(text); planes.push({ bone: b, texture: 'atlas', rect: { x, y, w: uv[2], h: 5 }, z, uv }); };
  const bit = (n) => `(math.mod(math.floor(v.gdev_show / ${n}), 2) > 0.5)`;
  const showIf = (n) => `${bit(n)} ? 1 : 0`;

  // anchors (1), over (8), rc (512) — one group per anchor
  const A = [['tl', 'top_left', 'red', [0, 0], 'TL', [10, 1]], ['t', 'top_middle', 'orange', [-4, 0], 'T', [6, 1]], ['tr', 'top_right', 'yellow', [-8, 0], 'TR', [-17, 1]],
    ['l', 'left_middle', 'chartreuse', [0, -4], 'L', [10, -2]], ['c', 'center', 'green', [-4, -4], 'C', [6, -2]], ['r', 'right_middle', 'spring', [-8, -4], 'R', [-13, -2]],
    ['bl', 'bottom_left', 'cyan', [0, -8], 'BL', [10, -6]], ['b', 'bottom_middle', 'azure', [-4, -8], 'B', [6, -6]], ['br', 'bottom_right', 'blue', [-8, -8], 'BR', [-17, -6]]];
  const H = 1 / (L.K * 0.1);   // the viewport's height in units at the default height scale (170.67)
  for (const [id, anchor, color, [x, y], text, [tx, ty]] of A) {
    const g = group(`a_${id}`, anchor);
    const root = bone(`gdev_${id}`, g);
    const mk = bone(`gdev_${id}_mark`, g, { parent: root, scale: showIf(BITS.anchors) });
    rect(mk, x, y, 8, 8, color);
    label(mk, tx, ty, text);
    // the rc bar: from the square's far side, a 1-unit plane scaled by a count of pre_animation runs (pivot at its near end)
    const right = x >= 0, bx = right ? x + 10 : x - 2;
    const rb = bone(`gdev_${id}_rc`, g, { parent: root, pivot: [right ? bx : bx + 1, y], scale: [`${bit(BITS.rc)} ? (2 + 2 * math.mod(v.gdev_rc, 12)) : 0`, `${bit(BITS.rc)} ? 1 : 0`, 1] });
    rect(rb, bx, y, 1, 2, color);
    // overscan: just outside the viewport, beside the corners and along the edges
    const ov = bone(`gdev_${id}_over`, g, { parent: root, scale: showIf(BITS.over) });
    const sx = anchor.includes('left') ? -1 : anchor.includes('right') ? 1 : 0, sy = anchor.startsWith('top') ? -1 : anchor.startsWith('bottom') ? 1 : 0;
    if (sx && sy) {
      // (a square out past each of the corner's two edges, and a long bar out past each edge from this corner)
      rect(ov, sx < 0 ? -10 : 4, sy < 0 ? 4 : -10, 6, 6, 'white'); rect(ov, sx < 0 ? 4 : -10, sy < 0 ? -10 : 4, 6, 6, 'white');
      rect(ov, sx < 0 ? -3 : 1, sy < 0 ? 0 : -H, 2, H, 'white');
      rect(ov, sx < 0 ? 0 : -640, sy < 0 ? -3 : 1, 640, 2, 'white');
    }
  }
  // box (2): the contain box of a 1280 x 720 design at 0.25 units a px — 320 x 180 units, from its centre
  {
    const g = group('box', 'center', { scale: { mode: 'contain', w: 1280, h: 720, g: 0.25 } });
    const b = bone('gdev_box', g, { scale: showIf(BITS.box) });
    rect(b, -160, -90, 320, 1, 'violet'); rect(b, -160, 89, 320, 1, 'violet'); rect(b, -160, -90, 1, 180, 'violet'); rect(b, 159, -90, 1, 180, 'violet');
    for (const [x, y] of [[-159, -89], [153, -89], [-159, 83], [153, 83]]) rect(b, x, y, 6, 6, 'violet');
    label(b, -150, -80, 'CONTAIN 16:9');
  }
  // gui (4): one unit = one JSON UI px, the hotbar's size above the bottom's middle, and a 32 x 32 square beside it
  {
    const g = group('gui', 'bottom_middle', { scale: { mode: 'gui', px: 1 } });
    const b = bone('gdev_gui', g, { scale: showIf(BITS.gui) });
    rect(b, -91, -22, 182, 1, 'rose'); rect(b, -91, -1, 182, 1, 'rose'); rect(b, -91, -22, 1, 22, 'rose'); rect(b, 90, -22, 1, 22, 'rose');
    rect(b, 100, -32, 32, 32, 'blue');
    label(b, -91, -29, 'GUI 182X22');
  }
  // clip (16): a renderer inside a panel that clips_children, 30 % x 30 % from 5 % of the left; scale 1/3 of that panel = 10 % of
  // the screen's height, like the others; a 400 x 400 square that is far bigger than the panel. Rose, not grey: on the CI device
  // (run 39989463030) no grey pixel was found at all — clipped away, or grey like the floor? A saturated hue no floor has tells
  {
    const g = group('clip', 'center', { scale: { mode: 'height', s: 1 / 3 }, clip: { size: ['30%', '30%'], anchor: 'left_middle', offset: ['5%', 0] } });
    const b = bone('gdev_clip', g, { scale: showIf(BITS.clip) });
    rect(b, -200, -200, 400, 400, 'rose', 1);
    label(b, -10, -2, 'CLIP');
  }
  // the reference: GeoUI Studio's single renderer (10 % x 10 % at 110 % from the top), its screen centre at y 135.04
  {
    const g = group('ref', 'center', { origin: [0, 135.04], renderer: false });
    const b = bone('gdev_ref', g, { scale: showIf(BITS.ref) });
    rect(b, -6, -0.5, 12, 1, 'white'); rect(b, -0.5, -6, 1, 12, 'white');
  }
  // input (128): the monitor at the top's middle
  const mvx = '((math.mod(v.gdev_mv, 256) - 127) / 127)', mvy = '((math.floor(v.gdev_mv / 256) - 127) / 127)';
  const btn = (k) => `(math.mod(math.floor(v.gdev_btn / ${2 ** k}), 2) > 0.5 ? 1 : 0)`;
  {
    const g = group('inp', 'top_middle');
    const root = bone('gdev_inp', g, { scale: showIf(BITS.input) });
    for (const [x, y, w, h] of [[-50, 12, 100, 0.5], [-50, 81.5, 100, 0.5], [-50, 12, 0.5, 70], [49.5, 12, 0.5, 70]]) rect(root, x, y, w, h, 'gray', 0.5);
    label(root, -46, 14, 'MOVE');
    for (const [x, y, w, h] of [[-38, 22, 16, 0.5], [-38, 37.5, 16, 0.5], [-38, 22, 0.5, 16], [-22.5, 22, 0.5, 16]]) rect(root, x, y, w, h, 'gray', 0.5);
    // (the move input: + 1 is left on x — Bedrock's — so the dot's x is its negative; forward is up)
    const dot = bone('gdev_inp_dot', g, { parent: root, pivot: [-30, 30], position: [`-${mvx} * 6`, `${mvy} * 6`, 0] });
    rect(dot, -32, 28, 4, 4, 'white', -0.2);
    const lamps = [['JMP', 'green', 0], ['SNK', 'yellow', 1], ['SWG', 'red', 2], ['USE', 'blue', 3], ['EMO', 'violet', 4], ['TXT', 'cyan', 5], ['UI', 'white', 6]];
    lamps.forEach(([t, col, k], i) => { const x = -12 + i * 9; const lb = bone(`gdev_inp_l${k}`, g, { parent: root, scale: btn(k) }); rect(lb, x, 22, 6, 6, col); label(root, x, 16, t.slice(0, 2)); });
    // (the client's own: q.is_jumping, q.is_sneaking and the last input mode — no server in between)
    const cl = [['q.is_jumping', 'chartreuse', 'J'], ['q.is_sneaking', 'orange', 'S'], ["q.last_input_mode_is_any('keyboard_and_mouse')", 'white', 'K'], ["q.last_input_mode_is_any('touch')", 'azure', 'T'], ["q.last_input_mode_is_any('gamepad')", 'rose', 'P']];
    cl.forEach(([q, col, t], i) => { const x = -12 + i * 9; const lb = bone(`gdev_inp_c${i}`, g, { parent: root, scale: `(${q}) ? 1 : 0` }); rect(lb, x, 32, 6, 6, col); label(root, x + 1, 39, t); });
    for (let k = 0; k < 9; k++) rect(root, -31 + 7 * k, 50, 5, 5, 'gray', 0.2);
    const hl = bone('gdev_inp_slot', g, { parent: root, pivot: [-31, 50], position: ['v.gdev_slot * 7', 0, 0] });
    rect(hl, -31, 50, 5, 5, 'white', -0.2);
    label(root, -46, 51, 'SLOT');
    // (the server's own yaw and pitch, as bars)
    const yb = bone('gdev_inp_yaw', g, { parent: root, pivot: [-40, 60], scale: ['1 + 79 * (v.gdev_yaw + 180) / 360', 1, 1] }); rect(yb, -40, 60, 1, 3, 'red');
    const pb = bone('gdev_inp_pitch', g, { parent: root, pivot: [-40, 66], scale: ['1 + 79 * (v.gdev_pitch + 90) / 180', 1, 1] }); rect(pb, -40, 66, 1, 3, 'blue');
    label(root, -46, 72, 'YAW PITCH');
  }
  // the pointers: the server's (from gdev:cur) and four from the client's own rotation queries, relative to the rotation when the
  // UI opened (gdev:ref), at the same 4 units a degree (pointer y is down; Molang's y is up)
  {
    const g = group('ptr', 'center');
    const root = bone('gdev_ptr', g, { scale: showIf(BITS.input) });
    const sp = bone('gdev_ptr_s', g, { parent: root, position: ['v.gdev_cx', '-v.gdev_cy', 0] });
    rect(sp, -3, -3, 6, 1, 'white', -1); rect(sp, -3, 2, 6, 1, 'white', -1); rect(sp, -3, -3, 1, 6, 'white', -1); rect(sp, 2, -3, 1, 6, 'white', -1);
    const qs = [['q1', 'q.head_y_rotation(0)', 'q.head_x_rotation(0)', 'red'], ['q2', 'q.target_y_rotation', 'q.target_x_rotation', 'yellow'],
      ['q3', 'q.camera_rotation(1)', 'q.camera_rotation(0)', 'cyan'], ['q4', 'q.body_y_rotation', 'q.body_x_rotation', 'violet']];
    for (const [id, yq, pq, col] of qs) {
      const b = bone(`gdev_ptr_${id}`, g, { parent: root });
      rect(b, -1.5, -1.5, 3, 3, col, -0.8);
      // (one animation each: a query that is not there for a player fails alone)
      anims.push({ name: `ptr_${id}`, bones: { [b]: { position: [`(math.mod(${yq} - v.gdev_refyaw + 540, 360) - 180) * 4`, `-((${pq}) - v.gdev_refpitch) * 4`, 0] } } });
    }
  }
  // query (256): bars of the client's rotation queries (length 4 + 56 x the value's place on a turn), at the left's middle
  {
    const g = group('qry', 'left_middle');
    const root = bone('gdev_qry', g, { scale: showIf(BITS.query) });
    // (the two run 40877717430 could not read — their azure and blue bars took in the first-person arm's blue — first, on red and
    //  orange; the ones it read as 0 on azure, blue, violet and rose)
    const Q = ['q.camera_rotation(0)', 'q.eye_target_y_rotation', 'q.camera_rotation(1)', 'q.eye_target_x_rotation', 'q.head_y_rotation(0)', 'q.head_x_rotation(0)',
      'q.is_local_player * 300', 'q.body_y_rotation', 'q.body_x_rotation', 'q.target_y_rotation', 'q.target_x_rotation', 'q.cardinal_player_facing * 60'];
    Q.forEach((q, k) => {
      const y = QUERY_Y0 + QUERY_DY * k, col = k < 11 ? HUES[k][0] : 'white';
      const b = bone(`gdev_qry_${k}`, g, { parent: root, pivot: [QUERY_X, y] });
      rect(b, QUERY_X, y, 1, 4, col);
      anims.push({ name: `qry_${k}`, bones: { [b]: { scale: [`4 + 56 * math.mod((${q}) + 3600, 360) / 360`, 1, 1] } } });
    });
    label(root, 14, -49, 'QUERIES');
  }
  // colors (64), glyph (1024), order (2048): at the middle, below the cross
  {
    const g = group('col', 'center');
    const cb = bone('gdev_col', g, { scale: showIf(BITS.colors) });
    SWATCHES.forEach(([c, x]) => rect(cb, x, -40, 10, 10, c));
    const half = bone('gdev_col_half', g, { parent: cb, material: 'blend' }); rect(half, HALF_X, -40, 10, 10, 'halfwhite');
    const gb = bone('gdev_glyph', g, { scale: showIf(BITS.glyph) });
    for (const r of GLYPH.F) rect(gb, ...r, 'white');
    rect(gb, ...GLYPH.red, 'red'); rect(gb, ...GLYPH.blue, 'blue');
    // (the blue plane nearer the camera but first in the geometry, the red one behind and after it)
    const ob = bone('gdev_order', g, { scale: showIf(BITS.order) });
    rect(ob, ...ORDER.blue.slice(0, 4), 'blue', ORDER.blue[4]); rect(ob, ...ORDER.red.slice(0, 4), 'red', ORDER.red[4]);
  }
  const textures = [{ id: 'atlas', width: ATLAS[0], height: ATLAS[1], png: atlasPng(labels) }];
  const R = (n) => `variable.is_paperdoll ? 0 : q.property('gdev:${n}')`;
  const pre = [
    `v.gdev_show = ${R('show')};`, `v.gdev_mv = variable.is_paperdoll ? 32639 : q.property('gdev:mv');`, `v.gdev_btn = ${R('btn')};`, `v.gdev_slot = ${R('slot')};`,
    `v.gdev_cur = variable.is_paperdoll ? 8390656 : q.property('gdev:cur');`, 'v.gdev_cx = math.mod(v.gdev_cur, 4096) * 0.1 - 204.8;', 'v.gdev_cy = math.floor(v.gdev_cur / 4096) * 0.1 - 204.8;',
    `v.gdev_rot = ${R('rot')};`, 'v.gdev_yaw = math.mod(v.gdev_rot, 4096) * 360 / 4096 - 180;', 'v.gdev_pitch = math.floor(v.gdev_rot / 4096) * 180 / 4095 - 90;',
    `v.gdev_ref = ${R('ref')};`, 'v.gdev_refyaw = math.mod(v.gdev_ref, 4096) * 360 / 4096 - 180;', 'v.gdev_refpitch = math.floor(v.gdev_ref / 4096) * 180 / 4095 - 90;',
    // (a count of pre_animation runs: the rc bars show whether each renderer runs it again)
    'v.gdev_rc = (v.gdev_rc ?? 0) + 1;',
    // (the player's own body, hidden from its frozen camera while the UI is open: read here, where the paper doll is guarded)
    `v.gdev_hide = variable.is_paperdoll ? 0 : (q.property('gdev:ui') > 0 ? 1 : 0);`,
  ];
  const properties = [{ name: 'show', range: [0, 8191], default: 0 }, { name: 'ui', range: [0, 2], default: 0 }, { name: 'mv', range: [0, 65535], default: 32639 },
    { name: 'btn', range: [0, 255], default: 0 }, { name: 'slot', range: [0, 8], default: 0 }, { name: 'cur', range: [0, 16777215], default: 8390656 },
    { name: 'rot', range: [0, 16777215], default: 0 }, { name: 'ref', range: [0, 16777215], default: 0 }];
  // the JSON UI: GeoUI Studio's own renderer (the reference) and labels bound to the HUD's title and subtitle
  const studio = { gdev_studio: { type: 'panel', size: ['10%', '10%'], offset: [0, '110%'], anchor_from: 'top_middle', anchor_to: 'top_middle',
    controls: [{ gdev_r_studio: { type: 'custom', renderer: 'live_player_renderer', layer: 1, bindings: [{ binding_name: '#hud_visible', binding_name_override: '#visible' }] } }] } };
  const lbl = (id, offset, source) => ({ [`gdev_txt_${id}`]: { type: 'label', anchor_from: 'top_left', anchor_to: 'top_left', offset, layer: 40, color: [1, 1, 0.4], shadow: true,
    font_scale_factor: 2, text: '#text', localize: false,
    bindings: [{ binding_name: '#hud_title_text_string', binding_type: 'global' }, { binding_name: '#hud_subtitle_text_string', binding_type: 'global' },
      { binding_type: 'view', source_property_name: source, target_property_name: '#text' }] } });
  const textPanel = { gdev_txt: { type: 'panel', size: ['100%', '100%'], controls: [
    lbl('title', ['8%', '30%'], '#hud_title_text_string'),
    lbl('sub', ['8%', '42%'], '#hud_subtitle_text_string'),
    lbl('first3', ['8%', '54%'], "('%.3s' * #hud_title_text_string)"),
    lbl('rest', ['8%', '66%'], "(#hud_title_text_string - ('%.3s' * #hud_title_text_string))"),
  ] } };
  return {
    ns: NS, name: 'GeoUI Device Check', description: 'GeoUI の式を本物の画面で確かめる（bds-lab: bds/geoui/SPEC.md）', seed: 'gdev-1',
    uuids: { rp: 'c3a8e1d2-4b7f-4c19-9e0a-5d6f7a8b9c01', rpMod: 'c3a8e1d2-4b7f-4c19-9e0a-5d6f7a8b9c02', bp: 'c3a8e1d2-4b7f-4c19-9e0a-5d6f7a8b9c03', bpData: 'c3a8e1d2-4b7f-4c19-9e0a-5d6f7a8b9c04', bpScript: 'c3a8e1d2-4b7f-4c19-9e0a-5d6f7a8b9c05' },
    scale: { mode: 'height', s: 0.1 }, groups, bones, planes, textures, pre, initialize: ['v.gdev_rc = 0;', 'v.gdev_hide = 0;'], properties, animations: anims,
    extraControls: [studio, textPanel], hideLocalPlayer: 'v.gdev_hide > 0', script: SCRIPT,
    extraScripts: { 'screen_nav.js': fs.readFileSync(path.join(HERE, 'nav.js'), 'utf8'), 'screen_input.js': fs.readFileSync(path.join(HERE, 'input.js'), 'utf8') },
  };
}

/** the atlas: the palette in row 0 (a texel each), the labels below it (white 3 x 5 letters) */
function atlasPng(labels) {
  const [W, H] = ATLAS, img = new Uint8Array(W * H * 4);
  PAL.forEach(([, c], i) => { img.set([c[0], c[1], c[2], c[3] ?? 255], i * 4); });
  for (const [text, x0, y0] of labels) for (const [x, y] of F.pixels(text)) img.set([255, 255, 255, 255], ((y0 + y) * W + x0 + x) * 4);
  return Buffer.from(encodePng({ width: W, height: H, data: img }));
}

// ---- the behaviour pack's script: the properties the pack reads, the UI mode, and every input logged (GDEV …) and checked
const SCRIPT = `// GeoUI device check (bds-lab: bds/geoui/screen/device.mjs makes this file — change that, not this).
// /scriptevent gdev:show <bits> · gdev:ui on [lock|speed|free] | off · gdev:cam 1|0 (the camera frozen alone) · gdev:mark · gdev:check <what> <label> · gdev:perm <jump|sneak|move|camera> on|off
// gdev:title <text> [subtitle] · gdev:sens <units a degree> · /gdev:t <text> (text typed in the chat as a command)
// What the input monitor shows and what each check means: bds/addons/geoui_device/TASK.md
import { world, system, Player, InputButton, ButtonState, InputPermissionCategory, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';
import './screen_nav.js';
import './screen_input.js';
const GS = globalThis.GeoUIScreen;
const NS = 'gdev';
const log = (s) => console.warn('GDEV ' + s);
const S = new Map();
const fresh = () => ({ moveN: 0, move: null, moveFirst: null, jumpHeld: 0, jumpEv: 0, sneakHeld: 0, sneakEv: 0, slots: [], wheel: [], swings: [], uses: 0, emotes: 0, texts: [],
  rot0: null, rotMax: 0, pos0: null, posMax: 0, recentres: 0, ptrJump: 0, modes: [], clicks: 0, navs: 0 });
function st(p) {
  let s = S.get(p.id);
  if (!s) {
    s = { ui: false, lock: false, anchor: null, seen: fresh(), pend: { swings: 0, uses: 0 }, flash: {}, last: {}, tick: 0,
      ctl: GS.input.createController({ bounds: { x0: -200, y0: -85, x1: 200, y1: 85 }, sens: 4, targets: [] }) };
    S.set(p.id, s);
  }
  return s;
}
const wrap = (a) => GS.input.wrap180(a);
const packRot = (r) => Math.round((wrap(r.y) + 180) * 4096 / 360) % 4096 + Math.max(0, Math.min(4095, Math.round((r.x + 90) * 4095 / 180))) * 4096;
function setp(p, name, v) { const s = st(p); if (s.last[name] === v) return; s.last[name] = v; try { p.setProperty(NS + ':' + name, v); } catch (e) { log('setProperty ' + name + ' ' + e); } }
function flash(s, k) { s.flash[k] = 10; }

// How the body is kept still while the move input is read as arrow keys (SPEC.md 「入力」): lock — the Movement permission off (a
// client that obeys it may stop sending the move input and the jump and sneak buttons too: what the app's check measures);
// speed — the movement attribute 0 and put back each tick; free — nothing stops it, the script puts it back each tick
function uiOn(p, how) {
  const s = st(p), rot = p.getRotation();
  if (s.ui) uiOff(p);
  s.ui = true; s.how = ['lock', 'speed', 'free'].includes(how) ? how : 'lock'; s.lock = s.how === 'lock';
  s.anchor = { loc: { x: p.location.x, y: p.location.y, z: p.location.z }, rot };
  try { p.camera.setCamera('minecraft:free', { location: p.getHeadLocation(), rotation: rot }); } catch (e) { log('camera ' + e); }
  if (s.lock) p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
  if (s.how === 'speed') { const m = p.getComponent('minecraft:movement'); if (m) { s.speed = m.currentValue; m.setCurrentValue(0); } }
  s.ctl.reset(rot, p.selectedSlotIndex); s.ctl.pointerTo(0, 0);
  setp(p, 'ui', 1); setp(p, 'ref', packRot(rot)); setp(p, 'cur', GS.input.pack2(0, 0));
  log('ui on ' + s.how + ' yaw=' + rot.y.toFixed(1) + ' pitch=' + rot.x.toFixed(1));
}
function uiOff(p) {
  const s = st(p);
  s.ui = false;
  try { p.camera.clear(); } catch (e) { log('camera ' + e); }
  p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
  if (s.how === 'speed') { const m = p.getComponent('minecraft:movement'); if (m) { if (typeof s.speed === 'number') m.setCurrentValue(s.speed); else m.resetToDefaultValue(); } }
  setp(p, 'ui', 0);
  log('ui off');
}
function check(p, what, label) {
  const s = st(p), z = s.seen, ok = (c, d) => log('CHECK ' + label + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + d);
  const mv = z.moveFirst ? z.moveFirst.x.toFixed(2) + ',' + z.moveFirst.y.toFixed(2) : '-';
  switch (what) {
    case 'move': return ok(z.moveN > 0, 'n=' + z.moveN + ' first=' + mv);
    case 'left': return ok(z.moveFirst && z.moveFirst.x > 0.5, 'first=' + mv + ' (x > 0 = left is positive)');
    case 'right': return ok(z.moveFirst && z.moveFirst.x < -0.5, 'first=' + mv);
    case 'forward': return ok(z.moveFirst && z.moveFirst.y > 0.5, 'first=' + mv);
    case 'still': return ok(z.posMax < 0.3, 'moved=' + z.posMax.toFixed(2));
    case 'moved': return ok(z.posMax > 0.5, 'moved=' + z.posMax.toFixed(2));
    case 'home': { const a = s.anchor && s.anchor.loc, l = p.location, d = a ? Math.hypot(l.x - a.x, l.z - a.z) : NaN; return ok(d < 0.6, 'from the place the UI opened=' + (Number.isFinite(d) ? d.toFixed(2) : '-')); }
    case 'rot': return ok(z.rotMax > 3, 'turned=' + z.rotMax.toFixed(1));
    case 'jump': return ok(z.jumpEv > 0, 'events=' + z.jumpEv + ' held=' + z.jumpHeld);
    case 'sneak': return ok(z.sneakEv > 0, 'events=' + z.sneakEv + ' held=' + z.sneakHeld);
    case 'slot': return ok(z.slots.length > 0, 'slots=' + z.slots.join(','));
    case 'wheel': return ok(z.wheel.length > 0, 'wheel=' + z.wheel.join(','));
    case 'swing': return ok(z.swings.length > 0, 'swings=' + z.swings.join(','));
    case 'use': return ok(z.uses > 0, 'uses=' + z.uses);
    case 'text': return ok(z.texts.length > 0, 'texts=' + JSON.stringify(z.texts));
    case 'recentre': return ok(z.recentres > 0 && z.ptrJump === 0, 'recentres=' + z.recentres + ' pointer jumps=' + z.ptrJump);
    case 'pointer': { const q = s.ctl.state.pointer; return ok(Math.abs(q[0]) + Math.abs(q[1]) > 5, 'pointer=' + q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
    case 'mode': return ok(z.modes.length > 0, 'modes=' + z.modes.join(','));
    default: return log('CHECK ' + label + ' FAIL unknown ' + what);
  }
}

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    // (a player leaving, or one not whole yet after a join, never stops the loop with an error every tick: the device check's
    //  tp right after the game joined again failed with the server's error twice in run 40877717430)
    if (!p.isValid) continue;
    try { tickOf(p); } catch (e) { const s = st(p); if (!s.tickErr) { s.tickErr = true; log('tick ' + e); } }
  }
}, 1);
function tickOf(p) {
  {
    const s = st(p), z = s.seen, ii = p.inputInfo;
    s.tick++;
    const v = ii.getMovementVector(), jump = ii.getButtonState(InputButton.Jump) === ButtonState.Pressed, sneak = ii.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
    const rot = p.getRotation(), loc = p.location, mode = String(ii.lastInputModeUsed);
    if (Math.hypot(v.x, v.y) > 0.2) { z.moveN++; if (!z.moveFirst) z.moveFirst = { x: v.x, y: v.y }; }
    if (jump) z.jumpHeld++; if (sneak) z.sneakHeld++;
    if (!z.rot0) z.rot0 = rot; else z.rotMax = Math.max(z.rotMax, Math.abs(wrap(rot.y - z.rot0.y)) + Math.abs(rot.x - z.rot0.x));
    if (!z.pos0) z.pos0 = { x: loc.x, y: loc.y, z: loc.z }; else z.posMax = Math.max(z.posMax, Math.hypot(loc.x - z.pos0.x, loc.z - z.pos0.z));
    if (s.ui) {
      const out = s.ctl.step({ tick: s.tick, rot, move: v, jump, sneak, slot: p.selectedSlotIndex, swings: s.pend.swings, uses: s.pend.uses, mode });
      s.pend.swings = 0; s.pend.uses = 0;
      for (const a of out.actions) if (a.type === 'setRotation') { try { p.setRotation(a.rotation); } catch (e) { log('setRotation ' + e); } z.recentres++; log('recentre pitch ' + rot.x.toFixed(1) + ' -> 0'); }
      for (const e of out.events) {
        if (e.type === 'pointer' && Math.abs(e.dx) + Math.abs(e.dy) > 40) z.ptrJump++;
        if (e.type === 'click') z.clicks++;
        if (e.type === 'nav' || e.type === 'key') { z.navs++; log('key ' + e.key + (e.repeat ? ' (repeat)' : '')); }
        if (e.type === 'wheel') z.wheel.push(e.delta);
      }
      setp(p, 'cur', GS.input.pack2(out.pointer[0], out.pointer[1]));
      // (free: the player walks, the script puts it back each tick — the frozen camera does not show it)
      if (!s.lock && s.anchor && Math.hypot(loc.x - s.anchor.loc.x, loc.z - s.anchor.loc.z) > 0.05) { try { p.teleport(s.anchor.loc, { keepVelocity: false }); } catch (e) { log('teleport ' + e); } }
    }
    for (const k of Object.keys(s.flash)) if (s.flash[k] > 0) s.flash[k]--;
    const bits = (jump ? 1 : 0) | (sneak ? 2 : 0) | (s.flash.swing > 0 ? 4 : 0) | (s.flash.use > 0 ? 8 : 0) | (s.flash.emote > 0 ? 16 : 0) | (s.flash.text > 0 ? 32 : 0) | (s.ui ? 64 : 0);
    setp(p, 'btn', bits);
    setp(p, 'mv', Math.round((Math.max(-1, Math.min(1, v.x)) + 1) * 127) + Math.round((Math.max(-1, Math.min(1, v.y)) + 1) * 127) * 256);
    setp(p, 'slot', p.selectedSlotIndex);
    setp(p, 'rot', packRot(rot));
  }
}

world.afterEvents.playerButtonInput.subscribe((e) => {
  const s = st(e.player);
  if (e.newButtonState === ButtonState.Pressed) { if (e.button === InputButton.Jump) s.seen.jumpEv++; else s.seen.sneakEv++; }
  log('button ' + e.button + ' ' + e.newButtonState);
});
world.afterEvents.playerSwingStart.subscribe((e) => { const s = st(e.player); s.seen.swings.push(String(e.swingSource)); s.pend.swings++; flash(s, 'swing'); log('swing ' + e.swingSource); });
world.afterEvents.itemUse.subscribe((e) => { const s = st(e.source); s.seen.uses++; s.pend.uses++; flash(s, 'use'); log('use ' + e.itemStack.typeId); });
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((e) => { const s = st(e.player); s.seen.slots.push(e.newSlotSelected); log('slot ' + e.previousSlotSelected + ' -> ' + e.newSlotSelected); });
world.afterEvents.playerEmote.subscribe((e) => { const s = st(e.player); s.seen.emotes++; flash(s, 'emote'); log('emote'); });
world.afterEvents.playerInputModeChange.subscribe((e) => { const s = st(e.player); s.seen.modes.push(String(e.newInputModeUsed)); log('mode ' + e.previousInputModeUsed + ' -> ' + e.newInputModeUsed); });

system.afterEvents.scriptEventReceive.subscribe((e) => {
  const [verb, ...rest] = e.id.split(':')[1] ? [e.id.split(':')[1], ...String(e.message).trim().split(/\\s+/)] : [];
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) {
    const s = st(p);
    if (verb === 'show') { setp(p, 'show', Math.max(0, Math.min(8191, Number(rest[0]) | 0))); log('show ' + rest[0]); }
    else if (verb === 'ui') { if (rest[0] === 'off') uiOff(p); else uiOn(p, rest[1] || 'lock'); }
    else if (verb === 'mark') { s.seen = fresh(); log('mark'); }
    else if (verb === 'cam') {
      // (the camera frozen where the head is and the body hidden, as the UI freezes it but with nothing of the UI: the marks then
      //  have no first-person arm in front of them — it hides GeoUI by depth at the screen's bottom right, RULES R4.11)
      if (rest[0] === '1') { try { p.camera.setCamera('minecraft:free', { location: p.getHeadLocation(), rotation: p.getRotation() }); } catch (e) { log('camera ' + e); } if (!s.ui) setp(p, 'ui', 2); }
      else if (!s.ui) { try { p.camera.clear(); } catch (e) { log('camera ' + e); } setp(p, 'ui', 0); }
      log('cam ' + (rest[0] === '1' ? 1 : 0));
    }
    else if (verb === 'check') check(p, rest[0], rest[1] || rest[0]);
    // (the player off the server before the game is started again — the console's kick fails with nobody on it, this does not)
    else if (verb === 'kick') { try { p.dimension.runCommand('kick "' + p.name + '"'); log('kick ' + p.name); } catch (e) { log('kick ' + e); } }
    else if (verb === 'perm') {
      const cat = { jump: InputPermissionCategory.Jump, sneak: InputPermissionCategory.Sneak, move: InputPermissionCategory.Movement, camera: InputPermissionCategory.Camera }[rest[0]];
      if (cat !== undefined) { p.inputPermissions.setPermissionCategory(cat, rest[1] !== 'off'); log('perm ' + rest[0] + ' ' + (rest[1] !== 'off' ? 'on' : 'off')); }
    } else if (verb === 'title') { p.onScreenDisplay.setTitle(rest[0] || '', { fadeInDuration: 0, stayDuration: 1200, fadeOutDuration: 0, subtitle: rest[1] || '' }); log('title ' + rest.join(' ')); }
    else if (verb === 'sens') { const v = Number(rest[0]); if (v > 0) s.ctl.cfg.sens = v; log('sens ' + s.ctl.cfg.sens); }
  }
}, { namespaces: [NS] });

system.beforeEvents.startup.subscribe((e) => {
  e.customCommandRegistry.registerCommand({ name: 'gdev:t', description: 'GeoUI device check: type a text', permissionLevel: CommandPermissionLevel.Any,
    mandatoryParameters: [{ name: 'text', type: CustomCommandParamType.String }] },
  (o, text) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (!p.isValid) return; const s = st(p); s.seen.texts.push(text); flash(s, 'text'); log('text ' + JSON.stringify(text)); });
    return { status: CustomCommandStatus.Success };
  });
});
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) { setp(e.player, 'show', 0); setp(e.player, 'ui', 0); } }); });
`;

// ---- where each mark lands on a W x H screen (px): what `measure marks` should read
export function expected(W, H, uiScale = 2) {
  const sc = scene(), groups = L.groupsOf(sc), byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const out = {};
  const add = (key, gid, r) => { const g = byId[gid]; const b = L.rectToScreen(g, r, W, H, uiScale); out[key] = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10])); };
  for (const [id, rx, ry] of [['tl', 0, 0], ['t', -4, 0], ['tr', -8, 0], ['l', 0, -4], ['c', -4, -4], ['r', -8, -4], ['bl', 0, -8], ['b', -4, -8], ['br', -8, -8]]) add(`anchor ${id}`, `a_${id}`, { x: rx, y: ry, w: 8, h: 8 });
  add('box', 'box', { x: -160, y: -90, w: 320, h: 180 });
  add('gui hotbar', 'gui', { x: -91, y: -22, w: 182, h: 22 });
  add('gui square', 'gui', { x: 100, y: -32, w: 32, h: 32 });
  // the middle's marks, each its own picture in app.txt (colors, glyph, order)
  for (const [c, x] of [...SWATCHES, ['halfwhite', HALF_X]]) add(`color ${c}`, 'col', { x, y: -40, w: 10, h: 10 });
  const xs = GLYPH.F.flatMap(([x, , w]) => [x, x + w]), ys = GLYPH.F.flatMap(([, y, , h]) => [y, y + h]);
  add('glyph F', 'col', { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  for (const k of ['red', 'blue']) { const [x, y, w, h] = GLYPH[k]; add(`glyph ${k}`, 'col', { x, y, w, h }); }
  for (const k of ['blue', 'red']) { const [x, y, w, h] = ORDER[k]; add(`order ${k}`, 'col', { x, y, w, h }); }
  // the query bars at a value of 0 (4 units long; a bar's box is as long as its value says: 56 more a whole turn)
  QUERY_NAMES.forEach((q, k) => add(`query ${k}`, 'qry', { x: QUERY_X, y: QUERY_Y0 + QUERY_DY * k, w: 4, h: 4 }));
  out.clip = { x0: 0.05 * W, y0: 0.35 * H, x1: 0.35 * W, y1: 0.65 * H };
  out['ref cross (measured d)'] = { x0: W / 2 - 6 * L.K * 0.1 * H, x1: W / 2 + 6 * L.K * 0.1 * H, y0: H / 2 - 6 * L.K * 0.1 * H, y1: H / 2 + 6 * L.K * 0.1 * H };
  return out;
}

// ---- a run's measures against the formulas: `node bds/geoui/screen/device.mjs compare <summary.json | run folder>`
const ANCHOR_HUE = { tl: 'red', t: 'orange', tr: 'yellow', l: 'chartreuse', c: 'green', r: 'spring', bl: 'cyan', b: 'azure', br: 'blue' };
const QUERY_NAMES = ['camera_rotation(0)', 'eye_target_y_rotation', 'camera_rotation(1)', 'eye_target_x_rotation', 'head_y_rotation(0)', 'head_x_rotation(0)',
  'is_local_player x 300', 'body_y_rotation', 'body_x_rotation', 'target_y_rotation', 'target_x_rotation'];
const COLOR_RGB = { white: [255, 255, 255], gray: [128, 128, 128], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], black: [0, 0, 0] };
const boxD = (g, w) => Math.max(...['x0', 'y0', 'x1', 'y1'].map((k) => Math.abs(g[k] - w[k])));
const mid = (b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
/** measures (summary.json's: [{ shot, kind, ok, values, why }]) → rows { shot, what, want, got, d (px), note, fit } and per screen
 *  what it says: the viewport's insets (how far each side of the HUD is in from the screen's edge), the GUI scale, clipped or not;
 *  and what the looks say: how much the renderer lights a colour, mirrored or not, depth or drawing order, pre_animation once a
 *  frame or per renderer, the client's rotation queries before and after a turn. fit false: a row the formulas' worst error leaves
 *  out (a mark that may be somewhere else on purpose: the order test's blue, white with the half-white in it) */
export function compare(measures, opts = {}) {
  const rows = [], screens = [], bars = {};
  for (const m of (measures || []).filter((x) => x.kind === 'marks')) {
    const v = m.values || {}, shot = m.shot || m.name || '?';
    if (!m.ok) { rows.push({ shot, what: '—', note: m.why || '測れなかった' }); continue; }
    const W = v.width, H = v.height, e = expected(W, H, opts.ui || 2), u = L.K * 0.1 * H;
    const got = (c) => (Number.isFinite(v[`${c}x0`]) ? { x0: v[`${c}x0`], y0: v[`${c}y0`], x1: v[`${c}x1`], y1: v[`${c}y1`] } : null);
    const add = (what, c, want, note, fit = true) => {
      const g = got(c), d = g && want ? boxD(g, want) : null;
      rows.push({ shot, what, cls: c, want: want || null, got: g, d, note: g ? note || '' : 'その色が無い', ...(fit ? {} : { fit: false }) });
      return g;
    };
    const say = (what, note) => rows.push({ shot, what, note, summary: true });
    if (/^(anchors|gui-dpi)/.test(shot)) {
      const g = {};
      // (the bottom's middle and right: azure and blue are in the world too — the sky, water, and at the bottom right the first-person
      //  arm's blue (RULES R4.11: it hides GeoUI planes there) — and their boxes take them in; the hotbar is drawn over the bottom
      //  middle's square (pictures before run 40961440806 had it shown): shown, not counted in the worst error)
      for (const [k, c] of Object.entries(ANCHOR_HUE)) {
        const blue = k === 'b' || k === 'br';
        g[k] = add(`寄せ先 ${k}`, c, e[`anchor ${k}`], blue ? '（ホットバーの下になり、ワールドの青・右下の 1 人称の腕と混ざることがある（RULES R4.11）: いちばん大きいずれに数えない）' : '', !blue);
      }
      // (the viewport's edges, read off the corner squares: 0 when the HUD reaches the screen's edge. Not off the bottom-right one:
      //  blue and azure are in the world too — the sky, water — and its box takes them in)
      if (g.tl && g.tr && g.bl) screens.push({ shot, W, H, inset: { left: g.tl.x0, top: g.tl.y0, right: W - g.tr.x1, bottom: H - g.bl.y1 } });
    }
    if (/^box/.test(shot)) {
      add('contain の箱', 'violet', e.box);
      // (the real hotbar is drawn over it: only its lower edge shows — its width is the GUI scale, not counted in the worst error)
      const r = add('gui の枠（ホットバー 182 x 22）', 'rose', e['gui hotbar'], '（本物のホットバーの下: 幅で GUI の倍率を読む）', false);
      if (r) screens.push({ shot, W, H, ui: (r.x1 - r.x0) / 182 });
    }
    if (/^gui-dpi/.test(shot)) { const r = got('rose'); if (r) screens.push({ shot, W, H, ui: (r.x1 - r.x0) / 182 }); }
    if (/^clip/.test(shot)) {
      // (rose since 2026-10-24: the square far bigger than the panel — the panel's box if clipped, the whole screen if not)
      const g = got('rose'), c = e.clip, inside = g && g.x0 >= c.x0 - 2 && g.y0 >= c.y0 - 2 && g.x1 <= c.x1 + 2 && g.y1 <= c.y1 + 2;
      rows.push({ shot, what: '切り抜き（30 % x 30 % の枠）', cls: 'rose', want: c, got: g, d: inside ? boxD(g, c) : null, fit: false,
        note: !g ? '薔薇色が無い: 切り抜く枠の中の renderer は何も描いていない（写真で確かめる）'
          : inside ? (boxD(g, c) <= 3 ? '枠いっぱいに収まる: clips_children が renderer を切り抜く' : '枠の中だが枠より小さい（写真で確かめる）')
            : g.x1 - g.x0 > 0.9 * W ? '画面いっぱい: 切り抜かれない' : '枠の外まで出る: 切り抜かれない' });
    }
    if (/^over/.test(shot)) {
      const g = got('white');
      rows.push({ shot, what: 'viewport の外の白い印', cls: 'white', want: null, got: g, d: null, note: g ? '見える: 画面が HUD の外まである' : '見えない: HUD が画面いっぱい' });
    }
    if (/^colors/.test(shot)) for (const [c, rgb] of Object.entries(COLOR_RGB)) {
      // (how much the renderer lights a plane: the measured channel over the drawn one; white's box may take the half-white in)
      const g = got(c), want = e[`color ${c}`], mean = [v[`${c}r`], v[`${c}g`], v[`${c}b`]], lit = rgb.map((x, i) => (x ? mean[i] / x : null)).filter((x) => x !== null);
      const half = c === 'white' && g && Math.abs(g.x1 - e['color halfwhite'].x1) <= 3;
      add(`色 ${c}`, c, want, g ? `rgb(${mean.map((x) => Math.round(x)).join(', ')})${lit.length ? `・明るさ ${(lit.reduce((a, x) => a + x, 0) / lit.length).toFixed(3)}` : ''}${half ? '（半透明の白も白に入った: 平均は混ざる）' : ''}` : '', !half);
    }
    if (/^glyph/.test(shot)) {
      const f = add('F の字（白）', 'white', e['glyph F']), r = add('F の右上の赤い点', 'red', e['glyph red']), b = add('F の左下の青い点', 'blue', e['glyph blue']);
      if (f && r && b) {
        const F2 = mid(f), lr = mid(r).x > F2.x && mid(b).x < F2.x, ud = mid(r).y < mid(b).y;
        say('F の向き', lr && ud ? '鏡写しではない（赤が右上・青が左下）' : `${lr ? '' : '左右が逆。'}${ud ? '' : '上下が逆。'}`);
      }
    }
    if (/^order/.test(shot)) {
      // (the blue plane nearer (z −0.5) but first in the geometry; the red one behind it and after: where they overlap, the one
      //  on top shows — the whole blue one if depth decides, else only its part out of the red one, from the red one's right edge)
      const b = add('手前の青（z −0.5・先に書いた）', 'blue', e['order blue'], '', false);
      add('奥の赤（z 0・後に書いた）', 'red', e['order red']);
      const depth = b && Math.abs(b.x0 - e['order blue'].x0) <= 3, order = b && Math.abs(b.x0 - e['order red'].x1) <= 3;
      // (else by the red one's pixels: the blue one's box can take in other blue — run 40877717430's took in the first-person
      //  arm's — but the red plane short of the overlap is the blue one on top, and whole the red one)
      const er = e['order red'], eb = e['order blue'], area = (er.x1 - er.x0) * (er.y1 - er.y0);
      const over = Math.max(0, Math.min(er.x1, eb.x1) - Math.max(er.x0, eb.x0)) * Math.max(0, Math.min(er.y1, eb.y1) - Math.max(er.y0, eb.y0)), n = v.redn;
      const byRed = !Number.isFinite(n) || !over ? null : Math.abs(n - (area - over)) <= 0.2 * over ? 'depth' : Math.abs(n - area) <= 0.2 * over ? 'order' : null;
      if (b || byRed) say('描く順と奥行き', depth ? '奥行きが効く: 手前（z が小さい）の青が上' : order ? '描いた順: 後に書いた赤が上（奥行きは効かない）'
        : byRed === 'depth' ? `奥行きが効く: 赤の画素 ${n} = 赤の板 ${Math.round(area)} − 重なり ${Math.round(over)}（手前の青が重なりを覆う。青の箱は他の青と混ざった）`
          : byRed === 'order' ? `描いた順: 赤の画素 ${n} = 赤の板 ${Math.round(area)}（重なりも赤。青の箱は他の青と混ざった）` : '分からない（青の左端が式のどちらでもない: 写真で確かめる）');
    }
    if (/^rc/.test(shot)) {
      // (a bar per anchor, 2 + 2 x (pre_animation's count mod 12) units: all alike when it runs once a frame for every renderer)
      const lens = {};
      for (const [k, c] of Object.entries(ANCHOR_HUE)) {
        const g = got(c);
        if (g) lens[k] = (g.x1 - g.x0) / u;
        rows.push({ shot, what: `rc の棒 ${k}`, cls: c, want: null, got: g, d: null, note: g ? `${lens[k].toFixed(1)} 単位（2 + 2 x (数え mod 12)）` : 'その色が無い' });
      }
      // (not the bottom's middle and right: azure and blue are in the world too)
      const sure = Object.entries(lens).filter(([k]) => k !== 'b' && k !== 'br').map(([, x]) => x);
      if (sure.length >= 3) {
        const spread = Math.max(...sure) - Math.min(...sure);
        say('pre_animation の回数', spread < 1.5 ? `どの renderer の棒も同じ長さ（差 ${spread.toFixed(1)} 単位）: 1 フレームに 1 回（renderer ごとではない）` : `棒の長さが違う（差 ${spread.toFixed(1)} 単位）: renderer ごとに動いている`);
      }
    }
    if (/^query/.test(shot)) {
      // (a bar QUERY_X units from the left's middle, 4 + 56 x (the value's place on a turn) long; its box is the bar itself when the
      //  shot world before it had no bars — app.txt since 2026-10-24)
      QUERY_NAMES.forEach((q, k) => {
        const g = got(HUES[k][0]), len = g ? (g.x1 - g.x0) / u : null, deg = g ? ((len - 4) / 56) * 360 : null;
        if (g) (bars[q] = bars[q] || {})[shot] = deg;
        rows.push({ shot, what: `q.${q}`, cls: HUES[k][0], want: e[`query ${k}`], got: g, d: null, note: g ? `棒 ${len.toFixed(1)} 単位 = ${deg.toFixed(0)}°（4 単位 = 0°、56 単位で 1 回り）` : 'その色が無い' });
      });
    }
  }
  // the client's rotation queries before and after a turn of the head with the camera frozen: which follow it, by how much
  for (const [q, s] of Object.entries(bars)) {
    if (s['query-before'] === undefined || s['query-after'] === undefined) continue;
    const dd = wrap180(s['query-after'] - s['query-before']);
    rows.push({ shot: 'query', what: `q.${q} の変化`, summary: true, note: `${Math.abs(dd) < 3 ? '動かない' : `${dd > 0 ? '+' : ''}${dd.toFixed(0)}°`}（${s['query-before'].toFixed(0)}° → ${s['query-after'].toFixed(0)}°）` });
  }
  return { rows, screens };
}
/** the comparison as text (Japanese, a line a mark) */
export function compareText(r) {
  const box = (b) => (b ? `(${Math.round(b.x0)}, ${Math.round(b.y0)})–(${Math.round(b.x1)}, ${Math.round(b.y1)})` : '—');
  const out = r.rows.map((x) => (x.summary ? `${x.shot.padEnd(18)} ${x.what.padEnd(24)} → ${x.note}`
    : `${x.shot.padEnd(18)} ${x.what.padEnd(24)} 式 ${box(x.want)}  測った ${box(x.got)}${x.d !== null && x.d !== undefined ? `  ずれ ${x.d.toFixed(1)} px` : ''}${x.note ? `  ${x.note}` : ''}`));
  for (const s of r.screens) {
    if (s.inset) out.push(`${s.shot.padEnd(18)} 表示領域の内側への寄り（px）: 左 ${s.inset.left}・上 ${s.inset.top}・右 ${s.inset.right}・下 ${s.inset.bottom}（${s.W}x${s.H}）`);
    if (s.ui) out.push(`${s.shot.padEnd(18)} GUI の倍率: ${s.ui.toFixed(2)} 画面 px / JSON UI px（${s.W}x${s.H}）`);
  }
  const worst = r.rows.filter((x) => Number.isFinite(x.d) && x.fit !== false).reduce((a, x) => (!a || x.d > a.d ? x : a), null);
  out.push(`いちばん大きいずれ ${(worst ? worst.d : 0).toFixed(1)} px${worst ? `（${worst.shot} の${worst.what}）` : ''}（3 px 以内なら式どおり: SPEC.md 6 章）`);
  return out.join('\n');
}

// ---- the add-on's other files
const TESTS = `# geoui_device（bds/geoui/screen/device.mjs が作る）: 端末の確かめのパックが本物の BDS で動き、入力（視点・移動・ジャンプ・スニーク・
# スロット・腕の振り・コマンドの文字）がスクリプトの UI のモードに届くか。描画（9 つの寄せ先・contain の枠・GUI の倍率・セーフエリア・
# 切り抜き・色・向き・順番・HUD の文字）は app.txt（本物のアプリ）と TASK.md（人が iPhone などで見る）。

## 読み込める（プロパティが既定値）
@A join
wait 2000
js JSON.stringify([p('A').getProperty('gdev:show'), p('A').getProperty('gdev:ui'), p('A').getProperty('gdev:cur')])
= [0,0,8390656]

## 表示の切り替え（gdev:show のビット）
scriptevent gdev:show 4095
wait 300
js p('A').getProperty('gdev:show')
= 4095
scriptevent gdev:show 0
wait 300

## カメラだけ止める（gdev:cam: 体を隠す。UI のモードではない）
scriptevent gdev:cam 1
wait 300
js p('A').getProperty('gdev:ui')
= 2
scriptevent gdev:cam 0
wait 300
js p('A').getProperty('gdev:ui')
= 0

## UI のモード（動きを禁止）: カメラを止め、歩いても動かず、視点でポインタが動く
scriptevent gdev:ui on lock
wait 500
js JSON.stringify([p('A').getProperty('gdev:ui'), p('A').inputPermissions.isPermissionCategoryEnabled(mc.InputPermissionCategory.Movement)])
= [1,false]
scriptevent gdev:mark
@A walk forward 10
wait 800
scriptevent gdev:check still bot-locked-still
~ GDEV CHECK bot-locked-still PASS
scriptevent gdev:mark
@A turn 20 10 10
wait 800
scriptevent gdev:check pointer bot-pointer
~ GDEV CHECK bot-pointer PASS
js const n = p('A').getProperty('gdev:cur'); const x = (n % 4096) * 0.1 - 204.8, y = Math.floor(n / 4096) * 0.1 - 204.8; JSON.stringify([x > 60, y > 25])
= [true,true]

## 下を向き続けると水平に戻し、ポインタは跳ばない
scriptevent gdev:mark
@A turn 0 60 30
wait 2500
scriptevent gdev:check recentre bot-recentre
~ GDEV CHECK bot-recentre PASS

## UI のモード（動けるまま毎 tick 戻す）: 移動の入力は届き、体は戻る
scriptevent gdev:ui on free
wait 500
scriptevent gdev:mark
@A walk forward 10
wait 800
scriptevent gdev:check move bot-free-move
~ GDEV CHECK bot-free-move PASS
scriptevent gdev:check forward bot-free-forward
~ GDEV CHECK bot-free-forward PASS
scriptevent gdev:check home bot-free-home
~ GDEV CHECK bot-free-home PASS

## ジャンプ・スニークのボタンが届く
scriptevent gdev:mark
@A jump
wait 600
@A sneak on
wait 400
@A sneak off
wait 400
scriptevent gdev:check jump bot-jump
~ GDEV CHECK bot-jump PASS
scriptevent gdev:check sneak bot-sneak
~ GDEV CHECK bot-sneak PASS

## スロット（ホイール）と腕の振り
scriptevent gdev:mark
@A hotbar next
wait 400
@A slot 5
wait 400
@A swing
wait 400
scriptevent gdev:check wheel bot-wheel
~ GDEV CHECK bot-wheel PASS
scriptevent gdev:check swing bot-swing
~ GDEV CHECK bot-swing PASS

## 文字はコマンドで（/gdev:t）
scriptevent gdev:mark
@A cmd /gdev:t hello
wait 600
scriptevent gdev:check text bot-text
~ GDEV CHECK bot-text PASS

## 動きの速さ 0（speed）でも移動の入力は届く
scriptevent gdev:ui on speed
wait 500
scriptevent gdev:mark
@A walk left 10
wait 800
scriptevent gdev:check left bot-speed-left
~ GDEV CHECK bot-speed-left PASS
js p('A').getComponent('minecraft:movement').currentValue
= 0

## UI を閉じると元に戻る
scriptevent gdev:ui off
wait 400
js JSON.stringify([p('A').getProperty('gdev:ui'), p('A').inputPermissions.isPermissionCategoryEnabled(mc.InputPermissionCategory.Movement), p('A').getComponent('minecraft:movement').currentValue > 0])
= [0,true,true]

## サーバーから出す（gdev:kick: 切り欠きの前。誰もいなくても失敗しない）
scriptevent gdev:kick
wait 1500
~ GDEV kick A
~ @A disconnected
js world.getAllPlayers().length
= 0
scriptevent gdev:kick
wait 500
!~ ^E
`;

/** the real app (Android): the shapes, the safe area and the inputs. Measures: `measure marks` (each hue's box on the screen) */
export function appTxt() {
  // (in the world: looking straight down (behind the marks only the still ground); adventure: a tap or a click on the ground breaks
  //  nothing; the HUD's parts hidden one by one, the hotbar kept — the GUI frame is drawn over it; the camera frozen where the head
  //  is (gdev:cam 1, the body hidden): in first person the arm hides GeoUI by depth at the bottom right and its blue joins the
  //  marks' blue (RULES R4.11 — run 40877717430 lost the right middle on 4:3 to 16:9 and the bottom right everywhere))
  const setup = ['do tp @a 0 -60 0 0 90                      # 真下を向く（後ろは動かない地面だけ）', 'do gamemode adventure @a',
    ...['crosshair', 'health', 'hunger', 'armor', 'progress_bar', 'air_bubbles', 'status_effects', 'item_text', 'tooltips', 'paperdoll', 'touch_controls'].map((h) => `do hud @a hide ${h}`),
    'do scriptevent gdev:show 0', 'do scriptevent gdev:cam 1', 'wait 7000'];
  const lines = [`# GeoUI の端末の確かめ（bds/geoui/screen/device.mjs が作る）: node lab.mjs app ci -a geoui_device（許可をもらってから）`,
    `# 各画面の大きさで、GeoUI を出す前（shot world）と後を比べ、色ごとの枠を測る（measure marks: 11 色・白・灰の箱 px）。期待の位置は`,
    `# node bds/geoui/screen/device.mjs expect <幅>x<高さ>。入力は gdev:check の PASS / FAIL がサーバーのログに出る（expect server）。`,
    `# 結果: node bds/geoui/screen/device.mjs compare <summary.json>（式と比べ、色・向き・重なり・renderer ごとの計算・回転のクエリも読む）。`, '',
    // (the game stopped and started again right before the join: a device come back from its snapshot carries the game's
    //  state of when it was saved — its first joins all failed on 2026-10-24 (run 40052537778: "An error has occurred";
    //  40055381439: a sign-in offer; 40059144882: PLAY on Realms), every join after a restart but one went in. In a batch
    //  this section is where this add-on starts)
    'section join', 'stop', 'launch', 'until title 600000', 'shot title', 'join', 'until joined 900000', ...setup,
    'absent clientlog \\bERROR\\b', ''];
  const sizes = [['default', null], ['4x3', '1024x768'], ['fold', '1104x920'], ['16x10', '1280x800'], ['16x9', '1920x1080'], ['18x9', '2160x1080'], ['195x9', '2340x1080'],
    ['20x9', '2400x1080'], ['21x9', '2520x1080'], ['32x9', '3840x1080']];
  // (the anchors with the hotbar hidden: it is drawn over GeoUI, and the bottom middle's square under it showed a few rows only in
  //  run 40961440806. Shown again — and the world shot again — for the box: its gui frame is the hotbar's own)
  for (const [id, sz] of sizes) {
    lines.push(`section size-${id}`);
    if (sz) lines.push(`size ${sz}`, 'wait 9000');
    lines.push('do hud @a hide hotbar', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world',
      `do scriptevent gdev:show ${BITS.anchors}`, 'wait 2000', `shot anchors-${id}`, `measure marks anchors-${id}`,
      'do hud @a reset hotbar', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world',
      `do scriptevent gdev:show ${BITS.box | BITS.gui | BITS.ref}`, 'wait 2000', `shot box-${id}`, `measure marks box-${id}`);
    if (id === 'default' || id === '4x3' || id === '32x9') lines.push(`do scriptevent gdev:show ${BITS.clip}`, 'wait 2000', `shot clip-${id}`, `measure marks clip-${id}`);
    lines.push('');
  }
  // (the looks, the text and the inputs on the device's own screen again (the sizes end at 32:9); one picture a kind of mark:
  //  `measure marks` boxes each colour once, and red, blue and white are in the colours, the F and the order test alike — the
  //  rc bars too without their anchors' squares, so each box is its bar)
  lines.push('section look', 'size reset', 'wait 6000', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world');
  for (const [name, bits] of [['colors', BITS.colors], ['glyph', BITS.glyph], ['order', BITS.order], ['rc', BITS.rc]]) lines.push(`do scriptevent gdev:show ${bits}`, 'wait 2000', `shot ${name}`, `measure marks ${name}`);
  lines.push('do scriptevent gdev:cam 0', 'wait 1500', '');
  // (the world first with the text test on: `measure diff text` then says where the title's letters came, in numbers the public
  //  summary keeps — the OCR found none of them in run 40924847860 and its picture is sealed)
  lines.push('section text', 'do scriptevent gdev:show 4096', 'wait 1500', 'shot world', 'do scriptevent gdev:title QZX7JK2W SUBLINE', 'wait 2500', 'shot text', 'measure diff text',
    'expect text QZX7JK2W', 'expect text ^QZX$', 'expect text ^7JK2W$', 'expect text SUBLINE', 'do scriptevent gdev:title', '');
  // the inputs: first without the lock (does each input arrive at all), then locked, then the camera frozen
  const chk = (what, label) => [`do scriptevent gdev:check ${what} ${label}`, `expect server GDEV CHECK ${label} PASS`];
  const sec = (name, ...steps) => { lines.push(`section ${name}`, 'do scriptevent gdev:mark', ...steps, ''); };
  sec('in-key-free', 'press W 700', 'wait 400', ...chk('move', 'key-w'), ...chk('forward', 'key-w-forward'));
  sec('in-key-left', 'press A 700', 'wait 400', ...chk('left', 'key-a-left'));
  lines.push('section ui-lock', `do scriptevent gdev:show ${BITS.input}`, 'do scriptevent gdev:ui on lock', 'wait 2500', 'shot ui-lock', '');
  sec('in-key-locked', 'press W 700', 'wait 400', ...chk('move', 'locked-key-w'), ...chk('still', 'locked-still'));
  sec('in-stick-locked', 'walk forward 0.7', 'wait 400', ...chk('move', 'locked-stick'));
  sec('in-look-locked', 'shot look-before', 'look right 400 60', 'wait 600', 'shot look-after', ...chk('rot', 'frozen-turn'), ...chk('pointer', 'frozen-pointer'));
  // (the bars against a world without them — each box is the whole bar, its length the query's value — before and after a turn
  //  of the head with the camera frozen; the input monitor off: its lamps and pointers are in the bars' colours)
  sec('in-query', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world', `do scriptevent gdev:show ${BITS.query}`, 'wait 1500', 'shot query-before', 'measure marks query-before',
    'look left 400 60', 'wait 800', 'shot query-after', 'measure marks query-after');
  sec('in-recentre', `do scriptevent gdev:show ${BITS.input}`, 'look down 1500 80', 'wait 600', ...chk('recentre', 'recentre'));
  sec('in-jump-pad', 'jump', 'wait 500', ...chk('jump', 'pad-jump'));
  sec('in-jump-key', 'press SPACE 300', 'wait 500', ...chk('jump', 'key-jump'));
  sec('in-jump-denied', 'do scriptevent gdev:perm jump off', 'wait 300', 'press SPACE 300', 'wait 500', ...chk('jump', 'denied-jump'), 'do scriptevent gdev:perm jump on');
  sec('in-sneak-pad', 'sneak 0.5', 'wait 400', ...chk('sneak', 'pad-sneak'));
  sec('in-sneak-key', 'press SHIFT_LEFT 400', 'wait 400', ...chk('sneak', 'key-sneak'));
  sec('in-sneak-denied', 'do scriptevent gdev:perm sneak off', 'wait 300', 'press SHIFT_LEFT 400', 'wait 400', ...chk('sneak', 'denied-sneak'), 'do scriptevent gdev:perm sneak on');
  sec('in-wheel', 'mouse scroll 0.5 0.5 1', 'wait 600', ...chk('wheel', 'mouse-wheel'));
  // (the keyboard's 5 as the device's own keyboard presses it — sendevent, as W A S D and SPACE that arrived: Android's `input
  //  keyevent` (the virtual keys) did not select a slot in run 40877717430)
  sec('in-slot-key', 'press 5 200', 'wait 600', ...chk('slot', 'key-slot'));
  sec('in-slot-pad', 'slot next', 'wait 600', ...chk('wheel', 'pad-wheel'));
  sec('in-swing-pad', 'attack 0.3', 'wait 500', ...chk('swing', 'pad-swing'));
  sec('in-swing-mouse', 'mouse tap 0.5 0.5', 'wait 500', ...chk('swing', 'mouse-swing'));
  sec('in-swing-touch', 'tap 0.6 0.4', 'wait 500', ...chk('swing', 'touch-swing'));
  // (a touch held: the touch controls' attack is a long press — a tap did not swing in run 40877717430)
  sec('in-swing-hold', 'hold 0.6 0.4 800', 'wait 500', ...chk('swing', 'touch-hold-swing'));
  // (something to use in the hand: an empty hand gives no itemUse — run 40877717430)
  sec('in-use-pad', 'do replaceitem entity @a slot.weapon.mainhand 0 snowball 16', 'wait 500', 'use 0.3', 'wait 500', ...chk('use', 'pad-use'), 'do replaceitem entity @a slot.weapon.mainhand 0 air');
  // (the chat by the device's keyboard: T opens it, the text key by key, ENTER sends — Android's virtual T opened nothing in run
  //  40877717430 — and nothing arrived in run 40924847860 either: each step's picture against the world before it says how far it
  //  got (the chat open, the letters in its box, closed again), the same once more with the chat opened by / itself)
  const typed = (open, word) => [...(open === 'T' ? ['SLASH'] : []), ...'GDEV'.split(''), 'SHIFT+SEMICOLON', 'T', 'SPACE', ...word.split('')].map((k) => `press ${k} 80`);
  const chat = (name, open, word, label) => sec(name, 'shot world', `press ${open} 150`, 'wait 1500', `shot ${label}-open`, `measure diff ${label}-open`, ...typed(open, word),
    'wait 300', `shot ${label}-typed`, `measure diff ${label}-typed`, 'press ENTER 150', 'wait 800', `shot ${label}-sent`, `measure diff ${label}-sent`, ...chk('text', `${label}-text`));
  chat('in-text', 'T', 'HELLO', 'chat');
  chat('in-text-slash', 'SLASH', 'HI', 'slash');
  sec('in-mode', 'tap 0.6 0.4', 'wait 300', 'press W 200', 'wait 300', 'pad A', 'wait 500', ...chk('mode', 'input-modes'));
  lines.push('section ui-free', 'do scriptevent gdev:ui off', 'wait 500', 'do scriptevent gdev:ui on free', 'wait 2000', '');
  sec('in-key-free-ui', 'press W 700', 'wait 400', ...chk('move', 'free-key-w'), ...chk('home', 'free-snapped'));
  sec('in-jump-free-ui', 'jump', 'wait 500', ...chk('jump', 'free-pad-jump'), ...chk('home', 'free-jump-home'));
  lines.push('section ui-speed', 'do scriptevent gdev:ui on speed', 'wait 2000', '');
  sec('in-key-speed', 'press W 700', 'wait 400', ...chk('move', 'speed-key-w'), ...chk('home', 'speed-home'));
  sec('in-jump-speed', 'press SPACE 300', 'wait 500', ...chk('jump', 'speed-key-jump'));
  // (the density and the cut-outs last: the run of 2026-10-23 (39989463030) came back from them in portrait — every shot after
  //  them 720 x 1560 with nothing drawn, every input check after them lost)
  lines.push('section ui-off', 'do scriptevent gdev:ui off', 'do scriptevent gdev:show 0', 'wait 1000', '');
  lines.push('section density', 'size reset', 'do scriptevent gdev:cam 1', 'wait 6000');
  for (const dpi of [240, 480]) {
    lines.push(`density ${dpi}`, 'wait 9000', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world', `do scriptevent gdev:show ${BITS.anchors | BITS.gui}`, 'wait 2000', `shot gui-dpi${dpi}`, `measure marks gui-dpi${dpi}`);
  }
  lines.push('density reset', 'wait 6000', '');
  // (the screen's edges with no cut-out: the white marks just outside the viewport show only where the screen reaches past it)
  lines.push('section over', 'do scriptevent gdev:show 0', 'wait 1500', 'shot world', `do scriptevent gdev:show ${BITS.over}`, 'wait 2000', 'shot over', 'measure marks over', '');
  // the cut-outs last of all, each with the game started again: in run 39989463030 every picture after `cutout corner` was
  // 720 x 1560 and the same as the one before it (the launcher's, not the game's) — Android re-creates an app when a cut-out
  // overlay changes, and the game did not come back. So: the overlay, the game stopped, started, joined again (shorter waits than
  // the first time), the same set-up, then the marks. Two shapes: a tall notch and a punch hole (the corner and double ones
  // the same way, if these show the game's safe area follows the cut-out)
  for (const cut of ['tall', 'hole']) {
    // (the player sent off the server first — by the pack: the console's `kick @a` fails with nobody on the server and the whole
    //  section would be skipped. The set-up's tp after the join again failed with the server's error in runs 40877717430,
    //  40924847860 and 40961440806 (the kick too): the game is stopped before the overlay changes and started after Android has
    //  had 10 s for it — changed under a running game, Android re-creates it, and it may have left the server again right after
    //  joining. `testfor @a` first: its line failing says nobody is on the server, rather than the tp failing for its own reason —
    //  and it did fail in run 40968015119: the game joined and was gone 5 s later. The screen at the join against 5 s later says
    //  in numbers whether the game left the world then (a title or a "disconnected" screen: most of it changes))
    lines.push(`section cutout-${cut}`, 'do scriptevent gdev:kick', 'wait 3000', 'stop', `cutout ${cut}`, 'wait 10000', 'launch', 'until title 180000', 'join', 'until joined 300000',
      'shot world', 'wait 5000', `shot rejoin-${cut}`, `measure diff rejoin-${cut}`, 'do testfor @a', ...setup,
      'do hud @a hide hotbar', 'wait 1000', 'shot world', `do scriptevent gdev:show ${BITS.anchors}`, 'wait 2000', `shot anchors-cut-${cut}`, `measure marks anchors-cut-${cut}`, 'do hud @a reset hotbar',
      `do scriptevent gdev:show ${BITS.over}`, 'wait 2000', `shot over-cut-${cut}`, `measure marks over-cut-${cut}`, '');
  }
  lines.push('section end', 'do scriptevent gdev:ui off', 'do scriptevent gdev:cam 0', 'do scriptevent gdev:show 0', 'do hud @a reset', 'wait 1000', 'shot end', '');
  return lines.join('\n');
}

const TASK = `# geoui_device — GeoUI の端末の確かめ（どの画面でも式どおりに出るか・入力がどう届くか）

## Request
osu! を作る前に GeoUI の仕様を全部確かめる（bds/geoui/SPEC.md）: いろいろな画面比の Android（ラボの CI の端末: app.txt）→ 実機の iPhone など（人が見る: 下の「人が見ること」）。
作り方: \`node bds/geoui/screen/device.mjs\`（このフォルダはそれが書く。手で直さない）。

## What it is
- 1 つのパックで、GeoUI の「画面のどこに何が出るか」の式（bds/geoui/screen/layout.js）を全部見せる。\`/scriptevent gdev:show <ビット>\` で切り替える:
  1 = 9 つの寄せ先（四隅・上下左右の真ん中・中心に 8 x 8 単位の四角。四隅の四角は画面の角にぴったり付く）、2 = contain の枠（16:9 のデザインの外枠: 画面の 2 辺に付く）、
  4 = GUI の倍率（ホットバーと同じ 182 x 22 の枠: ホットバーにぴったり重なる）、8 = セーフエリアの外（HUD の外にだけ出る白い印: 普通の画面では見えない）、
  16 = 切り抜き（ピンクの大きな四角が画面の左の 30 % x 30 % の枠に収まるか）、32 = GeoUI Studio の 1 つの renderer で真ん中に出る十字、
  64 = 色（白・灰・赤・緑・青・黒・半透明の白）、128 = 入力の表示、256 = 回転のクエリの棒、512 = renderer ごとの計算の回数、1024 = F の字（鏡写しか）、
  2048 = 重なり（青が手前・赤が奥）、4096 = HUD の文字（タイトルとサブタイトルを GeoUI の画面に置く・タイトルの先頭 3 文字と残り）。
- \`/scriptevent gdev:ui on\`（lock: 動きを禁止 / free: 動いても戻す）で UI のモード: カメラを止め、視点でポインタ（白い四角）、W A S D・スティックで移動の点、
  ジャンプ・スニーク・腕の振り・使う・エモート・文字のランプ、スロット、サーバーの向き。\`gdev:ui off\` で戻る。
- 入力は全部サーバーのログに \`GDEV …\` で出る。\`gdev:mark\` の後の入力を \`gdev:check <move|left|forward|still|rot|jump|sneak|slot|wheel|swing|use|text|recentre|pointer|mode> <名前>\` が
  \`GDEV CHECK <名前> PASS|FAIL\` で答える。文字は \`/gdev:t <文字>\`（チャットのコマンド: フォームなし）。

## 人が見ること（iPhone・iPad・PC・ゲーム機で、横向きで）
1. ワールドに入って \`/scriptevent gdev:show 1\`: 四隅の赤・黄・水色・青の四角が画面の角に、上下左右の真ん中（橙・青緑系）と中心（緑）が正しい所に付くか。
   切り欠き（ノッチ・Dynamic Island）や角の丸い所で欠けていないか。欠けていれば、その分だけ HUD のセーフエリアが内側にある。
2. \`/scriptevent gdev:show 8\`: 白い印や白い線が見えたら、その所は HUD の外（GeoUI の viewport の外）に画面がある。見えた辺と太さを写真に。
3. \`/scriptevent gdev:show 38\`: 紫の枠（16:9）が画面の左右か上下の 2 辺にぴったり付くか、ピンクの枠がホットバーにぴったり重なるか、白い十字が緑の中心と同じ所か。
4. \`/scriptevent gdev:show 16\`: ピンクの大きな四角が左の枠（幅 30 %・高さ 30 %）に収まっていれば切り抜きが効く。画面いっぱいなら効かない。何も出なければ、切り抜く枠の中の renderer は描かれない。
5. \`/scriptevent gdev:show 1088\`（64 + 1024）: 色の見え方と F の向き（赤い点が F の右、青い点が左なら鏡写しではない）。\`gdev:show 2048\`: 青と赤の板の重なった所が青なら奥行きが効く（赤なら描いた順）。
6. \`/scriptevent gdev:title ABCDEFG XYZ\` と \`gdev:show 4096\`: 左に黄色い字で ABCDEFG・XYZ・ABC・DEFG が出れば、HUD の文字を GeoUI に置ける。
7. \`/scriptevent gdev:show 128\` → \`/scriptevent gdev:ui on\`: 画面を指でなぞると白い四角（ポインタ）が動き、ジャンプ・スニークのボタンでランプ、ホットバーを
   押すとスロット、移動のパッドで点が動くか。カメラは止まったまま。終わったら \`/scriptevent gdev:ui off\`。
写真は全部 \`/scriptevent gdev:show 0\` の時と比べて撮る。写真は bds/geoui/measure.html でなくてもよい（SPEC.md の「端末の確かめ」に書く値と比べる）。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示の切り替え（gdev:show のビット）
- [ ] カメラだけ止める（gdev:cam: 体を隠す。UI のモードではない）
- [ ] UI のモード（動きを禁止）: カメラを止め、歩いても動かず、視点でポインタが動く
- [ ] 下を向き続けると水平に戻し、ポインタは跳ばない
- [ ] UI のモード（動けるまま毎 tick 戻す）: 移動の入力は届き、体は戻る
- [ ] ジャンプ・スニークのボタンが届く
- [ ] スロット（ホイール）と腕の振り
- [ ] 文字はコマンドで（/gdev:t）
- [ ] 動きの速さ 0（speed）でも移動の入力は届く
- [ ] UI を閉じると元に戻る
`;

/** every file of the add-on (path relative to its folder → text or bytes) */
export function files() {
  const built = P.build(scene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = {};
  for (const [p, c] of Object.entries(built.files)) out[p] = c && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c;
  out['tests.txt'] = TESTS;
  out['app.txt'] = appTxt();
  out['TASK.md'] = TASK;
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/screen/device.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'GeoUI の式を本物の画面で確かめる（9 つの寄せ先・contain・GUI の倍率・セーフエリア・切り抜き・色・向き・入力）' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

function main(argv) {
  if (argv[0] === 'compare') {
    let f = argv[1] || '';
    if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = ['summary.json', 'results/summary.json'].map((x) => path.join(argv[1], x)).find((x) => fs.existsSync(x)) || '';
    if (!f || !fs.existsSync(f)) { console.error('node bds/geoui/screen/device.mjs compare <summary.json | 実行のフォルダ（app/runs/gh-<番号>）> [--ui <画面の px / JSON UI の px>]'); process.exit(2); }
    const sum = JSON.parse(fs.readFileSync(f, 'utf8')), ui = Number((argv.indexOf('--ui') >= 0 && argv[argv.indexOf('--ui') + 1]) || 2);
    console.log(compareText(compare(sum.measures || [], { ui })));
    return;
  }
  if (argv[0] === 'expect') {
    const m = /^(\d+)x(\d+)$/.exec(argv[1] || ''), ui = Number((argv.indexOf('--ui') >= 0 && argv[argv.indexOf('--ui') + 1]) || 2);
    if (!m) { console.error('node bds/geoui/screen/device.mjs expect <幅>x<高さ> [--ui <画面の px / JSON UI の px>]'); process.exit(2); }
    const e = expected(Number(m[1]), Number(m[2]), ui);
    for (const [k, b] of Object.entries(e)) console.log(`${k.padEnd(24)} (${b.x0.toFixed(1)}, ${b.y0.toFixed(1)})–(${b.x1.toFixed(1)}, ${b.y1.toFixed(1)})`);
    return;
  }
  const { files: F2, stats } = files(), check = argv.includes('--check');
  const bad = [];
  const want = new Set(Object.keys(F2));
  for (const [rel, c] of Object.entries(F2)) {
    const f = path.join(OUT, rel), buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    if (check) { if (!fs.existsSync(f) || !fs.readFileSync(f).equals(buf)) bad.push(rel); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
  }
  // (a file this no longer makes is left over: --check says so, writing removes it)
  const walk = (d, pre = '') => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`])) : []);
  // (the lab's own files beside a unit it tested — lab.mjs, tsconfig.json: git ignores them — are not the add-on's)
  for (const rel of walk(OUT)) if (!want.has(rel) && !LAB_OWN.has(rel)) { if (check) bad.push(`${rel}（余分）`); else fs.rmSync(path.join(OUT, rel)); }
  if (check) {
    if (bad.length) { console.error(`bds/addons/${NAME} は device.mjs が作る物と違います: ${bad.join(' ')}\n→ node bds/geoui/screen/device.mjs`); process.exit(1); }
    console.log(`OK bds/addons/${NAME} is what device.mjs makes`);
  } else console.log(`OK bds/addons/${NAME}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

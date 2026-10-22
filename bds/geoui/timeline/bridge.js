/* global document, Image, Blockbench, Project, ModelProject, Property, Group, Cube, Modes, Animator, Preview, Panel, Undo, Action, Dialog, THREE, Canvas, JSZip */
// GeoUI timeline — the bridge (bds/geoui/timeline/PLAN.md step 7): the timeline inside GeoUI Builder in Blockbench.
//  - the document and its sounds kept in the project (.bbmodel: Project.geoui_timeline, Project.geoui_media); every edit one
//    step of Blockbench's Undo (its history names it; undo and redo bring the document back)
//  - three panels — the timeline below (with its sequences), the inspector and the instances' table on the right — and the
//    paths and instances drawn over the preview (pathedit.js)
//  - a preview that plays: the sequence evaluated each frame (model.evaluate: the export's own values) and put on the bones over
//    Blockbench's own pose (GeoUI's layout for the preview's screen), see-through and flipbook frames by a material of the bone's
//    own while it plays, each instance by a copy of its template's bones (never saved: made and dropped as instances come and
//    go), the sounds through WebAudio — and a video of it (webm, or PNGs in a zip)
//  - the export: GeoUI Builder's pack with the timeline's RP (compile.js) and BP (runtime.js)
//  - osu! maps (.osu, .osz) with the elements they need drawn when the project lacks them (slider bodies into an atlas)
// The pure parts are tested in Node (tests/tl-bridge-offline.mjs); the rest in the real Blockbench (check-bridge.mjs).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const TINY = 1e-5;   // (Blockbench's own "scale 0": a bone collapsed to a point)
  const nz = (v) => (Math.abs(v) < TINY ? TINY : v);
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** a number's digits for a value (most significant first): the numeral each shows, −1 for a leading zero not shown — GeoUI
   *  Builder's own rule (GeoUICore.digitExpr): the last `count` digits, the last one always shown */
  function digitsOf(value, count, hideLeadingZero = true) {
    const v = Math.floor(Math.abs(num(value))), out = [];
    for (let k = 0; k < count; k++) {
      const place = 10 ** (count - 1 - k);
      out.push(hideLeadingZero && k < count - 1 && v < place ? -1 : Math.floor(v / place) % 10);
    }
    return out;
  }
  /** Blockbench's texture shader (as written, or minified as its build ships it) with an alpha and a uv offset of the bone's own:
   *  the map sampled at vUv + GEOUI_UV, the colour's alpha times GEOUI_ALPHA at the end (null: a shader this does not know) */
  function patchShader(src) {
    const decl = /uniform\s+sampler2D\s+map\s*;/, sample = /texture2D\s*\(\s*map\s*,\s*vUv\s*\)/g, clip = /#include\s*<clipping_planes_fragment>/;
    if (typeof src !== 'string' || !decl.test(src) || !src.match(sample) || !/void\s+main\s*\(/.test(src)) return null;
    let out = src.replace(decl, (m) => `${m}\nuniform float GEOUI_ALPHA;\nuniform vec2 GEOUI_UV;\n`).replace(sample, 'texture2D(map, vUv + GEOUI_UV)');
    if (clip.test(out)) out = out.replace(clip, (m) => `gl_FragColor.a *= GEOUI_ALPHA;\n${m}`);
    else { const end = out.lastIndexOf('}'); if (end < 0) return null; out = `${out.slice(0, end)}gl_FragColor.a *= GEOUI_ALPHA;\n${out.slice(end)}`; }
    return out;
  }
  /** four corners in px [top-left, top-right, bottom-right, bottom-left] → an upright rectangle { x, y, w, h }, or null (the
   *  camera turned: the screen is not shown face on) */
  function rectOf(pts, tol = 1.5) {
    if (!Array.isArray(pts) || pts.length !== 4 || !pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null;
    const [tl, tr, br, bl] = pts;
    if (Math.abs(tl[1] - tr[1]) > tol || Math.abs(bl[1] - br[1]) > tol || Math.abs(tl[0] - bl[0]) > tol || Math.abs(tr[0] - br[0]) > tol) return null;
    const x = Math.min(tl[0], bl[0]), y = Math.min(tl[1], tr[1]), w = Math.max(tr[0], br[0]) - x, h = Math.max(bl[1], br[1]) - y;
    return w > 1 && h > 1 && tr[0] > tl[0] && bl[1] > tl[1] ? { x, y, w, h } : null;
  }
  /** a flipbook's frame as a uv offset (0…1 units; three.js's v goes up): its column and row of `cols`, a cell du × dv */
  function frameOffset(fr, cols, du, dv) { const f = Math.max(0, Math.floor(num(fr))), c = Math.max(1, Math.round(num(cols, 1))); return [(f % c) * du, -Math.floor(f / c) * dv]; }
  /** the elements a sequence's templates move (their prototypes: hidden while it plays — their copies show) */
  function protosOf(seq) { const out = new Set(); for (const tp of (seq && seq.templates) || []) for (const tr of tp.tracks) if (tr.kind === 'layer' && tr.target) out.add(tr.target); return out; }
  /** a sound's id in the pack (compile.js's name for it), not one already taken */
  function soundId(name, taken) { const base = clean(String(name).replace(/\.[^.]*$/, '')); let id = base, i = 1; while ((taken || []).includes(id)) id = `${base}_${++i}`; return id; }
  /** slider bodies (osu.toDocument's) in one flipbook of equal cells: { cols, rows, cell: [w, h] px, pxPerUnit, w, h, at(i) → [x, y] }
   *  — px a unit as many as fit in maxSize (4 at most) */
  function bodyAtlas(bodies, { maxSize = 2048, most = 4 } = {}) {
    // (each body's extent: the line its ball follows, as bodyImage draws it)
    const n = Math.max(1, bodies.length), span = (b, ax) => { const v = (b.line && b.line.length ? b.line : b.points).map((p) => p[ax]); return Math.max(...v) - Math.min(...v) + b.width + 2; };
    const W = Math.max(1, ...bodies.map((b) => span(b, 0))), H = Math.max(1, ...bodies.map((b) => span(b, 1))), cols = Math.ceil(Math.sqrt((n * H) / W)) || 1, rows = Math.ceil(n / cols);
    // (a cell a whole number of px at most maxSize / cols wide: the atlas never passes maxSize)
    const p = Math.max(0.25, Math.min(most, Math.floor(maxSize / cols) / W, Math.floor(maxSize / rows) / H));
    const cw = Math.ceil(W * p), ch = Math.ceil(H * p);
    return { cols, rows, cell: [cw, ch], pxPerUnit: p, w: cols * cw, h: rows * ch, units: [cw / p, ch / p], at: (i) => [(i % cols) * cw, Math.floor(i / cols) * ch] };
  }
  /** base64 ↔ bytes (the sounds kept in the project) */
  function toB64(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined' && typeof root.btoa !== 'function') return Buffer.from(b).toString('base64');
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return root.btoa(s);
  }
  function fromB64(s) {
    if (typeof Buffer !== 'undefined' && typeof root.atob !== 'function') return new Uint8Array(Buffer.from(String(s), 'base64'));
    const bin = root.atob(String(s)), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** what a sound file is: { ext, seconds } (null: not one the game plays — .ogg and .wav — though the preview may) */
  function soundInfo(name, bytes) {
    const ext = String(name).toLowerCase().split('.').pop(), Me = T.media;
    if (ext === 'wav') { const i = Me.wavInfo(bytes); return i ? { ext, seconds: i.seconds, game: true } : null; }
    if (ext === 'ogg') { const i = Me.oggInfo(bytes); return { ext, seconds: i ? i.seconds : 0, game: true }; }
    if (ext === 'mp3' || ext === 'm4a' || ext === 'flac') return { ext, seconds: 0, game: false };
    return null;
  }

  // ---------------------------------------------------------------------------------------------------------------- Blockbench
  /** the bridge in Blockbench. ctx: GeoUI Builder's own — { G (GeoUICore), isGeo(), settings(), elementOf(node), boxOf(group),
   *  preview(), frame(), toBB, fromBB, say(text, kind), addImage(o), addNumber(o), setFrameVisible(bool), view() } →
   *  { uninstall(), extend(built, design), actions (ids for GeoUI's menu), store, player } */
  function install(ctx) {
    const G = ctx.G, isGeo = ctx.isGeo, say = ctx.say;
    const st = { props: [], panels: [], actions: [], listeners: [], mounts: [], pe: null, states: null, seq: null, wrapped: new Map(), clones: new Map(), warned: new Set(),
      decoded: new Map(), decoding: new Set(), audioCtx: null, elemCache: null, previewing: false, exporting: false };
    const on = (ev, f) => { Blockbench.on(ev, f); st.listeners.push([ev, f]); };
    const warnOnce = (k, m) => { if (!st.warned.has(k)) { st.warned.add(k); say(m, 'error'); } };

    // ---- the document and its sounds, kept in the project (and in Undo's saves: the documents are never changed in place)
    st.props.push(new Property(ModelProject, 'object', 'geoui_timeline', { default: undefined }));
    st.props.push(new Property(ModelProject, 'array', 'geoui_media', { default: [] }));
    const proj = () => (typeof Project !== 'undefined' && Project ? Project : null);
    const getDoc = () => { const p = proj(); return p && p.geoui_timeline && p.geoui_timeline.sequences ? p.geoui_timeline : null; };
    const setDoc = (d) => { const p = proj(); if (p) { p.geoui_timeline = d; p.saved = false; } };
    const mediaAll = () => { const p = proj(); return (p && Array.isArray(p.geoui_media) ? p.geoui_media : []); };
    const undo = { edit(label, apply) { Undo.initEdit({ geoui_timeline: true }); apply(); Undo.finishEdit(`GeoUI: ${label}`, { geoui_timeline: true }); } };
    on('create_undo_save', ({ save, aspects }) => { if (aspects && aspects.geoui_timeline && proj()) { save.geoui_timeline = proj().geoui_timeline || null; save.geoui_media = mediaAll().slice(); } });
    on('load_undo_save', ({ save }) => {
      if (!save || !('geoui_timeline' in save) || !proj()) return;
      proj().geoui_timeline = save.geoui_timeline || undefined;
      if (Array.isArray(save.geoui_media)) proj().geoui_media = save.geoui_media.slice();
      store.refresh(); player.refresh();
    });
    /** the media changed (a sound in or out): one undo step */
    function setMedia(list, label) { undo.edit(label, () => { proj().geoui_media = list; proj().saved = false; }); store.refresh(); }

    // ---- what the editors see of the design: the GeoUI elements and where they rest (model units: the middle of their box)
    function elements() {
      if (!isGeo()) return [];
      if (st.elemCache) return st.elemCache;
      st.elemCache = Group.all.filter((g) => g.geoui && g.geoui.type && g.export !== false).map((g) => {
        const b = ctx.boxOf(g);
        return { name: g.name, type: g.geoui.type, x: b ? (b.x0 + b.x1) / 2 : 0, y: b ? (b.y0 + b.y1) / 2 : G.PIVOT_Y, frames: g.geoui.frames || null };
      });
      return st.elemCache;
    }
    for (const ev of ['finished_edit', 'select_project', 'undo', 'redo', 'update_selection']) on(ev, () => { st.elemCache = null; });
    // (the design edited — a template's bones moved, resized, retextured: its copies are made again from it at the next frame)
    on('finished_edit', ({ aspects } = {}) => { if (!(aspects && aspects.geoui_timeline) && st.clones.size) { for (const [key, c] of [...st.clones]) dropClone(key, c); if (PREVIEW_ON()) Animator.preview(); } });
    const media = () => mediaAll().map((m) => ({ id: m.id, kind: m.kind, name: m.name, ext: m.ext, duration: m.duration, peaks: m.peaks, game: m.game !== false }));

    // ---- the sounds for the preview: decoded once each
    function audioContext() {
      if (st.audioCtx) return st.audioCtx;
      const AC = root.AudioContext || root.webkitAudioContext;
      st.audioCtx = AC ? new AC() : null;
      return st.audioCtx;
    }
    function buffer(id) {
      if (st.decoded.has(id)) return st.decoded.get(id);
      const m = mediaAll().find((x) => x.id === id), ac = audioContext();
      if (!m || !ac || st.decoding.has(id)) return null;
      st.decoding.add(id);
      const bytes = fromB64(m.data);
      ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then((buf) => { st.decoded.set(id, buf); }, () => { warnOnce(`decode:${id}`, `音「${m.name}」を読めません`); }).finally(() => st.decoding.delete(id));
      return null;
    }
    // (the audio engine: a context that starts suspended — Blockbench's first play, a person's click, lets it run)
    const audioEngine = audioContext() ? T.player.createAudio({ context: audioContext(), buffer }) : null;

    // ---- the preview: the evaluated states on the bones, over Blockbench's own pose
    const PREVIEW_ON = () => isGeo() && Modes.animate && !!st.states;
    function host() {
      return {
        apply(states, t, seq) { st.states = states; st.seq = seq; if (Modes.animate && isGeo()) Animator.preview(); },
        clear() { st.states = null; st.seq = null; restore(); if (Modes.animate && isGeo()) Animator.preview(); },
        canvas: () => (Preview.selected ? Preview.selected.canvas : null),
        frameRect, screen, elements, capture, frameCanvas, drawFrame,
      };
    }
    /** into the preview (animate mode, GeoUI's layout animation chosen) the first time the person plays or seeks */
    function enterPreview() {
      if (!isGeo()) return false;
      const name = `animation.${ctx.settings().ns}_transform`, sel = typeof root.Animation !== 'undefined' && root.Animation.selected;
      if (!Modes.animate || !sel || sel.name !== name) ctx.preview();
      return true;
    }
    on('display_animation_frame', () => { if (PREVIEW_ON()) { try { overlay(); } catch (e) { warnOnce('overlay', `タイムラインのプレビューで問題: ${e.message || e}`); } } });
    on('select_mode', () => setTimeout(() => { if (!Modes.animate) { player.pause(); restore(); } }, 0));
    /** the bone (its mesh) of an element and how far below it a node is (child indices: the same in a copy) */
    let names = null;   // (the bones by name, once a frame)
    const groupOf = (name) => { if (!names) names = new Map(Group.all.map((g) => [g.name, g])); return names.get(name) || null; };
    const pathTo = (from, to) => { const out = []; for (let o = to; o && o !== from; o = o.parent) { if (!o.parent) return null; out.unshift(o.parent.children.indexOf(o)); } return out; };
    const follow = (obj, path) => { let o = obj; for (const i of path || []) { o = o && o.children[i]; } return o || null; };
    function overlay() {
      names = null;
      const states = st.states, seq = st.seq, protos = protosOf(seq), rest = new Map();
      for (const w of st.wrapped.values()) setUniforms(w, 1, [0, 0]);
      // (the prototypes: where they rest now — their copies start there — then hidden)
      for (const name of protos) {
        const g = groupOf(name);
        if (!g || !g.mesh) continue;
        rest.set(name, { p: g.mesh.position.clone(), r: g.mesh.rotation.clone(), s: g.mesh.scale.clone() });
        g.mesh.scale.set(TINY, TINY, TINY);
      }
      const seen = new Set();
      for (const [key, s] of Object.entries(states || {})) {
        const hash = key.indexOf('#'), name = hash < 0 ? key : key.slice(0, hash), g = groupOf(name);
        if (!g || !g.mesh) continue;
        if (hash < 0) { if (!protos.has(name)) applyState(g, g.mesh, s, null); continue; }
        if (s.visible === false) continue;
        seen.add(key);
        const c = cloneFor(key, g), r = rest.get(name);
        if (r) { c.position.copy(r.p); c.rotation.copy(r.r); c.scale.copy(r.s); }
        c.visible = true;
        applyState(g, c, s, c);
      }
      for (const [key, c] of st.clones) if (!seen.has(key)) dropClone(key, c);
    }
    /** an element's state on a mesh (the bone itself, or a copy): moved, turned, scaled over the pose it has; see-through, its
     *  flipbook frame, a number's digits and a gauge's fill by the meshes below it */
    function applyState(g, mesh, s, copy) {
      if (s.visible === false) { mesh.scale.set(TINY, TINY, TINY); return; }
      // (Blockbench keeps x mirrored: the export's +x is its −x — as its own animations do)
      mesh.position.x -= num(s.x); mesh.position.y += num(s.y);
      if (num(s.rotation)) mesh.rotation.z += (num(s.rotation) * Math.PI) / 180;
      const sx = num(s.scaleX, 1), sy = num(s.scaleY, 1);
      mesh.scale.x = nz(mesh.scale.x * sx); mesh.scale.y = nz(mesh.scale.y * sy);
      const el = g.geoui || {};
      if (s.fill !== undefined && el.type === 'gauge') {
        const ax = el.gauge && ['top', 'bottom'].includes(el.gauge.fill) ? 'y' : 'x', f = Math.max(0, Math.min(1, num(s.fill)));
        mesh.scale[ax] = nz(f * (ax === 'x' ? sx : sy));
      }
      if (s.value !== undefined && el.type === 'number') numerals(g, mesh, s.value, copy);
      const alpha = Math.max(0, Math.min(1, num(s.opacity, 1)));
      const uv = s.frame !== undefined && el.frames ? frameUv(g, s.frame) : [0, 0];
      if (alpha < 0.999 || uv[0] || uv[1]) for (const m of meshesBelow(g, copy)) { const w = wrapped(m); if (w) setUniforms(w, alpha, uv); else warnOnce('shader', 'この Blockbench では、プレビューで不透明度とコマを見せられません（書き出しには効きます）'); }
    }
    /** the cube meshes below an element: its own, or the same ones in a copy */
    function meshesBelow(g, copy) {
      const out = [];
      g.forEachChild((c) => { if (c instanceof Cube && c.mesh) out.push(copy ? follow(copy, pathTo(g.mesh, c.mesh)) : c.mesh); }, null, true);
      return out.filter(Boolean);
    }
    function numerals(g, mesh, value, copy) {
      const digits = [];
      g.forEachChild((d) => { if (d instanceof Group && d.geoui && d.geoui.role === 'digit') digits[d.geoui.index] = d; }, Group, true);
      const D = digits.filter(Boolean), shown = digitsOf(value, D.length, !(g.geoui.number && g.geoui.number.hideLeadingZero === false));
      D.forEach((d, k) => d.forEachChild((n) => {
        if (!(n instanceof Group) || !n.geoui || n.geoui.role !== 'numeral' || !n.mesh) return;
        const m = copy ? follow(copy, pathTo(g.mesh, n.mesh)) : n.mesh, v = n.geoui.value === shown[k] ? 1 : TINY;
        if (m) m.scale.set(v, v, v);
      }, Group, true));
    }
    /** a flipbook element's frame: the step of its cell (its first plane's uv size over its texture's) */
    function frameUv(g, fr) {
      const fb = g.geoui.frames, c = (() => { let x = null; g.forEachChild((n) => { if (!x && n instanceof Cube) x = n; }, null, true); return x; })();
      const face = c && c.faces && c.faces.north, tex = face && face.getTexture && face.getTexture();
      if (!fb || !face || !tex) return [0, 0];
      return frameOffset(fr, fb.cols, Math.abs(face.uv[2] - face.uv[0]) / (tex.uv_width || tex.width || 1), Math.abs(face.uv[3] - face.uv[1]) / (tex.uv_height || tex.height || 1));
    }
    // ---- a material of the mesh's own while it plays (Blockbench's own, its shader given an alpha and a uv offset)
    function patchMaterial(m) {
      if (!m || !m.isShaderMaterial || !m.uniforms || !m.uniforms.map) return m;
      const frag = patchShader(m.fragmentShader);
      if (!frag) return null;
      const n = m.clone();
      n.fragmentShader = frag;
      n.uniforms = Object.assign({}, n.uniforms, { map: m.uniforms.map, GEOUI_ALPHA: { value: 1 }, GEOUI_UV: { value: new THREE.Vector2(0, 0) } });
      n.transparent = true; n.needsUpdate = true; n.__geouiFrom = m;
      return n;
    }
    function wrapped(mesh) {
      let w = st.wrapped.get(mesh);
      if (w && mesh.material === w.mat) return w;
      if (w) unwrap(mesh, w, false);   // (Blockbench gave it another material: wrapped anew)
      const orig = mesh.material, list = (Array.isArray(orig) ? orig : [orig]).map(patchMaterial);
      if (list.some((x) => x === null)) { for (const x of list) if (x && x.__geouiFrom) x.dispose(); return null; }
      const mat = Array.isArray(orig) ? list : list[0];
      mesh.material = mat;
      w = { mesh, orig, mat, list: list.filter((x) => x && x.__geouiFrom) };
      st.wrapped.set(mesh, w);
      return w;
    }
    function setUniforms(w, alpha, uv) { for (const m of w.list) { m.uniforms.GEOUI_ALPHA.value = alpha; m.uniforms.GEOUI_UV.value.set(uv[0], uv[1]); m.uniforms.map = m.__geouiFrom.uniforms.map; } }
    function unwrap(mesh, w, put = true) { if (put && mesh.material === w.mat) mesh.material = w.orig; for (const m of w.list) m.dispose(); st.wrapped.delete(mesh); }
    // ---- the instances' copies (the scene's only, never the project's)
    function cloneFor(key, g) {
      let c = st.clones.get(key);
      if (c && c.parent) return c;
      c = g.mesh.clone(true);
      c.name = `geoui_copy:${key}`;
      c.traverse((o) => { o.raycast = () => {}; o.userData = Object.assign({}, o.userData, { geouiCopy: true }); });
      (g.mesh.parent || Canvas.scene).add(c);
      st.clones.set(key, c);
      return c;
    }
    function dropClone(key, c) {
      c.traverse((o) => { const w = st.wrapped.get(o); if (w) unwrap(o, w); });
      if (c.parent) c.parent.remove(c);
      st.clones.delete(key);
    }
    /** everything of the preview's own away: the copies, the materials back */
    function restore() {
      for (const [key, c] of [...st.clones]) dropClone(key, c);
      for (const [mesh, w] of [...st.wrapped]) unwrap(mesh, w);
    }
    // ---- the screen in the canvas (pathedit's mapping, the video's frame)
    function frameRect() {
      const p = Preview.selected;
      if (!p || !p.canvas || !isGeo()) return null;
      const { now } = ctx.frame(), cam = p.camera;
      cam.updateMatrixWorld();
      const pts = [[now.left, now.top], [now.right, now.top], [now.right, now.bottom], [now.left, now.bottom]].map(([x, y]) => {
        const v = new THREE.Vector3(...ctx.toBB([x, y, 0])).project(cam);
        return [((v.x + 1) / 2) * p.width, ((1 - v.y) / 2) * p.height];
      });
      return rectOf(pts);
    }
    function screen() { const { now } = ctx.frame(); return { unitsH: now.top - now.bottom, center: [(now.left + now.right) / 2, (now.top + now.bottom) / 2] }; }
    /** the preview canvas's own px per CSS px (Blockbench's pixel ratio: the screen's, or its own setting) */
    const pxRatio = () => { const p = Preview.selected; return p && p.canvas && p.width ? p.canvas.width / p.width : root.devicePixelRatio || 1; };
    function frameCanvas({ scale = 1 } = {}) {
      const r = frameRect();
      if (!r) throw new Error('GeoUI の画面が正面から見えていません（GeoUI → 画面を正面から見る）');
      const dpr = pxRatio(), cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round((r.w * dpr * num(scale, 1)) / 2) * 2); cv.height = Math.max(2, Math.round((r.h * dpr * num(scale, 1)) / 2) * 2);
      return cv;
    }
    /** the preview drawn now (no grid, gizmo or GeoUI frame) and the screen's part copied into cv (bg: a colour under it, or clear) */
    function drawFrame(cv, { background = null } = {}) {
      const p = Preview.selected, r = frameRect(), dpr = pxRatio(), c2 = cv.getContext('2d');
      if (!p || !r) return;
      ctx.setFrameVisible(false);
      try {
        Canvas.withoutGizmos(() => {
          p.render();
          c2.clearRect(0, 0, cv.width, cv.height);
          if (background) { c2.fillStyle = background; c2.fillRect(0, 0, cv.width, cv.height); }
          c2.drawImage(p.canvas, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr, 0, 0, cv.width, cv.height);
        });
      } finally { ctx.setFrameVisible(true); }
    }
    async function capture({ scale = 1, background = null } = {}) {
      const cv = frameCanvas({ scale });
      drawFrame(cv, { background });
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    }

    // ---- the store and the player
    const H = host();
    const store = T.store.createStore({ getDoc, setDoc, undo, elements, media, onError: (e) => warnOnce(`store:${e && e.message}`, `タイムライン: ${e && e.message ? e.message : e}`) });
    const player = T.player.createPlayer({ store, host: H, audio: audioEngine, events: 'hit' });
    // (playing or moving the playhead takes the preview into animate mode with GeoUI's layout: what the person asked to see)
    store.setPlayer(Object.assign(Object.create(player), {
      play() { if (enterPreview()) player.play(); },
      toggle() { if (player.playing()) player.pause(); else if (enterPreview()) player.play(); },
      seekTo(t) { enterPreview(); player.seekTo(t); },
      step(n) { enterPreview(); player.step(n); },
    }));
    store.subscribe((what) => { if (what && (what.doc || what.external) && !player.playing()) player.refresh(); });
    on('select_project', () => setTimeout(() => { player.pause(); restore(); st.states = null; st.elemCache = null; store.refresh(); attachPaths(); }, 0));
    on('unselect_project', () => { player.pause(); restore(); st.states = null; });

    // ---- the panels (Blockbench styles every button, select and input of the page its own way — big, or invisible for a
    //  checkbox: in these panels they are the browser's own again, with each one's own inline style over that)
    const css = document.createElement('style');
    css.id = 'geoui-timeline-css';
    css.textContent = ['#panel_geoui_timeline', '#panel_geoui_inspector', '#panel_geoui_instances'].map((p) => `${p} button, ${p} select, ${p} input, ${p} textarea`).join(', ')
      + ' { all: revert; cursor: default; }\n#panel_geoui_timeline button, #panel_geoui_inspector button, #panel_geoui_instances button { cursor: pointer; }\n'
      + '#panel_geoui_timeline .panel_vue_wrapper, #panel_geoui_inspector .panel_vue_wrapper, #panel_geoui_instances .panel_vue_wrapper { height: 100%; }\n';
    document.head.append(css);
    const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c !== null && c !== undefined) e.append(c); return e; };
    const BTN = 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin-right:4px;padding:2px 7px;cursor:pointer';
    function panel(id, name, icon, slot, make, extra = {}) {
      const p = new Panel(id, Object.assign({
        name, icon, condition: { formats: ['geoui'] }, growable: true, resizable: true,
        default_position: { slot, float_position: [100, 100], float_size: [520, 320], height: slot === 'bottom' ? 300 : 360 },
        component: { template: `<div class="${id}" style="height:100%;min-height:120px;display:flex;flex-direction:column"></div>`, mounted() { st.mounts.push(make(this.$el)); } },
      }, extra));
      st.panels.push(p);
      return p;
    }
    /** the sequence bar over the timeline: which sequence, a new one, its removal; what plays as the hits; the loop */
    function seqBar(el) {
      const sel = h('select', { class: 'geoui-tl-seq', style: 'background:#33353d;color:#ddd;border:0;max-width:220px', onchange: (e) => store.select({ seq: e.target.value }) });
      const hits = h('select', { title: 'プレビューの当たり（テンプレートの trigger・until が答える）', style: 'background:#33353d;color:#ddd;border:0;margin-left:8px', onchange: (e) => player.setEvents(e.target.value) },
        [['hit', '当たり（オート）'], ['miss', '外れ'], ['none', 'なし']].map(([v, l]) => h('option', { value: v }, l)));
      const loop = h('input', { type: 'checkbox', checked: '', title: '範囲（in / out）をくり返す', onchange: (e) => player.setLoop(e.target.checked) });
      const bar = h('div', { class: 'geoui-tl-seqbar', style: 'display:flex;align-items:center;gap:4px;padding:3px 6px;background:#141518;font:12px sans-serif;color:#ccc' }, [
        h('span', {}, 'シーケンス '), sel,
        h('button', { class: 'geoui-tl-seq-add', style: BTN, title: '新しいシーケンス', onclick: () => store.dispatch({ type: 'seq.add' }) }, '＋'),
        h('button', { class: 'geoui-tl-seq-del', style: BTN, title: 'このシーケンスを消す', onclick: () => { const s = store.selection().seq; if (s && root.confirm && root.confirm('このシーケンスを消しますか？（取り消せます）')) store.dispatch({ seq: s, type: 'seq.remove' }); } }, '🗑'),
        h('span', { style: 'margin-left:10px' }, 'プレビューの当たり'), hits,
        h('label', { style: 'margin-left:10px' }, [loop, ' ループ']),
      ]);
      const empty = h('div', { class: 'geoui-tl-empty', style: 'padding:16px;color:#aaa;font:13px sans-serif;display:none' }, [
        'まだシーケンスがありません。', h('button', { style: `${BTN};margin-left:8px`, onclick: () => store.dispatch({ type: 'seq.add', name: 'シーケンス 1' }) }, 'シーケンスを作る')]);
      const paint = () => {
        const d = store.doc(), cur = store.selection().seq;
        sel.textContent = '';
        for (const s of d.sequences) sel.append(h('option', { value: s.id }, s.name || s.id));
        sel.value = cur || '';
        empty.style.display = d.sequences.length ? 'none' : 'block';
      };
      el.append(bar, empty);
      paint();
      const off = store.subscribe((w) => { if (T.store.needsDraw(w)) paint(); });
      return { unmount() { off(); bar.remove(); empty.remove(); } };
    }
    panel('geoui_timeline', 'GeoUI タイムライン', 'movie', 'bottom', (el) => {
      const sb = seqBar(el), box = h('div', { style: 'flex:1;min-height:0' });
      el.append(box);
      const tl = T.timeline.mount(box, store, { say: (m) => say(m, 'error') });
      return { unmount() { tl.unmount(); sb.unmount(); box.remove(); } };
    });
    panel('geoui_inspector', 'GeoUI インスペクタ', 'tune', 'right_bar', (el) => T.inspector.mount(el, store));
    panel('geoui_instances', 'GeoUI 実体', 'scatter_plot', 'right_bar', (el) => T.instances.mount(el, store, { importOsu: (text) => importOsuText(text) }));
    function attachPaths() {
      if (st.pe) { st.pe.detach(); st.pe = null; }
      if (!isGeo() || !T.pathedit || !Preview.selected) return;
      st.pe = T.pathedit.attach({ canvas: H.canvas, frameRect, screen, elements }, store, { grid: 1 });
    }
    attachPaths();

    // ---- actions (GeoUI's menu)
    const A = (id, o) => { const a = new Action(id, o); st.actions.push(a); return a; };
    A('geoui_tl_play', { name: 'タイムライン: 再生・停止', icon: 'play_arrow', condition: isGeo, click: () => store.transport.toggle() });
    A('geoui_tl_track', { name: 'タイムライン: 選んだ要素のトラックを足す', icon: 'playlist_add', condition: isGeo, click: addTrackForSelected });
    A('geoui_tl_media', { name: 'タイムライン: 音・画像・連番を取り込む…', icon: 'library_music', condition: isGeo, click: importMedia });
    A('geoui_tl_osu', { name: 'タイムライン: osu! の譜面を取り込む（.osu・.osz）…', icon: 'radio_button_checked', condition: isGeo, click: importOsuFile });
    A('geoui_tl_video', { name: 'タイムライン: 動画を書き出す…', icon: 'movie_creation', condition: isGeo, click: videoDialog });

    function ensureSeq() {
      if (store.doc().sequences.length) return store.selection().seq;
      const r = store.dispatch({ type: 'seq.add', name: 'シーケンス 1' });
      return r.ok ? r.id : null;
    }
    function addTrackForSelected() {
      const g = ctx.elementOf(Group.first_selected || (root.Outliner && root.Outliner.selected && root.Outliner.selected[0]));
      if (!g) return say('GeoUI の要素（画像・数字・ゲージ）のボーンを選んでください', 'error');
      const seq = ensureSeq(), t = store.time();
      const r = store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'layer', target: g.name, name: g.name }, { seq, type: 'clip.add', track: '$0', start: t, end: t + 2 }] });
      if (!r.ok) return say(r.error, 'error');
      store.select({ clips: [r.id] });
      say(`「${g.name}」のトラックを足しました（${t.toFixed(2)} 秒から 2 秒のクリップ）`);
    }

    // ---- media: sounds (into the project and a track), an image (an element), an image sequence (a flipbook element)
    function importMedia() {
      Blockbench.import({ extensions: ['ogg', 'wav', 'mp3', 'png'], type: '音・画像', multiple: true, readtype: (name) => (/\.png$/i.test(name) ? 'image' : 'buffer') }, async (files) => {
        const sounds = files.filter((f) => !/\.png$/i.test(f.name)), images = files.filter((f) => /\.png$/i.test(f.name));
        if (sounds.length) await addSounds(sounds);
        if (images.length === 1) await ctx.addImage({ name: images[0].name.replace(/\.png$/i, ''), dataUrl: images[0].content });
        else if (images.length > 1) await addSequence(images);
      });
    }
    async function addSounds(files) {
      const list = mediaAll().slice(), added = [];
      for (const f of files) {
        const bytes = new Uint8Array(f.content), info = soundInfo(f.name, bytes);
        if (!info) { say(`「${f.name}」は音として読めません（.ogg・.wav）`, 'error'); continue; }
        let peaks = [], duration = info.seconds;
        try {
          const ac = audioContext(), buf = ac && (await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
          if (buf) { duration = buf.duration; peaks = T.media.peaks(buf.getChannelData(0), 1000); }
        } catch (e) { if (!info.game) { say(`「${f.name}」を読めません`, 'error'); continue; } }
        const id = soundId(f.name, list.map((m) => m.id));
        list.push({ id, kind: 'sound', name: f.name, ext: info.ext, game: info.game, duration, peaks, data: toB64(bytes) });
        added.push({ id, duration, game: info.game, name: f.name });
      }
      if (!added.length) return;
      setMedia(list, '音を取り込む');
      for (const a of added) st.decoded.delete(a.id);
      // (each on an audio track of its own, at the playhead)
      const seq = ensureSeq(), t = store.time();
      for (const a of added) store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'audio', name: a.name }, { seq, type: 'clip.add', track: '$0', start: t, end: t + Math.max(0.1, a.duration || 1), clip: { sound: a.id, name: a.name } }] });
      const notGame = added.filter((a) => !a.game);
      say(`音 ${added.length} 個を取り込みました${notGame.length ? `（${notGame.map((a) => a.name).join('・')} はプレビューだけ: ゲームでは .ogg か .wav に）` : ''}`, notGame.length ? 'error' : undefined);
    }
    /** an image sequence (file names in their numbers' order) into one flipbook texture and an element that shows a frame each */
    async function addSequence(files) {
      const names = T.media.sortSequence(files.map((f) => f.name)), byName = new Map(files.map((f) => [f.name, f]));
      const imgs = await Promise.all(names.map((n) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(`${n} を読めません`)); im.src = byName.get(n).content; })));
      const fw = imgs[0].naturalWidth, fh = imgs[0].naturalHeight, fb = T.media.flipbook(imgs.length, fw, fh);
      const cv = document.createElement('canvas'); cv.width = fb.w; cv.height = fb.h;
      const c2 = cv.getContext('2d');
      imgs.forEach((im, i) => c2.drawImage(im, (i % fb.cols) * fw, Math.floor(i / fb.cols) * fh, fw, fh));
      const S = ctx.settings(), hgt = S.unitsPerScreenH * 0.3, base = names[0].replace(/[_-]?\d+\.png$/i, '').replace(/\.png$/i, '') || 'sequence';
      const g = await ctx.addImage({ name: base, dataUrl: cv.toDataURL('image/png'), uv: [0, 0, fw, fh], height: hgt, width: (hgt * fw) / fh, blend: 'blend' });
      g.geoui = Object.assign({}, g.geoui, { frames: { cols: fb.cols, rows: fb.rows, count: imgs.length } });
      proj().saved = false; st.elemCache = null;
      // (a track that runs through the frames once at the sequence's fps, from the playhead)
      const seq = ensureSeq(), fps = (store.doc().sequences.find((s) => s.id === seq) || {}).fps || 20, t = store.time(), len = imgs.length / fps;
      store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'layer', target: g.name, name: g.name },
        { seq, type: 'clip.add', track: '$0', start: t, end: t + len, clip: { name: g.name, channels: { frame: [{ t: 0, v: 0, ease: 'linear' }, { t: len, v: imgs.length - 0.001 }] } } }] });
      say(`連番 ${imgs.length} 枚を 1 枚のテクスチャ（${fb.cols} x ${fb.rows}）にして「${g.name}」に（${len.toFixed(2)} 秒）`);
    }

    // ---- osu!: the map's instances, templates, paths, tempo into the sequence; the elements it needs drawn when missing
    function importOsuFile() {
      Blockbench.import({ extensions: ['osu', 'osz'], type: 'osu! の譜面', readtype: (name) => (/\.osz$/i.test(name) ? 'buffer' : 'text') }, async (files) => {
        const f = files[0];
        if (!f) return;
        if (!/\.osz$/i.test(f.name)) return importOsuText(f.content);
        if (typeof JSZip === 'undefined') return say('.osz を開けません（JSZip がありません）: 中の .osu を取り込んでください', 'error');
        const zip = await JSZip.loadAsync(f.content), osus = Object.keys(zip.files).filter((n) => /\.osu$/i.test(n));
        if (!osus.length) return say('.osz に .osu がありません', 'error');
        const pick = async (name) => {
          const text = await zip.file(name).async('string'), map = T.osu.parseOsu(text), audio = (map.general || {}).AudioFilename;
          const af = audio && Object.keys(zip.files).find((n) => n.toLowerCase() === String(audio).toLowerCase());
          let soundIdFor = null;
          if (af) { const bytes = await zip.file(af).async('uint8array'); await addSounds([{ name: af, content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }]); soundIdFor = soundId(af, []); }
          await importOsuText(text, { sound: soundIdFor && mediaAll().some((m) => m.id === soundIdFor) ? soundIdFor : undefined, skipMusicTrack: !!soundIdFor });
        };
        if (osus.length === 1) return pick(osus[0]);
        new Dialog({ id: 'geoui_osz', title: 'osu!: どの難しさを取り込みますか', form: { which: { label: '譜面', type: 'select', options: Object.fromEntries(osus.map((n) => [n, n.replace(/\.osu$/i, '')])), value: osus[0] } }, onConfirm: (r) => { pick(r.which); } }).show();
      });
    }
    async function importOsuText(text, o = {}) {
      let map, out;
      try { map = T.osu.parseOsu(text); } catch (e) { return say(`osu! の譜面を読めません: ${e.message || e}`, 'error'); }
      const sounds = mediaAll().filter((m) => m.kind === 'sound'), audio = (map.general || {}).AudioFilename || '';
      const music = o.sound || (sounds.find((m) => clean(m.name.replace(/\.[^.]*$/, '')) === clean(audio.replace(/\.[^.]*$/, ''))) || (sounds.length === 1 ? sounds[0] : null) || { id: 'music' }).id;
      try { out = T.osu.toDocument(map, { width: 120, designRadius: 10, sound: music }); } catch (e) { return say(`osu! の譜面を変換できません: ${e.message || e}`, 'error'); }
      const s = out.doc.sequences[0];
      await ensureElements(out);
      let seq = store.selection().seq;
      if (!seq) { const r = store.dispatch({ type: 'seq.add', name: s.name, duration: s.duration, fps: s.fps }); seq = r.id; }
      // (the music track only when the sound is not on a track already: an .osz's music was put on one as it came in)
      const tracks = o.skipMusicTrack ? s.tracks.filter((tr) => tr.kind !== 'audio') : s.tracks;
      const cur = store.doc().sequences.find((q) => q.id === seq), dur = Math.max(cur.duration, s.duration);
      const r = store.dispatch({ type: 'batch', intents: [{ seq, type: 'seq.set', patch: { duration: dur } }, { seq, type: 'instances.import', instances: s.instances, templates: s.templates, tempo: s.tempo, paths: s.paths, markers: s.markers, tracks }] });
      if (!r.ok) return say(r.error, 'error');
      const i = out.info;
      say(`osu!「${i.title}」[${i.version}]: 円 ${i.counts.circles}・スライダー ${i.counts.sliders}・スピナー ${i.counts.spinners}${sounds.some((m) => m.id === music) ? '' : `（音楽「${audio}」は .ogg にして「音・画像・連番を取り込む」で: id ${music}）`}`);
    }
    /** the elements an osu! map moves, drawn here when the project has none of that name: circles and approach rings in the
     *  map's combo colours (a frame each), the combo number, the burst, the miss mark, the spinner, the ball, the slider bodies */
    function ensureElements(out) {
      const E = T.osu.DEFAULT_ELEMENTS, have = (n) => !!groupOf(n), cols = out.info.colours.slice(0, 8), made = [];
      const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      const draw = (w, hgt, fn) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt; fn(cv.getContext('2d')); return cv.toDataURL('image/png'); };
      const ring = (c2, x, y, r, width, colour) => { c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.lineWidth = width; c2.strokeStyle = colour; c2.stroke(); };
      const disc = (c2, x, y, r, colour) => { c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.fillStyle = colour; c2.fill(); };
      const at0 = { x: 0, y: 0 };
      const jobs = [];
      if (!have(E.circle)) jobs.push(async () => { const g = await ctx.addImage({ name: E.circle, ...at0, height: 20, width: 20, blend: 'blend', uv: [0, 0, 64, 64], dataUrl: draw(64 * cols.length, 64, (c2) => cols.forEach((c, k) => { disc(c2, 32 + 64 * k, 32, 29, 'rgba(30,30,40,0.9)'); disc(c2, 32 + 64 * k, 32, 22, rgb(c)); ring(c2, 32 + 64 * k, 32, 26, 5, '#ffffff'); })) }); g.geoui = Object.assign({}, g.geoui, { frames: { cols: cols.length, rows: 1 } }); made.push(E.circle); });
      if (!have(E.approach)) jobs.push(async () => { const g = await ctx.addImage({ name: E.approach, ...at0, height: 20, width: 20, blend: 'blend', uv: [0, 0, 64, 64], dataUrl: draw(64 * cols.length, 64, (c2) => cols.forEach((c, k) => ring(c2, 32 + 64 * k, 32, 28, 4, rgb(c)))) }); g.geoui = Object.assign({}, g.geoui, { frames: { cols: cols.length, rows: 1 } }); made.push(E.approach); });
      if (!have(E.number)) jobs.push(async () => { await ctx.addNumber({ name: E.number, digits: 2, height: 8, x: 0, y: 0, source: '0', hideLeadingZero: true }); made.push(E.number); });
      if (!have(E.burst)) jobs.push(async () => { await ctx.addImage({ name: E.burst, ...at0, height: 20, width: 20, blend: 'add', dataUrl: draw(64, 64, (c2) => { const gr = c2.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,220,0.9)'); gr.addColorStop(1, 'rgba(255,255,220,0)'); c2.fillStyle = gr; c2.fillRect(0, 0, 64, 64); }) }); made.push(E.burst); });
      if (!have(E.miss)) jobs.push(async () => { await ctx.addImage({ name: E.miss, ...at0, height: 12, width: 12, blend: 'blend', dataUrl: draw(64, 64, (c2) => { c2.strokeStyle = '#ff4040'; c2.lineWidth = 9; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(12, 12); c2.lineTo(52, 52); c2.moveTo(52, 12); c2.lineTo(12, 52); c2.stroke(); }) }); made.push(E.miss); });
      if (!have(E.spinner)) jobs.push(async () => { await ctx.addImage({ name: E.spinner, ...at0, height: 60, width: 60, blend: 'blend', dataUrl: draw(128, 128, (c2) => { ring(c2, 64, 64, 58, 6, '#ffffff'); c2.fillStyle = '#ffd040'; c2.fillRect(61, 8, 6, 40); }) }); made.push(E.spinner); });
      if (!have(E.ball)) jobs.push(async () => { await ctx.addImage({ name: E.ball, ...at0, height: 10, width: 10, blend: 'blend', dataUrl: draw(32, 32, (c2) => { disc(c2, 16, 16, 14, '#ffffff'); disc(c2, 16, 16, 9, '#ffc040'); }) }); made.push(E.ball); });
      if (!have(E.body) && out.bodies.length) jobs.push(async () => {
        const A2 = bodyAtlas(out.bodies), Me = T.media;
        const url = draw(A2.w, A2.h, (c2) => out.bodies.forEach((b, i) => {
          const img = Me.bodyImage(b, { pxPerUnit: A2.pxPerUnit }), [x, y] = A2.at(i);
          c2.save(); c2.translate(x + (A2.cell[0] - img.w) / 2, y + (A2.cell[1] - img.h) / 2); Me.drawOps(c2, img.ops); c2.restore();
        }));
        const g = await ctx.addImage({ name: E.body, ...at0, width: A2.units[0], height: A2.units[1], blend: 'blend', uv: [0, 0, A2.cell[0], A2.cell[1]], dataUrl: url, z: 0.5 });
        g.geoui = Object.assign({}, g.geoui, { frames: { cols: A2.cols, rows: A2.rows } });
        made.push(E.body);
        if (A2.pxPerUnit < 1) say(`スライダーの体 ${out.bodies.length} 本を 1 枚に入れるため、1 単位 ${A2.pxPerUnit.toFixed(2)} px に縮めました（粗く見えます）`, 'error');
      });
      return jobs.reduce((p, j) => p.then(j), Promise.resolve()).then(() => { st.elemCache = null; if (made.length) say(`osu! の要素を描いて足しました: ${made.join('・')}`); });
    }

    // ---- a video of the timeline
    function videoDialog() {
      const seqId = store.selection().seq, seq = store.doc().sequences.find((s) => s.id === seqId);
      if (!seq) return say('シーケンスがありません', 'error');
      const [a, b] = player.range();
      new Dialog({
        id: 'geoui_tl_video', title: 'GeoUI: タイムラインを動画に', width: 520,
        form: {
          format: { label: '形式', type: 'select', options: { webm: 'WebM（動画と音）', 'png-zip': 'PNG の連番（zip・背景は透明）' }, value: 'webm' },
          fps: { label: 'コマ数 / 秒', type: 'number', value: 30, min: 1, max: 120 },
          from: { label: '始め（秒）', type: 'number', value: a, min: 0, step: 0.05 },
          to: { label: '終わり（秒）', type: 'number', value: b, min: 0, step: 0.05 },
          scale: { label: '大きさ（画面の何倍）', type: 'select', options: { 1: '1 倍', 2: '2 倍', 0.5: '0.5 倍' }, value: '1' },
          background: { label: '背景（WebM）', type: 'select', options: { '#000000': '黒', '#00ff00': '緑（クロマキー）', '#ffffff': '白', transparent: '透明（VP9 のアルファ: 対応する編集ソフトで）' }, value: '#000000' },
          _info: { type: 'info', text: 'WebM は実時間で作ります（長さの分だけかかる）。プレビューは GeoUI → 画面を正面から見る の向きで写します。' },
        },
        onConfirm: (r) => { exportVideo({ format: r.format, fps: r.fps, from: r.from, to: r.to, scale: +r.scale, background: r.background === 'transparent' ? null : r.background }); },
      }).show();
    }
    async function exportVideo(o) {
      if (st.exporting) return say('いま書き出しています', 'error');
      if (!enterPreview()) return;
      ctx.view();
      st.exporting = true;
      const ac = { aborted: false }, seqName = clean((store.doc().sequences.find((s) => s.id === store.selection().seq) || {}).name || 'timeline');
      Blockbench.setProgress && Blockbench.setProgress(0.001);
      try {
        const out = await player.exportVideo({ format: o.format, fps: o.fps, from: o.from, to: o.to, scale: o.scale, signal: ac, onProgress: (d, n) => Blockbench.setProgress && Blockbench.setProgress(d / n), background: o.background });
        const blob = out.data instanceof root.Blob ? out.data : new root.Blob([out.data], { type: out.mime });
        Blockbench.export({ resource_id: 'geoui_video', type: o.format === 'webm' ? 'WebM 動画' : 'PNG の連番（zip）', extensions: [o.format === 'webm' ? 'webm' : 'zip'], name: `${seqName}.${o.format === 'webm' ? 'webm' : 'zip'}`, content: blob, savetype: 'zip' },
          () => say(`動画を書き出しました（${out.frames} コマ）`));
      } catch (e) { say(`書き出せません: ${e.message || e}`, 'error'); } finally { st.exporting = false; Blockbench.setProgress && Blockbench.setProgress(0); }
    }
    // (webm's frames over a background colour: the player hands drawFrame its options)
    const drawFrame0 = drawFrame;
    H.drawFrame = (cv, o) => drawFrame0(cv, o);

    // ---- the export: the timeline's RP and BP added to GeoUI Builder's pack
    function extend(built, design) {
      const doc = getDoc();
      if (!doc || !doc.sequences.length) return built;
      const S = built.settings, warnings = [];
      const sounds = mediaAll().filter((m) => m.kind === 'sound').flatMap((m) => {
        if (m.game === false || !['ogg', 'wav'].includes(m.ext)) { warnings.push(`音「${m.name}」は .${m.ext}: ゲームでは鳴りません（.ogg か .wav にして取り込み直す）`); return []; }
        return [{ id: m.id, ext: m.ext, data: fromB64(m.data) }];
      });
      const rp = T.compile.extendPack(built.files, doc, { design, core: G, sounds });
      let files = rp.files;
      warnings.push(...rp.warnings);
      if (S.bp) { const bp = T.runtime.extendBehavior(files, doc, { stats: rp.stats, ns: S.ns }); files = bp.files; warnings.push(...bp.warnings); }
      else warnings.push('ビヘイビアパックを作らない設定です: ゲームの中で再生する命令（scriptevent）は書き出しません');
      // (「確かめる」: what the timeline takes of the game's limits — the player's properties with GeoUI's own, the Molang,
      //  the bones, the element's own render controllers, the animations)
      const st2 = rp.stats, b2 = st2.budget || {}, c2 = st2.counts || {};
      if (Array.isArray(built.report)) built.report.push(`タイムライン: プロパティ ${b2.total ?? '?'} 個（GeoUI の ${b2.base ?? 0} 個込み・上限 ${b2.propertyLimit ?? 32}）・Molang ${st2.lines ?? 0} 行・${Math.round((st2.chars ?? 0) / 1000)} k 文字・変数 ${st2.variables ?? 0} 個（プレイヤーの分も込みで ${st2.entityVariables ?? st2.variables ?? 0} 個）（最長 ${st2.longest ?? 0} 文字・括弧 ${st2.deepest ?? 0} 段）・ボーン ${c2.bones ?? 0} 本・要素の render controller ${c2.renderControllers ?? 0} 個・アニメーション ${c2.animations ?? 0} 個`);
      return Object.assign(built, { files, warnings: [...built.warnings, ...warnings], timeline: rp.stats });
    }

    function uninstall() {
      player.dispose(); restore();
      css.remove();
      if (st.pe) { st.pe.detach(); st.pe = null; }
      for (const m of st.mounts) { try { m.unmount(); } catch (e) { /* (gone) */ } }
      for (const p of st.panels) p.delete();
      for (const a of st.actions) a.delete();
      for (const [ev, f] of st.listeners) Blockbench.removeListener(ev, f);
      for (const p of st.props) p.delete();
      if (st.audioCtx && st.audioCtx.close) st.audioCtx.close();
      store.dispose();
    }
    return { uninstall, extend, store, player, host: H, actions: ['geoui_tl_play', 'geoui_tl_track', 'geoui_tl_media', 'geoui_tl_osu', 'geoui_tl_video'], state: st, importOsuText, addSounds, exportVideo, frameRect,
      audio: audioEngine, audioCount: () => (audioEngine ? audioEngine.count() : 0) };
  }

  T.bridge = { install, digitsOf, patchShader, rectOf, frameOffset, protosOf, soundId, bodyAtlas, toB64, fromB64, soundInfo };
  if (typeof module === 'object' && module && module.exports) module.exports = T.bridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);

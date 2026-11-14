// GeoUI Screen — a scene (groups anchored on the screen, planes on atlases, Molang, properties, a script) → the two packs
// (pure: files as text and bytes, nothing written). The resource pack redefines minecraft:player the way GeoUI Builder does
// (the vanilla definitions it carries, GeoUICore.VANILLA_*), adds one geometry + render controller per atlas (every geometry
// keeps every bone; a bone's planes are on one atlas), a transform animation (bone positions, scales and rotations as Molang)
// and the HUD's renderers (layout.hudScreen: one per group). The behaviour pack carries the player's properties and the script.
//
// scene = {
//   ns, name, description, version [1,0,0], minEngine [1,26,50], uuids {rp,rpMod,bp,bpData,bpScript} | seed,
//   scale (layout.modeOf), groups [{ id, anchor, scale?, clip?, layer? }],
//   textures [{ id, width, height, png (bytes or base64) }],
//   bones [{ name, group, parent?, pivot? [x, y] (local units), material? 'cutout'|'blend'|'add'|'fade'|'addfade'|'glass' or one of
//            extraMaterials (+ '_s': smooth),
//            visible? Molang, position? [x, y, z] Molang (model units, added: x right, y UP), scale? Molang|[3], rotation? [3] }],
//   planes [{ bone, texture, rect {x, y, w, h} (local units, y down), z (toward the camera is negative), uv [u, v, w, h] (texture px) }],
//   pre [lines] (pre_animation, after the guard), initialize [lines], properties [{ name, range [a, b], default }],
//   hideLocalPlayer (Molang: hide the player's own body in the world while true — a frozen camera then sees through it),
//   script (the BP's scripts/main.js), extraScripts { 'name.js': text }, lang { en_US: '', ja_JP: '' },
//   serverVersion ('@minecraft/server' the script asks for: 2.5.0 by default — playerSwingStart is in WorldAfterEvents from 2.5.0,
//   Mojang's script metadata (bedrock-samples metadata/script_modules), RULES.md R7.1),
//   scaleScript (the player's scripts.scale, Molang: the renderer's unit is scale / 16 of its panel — RULES.md R4.1; vanilla 0.9375),
//   patchPlayer({ rp, bp }) (last changes to the two player definitions: component groups, events …),
//   rcPatch (keys merged into every GeoUI render controller: color, overlay_color … as Molang),
//   extraMaterials { name: definition } (materials not proved yet, for an experiment's bones only — never one of MATS' names:
//   a probe tries them, RULES.md says what they did; what holds moves into MATS),
//   f1 (true: F1 without the game mode changed — the property <ns>:f1 hides the local player's arms and held items (the arms'
//   bones moved far below and at scale 0 — which hides the empty hand's arm only: a first-person held item follows neither the
//   arm's position nor its scale, RULES R10.13) and body (render controllers), the HUD by the title channel: layout.js,
//   channel.js; and the camera preset <ns>:eye (bp/cameras/presets: follow_orbit at the eyes, radius 0.1 — no first-person
//   pass, so no held item: channel.js sets it with cfg.camera; f1Camera: false leaves it out),
//   urlImages [{ id, group, rect {x, y, w, h} (local units), slot, above? }] (images the game fetches by URL: layout.js),
//   channel { width } (the title channel's field width), modules [{ module_name, version }] (more script modules: server-net …)
// }
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const L = () => S.layout || (typeof require === 'function' ? require('./layout.js') : null);
  const J = (o) => JSON.stringify(o, null, 2);
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const clean = (s, fb) => String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || fb;

  /** the materials (the ones GeoUI Builder and the timeline proved on the real app: cutout, blend, add; fade and addfade with the
   *  colour mask, whose alpha the render controller's colour sets — blend alone ignores it) in a point- and a smooth-filtered set */
  const MATS = {
    cutout: { '+defines': ['USE_UV_ANIM', 'ALPHA_TEST'] },
    blend: { '+defines': ['USE_UV_ANIM'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
    add: { '+defines': ['USE_UV_ANIM'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' },
    fade: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
    addfade: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' },
    // (translucent without writing depth: what is drawn later is never hidden behind it — a glass panel over a page)
    glass: { '+defines': ['USE_UV_ANIM'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
  };
  const MAT_NAMES = Object.keys(MATS);
  /** the @minecraft/server version each API a GeoUI script uses first appeared in (Mojang's script metadata, bedrock-samples
   *  1.26.50.4 metadata/script_modules/@minecraft/server-bindings_*.json — RULES.md R7.1): a pack asks for the highest it uses */
  const API_MIN = Object.freeze({
    playerSwingStart: '2.5.0', EntitySwingSource: '2.5.0', playerHotbarSelectedSlotChange: '2.1.0', playerButtonInput: '1.18.0',
    playerInputModeChange: '1.17.0', playerEmote: '1.14.0', selectedSlotIndex: '1.11.0', playAnimation: '1.9.0', isSneaking: '1.6.0',
  });
  const vnum = (v) => String(v).split('.').map(Number).reduce((a, x) => a * 1000 + (x || 0), 0);
  /** the lowest @minecraft/server version that has every API of API_MIN a script names, and which ones need it */
  function apiNeeds(text) {
    let need = '1.0.0'; const uses = [];
    for (const [name, v] of Object.entries(API_MIN)) if (new RegExp(`\\b${name}\\b`).test(String(text || ''))) { uses.push(name); if (vnum(v) > vnum(need)) need = v; }
    return { need, uses };
  }
  function materialsFile(ns, used, extra = {}) {
    const table = Object.assign({}, MATS, extra);
    const m = { materials: { version: '1.0.0' } };
    const base = (filter) => ({
      vertexShader: 'shaders/entity.vertex', vrGeometryShader: 'shaders/entity.geometry', fragmentShader: 'shaders/entity.fragment',
      vertexFields: [{ field: 'Position' }, { field: 'Normal' }, { field: 'UV0' }],
      variants: [
        { skinning: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Normal' }, { field: 'UV0' }] } },
        { skinning_color: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Color' }, { field: 'Normal' }, { field: 'UV0' }] } },
      ],
      msaaSupport: 'Both', '+samplerStates': [{ samplerIndex: 0, textureFilter: filter }],
    });
    m.materials[`${ns}_base`] = base('Point');
    m.materials[`${ns}_bases`] = base('Bilinear');
    for (const name of used) {
      const smooth = name.endsWith('_s'), kind = smooth ? name.slice(0, -2) : name;
      m.materials[`${ns}_${name}:${ns}_${smooth ? 'bases' : 'base'}`] = table[kind];
    }
    return m;
  }

  /** a stable UUID v4-shaped id from text (the same one GeoUI Builder makes: FNV-1a, 4 rounds) */
  function uuidFrom(seed) {
    const hex = [];
    for (let r = 0; r < 4; r++) {
      let h = 0x811c9dc5 ^ (r * 0x9e3779b9);
      for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      hex.push((h >>> 0).toString(16).padStart(8, '0'));
    }
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${((parseInt(s[16], 16) & 3) | 8).toString(16)}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
  const b64 = (bytes) => (typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes))));

  /** scene → { files: { 'rp/…' | 'bp/…': string | { base64 } }, stats, warnings } */
  function build(scene, opts = {}) {
    const lay = L(), G = opts.core || null, warnings = [];
    if (!G || !G.VANILLA_RP_PLAYER) throw new Error('GeoUICore（geoui_builder.js）を opts.core に渡してください: プレイヤーの元の定義を使います');
    const ns = clean(scene.ns, 'gs').slice(0, 24), files = {};
    const groups = lay.groupsOf(scene), byGroup = Object.fromEntries(groups.map((g) => [g.id, g]));
    const textures = scene.textures || [], texIds = new Set(textures.map((t) => t.id));
    // (an experiment's own materials: new names only — a proved one is never redefined by a scene)
    const extraMats = scene.extraMaterials || {};
    for (const k of Object.keys(extraMats)) if (MAT_NAMES.includes(k) || !/^[a-z][a-z0-9]{0,15}$/.test(k)) throw new Error(`実験の材質の名前「${k}」は英小文字と数字の新しい名前で（${MAT_NAMES.join(' ')} 以外）`);
    const matNames = [...MAT_NAMES, ...Object.keys(extraMats)];
    // ---- bones: model positions from the groups' origins; a bone's planes on one atlas, its material its own
    const bones = (scene.bones || []).map((b0) => {
      const b = Object.assign({}, b0), g = byGroup[b.group];
      if (!g) throw new Error(`ボーン ${b.name} のグループ「${b.group}」がありません`);
      b.material = b.material || 'cutout';
      const kind = b.material.endsWith('_s') ? b.material.slice(0, -2) : b.material;
      if (!matNames.includes(kind)) throw new Error(`ボーン ${b.name} のマテリアル「${b.material}」は ${matNames.join(' ')}（なめらかなら _s）`);
      const p = b.pivot || [0, 0];
      b.modelPivot = [r4(g.origin[0] + p[0]), r4(g.origin[1] - p[1]), 0];
      return b;
    });
    const boneByName = new Map(bones.map((b) => [b.name, b]));
    if (boneByName.size !== bones.length) throw new Error('同じ名前のボーンが 2 つあります');
    for (const b of bones) if (b.parent && !boneByName.has(b.parent)) throw new Error(`ボーン ${b.name} の親 ${b.parent} がありません`);
    const rootName = `${ns}_root`;
    // ---- planes → cubes per texture. No two faces on one plane: a plane that overlaps one before it at the same depth (within
    //      0.02) goes 0.021 farther back until it is free — the lab's model check (z-fight) and the game's flicker both come from
    //      two faces on one plane; the one written first stays in front
    const perTex = new Map(textures.map((t) => [t.id, new Map()]));
    let planeCount = 0, settled = 0;
    const placed = [];
    const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
    for (const p of scene.planes || []) {
      const b = boneByName.get(p.bone);
      if (!b) throw new Error(`面のボーン「${p.bone}」がありません`);
      if (!texIds.has(p.texture)) throw new Error(`面のテクスチャ「${p.texture}」がありません`);
      const g = byGroup[b.group];
      const box = { x0: g.origin[0] + p.rect.x, x1: g.origin[0] + p.rect.x + p.rect.w, y0: g.origin[1] - p.rect.y - p.rect.h, y1: g.origin[1] - p.rect.y };
      let z = p.z || 0, guard = 0;
      while (placed.some((q) => Math.abs(q.z - z) < 0.02 && overlaps(q.box, box)) && guard++ < 400) z = r4(z + 0.021);
      if (guard) settled++;
      placed.push({ box, z });
      const cube = lay.rectToModel(g, p.rect, z);
      const uv = p.uv;
      cube.uv = { north: { uv: [r4(uv[0]), r4(uv[1])], uv_size: [r4(uv[2]), r4(uv[3])] } };
      const m = perTex.get(p.texture);
      if (!m.has(b.name)) m.set(b.name, []);
      m.get(b.name).push(cube);
      planeCount++;
    }
    // ---- geometry per texture (every bone in each: the transform animation finds them all)
    const allBones = (texId) => {
      const cubesOf = perTex.get(texId) || new Map();
      const out = [{ name: rootName, pivot: [0, 0, 0] }];
      for (const b of bones) {
        const o = { name: b.name, parent: b.parent || rootName, pivot: b.modelPivot };
        if (b.rotation) o.rotation = b.rotation;
        const cubes = cubesOf.get(b.name);
        if (cubes && cubes.length) o.cubes = cubes;
        out.push(o);
      }
      return out;
    };
    // (the content is far from the origin: the bounds hold every group's, in blocks, so nothing is culled)
    const xs = groups.map((g) => g.origin[0]), ys = groups.map((g) => g.origin[1]);
    const bounds = { visible_bounds_width: Math.ceil((Math.max(...xs.map(Math.abs)) + 800) * 2 / 16), visible_bounds_height: Math.ceil((Math.max(...ys.map(Math.abs)) + 800) * 2 / 16), visible_bounds_offset: [0, 0, 0] };
    const geos = textures.map((t) => {
      const key = `${ns}_${clean(t.id, 't')}`;
      return { key, tex: t, json: { format_version: '1.12.0', 'minecraft:geometry': [{ description: Object.assign({ identifier: `geometry.${key}`, texture_width: t.width, texture_height: t.height }, bounds), bones: allBones(t.id) }] } };
    });
    // ---- materials and render controllers
    const used = new Set(['cutout']);
    for (const b of bones) used.add(b.material);
    const cond = ['q.is_in_ui', '!variable.is_paperdoll'].join(' && ');
    const controllers = {}, rcList = [];
    const vis = bones.filter((b) => b.visible !== undefined && b.visible !== null && String(b.visible).trim() !== '');
    for (const g of geos) {
      const mats = [{ '*': `material.${ns}_cutout` }];
      for (const b of bones) if (b.material !== 'cutout') mats.push({ [b.name]: `material.${ns}_${b.material}` });
      // (the materials define USE_UV_ANIM: the controller says its offset and scale, 0 and 1 — left out, they are not 1)
      const rc = { geometry: `Geometry.${g.key}`, materials: mats, textures: [`Texture.${g.key}`], uv_anim: { offset: [0, 0], scale: [1, 1] },
        color: { r: 1, g: 1, b: 1, a: scene.alpha || 1 }, is_hurt_color: { r: 0, g: 0, b: 0, a: 0 }, on_fire_color: { r: 0, g: 0, b: 0, a: 0 } };
      if (vis.length) rc.part_visibility = [{ '*': true }, ...vis.map((b) => ({ [b.name]: String(b.visible) }))];
      // (the scene's own changes to every controller: a colour multiplier, an overlay colour … — RULES.md R3.11)
      if (scene.rcPatch) Object.assign(rc, JSON.parse(JSON.stringify(scene.rcPatch)));
      controllers[`controller.render.${g.key}`] = rc;
      rcList.push({ [`controller.render.${g.key}`]: cond });
      files[`rp/models/entity/${ns}/${clean(g.tex.id, 't')}.geo.json`] = J(g.json);
      files[`rp/textures/${ns}/${clean(g.tex.id, 't')}.png`] = { base64: b64(g.tex.png) };
    }
    // ---- the transform animation: positions (added), scales and rotations (Molang) per bone
    const anim = {};
    for (const b of bones) {
      const ch = {};
      if (b.position) ch.position = b.position.map((v) => (typeof v === 'number' ? r4(v) : String(v)));
      if (b.scale !== undefined && b.scale !== null) ch.scale = Array.isArray(b.scale) ? b.scale.map(String) : String(b.scale);
      if (b.spin) ch.rotation = b.spin.map((v) => (typeof v === 'number' ? r4(v) : String(v)));
      if (Object.keys(ch).length) anim[b.name] = ch;
    }
    const animations = { [`animation.${ns}.ui`]: { loop: true, animation_length: 1, bones: anim } };
    // (more animations of the scene's own: each its own Molang, so a query that fails in one leaves the others running)
    const extraAnims = (scene.animations || []).map((a) => {
      const key = `${ns}_${clean(a.name, 'a')}`;
      animations[`animation.${ns}.${clean(a.name, 'a')}`] = { loop: true, animation_length: 1, bones: a.bones };
      return { key, full: `animation.${ns}.${clean(a.name, 'a')}`, cond: a.condition || 'q.is_in_ui' };
    });
    // (F1: the local player's arms and what they hold gone. The first-person item follows its arm's position — the game's own
    //  swap_item animation dips it with the arm's y — but not the arm's scale: scale 0 alone left a held block and a sword in
    //  sight (run 41001422618・41004077706), so the arms also go 100 units (6 blocks) down, out of the view, as the swap does)
    if (scene.f1) {
      const F1_DROP = [0, -100, 0];
      // (the bone names as the game's own player animations write them: lower case)
      animations[`animation.${ns}.f1`] = { loop: true, animation_length: 1, bones: {
        rightarm: { position: F1_DROP, scale: 0 }, leftarm: { position: F1_DROP, scale: 0 }, rightitem: { scale: 0 }, leftitem: { scale: 0 } } };
    }
    files[`rp/animations/${ns}.animation.json`] = J({ format_version: '1.8.0', animations });
    files[`rp/render_controllers/${ns}.render_controllers.json`] = J({ format_version: '1.8.0', render_controllers: controllers });
    files[`rp/materials/entity.material`] = J(materialsFile(ns, used, extraMats));
    files[`rp/ui/hud_screen.json`] = J(lay.hudScreen(scene, { followHud: scene.followHud !== false }));
    // ---- the player: vanilla + ours
    const ce = JSON.parse(G.VANILLA_RP_PLAYER), d = ce['minecraft:client_entity'].description;
    for (const m of used) d.materials[`${ns}_${m}`] = `${ns}_${m}`;
    for (const g of geos) { d.textures[g.key] = `textures/${ns}/${clean(g.tex.id, 't')}`; d.geometry[g.key] = `geometry.${g.key}`; }
    // (the paper doll of the pause screen is a player built for the picture: it has no properties, and a q.property there stops
    //  the rest of pre_animation — bds-lab's probe: every line that reads one is guarded by variable.is_paperdoll)
    if (scene.scaleScript) d.scripts.scale = String(scene.scaleScript);
    d.scripts.initialize = [...(d.scripts.initialize || []), ...(scene.initialize || [])];
    d.scripts.pre_animation = [...d.scripts.pre_animation, ...(scene.pre || [])];
    d.animations[`${ns}_ui`] = `animation.${ns}.ui`;
    for (const a of extraAnims) d.animations[a.key] = a.full;
    // F1 (no game mode change): the arms and the held items in the world only (the inventory's doll and the GeoUI renderers are
    // in a UI); the property read where the paper doll is guarded (it has no properties)
    const f1Var = `v.${ns}_f1`;
    if (scene.f1) {
      d.scripts.initialize = [...d.scripts.initialize, `${f1Var} = 0;`];
      d.scripts.pre_animation = [...d.scripts.pre_animation, `${f1Var} = variable.is_paperdoll ? 0 : q.property('${ns}:f1');`];
      d.animations[`${ns}_f1`] = `animation.${ns}.f1`;
    }
    // (F1's arms and items: in first person — the game's own variable, true only for the local player in its first-person view —
    //  or the local player in the world. q.is_local_player && !q.is_in_ui alone did not hide the first-person arm: run 41001422618)
    d.scripts.animate = [{ [`${ns}_ui`]: 'q.is_in_ui' }, ...extraAnims.map((a) => ({ [a.key]: a.cond })), ...(scene.f1 ? [{ [`${ns}_f1`]: `${f1Var} > 0 && (variable.is_first_person || (q.is_local_player && !q.is_in_ui))` }] : []), ...d.scripts.animate];
    // (the player's own body hidden from itself: hideLocalPlayer (a frozen camera sees through it) and F1 (spectator-like). In
    //  the world only, for the local player only — the inventory's doll and everyone else still see it. The first-person
    //  controllers too: the frozen camera may keep the first-person view, whose arm hides GeoUI by depth — RULES R4.11)
    const hides = [scene.hideLocalPlayer, scene.f1 ? `${f1Var} > 0` : null].filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
    const hideLocal = scene.hideLocalPlayer !== undefined && scene.hideLocalPlayer !== null && String(scene.hideLocalPlayer).trim() !== '' ? String(scene.hideLocalPlayer) : null;
    d.render_controllers = [...rcList, ...d.render_controllers.map((rc) => {
      if (!hides.length) return rc;
      const [k, v] = Object.entries(rc)[0];
      if (!/^controller\.render\.player\.(first|third)_person/.test(k)) return rc;
      // (F1 in first person: the first-person controllers draw only the local player's own view — F1 alone hides them there)
      if (scene.f1 && /^controller\.render\.player\.first_person/.test(k)) return { [k]: `(${v}) && !(${hideLocal ? `(q.is_local_player && !q.is_in_ui && (${hideLocal})) || ` : ''}(${f1Var} > 0))` };
      const any = hides.length === 1 ? hides[0] : hides.map((h) => `(${h})`).join(' || ');
      return { [k]: `(${v}) && !(q.is_local_player && !q.is_in_ui && (${any}))` };
    })];
    const be = JSON.parse(G.VANILLA_BP_PLAYER);
    if (typeof scene.patchPlayer === 'function') scene.patchPlayer({ rp: ce, bp: be });
    files['rp/entity/player.entity.json'] = J(ce);
    const U = scene.uuids || { rp: uuidFrom(`${ns}:rp:${scene.seed || ''}`), rpMod: uuidFrom(`${ns}:rp-mod:${scene.seed || ''}`), bp: uuidFrom(`${ns}:bp:${scene.seed || ''}`),
      bpData: uuidFrom(`${ns}:bp-data:${scene.seed || ''}`), bpScript: uuidFrom(`${ns}:bp-script:${scene.seed || ''}`) };
    const version = scene.version || [1, 0, 0], minEngine = scene.minEngine || [1, 26, 50];
    const name = scene.name || 'GeoUI Screen', desc = scene.description || 'GeoUI Screen (bds-lab)';
    files['rp/manifest.json'] = J({ format_version: 2, header: { name: `${name} RP`, description: desc, uuid: U.rp, version, min_engine_version: minEngine }, modules: [{ type: 'resources', uuid: U.rpMod, version: [1, 0, 0] }] });
    const langOf = (k) => `pack.name=${String(name).replace(/[\r\n=]/g, ' ')}\npack.description=${String(desc).replace(/[\r\n=]/g, ' ')}\n${(scene.lang && scene.lang[k]) || ''}`;
    files['rp/texts/languages.json'] = J(['en_US', 'ja_JP']);
    files['rp/texts/en_US.lang'] = `${langOf('en_US')}entity.minecraft:player.name=Player\n`;
    files['rp/texts/ja_JP.lang'] = `${langOf('ja_JP')}entity.minecraft:player.name=プレイヤー\n`;
    // ---- the behaviour pack
    const props = {};
    const propList = [...(scene.properties || [])];
    if (scene.f1 && !propList.some((p) => p.name === 'f1')) propList.push({ name: 'f1', range: [0, 1], default: 0 });
    for (const p of propList) {
      if (!/^[a-z0-9_]{1,32}$/.test(p.name)) throw new Error(`プロパティの名前「${p.name}」は英小文字・数字・_`);
      props[`${ns}:${p.name}`] = { client_sync: true, type: 'int', range: p.range, default: p.default ?? p.range[0] };
    }
    if (Object.keys(props).length > 32) warnings.push(`プロパティが ${Object.keys(props).length} 個: ゲームの上限は 32 個`);
    if (Object.keys(props).length) be['minecraft:entity'].description.properties = props;
    files['bp/entities/player.json'] = J(be);
    // (F1's camera: a third-person camera at the eyes. inherit_from follow_orbit (radius 0.1, the eye height 1.62 above the feet,
    //  no view offset) — read by BDS 1.26.60.6 and set by `camera A set <ns>:eye`; extend_player_rendering is not in its schema
    //  (the whole preset was refused with it))
    if (scene.f1 && scene.f1Camera !== false) {
      files[`bp/cameras/presets/${ns}_eye.json`] = J({ format_version: '1.21.50', 'minecraft:camera_preset': { identifier: `${ns}:eye`, inherit_from: 'minecraft:follow_orbit', radius: 0.1, entity_offset: [0, 1.62, 0], view_offset: [0, 0] } });
    }
    files['bp/loot_tables/empty.json'] = J({ pools: [] });
    const serverVersion = scene.serverVersion || '2.5.0';
    const needs = apiNeeds([scene.script || '', ...Object.values(scene.extraScripts || {})].join('\n'));
    if (scene.script && vnum(needs.need) > vnum(serverVersion)) warnings.push(`スクリプトが @minecraft/server ${needs.need} の API（${needs.uses.join('・')}）を使うのに ${serverVersion} を宣言しています`);
    const deps = [{ uuid: U.rp, version }, { module_name: '@minecraft/server', version: serverVersion }, ...(scene.modules || []).map((m) => ({ module_name: m.module_name, version: m.version }))];
    files['bp/manifest.json'] = J({ format_version: 2, header: { name: `${name} BP`, description: desc, uuid: U.bp, version, min_engine_version: minEngine },
      modules: [{ type: 'data', uuid: U.bpData, version: [1, 0, 0] }, ...(scene.script ? [{ type: 'script', language: 'javascript', uuid: U.bpScript, entry: 'scripts/main.js', version: [1, 0, 0] }] : [])],
      dependencies: scene.script ? deps : deps.slice(0, 1) });
    if (scene.script) files['bp/scripts/main.js'] = scene.script;
    for (const [k, v] of Object.entries(scene.extraScripts || {})) files[`bp/scripts/${k}`] = v;
    files['bp/texts/languages.json'] = J(['en_US', 'ja_JP']);
    files['bp/texts/en_US.lang'] = langOf('en_US'); files['bp/texts/ja_JP.lang'] = langOf('ja_JP');
    if (bones.length + 1 > 600) warnings.push(`ボーンが ${bones.length + 1} 本: 本物のアプリで確かめたのは 600 本まで`);
    // ---- every renderer draws every group: none may show another's content (or the player's body) on any device, at the GUI
    //      scales a phone, a tablet and a PC use (2 and 3 screen px a JSON UI px: SPEC.md 「ほかのグループが映らないこと」)
    const boxes = {};
    for (const p of scene.planes || []) {
      const g = boneByName.get(p.bone).group, b = boxes[g] || (boxes[g] = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      b.x0 = Math.min(b.x0, p.rect.x); b.y0 = Math.min(b.y0, p.rect.y); b.x1 = Math.max(b.x1, p.rect.x + p.rect.w); b.y1 = Math.max(b.y1, p.rect.y + p.rect.h);
    }
    const seen = new Map();
    for (const ui of [2, 3]) for (const d of lay.DEVICES) for (const h of lay.ghosts(groups, boxes, d.w, d.h, ui)) { const k = `${h.by}←${h.seen}`; if (!seen.has(k)) seen.set(k, `${d.id} GUI ${ui}`); }
    for (const [k, where] of seen) warnings.push(`グループ ${k.replace('←', ' の renderer に ')} が映る（${where} など）: origin を離すか、大きさの決め方を変えてください`);
    const stats = { groups: groups.length, bones: bones.length + 1, planes: planeCount, settled, textures: textures.length, properties: Object.keys(props).length, renderers: groups.filter((g) => g.renderer !== false).length };
    return { files, stats, warnings, ns, uuids: U };
  }

  S.pack = { MATS, MAT_NAMES, API_MIN, apiNeeds, materialsFile, uuidFrom, build };
  if (typeof module === 'object' && module && module.exports) module.exports = S.pack;
})(typeof globalThis !== 'undefined' ? globalThis : this);

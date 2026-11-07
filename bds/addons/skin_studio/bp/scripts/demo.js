// Skin Studio — showcase: one tour that does everything, for presenting / recording the addon.
//   /scriptevent studio:demo [fast]   the whole tour (fast = 4x, for tests)
//   /scriptevent studio:clean         remove the stage and put the area back as it was
//   /scriptevent studio:guide         the guide item (its menu does all of the above)
// The tour drives the other modules only through their public scriptevents (run as the viewer),
// so what it shows is exactly what a player or a command block can do.
import { world, system, Player, EasingType, InputPermissionCategory, StructureSaveMode, ItemStack } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';

const STATE = 'sd:state';
const BACKUP = 'skin_studio:demo_backup';
const GUIDE = 'skin_podium:guide';
const DEMO_SKINS = ['Demo_Alex', 'Demo_Steve'];
let running;            // { id, abort }

const valid = e => { try { return !!e && e.isValid; } catch (_) { return false; } };
const tell = (p, msg) => { try { p.sendMessage(`§d[Skin Studio]§r ${msg}`); } catch (_) {} };
const snap = y => Math.round(y / 90) * 90;
function loadState() { try { const v = world.getDynamicProperty(STATE); return typeof v === 'string' ? JSON.parse(v) : undefined; } catch (_) { return undefined; } }
function saveState(s) { world.setDynamicProperty(STATE, s ? JSON.stringify(s) : undefined); }

// stage coordinates: a = forward from the viewer, b = to the right, h = up (blocks)
function frame(origin, yaw) {
  const r = yaw * Math.PI / 180;
  const f = { x: Math.round(-Math.sin(r)), z: Math.round(Math.cos(r)) };
  const rt = { x: -f.z, z: f.x };
  const L = (a, b, h) => ({ x: origin.x + 0.5 + f.x * a + rt.x * b, y: origin.y + h, z: origin.z + 0.5 + f.z * a + rt.z * b });
  const box = (a0, a1, b0, b1, h0, h1) => {
    const p = L(a0, b0, h0), q = L(a1, b1, h1);
    return { min: { x: Math.floor(Math.min(p.x, q.x)), y: Math.min(p.y, q.y), z: Math.floor(Math.min(p.z, q.z)) },
             max: { x: Math.floor(Math.max(p.x, q.x)), y: Math.max(p.y, q.y), z: Math.floor(Math.max(p.z, q.z)) } };
  };
  return { L, box, f, yaw };
}
const REGION = [0, 15, -9, 9, -1, 7];
function fill(dim, { min, max }, block) { dim.runCommand(`fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} ${block}`); }

function buildStage(p) {
  const dim = p.dimension, l = p.location;
  const origin = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  const fr = frame(origin, snap(p.getRotation().y));
  const region = fr.box(...REGION);
  try { world.structureManager.delete(BACKUP); } catch (_) {}
  world.structureManager.createFromWorld(BACKUP, dim, region.min, region.max, { includeEntities: false, includeBlocks: true, saveMode: StructureSaveMode.World });
  fill(dim, fr.box(0, 15, -9, 9, 0, 7), 'air');
  fill(dim, fr.box(0, 15, -9, 9, -1, -1), 'smooth_quartz');
  fill(dim, fr.box(1, 14, -8, 8, -1, -1), 'polished_blackstone');
  fill(dim, fr.box(2, 13, -7, 7, -1, -1), 'smooth_quartz');
  fill(dim, fr.box(0, 7, -1, 1, 0, 0), 'red_carpet');            // the walk up to the podium
  for (const [a, b] of [[2, -8], [2, 8], [13, -8], [13, 8]]) {   // four lanterns on posts
    const q = fr.L(a, b, 0);
    dim.runCommand(`fill ${Math.floor(q.x)} ${q.y} ${Math.floor(q.z)} ${Math.floor(q.x)} ${q.y + 1} ${Math.floor(q.z)} polished_blackstone_wall`);
    dim.runCommand(`setblock ${Math.floor(q.x)} ${q.y + 2} ${Math.floor(q.z)} lantern`);
  }
  return { dim: dim.id, origin, yaw: fr.yaw, region, entities: [], player: p.id };
}

function cleanup(by) {
  const s = loadState();
  if (!s) { if (by) tell(by, '片付けるものはありません。'); return false; }
  let dim; try { dim = world.getDimension(s.dim); } catch (_) {}
  for (const id of s.entities ?? []) {
    const e = world.getEntity(id); if (!valid(e)) continue;
    try {
      // the podium's statues / the mirror's reflections go with it
      for (const t of ['skin_podium:statue', 'skin_podium:reflection'])
        for (const c of e.dimension.getEntities({ type: t, location: e.location, maxDistance: 4 }))
          if (c.getDynamicProperty('sp:podium') === id || c.getDynamicProperty('sm:mirror') === id) c.remove();
      e.remove();
    } catch (_) {}
  }
  for (const n of DEMO_SKINS) try { world.getDimension('overworld').runCommand(`scriptevent podium:vaultdel ${n}`); } catch (_) {}
  if (dim) {
    try { world.structureManager.place(BACKUP, dim, s.region.min); } catch (e) { console.warn(`[Skin Studio] restore: ${e}`); }
    try { world.structureManager.delete(BACKUP); } catch (_) {}
  }
  const p = world.getEntity(s.player);
  if (p instanceof Player) { try { p.runCommand('scriptevent podium:hud off'); } catch (_) {} }
  saveState(undefined);
  if (by) tell(by, '紹介ステージを片付けて、元に戻しました。');
  return true;
}

async function tour(p, fast) {
  if (running) return tell(p, 'いまデモを再生中です。');
  if (loadState()) cleanup(undefined);                 // a previous stage goes first
  const run = { id: p.id, abort: false };
  running = run;
  const k = fast ? 0.25 : 1;
  const wait = async sec => { await system.waitTicks(Math.max(1, Math.round(sec * 20 * k))); if (run.abort || !valid(p)) throw new Error('aborted'); };
  const bar = text => { try { p.onScreenDisplay.setActionBar(text); } catch (_) {} };
  const title = (t, sub) => { try { p.onScreenDisplay.setTitle(t, { subtitle: sub, fadeInDuration: 6, stayDuration: Math.round(50 * k) + 10, fadeOutDuration: 8 }); } catch (_) {} };
  const cam = (loc, facing, ease) => { try { p.camera.setCamera('minecraft:free', { location: loc, facingLocation: facing, easeOptions: { easeTime: Math.max(0.05, ease * k), easeType: EasingType.InOutSine } }); } catch (_) {} };
  const run_ = c => { try { p.runCommand(c); } catch (e) { console.warn(`[Skin Studio] ${c}: ${e}`); } };
  const step = (n, text) => { bar(`§e${n}§r ${text}`); console.log(`[Skin Studio] demo step ${n}`); };
  let state;
  try {
    try { p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false); } catch (_) {}
    state = buildStage(p);
    saveState(state);
    const fr = frame(state.origin, state.yaw);
    const dim = p.dimension;
    p.teleport(fr.L(0, 0, 0), { rotation: { x: 5, y: state.yaw } });
    title('§l§6Skin Studio', '§fスキンを、表彰台と鏡に。');
    cam(fr.L(-4, 0, 6), fr.L(9, 0, 1), 0.1);
    await wait(3);

    // 1 — the podium
    const podium = dim.spawnEntity('skin_podium:podium', fr.L(10, -3, 0));
    state.entities.push(podium.id); saveState(state);
    step('1/8', '表彰台：置くと、スキン像が3体立ちます');
    cam(fr.L(5, -3, 2.4), fr.L(10, -3, 1.3), 1.5);
    await wait(2.5);
    run_('scriptevent podium:set 1 @s');
    step('2/8', '像に、自分のスキンが映ります（Skin Changer の受け渡し）');
    await wait(3.5);

    // 2 — mannequins (SimulatedPlayer) wearing saved skins
    run_('scriptevent podium:vaultcopy Demo_Alex slim #f2c9a6');
    run_('scriptevent podium:vaultcopy Demo_Steve wide #8d5a3b');
    run_('scriptevent podium:set 2 Demo_Alex');
    run_('scriptevent podium:set 3 Demo_Steve');
    step('3/8', '保存したスキンを SimulatedPlayer のマネキンが着て、像に映します');
    await wait(5);
    run_('scriptevent podium:vaultcopy Demo_Alex slim #6a4630');
    step('4/8', 'setSkin で着せ替えると、像もすぐに変わります');
    await wait(3.5);

    // 3 — looks: metallic, turntable
    run_('scriptevent podium:look all 0 1');
    step('5/8', 'メタリック像スタイル・ポーズ・回転');
    await wait(2.5);
    run_('scriptevent podium:look all 0 0');
    run_('scriptevent podium:spin on');
    cam(fr.L(6, 1, 3.2), fr.L(10, -3, 1.2), 2);
    await wait(3.5);
    run_('scriptevent podium:spin off');

    // 4 — the ceremony
    run_('scriptevent podium:ceremony');
    step('6/8', '表彰式：像がジャンプして、タイトルとパーティクル');
    cam(fr.L(2, -1, 4), fr.L(10, -3, 2), 1.5);
    await wait(6);

    // 5 — geoUI HUD (first person)
    try { p.camera.clear(); } catch (_) {}
    p.teleport(fr.L(1, 0, 0), { rotation: { x: 0, y: state.yaw } });
    run_('scriptevent podium:hud podium');
    step('7/8', 'geoUI 式：表彰台を画面に表示（一人称）');
    await wait(4);
    run_('scriptevent podium:hud self');
    await wait(3);
    run_('scriptevent podium:hud off');

    // 6 — the mirror
    const mirror = dim.spawnEntity('skin_podium:mirror', fr.L(8, 5, 0));
    state.entities.push(mirror.id); saveState(state);
    await wait(1.5);
    const my = mirror.getRotation().y, mr = my * Math.PI / 180;
    const n = { x: -Math.sin(mr), z: Math.cos(mr) };
    p.teleport({ x: mirror.location.x + n.x * 2.6, y: mirror.location.y, z: mirror.location.z + n.z * 2.6 }, { rotation: { x: 8, y: my + 180 } });
    step('8/8', '鏡：見る人の視点から、鏡像を毎フレーム計算します');
    await wait(3);
    for (const c of [1, 2, 3, 0]) { run_(`scriptevent mirror:frame ${c}`); bar(`§e8/8§r 枠の色：${['金', '銀', '木', '黒'][c]}`); await wait(0.9); }
    // a disguise shows in the mirror: become the mannequin on 2nd place
    const st2 = dim.getEntities({ type: 'skin_podium:statue', location: podium.location, maxDistance: 4 }).find(s => s.getDynamicProperty('sp:rank') === 2);
    const slot = st2?.getProperty('skin_podium:target');
    const mq = world.getAllPlayers().find(q => q.name.startsWith('Mannequin_') && q.getProperty('mimic:slot') === slot);
    if (mq) {
      run_(`skinchanger:skin change @s "${mq.name}"`);
      bar('§e8/8§r 変身すると、鏡にも変身後の姿が映ります');
      await wait(4);
      run_('skinchanger:skin reset @s');
      await wait(1);
    }

    // finale
    p.teleport(fr.L(0, 0, 0), { rotation: { x: 5, y: state.yaw } });
    cam(fr.L(-3, 0, 5), fr.L(9, 1, 1.5), 2);
    title('§l§6Skin Studio', '§f表彰台・スキン像・マネキン・HUD・鏡');
    await wait(4);
    tell(p, 'デモはここまで。§b/scriptevent studio:clean§r（またはガイドのメニュー）で片付けて元に戻せます。');
    console.log('[Skin Studio] demo done');
  } catch (e) {
    if (String(e?.message ?? e) !== 'aborted') { console.warn(`[Skin Studio] demo: ${e}`); if (valid(p)) tell(p, `§cデモを中断しました: ${e}`); }
  } finally {
    if (valid(p)) {
      try { p.camera.clear(); } catch (_) {}
      try { p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true); } catch (_) {}
    }
    running = undefined;
  }
}

// ---------- the guide item
async function guideMenu(p) {
  const f = new ActionFormData().title('§lSkin Studio ガイド').body(
    'スキンを、表彰台と鏡に。\n\n' +
    '・表彰台/鏡：スポーンエッグで置いて、使用(右クリック/長押し)で設定\n' +
    '・画面表示：/scriptevent podium:hud\n・スキン保管庫：/scriptevent podium:vault\n' +
    '・変身：/skinchanger:skin change @s 相手');
  const acts = [];
  f.button('§6紹介デモを全部見る'); acts.push('demo');
  if (loadState()) { f.button('§c紹介ステージを片付ける'); acts.push('clean'); }
  f.button('表彰台を目の前に置く'); acts.push('podium');
  f.button('鏡を目の前に置く'); acts.push('mirror');
  f.button('画面表示(HUD)の設定'); acts.push('hud');
  f.button('スキン保管庫'); acts.push('vault');
  const res = await f.show(p);
  if (res.canceled) return;
  const a = acts[res.selection];
  if (a === 'demo') tour(p, false);
  else if (a === 'clean') cleanup(p);
  else if (a === 'podium' || a === 'mirror') {
    const r = p.getRotation().y * Math.PI / 180, l = p.location;
    const d = a === 'podium' ? 4 : 3;
    p.dimension.spawnEntity(`skin_podium:${a}`, { x: l.x - Math.sin(r) * d, y: Math.floor(l.y), z: l.z + Math.cos(r) * d });
  } else if (a === 'hud') p.runCommand('scriptevent podium:hud');
  else if (a === 'vault') p.runCommand('scriptevent podium:vault');
}
const lastUse = new Map();
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!(source instanceof Player) || itemStack?.typeId !== GUIDE) return;
  const now = system.currentTick;
  if (now - (lastUse.get(source.id) ?? -100) < 8) return;
  lastUse.set(source.id, now);
  guideMenu(source).catch(e => console.warn(`[Skin Studio] guide: ${e}`));
});
system.afterEvents.scriptEventReceive.subscribe(e => {
  if (!e.id.startsWith('studio:')) return;
  const p = e.sourceEntity instanceof Player ? e.sourceEntity : undefined;
  if (e.id === 'studio:clean') { system.run(() => cleanup(p)); return; }
  if (!p) return;
  if (e.id === 'studio:demo') system.run(() => tour(p, e.message.trim() === 'fast'));
  else if (e.id === 'studio:guide') system.run(() => { try { p.getComponent('inventory').container.addItem(new ItemStack(GUIDE, 1)); } catch (_) {} });
});
// the tour stops (and the stage stays, for studio:clean) if its viewer leaves
world.afterEvents.playerLeave.subscribe(({ playerId }) => { if (running?.id === playerId) running.abort = true; });
// a hint once per player
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.getDynamicProperty('sd:hinted')) return;
  player.setDynamicProperty('sd:hinted', true);
  system.runTimeout(() => tell(player, 'ガイド: §b/scriptevent studio:guide§r ／ 紹介デモ: §b/scriptevent studio:demo§r'), 60);
});

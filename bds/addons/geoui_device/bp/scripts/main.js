// GeoUI device check (bds-lab: bds/geoui/screen/device.mjs makes this file — change that, not this).
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
  const [verb, ...rest] = e.id.split(':')[1] ? [e.id.split(':')[1], ...String(e.message).trim().split(/\s+/)] : [];
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

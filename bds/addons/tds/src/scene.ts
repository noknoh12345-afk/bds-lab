// The expedition's scenes (the plan's second layer: looks and sounds only, never a number of the game). On an expedition:
// - the time of day follows the waves: morning at the first, dusk at the last, midnight for the Hidden Wave (the day cycle is held)
// - a boss brings rain (thunder in the hard modes), turns the camera to the entrance gate for a moment and shakes it; its name
//   shows as a title (a player holding a tower slot keeps the view)
// - the hard modes have a fog of their own (rp/fogs, ours)
// - the exit gate breaks as the base loses health (below 75, 50 and 25 %; all of it when the base falls)
// - a win sets off fireworks over the camp; a loss brings the gate down and fades the screen
// Every scene is logged ("scene") for the tests; the world is touched only at the game's own speed and not headless.
// /tds:scene <what> on|off turns each off (kept in the world).
import { world, system, WeatherType, EasingType, CameraShakeType } from '@minecraft/server';
import * as G from './game';
import { modes, enemies } from './defs';
import { cmdAny } from './kit';

const KINDS = ['time', 'weather', 'fog', 'bosscam', 'gate', 'end'] as const;
type Kind = (typeof KINDS)[number];
const dim = () => world.getDimension('overworld');
const say = (what: string, o: Record<string, unknown> = {}) => G.log('scene', { what, ...o });
const live = () => !G.headless && G.simSpeed() <= 1;
function on(k: Kind) { try { const s = JSON.parse((world.getDynamicProperty('tds:scene') as string) ?? '{}'); return s[k] !== false; } catch { return true; } }
const FOG: Record<string, string> = { Molten: 'tds:fog_molten', Fallen: 'tds:fog_fallen', Frost: 'tds:fog_frost', Voidcore: 'tds:fog_void', Hardcore: 'tds:fog_hard' };
const HARD = new Set(['Fallen', 'Hardcore', 'Voidcore']);
const TAG = 'tds_match';
const players = (m: G.Match) => world.getAllPlayers().filter((p) => m.players.includes(p.name));

let seen = new Set<string>(), gateStep = 0, weather = '', heldCycle = false;

function timeFor(m: G.Match) {
  const md = modes[m.mode]; if (m.wave > md.waves) return 18000;
  const f = md.waves > 1 ? (Math.max(1, m.wave) - 1) / (md.waves - 1) : 0;
  return Math.round(1000 + 12000 * f);
}
function setTime(m: G.Match) {
  const t = timeFor(m); say('time', { wave: m.wave, t });
  if (!live() || !on('time')) return;
  try { if (world.gameRules.doDayLightCycle) { world.gameRules.doDayLightCycle = false; heldCycle = true; } } catch { /* older engine */ }
  try { world.setTimeOfDay(t); } catch { /* not allowed */ }
}
function setWeather(m: G.Match, boss: boolean) {
  const w = boss ? (HARD.has(m.mode) ? 'Thunder' : 'Rain') : m.mode === 'Frost' ? 'Rain' : 'Clear';
  if (w === weather) return; weather = w; say('weather', { w });
  if (!live() || !on('weather')) return;
  try { dim().setWeather(WeatherType[w as keyof typeof WeatherType], 20 * 600); } catch { /* not allowed */ }
}
function bosscam(m: G.Match, name: string) {
  say('bosscam', { boss: name }); setWeather(m, true);
  if (!live() || !on('bosscam') || !m.site) return;
  const g = m.site.gateIn, c = m.site.camp, dx = c[0] - g[0], dz = c[2] - g[2], l = Math.hypot(dx, dz) || 1;
  const at = { x: g[0] + (dx / l) * 9, y: g[1] + 5, z: g[2] + (dz / l) * 9 }, look = { x: g[0], y: g[1] + 1, z: g[2] };
  for (const p of players(m)) {
    const held = p.getComponent('inventory')?.container?.getItem(p.selectedSlotIndex)?.typeId ?? '';
    try { p.onScreenDisplay.setTitle(`§c${name}`, { subtitle: { translate: 'tds.scene.boss' }, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 }); } catch { /* left */ }
    try { p.playSound('mob.wither.spawn', { volume: 0.4 }); } catch { /* left */ }
    try { p.camera.addShake({ intensity: 0.25, duration: 1.2, type: CameraShakeType.Positional }); } catch { /* older engine */ }
    if (/^tds:slot_/.test(held)) continue;   // placing a tower: the view stays
    try {
      p.camera.setCamera('minecraft:free', { location: at, facingLocation: look, easeOptions: { easeTime: 0.8, easeType: EasingType.InOutSine } });
      system.runTimeout(() => { try { p.camera.clear(); } catch { /* left */ } }, 50);
    } catch { /* no camera here */ }
  }
}
function breakGate(m: G.Match, step: number) {
  say('gate', { step });
  const b = m.site?.gateBlocks; if (!b?.length || !live() || !on('gate')) return;
  const from = Math.ceil((b.length * (step - 1)) / 4), to = step >= 4 ? b.length : Math.ceil((b.length * step) / 4);
  for (let i = from; i < to; i++) {
    const [x, y, z] = b[i];
    try { dim().runCommand(`setblock ${x} ${y} ${z} air`); dim().spawnParticle('minecraft:large_explosion', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }); } catch { /* unloaded */ }
  }
  try { dim().playSound('random.explode', { x: b[0][0], y: b[0][1], z: b[0][2] }, { volume: 0.5 }); } catch { /* unloaded */ }
}
function finale(m: G.Match, r: 'win' | 'lose') {
  say('end', { result: r });
  if (r === 'lose') { while (gateStep < 4) breakGate(m, ++gateStep); }
  if (!live() || !on('end') || !m.site) return;
  const c = m.site.camp;
  if (r === 'win') for (let i = 0; i < 8; i++) system.runTimeout(() => {
    const at = { x: c[0] - 0.5 + (Math.random() * 8 - 4), y: c[1] + 1, z: c[2] - 0.5 + (Math.random() * 8 - 4) };
    try { dim().spawnEntity('minecraft:fireworks_rocket' as never, at); dim().spawnParticle('minecraft:totem_particle', { x: at.x, y: at.y + 6, z: at.z }); } catch { /* unloaded */ }
  }, i * 8);
  else for (const p of players(m)) { try { p.camera.fade({ fadeColor: { red: 0, green: 0, blue: 0 }, fadeTime: { fadeInTime: 0.6, holdTime: 1.2, fadeOutTime: 1.2 } }); } catch { /* older engine */ } }
}
function lift(m?: G.Match) {
  for (const p of m ? players(m) : world.getAllPlayers()) { try { p.fogSettings.remove(TAG); } catch { /* older engine */ } }
  if (heldCycle) { heldCycle = false; try { world.gameRules.doDayLightCycle = true; } catch { /* older engine */ } }
}

G.onStart.push((m, ps) => {
  seen = new Set(); gateStep = 0; weather = '';
  if (!m.site) return;
  const fog = FOG[m.mode];
  if (fog) { say('fog', { fog }); if (live() && on('fog')) for (const p of ps) { try { p.fogSettings.push(fog, TAG); } catch { /* older engine */ } } }
});
G.onWave.push((m) => {
  if (!m.site) return;
  setTime(m);
  const boss = (modes[m.mode].wave[String(m.wave)] ?? []).some((g) => enemies[g.e]?.boss);
  if (!boss) setWeather(m, false);
});
G.onEnd.push((m, r) => { if (!m.site) return; finale(m, r); system.runTimeout(() => lift(m), 200); });
const stopSite = G.siteHooks.stop;
G.siteHooks.stop = () => { stopSite?.(); lift(); };
// a boss on the road for the first time, and the base's health: checked every second
system.runInterval(() => {
  const m = G.M; if (!m?.site || m.over) return;
  for (const e of m.enemies) if (e.boss && !seen.has(e.name)) { seen.add(e.name); bosscam(m, e.name); }
  const f = m.baseHP / Math.max(1, m.maxHP), step = f <= 0 ? 4 : f < 0.25 ? 3 : f < 0.5 ? 2 : f < 0.75 ? 1 : 0;
  while (gateStep < step) breakGate(m, ++gateStep);
}, 20);

cmdAny('tds:scene', 'Expedition scenes on or off: time, weather, fog, bosscam, gate, end, all', { what: [...KINDS, 'all'], scene: ['on', 'off'] }, (_, a) => {
  let s: Record<string, boolean> = {}; try { s = JSON.parse((world.getDynamicProperty('tds:scene') as string) ?? '{}'); } catch { /* new */ }
  for (const k of a.what === 'all' ? KINDS : [a.what]) s[k] = a.scene === 'on';
  world.setDynamicProperty('tds:scene', JSON.stringify(s));
  return `Scenes: ${KINDS.map((k) => `${k} ${s[k] === false ? 'off' : 'on'}`).join(', ')}`;
}, true);
cmdAny('tds:basehp', 'Set the base health of the match (test)', { n: 'int' }, (_, a) => { const m = G.M; if (!m) return 'no match'; m.baseHP = a.n; return `base ${a.n}/${m.maxHP}`; }, true);

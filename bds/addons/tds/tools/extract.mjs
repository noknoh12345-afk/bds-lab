// wiki cache → data/*.json (deterministic; rerun any time)
import fs from 'node:fs'; import { waves } from './waves.mjs';
const C = n => { try { return fs.readFileSync(new URL(`../.cache/${n.replace(/[^\w.-]+/g, '_')}.wt`, import.meta.url), 'utf8'); } catch { return ''; } };
const D = new URL('../data/', import.meta.url).pathname; fs.mkdirSync(D, { recursive: true });
const unknown = [];
const strip = s => (s ?? '').replace(/\{\{WikiAb\|([^}]*)\}\}/g, '$1').replace(/<ref[^>]*\/>/g, '').replace(/<ref.*?<\/ref>/gs, '').replace(/\[\[File:[^\]]*\]\]/g, '').replace(/\{\{(?:Money|Coins|Gem|Exp|TowerExp|Defense|Level)\|?([^}]*)\}\}/g, '$1')
  .replace(/\{\{Color\|[^|}]*\|([^}]*)\}\}/g, '$1').replace(/\{\{Attr\|([^|}]*)(?:\|([^}]*))?\}\}/g, (_, a, b) => b ? `${a} ${b}` : a).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<[^>]+>/g, ' ').trim();
const num = s => { const m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : null; };
const field = (t, k) => t.match(new RegExp(`^\\|${k} ?=((?:.|\\n(?!\\|[a-z_\\-0-9]+ ?=|\\}\\}))*)`, 'm'))?.[1] ?? null;
const key = h => strip(h).replace(/\$[A-Z0-9-]+\$/g, '').trim().toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
const det = s => { s = strip(s ?? ''); if (!s || /^(N\/A|None|No)$/i.test(s)) return null; const l = s.match(/Level (\d+)/i); return l ? +l[1] : 0; };

// ---------- towers ----------
const cats = JSON.parse(fs.readFileSync(new URL('../.cache/cats.json', import.meta.url)));
const towers = {};
for (const [cat, names] of Object.entries(cats)) for (const name of names) {
  const t = C(name); if (!t.includes('TowerInfobox')) { unknown.push({ tower: name, why: 'no infobox' }); continue; }
  const ib = t.slice(t.indexOf('TowerInfobox'));
  const tab = t.slice(t.search(/\{\| class="wikitable stats-table"/));
  const lines = tab.split('\n'); const hi = lines.findIndex(l => /^! ?Level !!/.test(l));
  if (hi < 0) { unknown.push({ tower: name, why: 'no stats table' }); continue; }
  const cols = lines[hi].replace(/^!\s*/, '').split('!!').map(key);
  const rows = []; let cur = null;
  for (const l of lines.slice(hi + 1)) { if (/^\|\}/.test(l)) break; if (/^\|-/.test(l)) { if (cur) rows.push(cur); cur = ''; continue; } if (cur !== null) cur += (cur ? ' ' : '') + l.replace(/^\|\s?/, ''); }
  if (cur) rows.push(cur);
  const costs = (t.match(/^\$COST\$ = (.*)$/m)?.[1] ?? '').split(';').map(num);
  const levels = rows.map(r => r.split('||').map(c => strip(c))).filter(r => /^\d+/.test(r[0])).map((r, i) => {
    const o = {}; cols.forEach((c, j) => { if (!c || /^(level|totalCost|dps|costEfficiency|maxDps|maxCostEfficiency|combinedDps|totalElapsedDamage)/.test(c)) return; const v = r[j]; if (v == null || v === '' || v.startsWith('$')) return; const n = num(v); o[c] = n !== null && /^[-\d.,]+\s*(s|%|x)?$/i.test(v.trim()) ? n : v; });
    o.cost = costs[i] ?? null; return o;
  });
  // forward-fill unchanged values
  for (let i = 1; i < levels.length; i++) for (const k in levels[i - 1]) if (!(k in levels[i])) levels[i][k] = levels[i - 1][k];
  if (levels.some(l => l.cost == null)) unknown.push({ tower: name, why: 'cost missing on some level' });
  const unlock = strip(field(ib, 'unlockcost')); const uk = /gem/i.test(field(ib, 'unlockcost') ?? '') ? 'gems' : /level/i.test(field(ib, 'unlockcost') ?? '') ? 'level' : /free/i.test(unlock) ? 'free' : 'coins';
  towers[name] = {
    category: cat, unlock: { kind: uk, value: uk === 'free' ? 0 : num(unlock) }, role: strip(field(ib, 'role')) || null,
    placement: /cliff/i.test(field(ib, 'placement') ?? '') ? (/ground/i.test(field(ib, 'placement')) ? 'both' : 'cliff') : 'ground',
    footprint: num(strip(field(ib, 'footprint'))) ?? 1.5, limit: num(strip(field(ib, 'placement_limit'))),
    damageType: strip(field(ib, 'damagetype')) || null, sell: num(strip(field(ib, 'basesellingprice'))),
    detect: { hidden: det(field(ib, 'hidden_detection')), lead: det(field(ib, 'lead_detection')), flying: det(field(ib, 'flying_detection')) },
    immune: strip(field(ib, 'immune')) || null, levels, src: `https://tds.fandom.com/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`,
  };
}

// ---------- modes ----------
const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore'];
const modes = {}; const used = new Set(); const roster = JSON.parse(fs.readFileSync(new URL('../.cache/modeenemies.json', import.meta.url)));
for (const m in roster) roster[m].forEach(e => used.add(e));
const CASH = { Easy: '(200+(w-1)*160)*(1-0.1*p)', Casual: 'w*200', Intermediate: '200+(w-1)*150', Molten: '(205+(w-1)*75)/(1-0.1*p)', Fallen: '(180+50*w)/p', Hardcore: '(325+50*w)/p' };
for (const m of MODES) {
  const t = C(`${m} Mode`); const ib = t.slice(t.indexOf('ModeInfobox'));
  const w = waves(t); Object.values(w).flat().forEach(x => used.add(x.e));
  const rw = strip(field(ib, 'rewards'));
  const timers = []; const tt = t.slice(t.search(/!Wave Timer/)); for (const r of tt.split('|}')[0].split('|-').slice(1)) { const c = r.split('\n').map(x => x.replace(/^\|/, '').trim()).filter(Boolean).map(strip); const [a, b = a] = c[0].split('-').map(Number); const sec = s => /∞/.test(s) ? null : s.split(':').reduce((x, y) => x * 60 + +y, 0); timers.push({ from: a, to: b, timer: sec(c[1]), skipAfter: /N\/A/.test(c[2] ?? '') ? null : sec(c[2] ?? '0:20') }); }
  modes[m] = { waves: num(field(ib, 'waves')), level: num(strip(field(ib, 'level_requirement'))) ?? 0, startCash: num(strip(field(ib, 'starting_cash'))), baseHP: num(field(ib, 'max_health')) ?? 200,
    waveCash: CASH[m], rewards: { coins: num(rw), exp: num(rw.split(',')[1] ?? ''), gems: /gem/i.test(field(ib, 'rewards')) ? num(rw) : 0 }, timers, wave: w, src: `https://tds.fandom.com/wiki/${m}_Mode` };
  if (m === 'Hardcore') modes[m].rewards.coins = 0;
  if (!field(ib, 'max_health')) unknown.push({ mode: m, why: 'baseHP not on page; using 200 (Fallen value)' });
}

// ---------- enemies ----------
const pick = (s, mode) => {
  if (!s) return null; s = s.split('{{InfoboxContainer')[0].split('----')[0];
  const parts = s.split(/<br\s*\/?>/).map(x => strip(x)).filter(Boolean).map(x => ({ v: x, lab: (x.match(/\(([^)]*)\)\s*$/)?.[1] ?? '') }));
  return (parts.find(p => p.lab.split(/,|&/).map(x => x.trim()).some(x => x === mode || x === `${mode} Mode`)) ?? parts.find(p => /Most modes/i.test(p.lab)) ?? parts.find(p => !p.lab || /Default/i.test(p.lab)) ?? parts[0])?.v ?? null;
};
const enemies = {};
const enemiesAll = used;
for (const e of used) {
  const t = C(e); if (!t) { unknown.push({ enemy: e, why: 'page missing' }); continue; }
  const per = {};
  for (const m of MODES) { if (!Object.values(modes[m].wave).flat().some(x => x.e === e) && !roster[m]?.includes(e)) continue;
    const hp = pick(field(t, 'base_hp'), m), sp = pick(field(t, 'speed'), m), cs = pick(field(t, 'cash'), m), sh = pick(field(t, 'shield_hp'), m);
    const spd = sp ? num(sp.match(/\(([\d.]+)/)?.[1] ?? sp) : null; const every = cs?.match(/every (\d+)%/);
    per[m] = { hp: num(hp), speed: spd, cash: num(cs), ...(every && { cashEveryPct: +every[1] }), ...(sh && { shield: num(sh) }) };
    if (per[m].hp == null || per[m].speed == null) unknown.push({ enemy: e, mode: m, why: 'hp/speed unreadable' });
  }
  const yes = k => /yes/i.test(strip(field(t, k)?.split('<br')[0] ?? ''));
  const imm = strip(field(t, 'immunity') ?? '').replace(/BossList\|?\w*/, 'Boss');
  enemies[e] = { hidden: yes('hidden'), flying: yes('fly'), lead: yes('lead'), ghost: yes('ghost'), boss: /Boss/.test(imm) || MODES.some(m => Object.values(modes[m].wave).flat().some(x => x.e === e && x.mods?.includes('Boss'))) || /BossList/.test(field(t, 'immunity') ?? ''),
    defense: num(strip(field(t, 'defense') ?? '')) ?? 0, immune: (imm.match(/\b(Stun|Freeze|Burn|Splash Damage|Slowed)\b(?!\s*\(Variable)/g) ?? []),
    spawnedBy: [...(field(t, 'spawned_by') ?? '').split('{{InfoboxContainer')[0].matchAll(/\[\[(?:([^\]|]*)\|)?([^\]]*)\]\]/g)].map(x => x[1] ?? x[2]), per, src: `https://tds.fandom.com/wiki/${encodeURIComponent(e.replace(/ /g, '_'))}` };
}
// abilities from the infobox (|abilityN = ..., |abilityN_cooldown = ...)
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, forty: 40 };
const nOf = w => NUM[w?.toLowerCase()] ?? (Number.isFinite(+w) ? +w : null);
function abilities(name, t) {
  const out = [];
  for (const m of t.matchAll(/^\|ability(\d) ?=(.*)$/gm)) {
    const raw = m[2].replace(/<ref.*?(<\/ref>|\/>)/g, ''), txt = strip(raw);
    const cdRaw = t.match(new RegExp(`^\\|ability${m[1]}_cooldown ?=(.*)$`, 'm'))?.[1];
    const cdN = cdRaw ? strip(cdRaw).split('-').map(Number).filter(Number.isFinite) : [];
    const cd = cdN.length ? cdN.reduce((a, b) => a + b) / cdN.length : null;
    const title = txt.split(/ [-–] /)[0].trim();
    const links = [...raw.matchAll(/(?:\b(\w+) )?\[\[(?:([^\]|]+)\|)?([^\]]+)\]\](?:e?s)?/g)].map(x => ({ n: nOf(x[1]), name: (x[2] ?? x[3]).trim() })).filter(x => enemiesAll.has(x.name) && x.name !== name);
    const num = re => { const x = txt.match(re); return x ? +x[1].replace(/,/g, '') : null; };
    const radius = num(/radius of ([\d.]+)/i) ?? num(/range of ([\d.]+)/i);
    const a = { title, cd };
    if (/upon (its )?death/i.test(txt) && /spawn/i.test(txt) && links.length) out.push({ ...a, kind: 'deathSpawn', spawn: links.map(l => ({ name: l.name, n: l.n ?? 1 })) });
    else if (/summon/i.test(txt) && links.length) { const pool = /can be|chance/i.test(txt); const total = nOf(txt.match(/summon(?:s|ing)?(?: in)? (\w+)/i)?.[1]) ?? 1; out.push({ ...a, kind: 'summon', spawn: pool ? [{ pool: links.map(l => l.name), n: total }] : links.map(l => ({ name: l.name, n: l.n ?? 1 })) }); }
    if (/stun(?:s|ning)? (?:all )?(?:the )?towers?/i.test(txt) || /towers? .*?stun/i.test(txt)) out.push({ ...a, kind: 'stun', dur: num(/(?:for|by) ([\d.]+) seconds?/i) ?? 3, radius, unitDmg: num(/([\d,]+) damage to units/i) });
    const fat = num(/([\d.]+)% Fatigue Debuff/i), rng = num(/([\d.]+)% Range Debuff/i);
    if (fat || rng) out.push({ ...a, kind: 'debuff', onDeath: /upon (its )?death/i.test(txt), fatigue: fat ?? 0, range: rng ?? 0, dur: num(/for ([\d.]+) seconds/i) ?? 10, radius, unitDmg: num(/deals? ([\d,]+) damage to units/i) });
    const heal = txt.match(/heals? any enemy in a radius of ([\d.]+) by ([\d,]+) every ([\d.]+)/i);
    if (heal) out.push({ ...a, kind: 'heal', radius: +heal[1], amount: +heal[2].replace(/,/g, ''), every: +heal[3] });
    const sp = txt.match(/upon death.*?([\d.]+)% speed buff.*?for ([\d.]+) seconds/i);
    if (sp) out.push({ ...a, kind: 'speedAura', onDeath: true, pct: +sp[1], dur: +sp[2], radius: radius ?? 6 });
    const dg = txt.match(/Gains ([\d.]+)% defense as its health is reduced until it reaches at least ([\d.]+)% defense/i);
    if (dg) out.push({ ...a, kind: 'boneArmor', step: +dg[1], max: +dg[2] });
  }
  for (const a of out) { if ((a.kind === 'summon' || a.kind === 'stun' || a.kind === 'debuff' && !a.onDeath) && a.cd == null) { a.cd = 10; unknown.push({ enemy: name, why: `${a.title}: cooldown not on the page (10 s)` }); } if ((a.kind === 'stun' || a.kind === 'debuff' && !a.onDeath) && a.radius == null) { a.radius = 12; unknown.push({ enemy: name, why: `${a.title}: area not given (12 studs)` }); } }
  return out;
}
for (const [n, e] of Object.entries(enemies)) { const ab = abilities(n, C(n)); if (ab.length) e.abilities = ab; }

// children: who spawns whom
for (const [n, e] of Object.entries(enemies)) for (const p of e.spawnedBy) if (enemies[p] && !enemies[p].spawns?.includes(n)) (enemies[p].spawns ??= []).push(n);
for (const [n, e] of Object.entries(enemies)) if (e.spawns && !e.abilities?.some(a => a.spawn)) { e.spawnMode = e.boss || /Necromancer|Summoner|Grave Digger|Necrotic|Mystery|Mandrake|Mandragora/.test(n) ? 'periodic' : 'death'; unknown.push({ enemy: n, why: `spawn mode/count guessed (${e.spawnMode})` }); }

for (const [k, v] of Object.entries({ spawnGap: '0.6 s between enemies of a group', groupGap: '1 s between groups', clearWait: 'next wave 5 s after a clear', childCount: '2 children per spawn/summon', summonEvery: 'summoners every 8 s', units: 'units: 4 studs/s, 6-stud gun range, 3 per tower, ram = min(hp)', killCash: 'kill cash to the tower owner', maps: 'Grassland is a lab layout; wiki map images not yet analysed', abilities: 'active abilities (Call to Arms, airstrikes, ...) not simulated', medic: 'Medic/healing: towers have no HP', rewards: 'Easy reward formula applied to every mode' })) unknown.push({ rule: k, why: v });
const w = (f, o) => fs.writeFileSync(D + f, JSON.stringify(o, null, 0));
w('towers.json', towers); w('modes.json', modes); w('enemies.json', enemies); w('_unknown.json', unknown);
console.log('towers', Object.keys(towers).length, 'modes', Object.keys(modes).length, 'enemies', Object.keys(enemies).length, 'unknown', unknown.length);

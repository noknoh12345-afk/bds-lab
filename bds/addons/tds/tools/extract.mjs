// wiki cache → data/*.json (deterministic; rerun any time)
import fs from 'node:fs'; import { waves, parse } from './waves.mjs';
const C = n => { try { return fs.readFileSync(new URL(`../.cache/${n.replace(/[^\w.-]+/g, '_')}.wt`, import.meta.url), 'utf8'); } catch { return ''; } };
const D = new URL('../data/', import.meta.url).pathname; fs.mkdirSync(D, { recursive: true });
const unknown = [];
const w0 = (f, o) => fs.writeFileSync(D + f, JSON.stringify(o, null, 0));
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
  const tab = t.slice(t.search(/\{\|\s*class="wikitable stats-table"/));
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
  const uraw = field(ib, 'unlockcost') ?? field(ib, 'towercost') ?? '', ucost = uraw.replace(/\{\{Robux\|[^}]*\}\}/g, ''), unlock = strip(ucost);
  const uk = /\{\{Gem/i.test(ucost) ? 'gems' : /\{\{Coins/i.test(ucost) ? 'coins' : /\{\{Level/i.test(ucost) ? 'level' : /free/i.test(unlock) ? 'free' : 'coins';
  const uval = uk === 'free' ? 0 : num(uk === 'level' ? ucost.match(/\{\{Level\|([\d,]+)/)?.[1] : ucost.match(/\{\{(?:Gem|Coins)\|([\d,]+)/)?.[1] ?? unlock);
  const triumph = ucost.match(/Triumph \[\[([^\]|]+)/)?.[1];
  towers[name] = {
    category: cat, unlock: { kind: uk, value: uval, ...(triumph && { triumph }) }, role: strip(field(ib, 'role')) || null,
    placement: /cliff/i.test(field(ib, 'placement') ?? '') ? (/ground/i.test(field(ib, 'placement')) ? 'both' : 'cliff') : 'ground',
    footprint: num(strip(field(ib, 'footprint'))) ?? 1.5, limit: num(strip(field(ib, 'placement_limit'))),
    damageType: strip(field(ib, 'damagetype')) || null, sell: num(strip(field(ib, 'basesellingprice'))),
    detect: { hidden: det(field(ib, 'hidden_detection')), lead: det(field(ib, 'lead_detection')), flying: det(field(ib, 'flying_detection')) },
    immune: strip(field(ib, 'immune')) || null, levels, src: `https://tds.fandom.com/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`,
  };
}

// level gates (Levels page): "X is now purchasable in the store" / "Hardcore towers are now purchasable" at a level
const LV = C('Levels'), levelRewards = {};
for (const r of LV.slice(LV.indexOf('!Rewards and Unlocks')).split('|-').slice(1)) {
  const c = r.split('\n').map(x => x.replace(/^\|/, '').trim()).filter(Boolean); const lv = num(c[0]); if (lv == null || !c[1]) continue;
  for (const m of c[1].matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\] is now purchasable/g)) if (towers[m[1]]) towers[m[1]].unlock.level = lv;
  if (/Hardcore towers are now purchasable/.test(c[1])) for (const t of Object.values(towers)) if (t.category === 'Hardcore') t.unlock.level = lv;
  const co = c[1].match(/\{\{Coins\|([\d,]+)\}\}/); if (co) levelRewards[lv] = { coins: num(co[1]) };
  if (/Fifth tower slot/i.test(c[1])) levelRewards.fifthSlot = lv;
}
for (const [n, t] of Object.entries(towers)) { const b = num(strip(field(C(n), 'basecost'))); if (b != null && t.levels[0] && b !== t.levels[0].cost) unknown.push({ tower: n, why: `infobox base cost ${b} vs stats table ${t.levels[0].cost}; the table is used` }); }

// tower abilities ({{Ability|Level Unlock=..|Cooldown Time=..|Ability Title=..|Cost=..|Information=..}}); first tab only (PVP tabs follow)
// every {{Ability}} of the towers is reproduced in src/abilities.ts; values the page does not give are listed below and in _unknown.json
const SIM = new Set(['Call to Arms', 'Airstrike', 'Frost Grenade', 'War Cry', 'Toggle Reverse', 'Ubercharge', 'Sweeper', 'Support Caravan', 'Drop the Beat', 'Aggressive Toxins', 'Patrol', 'FPS', 'Air-Drop', 'Reposition', 'Raise the Dead', 'Hologram Tower', 'Helicopter Reposition', 'SWAT Van', 'Bounty', 'Missile', 'Bee Swarm Grenade', 'Equip Bombs', 'Thorns', 'Heatwave', 'Ice Turret', 'Convoy', "Warrior's Call"]);
for (const [name, tw] of Object.entries(towers)) {
  const t = C(name), seen = new Set(), list = [];
  for (const m of t.matchAll(/\{\{Ability\|([\s\S]*?)\n\}\}/g)) {
    const f = Object.fromEntries(m[1].split(/\|(?=[A-Z][\w ]+=)/).map(x => { const i = x.indexOf('='); return [x.slice(0, i).trim(), strip(x.slice(i + 1)).replace(/\s+/g, ' ').trim()]; }));
    const title = (f['Ability Title'] ?? '').replace(/This ability.*$/, '').trim(); if (!title || seen.has(title)) continue; seen.add(title);
    const cds = [...(f['Cooldown Time'] ?? '').matchAll(/([\d.]+)s(?: Cooldown)?(?: \(Level (\d+)\))?/g)].map(x => [x[2] ? +x[2] : null, +x[1]]);
    const cdBy = cds.some(x => x[0] != null) ? Object.fromEntries(cds.filter(x => x[0] != null)) : undefined;
    list.push({ title, unlock: num(f['Level Unlock']) ?? 0, path: (f['Level Unlock'] ?? '').match(/\d+([AB])/)?.[1] ?? null, cd: cds[0]?.[1] ?? null, ...(cdBy && { cdBy }), cost: num(f.Cost ?? '') ?? 0, simulated: SIM.has(title) });
    if (!SIM.has(title)) unknown.push({ tower: name, why: `ability "${title}" not simulated` });
  }
  if (list.length) tw.abilities = list;
}

// ---------- modes ----------
const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore', 'Frost', 'Voidcore'];
const modes = {}; const used = new Set(); const roster = JSON.parse(fs.readFileSync(new URL('../.cache/modeenemies.json', import.meta.url)));
for (const m in roster) roster[m].forEach(e => used.add(e));
// wave bonus per mode page ("the formula for calculating the wave bonus"); w = waves completed, p = players; mult = 1 - reduction for 1..4 players
const CASH = {
  Easy: { pieces: [{ to: 99, e: '(200+(w-1)*160)*(1-0.1*p)' }], mult: [1, 1, 1, 1] },
  Casual: { pieces: [{ to: 20, e: 'w*200' }, { to: 99, e: '300+(w-1)*350' }], mult: [1, 0.9, 0.85, 0.8] },
  Intermediate: { pieces: [{ to: 99, e: '200+(w-1)*150' }], mult: [1, 0.88, 0.79, 0.76] },
  Molten: { pieces: [{ to: 15, e: '250+((w-1)*60)**1.03' }, { to: 99, e: '300+((w-1)*75)**1.07' }], mult: [1, 0.9, 0.85, 0.8] },
  Fallen: { pieces: [{ to: 30, e: '300+((w-1)*60)**1.03' }, { to: 99, e: '300+((w-1)*60)**1.07' }], mult: [1, 0.7, 0.61, 0.6] },
  Hardcore: { pieces: [{ to: 99, e: '(325+50*w)/p' }], mult: [1, 0.52, 0.55, 0.55] },
};
// wave clear bonus (mode pages): solo / group share of the wave bonus; some modes also need an undamaged base; Hardcore has none (Waves page)
const CLEAR = { Easy: [0.35, 0.2, false], Casual: [0.35, 0.2, true], Intermediate: [0.35, 0.2, false], Molten: [0.4, 0.2, true], Fallen: [0.4, 0.2, true], Hardcore: [0, 0, false] };
// starting cash (Waves page): 500, Hardcore 900 solo / 750 duo / 600 trio
const START = { Hardcore: [900, 750, 600, 600] };
// the same three, read from each mode page; the hand tables above are kept as the fallback (and must agree where both exist)
const toExpr = (raw) => {
  let e = raw.replace(/\{\{Money\|([\d,.]+)\}\}/g, (_, n) => n.replace(/,/g, '')).replace(/'''?/g, '').replace(/<[^>]+>/g, '');
  e = e.replace(/([\d.]+)%/g, (_, n) => String(+n / 100)).replace(/Waves? Completed/gi, 'w').replace(/(?:Number of )?Players?(?: Count)?/gi, 'p')
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/[\[{]/g, '(').replace(/[\]}]/g, ')').replace(/\^/g, '**').replace(/[−–]/g, '-').replace(/\s+/g, '');
  return /^[\dwp+\-*/().]+$/.test(e) && /w/.test(e) ? e : null;
};
const evalCash = (c, w, p) => { const e = (c.pieces.find((x) => w <= x.to) ?? c.pieces[c.pieces.length - 1]).e; try { return Math.floor(Function('w', 'p', `return ${e}`)(w, p) * (c.mult[Math.min(4, Math.max(1, p)) - 1] ?? 1) + 1e-6); } catch { return NaN; } };
function cashOf(t) {
  const at = t.search(/formula for calculating (?:the )?wave bonus|has two wave bonuses|wave bonus is calculated as/i); if (at < 0) return null;
  let sec = t.slice(at, at + 5000); const cut = sec.search(/reduced using multipliers|\{\||\nBefore |Prior to /); const head = cut > 0 ? sec.slice(0, cut) : sec;
  const pieces = [];
  for (const x of head.matchAll(/(?:Between waves (\d+) (?:to|and) (\d+)[^\n]*\n)?:<big>([^\n]*?)<\/big>/g)) { const e = toExpr(x[3]); if (!e) return null; pieces.push({ to: x[2] ? +x[2] : 99, e }); }
  if (!pieces.length) return null; pieces[pieces.length - 1].to = 99;
  // the page's worked example ("on Wave N, the wave bonus is … rounded down to X … In duo, it is Y"), used to settle disagreements
  const ex = sec.match(/on Wave (\d+), the wave bonus is \{\{Money\|[\d.,]+\}\}, rounded down to \{\{Money\|([\d,]+)\}\}[\s\S]{0,300}?In duo, it is \{\{Money\|([\d,]+)\}\}/);
  const mult = [1, 1, 1, 1], tb = sec.indexOf('Total Reduction');
  if (tb >= 0) {
    const tab = sec.slice(sec.lastIndexOf('{|', tb), sec.indexOf('|}', tb));
    for (const r of tab.split('|-').slice(1)) { const c = r.split('\n').map((x) => x.replace(/^[|!]/, '').trim()).filter(Boolean); const i = ['Solo', 'Duo', 'Trio', 'Quad'].indexOf(c[0]); const v = num(c[c.length - 1]); if (i >= 0 && v != null) mult[i] = +(1 - v / 100).toFixed(4); }
    if (!/\|Quad/.test(tab)) mult[3] = mult[2];
  }
  return { pieces, mult, ...(ex && { example: { w: +ex[1], solo: num(ex[2]), duo: num(ex[3]) } }) };
}
function clearOf(t) {
  const s0 = t.slice(t.search(/The wave clear bonus/i)); if (!/The wave clear bonus/i.test(t)) return null;
  const sent = s0.slice(0, 600);
  if (/does not appear/i.test(sent.slice(0, 200))) return [0, 0, false];
  const x = sent.match(/It is ([\d.]+)% of the wave bonus(?: in solo,? while for duo, trio and quad it is ([\d.]+)%)?/i); if (!x) return null;
  return [+x[1] / 100, x[2] ? +x[2] / 100 : +x[1] / 100, /no damage was dealt to the base/i.test(sent.slice(0, 300))];
}
function startOf(raw) {
  if (!/Solo:/.test(raw ?? '')) return null;
  const g = (k) => num(raw.match(new RegExp(`${k}:\\s*\\*\\{\\{Money\\|([\\d,]+)`))?.[1] ?? '');
  const r = [g('Solo'), g('Duo'), g('Trio'), g('Quad')]; if (r[0] == null) return null;
  for (let i = 1; i < 4; i++) if (r[i] == null) r[i] = r[i - 1];
  return r;
}
function pickCash(m, t, W) {
  const got = cashOf(t), hand = CASH[m];
  if (!got && !hand) { unknown.push({ mode: m, why: 'wave bonus formula not readable; no wave bonus' }); return { pieces: [{ to: 99, e: '0' }], mult: [1, 1, 1, 1] }; }
  if (!got) { unknown.push({ mode: m, why: 'wave bonus formula not readable on the page; hand table used' }); return hand; }
  const ex = got.example; delete got.example;
  const fitsExample = (c) => !!ex && evalCash(c, ex.w, 1) === ex.solo && evalCash(c, ex.w, 2) === ex.duo;
  if (!hand) return got;
  for (let w = 1; w <= (W ?? 40); w++) for (let p = 1; p <= 4; p++) if (evalCash(got, w, p) !== evalCash(hand, w, p)) {
    if (fitsExample(got) && !fitsExample(hand)) { unknown.push({ mode: m, why: `the old hand table disagreed with the page at wave ${w}, ${p} players; the page (its worked example agrees) is used` }); return got; }
    unknown.push({ mode: m, why: `wave bonus read from the page differs from the hand table at wave ${w}, ${p} players; hand table used` }); return hand;
  }
  return got;
}
function pickClear(m, t) {
  const got = clearOf(t), hand = CLEAR[m];
  if (!got && !hand) { unknown.push({ mode: m, why: 'wave clear bonus not readable; none' }); return [0, 0, false]; }
  if (!got) return hand;
  if (hand && JSON.stringify(got) !== JSON.stringify(hand)) { unknown.push({ mode: m, why: `wave clear bonus read as ${JSON.stringify(got)}, hand table ${JSON.stringify(hand)} used` }); return hand; }
  return got;
}

// rewards (each mode page's ==Rewards== table): R ÷ (1 + [(N ÷ Current Wave) − 1]^k) + triumph bonus, per currency
const CUR = { Coins: 'coins', Gem: 'gems', Exp: 'exp', TowerExp: 'texp' };
function rewards(m, t, W, total) {
  const out = {}, sec = t.slice(t.indexOf('==Rewards=='), t.indexOf('==', t.indexOf('==Rewards==') + 12) > 0 ? t.indexOf('|}', t.indexOf('÷', t.indexOf('==Rewards=='))) : undefined);
  for (const x of sec.matchAll(/^\|\{\{(Coins|Gem|Exp|TowerExp)\|([\d,]+)\}\} ÷ \(1 \+ \[\((\d+) ÷ Current Wave\) - 1\](?:\^([\d.]+))?\)(?: \+ \{\{\1\|([\d,]+)\}\})?/gm)) {
    const F = { base: num(x[2]), n: +x[3], pow: x[4] ? +x[4] : 1, bonus: x[5] ? num(x[5]) : 0 };
    // the infobox gives the triumph total; when the formula's N disagrees with it and the mode's wave count fits, the wave count is used
    const want = num(total.match(new RegExp(`\\{\\{${x[1]}\\|([\\d,]+)`))?.[1] ?? ''), at = (G) => Math.floor(G.base / (1 + Math.pow(Math.max(0, G.n / W - 1), G.pow)) + G.bonus + 1e-9);
    if (want != null && at(F) !== want && at({ ...F, n: W }) === want) { unknown.push({ mode: m, why: `${CUR[x[1]]} reward formula says ${F.n} ÷ Current Wave; its infobox total ${want} needs ${W} (used)` }); F.n = W; }
    else if (want != null && at(F) !== want) unknown.push({ mode: m, why: `${CUR[x[1]]} reward at the last wave is ${at(F)}, infobox says ${want}` });
    out[CUR[x[1]]] = F;
  }
  if (!out.exp) unknown.push({ mode: m, why: 'reward table not found' });
  return out;
}
// health scale (|health_scale = 15% (Duo)<br/>25% (Trio)<br/>40% (Quad)): enemy health × (1 + scale) for 1..4 players
const hpScale = (s) => { const r = [0, 0, 0, 0]; for (const [i, k] of [[1, 'Duo'], [2, 'Trio'], [3, 'Quad']]) { const x = (s ?? '').match(new RegExp(`([\\d.]+)% \\(${k}\\)`)); if (x) r[i] = +x[1] / 100; } return r; };
for (const m of MODES) {
  const t = C(`${m} Mode`); const ib = t.slice(t.indexOf('ModeInfobox'));
  const w = waves(t); Object.values(w).flat().forEach(x => used.add(x.e));
  const rw = strip(field(ib, 'rewards'));
  const timers = []; const tt = t.slice(t.search(/!Wave Timer/)); for (const r of tt.split('|}')[0].split('|-').slice(1)) { const c = r.split('\n').map(x => x.replace(/^\|/, '').trim()).filter(Boolean).map(strip); const [a, b = a] = c[0].split('-').map(Number); const sec = s => /∞/.test(s) ? null : s.split(':').reduce((x, y) => x * 60 + +y, 0); timers.push({ from: a, to: b, timer: sec(c[1]), skipAfter: /N\/A/.test(c[2] ?? '') ? null : sec(c[2] ?? '0:20') }); }
  const W0 = num(field(ib, 'waves')), cash = pickCash(m, t, W0), clr = pickClear(m, t), st = startOf(field(ib, 'starting_cash')) ?? START[m] ?? null;
  if (START[m] && st && JSON.stringify(st) !== JSON.stringify(START[m])) unknown.push({ mode: m, why: `starting cash read as ${JSON.stringify(st)} (used); hand table ${JSON.stringify(START[m])}` });
  modes[m] = { waves: num(field(ib, 'waves')), level: num(strip(field(ib, 'level_requirement'))) ?? 0, startCash: num(strip(field(ib, 'starting_cash'))), baseHP: num(field(ib, 'max_health')) ?? 200,
    waveCash: cash, clear: { solo: clr[0], group: clr[1], noDamage: clr[2] }, startBy: st, rewards: rewards(m, t, num(field(ib, 'waves')), field(ib, 'rewards') ?? ''), hpScale: hpScale(field(ib, 'health_scale')), timers, wave: w, src: `https://tds.fandom.com/wiki/${m}_Mode` };
  if (!field(ib, 'max_health')) unknown.push({ mode: m, why: 'baseHP not on page; using 200 (Fallen value)' });
}
// party limits (Elevators page / Matchmaking page: Hardcore and Voidcore have no quads)
for (const m of ['Hardcore', 'Voidcore']) if (modes[m]) modes[m].maxPlayers = 3;
// Voidcore: entering needs a Hardcore triumph (Levels page) and skills are off there (Skills page)
if (modes.Voidcore) {
  if (/Voidcore[^\n]{0,80}requires previously beating[^\n]{0,10}Hardcore/i.test(LV)) modes.Voidcore.needsTriumph = 'Hardcore'; else { modes.Voidcore.needsTriumph = 'Hardcore'; unknown.push({ mode: 'Voidcore', why: 'Hardcore triumph gate not found on the Levels page (kept)' }); }
  if (/Voidcore/.test(C('Skills').slice(0, 4000))) modes.Voidcore.noSkills = true;
}
// Hidden Wave (its own page): Fallen waves 41 and "???" (= 42); dialogue cells are skipped, only enemy groups are read
const HW = C('Hidden Wave');
if (HW && modes.Fallen) {
  const ws = HW.slice(HW.indexOf('===Wave Structure==='), HW.indexOf('==Strategy=='));
  const tabs = ws.split('{|').slice(1).map((x) => x.split('|}')[0]);
  const lab = (c) => (/\?\?\?/.test(c) ? 42 : num(c));
  const timers = [];
  for (const r of (tabs[0] ?? '').split('|-').slice(1)) { const c = r.split('\n').map((x) => x.replace(/^\|/, '').trim()).filter(Boolean).map(strip); if (c.length < 2) continue; const w = lab(c[0]); if (!w) continue; timers.push({ from: w, to: w, timer: /∞/.test(c[1]) ? null : c[1].split(':').reduce((a, b) => a * 60 + +b, 0), skipAfter: null }); }
  let cur = null; const hw = {};
  for (const l of (tabs[1] ?? '').split('\n')) {
    const x = l.match(/^\|\s*(?:rowspan="\d+"\s*\|)?\s*(\d+|\?\?\?)\s*$/); if (x) { cur = lab(x[1]); continue; }
    if (cur && /\d+x\s*(?:''')?\[\[/.test(l) && !hw[cur]) hw[cur] = parse(l);
  }
  for (const [w, g] of Object.entries(hw)) { modes.Fallen.wave[w] = g; g.forEach((x) => used.add(x.e)); }
  const codes = HW.match(/type "(\d+)", "(\d+)" and "(\d+)"/)?.slice(1) ?? [];
  const rw = (field(HW, 'rewards') ?? '').split(/<br\s*\/?>/).map((v) => ({ label: v.match(/\{\{Color\|(\w+)\}\}/)?.[1] ?? strip(v).match(/\(([^)]*)\)\s*$/)?.[1] ?? '', gems: num(v.match(/\{\{Gem\|\+?([\d,]+)/)?.[1] ?? '') ?? 0, exp: num(v.match(/\{\{Exp\|([\d,]+)/)?.[1] ?? '') ?? 0, texp: num(v.match(/\{\{TowerExp\|([\d,]+)/)?.[1] ?? '') ?? 0 })).filter((r) => r.gems || r.exp);
  modes.Fallen.hidden = { codes, baseHP: num(HW.match(/base health needs to be reduced to (\d+)/)?.[1] ?? '') ?? 1, king: HW.match(/on Wave 40, the \[\[([^\]|]+)/)?.[1] ?? 'Fallen King', kingWithin: num(HW.match(/defeated in under (\d+) seconds/)?.[1] ?? '') ?? 60, timers, rewards: rw };
  for (const tm of timers) if (!modes.Fallen.timers.some((x) => x.from === tm.from)) modes.Fallen.timers.push(tm);
  if (codes.length !== 3) unknown.push({ mode: 'Fallen', why: 'Hidden Wave codes not read' });
  if (!hw[41] || !hw[42]) unknown.push({ mode: 'Fallen', why: 'Hidden Wave enemy groups not read' });
  unknown.push({ mode: 'Fallen', why: 'Hidden Wave rewards are listed per difficulty label; the last regular label is used, the first-triumph gem bonus is added once' });
}
// Sandbox (its own page): infinite cash, no waves of its own, no rewards; enemies and waves are summoned by the players
{
  const t = C('Sandbox Mode'), ib = t.slice(t.indexOf('ModeInfobox'));
  modes.Sandbox = { waves: 0, level: num(strip(field(ib, 'level_requirement') ?? '')) ?? 250, startCash: num(strip(field(ib, 'starting_cash') ?? '')) ?? 9999999999, startBy: null, baseHP: num(field(ib, 'max_health') ?? '') ?? 200,
    waveCash: { pieces: [{ to: 99, e: '0' }], mult: [1, 1, 1, 1] }, clear: { solo: 0, group: 0, noDamage: false }, rewards: {}, hpScale: [0, 0, 0, 0], timers: [], wave: {}, sandbox: true, src: 'https://tds.fandom.com/wiki/Sandbox_Mode' };
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
    const noSh = strip((field(t, 'speed') ?? '').split('{{InfoboxContainer')[0]).match(/\(([\d.]+), No Shield\)/);
    per[m] = { hp: num(hp), speed: spd, cash: num(cs), ...(every && { cashEveryPct: +every[1] }), ...(sh && { shield: num(sh) }), ...(noSh && { speedNoShield: +noSh[1] }) };
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
    const sp = txt.match(/upon (?:its )?death.*?([\d.]+)% speed (?:buff|boost).*?for ([\d.]+) seconds/i);
    if (sp) out.push({ ...a, kind: 'speedAura', onDeath: true, pct: +sp[1], dur: +sp[2], radius: radius ?? 6 });
    const dg = txt.match(/Gains ([\d.]+)% defense as its health is reduced until it reaches at least ([\d.]+)% defense/i);
    if (dg) out.push({ ...a, kind: 'boneArmor', step: +dg[1], max: +dg[2] });
    const big = (x) => +String(x).replace(/,/g, '');
    // phases: at a health threshold the enemy changes (becomes hidden, a new speed, Aggro, a shield, a pause)
    const ph = txt.match(/(?:upon|when|after)[^.]*?(reaching|reaches|going below|losing) (?:(\d+(?:\.\d+)?)% of its (?:default )?health|half(?: of its default)? health|([\d,]+) health)/i) ?? (/(?:^|\. )at half health/i.test(txt) ? [null, 'reaching', '50', null] : null);
    if (ph) {
      const p = { ...a, kind: 'phase', at: ph[2] ? (/losing/i.test(ph[1]) ? 1 - +ph[2] / 100 : +ph[2] / 100) : ph[3] ? null : 0.5, atHp: ph[3] ? big(ph[3]) : null };
      if (/becomes (?:a )?hidden/i.test(txt)) p.hidden = true;
      const v = txt.match(/speed (?:is set to|to) ([\d.]+)/i); if (v) p.speed = +v[1];
      if (/gains? (?:the )?Aggro/i.test(txt)) p.aggro = true;
      const sh = txt.match(/gains? ([\d,]+) Shield Health/i) ?? txt.match(/Shield Health to ([\d,]+)/i); if (sh) p.shield = big(sh[1]);
      if (/stops moving/i.test(txt)) p.stop = 3;
      if (p.hidden || p.speed || p.aggro || p.shield || p.stop) out.push(p);
    }
    // healing left on the path
    const hz = txt.match(/heals? enemies by ([\d,]+) health every ([\d.]+) seconds?/i) ?? txt.match(/heals? (?:any )?enem(?:y|ies)[^.]*? by ([\d,]+)[^.]*?every ([\d.]+)/i);
    if (hz && !heal) out.push({ ...a, kind: 'healZone', amount: big(hz[1]), every: +hz[2], dur: num(/last(?:s|ing)? ([\d.]+) seconds/i) ?? 5, radius: radius ?? 4, onDeath: /upon (its )?death/i.test(txt) });
    // towers frozen by an attack
    const fz = txt.match(/freez(?:es|ing)[^.]*?for ([\d.]+) seconds?/i) ?? txt.match(/frozen for ([\d.]+) seconds?/i);
    if (fz && /tower/i.test(txt)) out.push({ ...a, kind: 'freezeTower', dur: +fz[1], radius: radius ?? num(/range of ([\d.]+)/i), max: nOf(txt.match(/up to (\w+) (?:different )?towers?/i)?.[1]) ?? null, unitDmg: num(/([\d,]+) damage to units/i) });
    // explosions that hurt units
    const ub = txt.match(/deals? ([\d,]+) damage to units in a radius of ([\d.]+)/i);
    if (ub && !(fat || rng) && !out.some((o) => o.kind === 'stun' || o.kind === 'freezeTower')) out.push({ ...a, kind: 'unitBlast', unitDmg: big(ub[1]), radius: +ub[2], onDeath: /upon (its )?death/i.test(txt) });
    // gifts: nearby enemies get an attribute
    const gf = txt.match(/gives enemies (?:the )?(Bloated|Blessed|Aggro)(?:,? or (Bloated|Blessed|Aggro))? attributes?/i);
    if (gf) out.push({ ...a, kind: 'gift', attrs: [gf[1], gf[2]].filter(Boolean), radius: num(/explosion (?:radius|range) of ([\d.]+)/i) ?? 6 });
    // revives another enemy after a delay
    const rv = txt.match(/reviving the ([\w ]+?) to ([\d,]+) health/i);
    if (rv) out.push({ ...a, kind: 'revive', target: rv[1].trim(), hp: big(rv[2]), dur: num(/spend ([\d.]+) seconds/i) ?? 10 });
    // becomes or spawns random enemies on death
    const rs = txt.match(/upon death, spawns (?:into )?(?:a random enemy|(\w+) enem(?:y|ies))/i);
    if (rs && !out.some((o) => o.kind === 'deathSpawn')) out.push({ ...a, kind: 'deathRandom', n: rs[1] ? nOf(rs[1]) ?? 1 : 1 });
  }
  for (const a of out) { if ((a.kind === 'freezeTower' || a.kind === 'gift' || a.kind === 'healZone' && !a.onDeath || a.kind === 'unitBlast' && !a.onDeath) && a.cd == null) { a.cd = 10; unknown.push({ enemy: name, why: `${a.title}: cooldown not on the page (10 s)` }); } if (a.kind === 'freezeTower' && a.radius == null) { a.radius = 12; unknown.push({ enemy: name, why: `${a.title}: area not given (12 studs)` }); }
  if ((a.kind === 'summon' || a.kind === 'stun' || a.kind === 'debuff' && !a.onDeath) && a.cd == null) { a.cd = 10; unknown.push({ enemy: name, why: `${a.title}: cooldown not on the page (10 s)` }); } if ((a.kind === 'stun' || a.kind === 'debuff' && !a.onDeath) && a.radius == null) { a.radius = 12; unknown.push({ enemy: name, why: `${a.title}: area not given (12 studs)` }); } }
  return out;
}
for (const [n, e] of Object.entries(enemies)) { const ab = abilities(n, C(n)); if (ab.length) e.abilities = ab; }

// children: who spawns whom
for (const [n, e] of Object.entries(enemies)) for (const p of e.spawnedBy) if (enemies[p] && !enemies[p].spawns?.includes(n)) (enemies[p].spawns ??= []).push(n);
for (const [n, e] of Object.entries(enemies)) if (e.spawns && !e.abilities?.some(a => a.spawn || a.kind === 'deathRandom')) { e.spawnMode = e.boss || /Necromancer|Summoner|Grave Digger|Necrotic|Mystery|Mandrake|Mandragora/.test(n) ? 'periodic' : 'death'; unknown.push({ enemy: n, why: `spawn mode/count guessed (${e.spawnMode})` }); }

// ---------- rules (lobby and economy pages) ----------
const plain = (t) => strip(t.replace(/<gallery>[\s\S]*?<\/gallery>/g, '').replace(/\{\{(Coins|Exp|Money|Gem)\|([^}]*)\}\}/g, '$2 $1')).replace(/\s+/g, ' ');
const must = (re, t, what) => { const x = t.match(re); if (!x) throw new Error(`rules: ${what} not found on its page`); return x; };
const EL = plain(C('Elevators')), EX = plain(C('Experience')), CA = plain(C('Easy Mode'));
const lift = (k) => { const x = must(new RegExp(`${k} Elevators have a maximum player limit of (\\d+) and wait up to (\\d+) seconds`), EL, `${k} elevator`); return { max: +x[1], wait: +x[2] }; };
const xb = must(/50% more Experience \((\d\d):00 UTC (\w+) – \d\d:00 UTC (\w+)\), any Experience earned is multiplied by ([\d.]+)x/, EX, 'XP boost');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], d0 = DAYS.indexOf(xb[2]), d1 = DAYS.indexOf(xb[3]);
must(/split their cash between players, regardless of how much damage/, CA, 'cash split'); must(/at least 0\.5, it gets rounded up/, CA, 'cash rounding');
// quests (Quests page): each section's reward and level-scaled range; what each objective measures is written here
const QT = C('Quests'), QS = {}; for (const sec of QT.slice(QT.indexOf('===Daily Quests==='), QT.indexOf('==Former Quests==')).split(/^====/m).slice(1)) { const [h, ...r] = sec.split('\n'); QS[h.replace(/=+/g, '').trim()] = plain(r.join(' ')); }
const reward = (t) => { const x = must(/(?:reward|completion)[^.]*? is ([\d,]+) (Coins|Gem)(?:,| and) ([\d,]+) Exp(?: and an? ([\w ]+ Crate))?/i, t, 'quest reward'); return { [x[2] === 'Gem' ? 'gems' : 'coins']: num(x[1]), exp: num(x[3]), ...(x[4] && { crate: x[4] }) }; };
const span = (t, re) => { const x = must(re, t, 'quest range'); return [num(x[1]), num(x[2])]; };
const R1 = /(?:starting at|as low as|anywhere from|from|starts at|go as low as) ([\d,]+)[^.]*?(?:up to|to|as high as|increasing to|goes up to|go up to) ([\d,]+)/i;
const Q = (title, kind, objs) => { const t = QS[title]; if (!t) throw new Error(`quest ${title} missing`); return { title, kind, ...reward(t), objs: objs(t) }; };
const quests = [
  Q('TOWER ROLE Formation', 'daily', () => [{ do: 'triumph', role: true }]),
  Q('Train TOWER', 'daily', (t) => [{ do: 'damage', tower: true, need: span(t, R1) }]),
  Q('Tower Spotlight', 'daily', (t) => [{ do: 'damage', tower: true, need: span(t, R1) }, { do: 'triumph', tower: true }]),
  Q('Bounty: BOSS', 'daily', (t) => [{ do: 'kills', need: span(t, R1) }, { do: 'boss', boss: true }]),
  Q('Small Team Clear', 'daily', (t) => [{ do: 'triumph', players: [...t.matchAll(/with (two|three|four)/g)].length ? [2, 3, 4] : [2] }]),
  Q('Cash Reserve', 'daily', (t) => [{ do: 'triumph', cash: span(t, R1) }]),
  Q('Status Control', 'daily', (t) => [{ do: 'status', status: true, need: span(t, R1) }]),
  Q('Clean Defense', 'daily', (t) => [{ do: 'triumph', hpPct: span(t, /starting at ([\d]+)% and going as high as ([\d]+)%/) }]),
  Q('Map Remix: MAP', 'daily', () => [{ do: 'triumph', map: true }]),
  Q('TOWER Ability Drill', 'daily', (t) => [{ do: 'ability', tower: true, need: span(t, R1) }]),
  Q('Weekly Expedition', 'weekly', (t) => [{ do: 'triumph', maps: nOf(must(/triumph (\w+) random maps/, t, 'maps')[1]) }]),
  Q('Mode Ladder', 'weekly', (t) => [{ do: 'triumph', modes: nOf(must(/with (\w+) objectives/, t, 'modes')[1]) }]),
  Q('Loadout Gauntlet', 'weekly', (t) => [{ do: 'triumph', loadoutMax: nOf(must(/with (\w+) or less towers/, t, 'loadout')[1]) }]),
  Q('Clean Campaign', 'weekly', (t) => [{ do: 'triumph', times: span(t, /as low as (\d+) and go up to (\d+)/), hpPct: span(t, /at least ([\d]+)% of the base health and as high as at least ([\d]+)%/) }]),
  Q('TOWER Lab', 'weekly', (t) => [{ do: 'damage', tower: true, need: span(t, /anywhere from ([\d,]+) to ([\d,]+) damage/) }, { do: 'kills', tower: true, need: span(t, /starting at ([\d,]+) defeated enemies and going up to ([\d,]+)/) }, { do: 'triumph', tower: true, times: span(t, /starting at (\d+) triumphs and increasing to (\d+)/) }]),
  Q('Economy Audit', 'weekly', (t) => [{ do: 'cash', need: span(t, /starts at ([\d,]+) and with levels goes up to ([\d,]+)/) }, { do: 'triumph', times: span(t, /as low as (\d+) and as high as (\d+)/), cash: span(t, /anywhere from ([\d,]+) to ([\d,]+)/) }]),
  Q('Boss Dossier', 'weekly', (t) => [{ do: 'boss', boss: true }, { do: 'boss', boss: true }]),
  Q('TOWER Support Ops', 'weekly', (t) => [{ do: 'ability', tower: true, support: true, need: span(t, /requires ([\d]+) to ([\d]+) ability uses/) }, { do: 'triumph', tower: true, support: true, times: span(t, /requires ([\d]+) to ([\d]+) triumphs/) }]),
];
const daily = nOf(must(/(\w+) of these appear every day/i, plain(QT), 'daily count')[1]), weekly = nOf(must(/(\w+) appear every week/i, plain(QT), 'weekly count')[1]);
// ---------- units (Units page: tower → unit names; each unit's own infobox) ----------
const UT = C('Units'), unitList = {}; { let cur = null; for (const l of UT.split('\n')) { const h = l.match(/mainheader">\[\[([^\]|]+)/); if (h) { cur = h[1]; unitList[cur] = []; continue; } const u = l.match(/^\|\[\[(?!File:)([^\]|]+)/); if (cur && u && !unitList[cur].includes(u[1])) unitList[cur].push(u[1]); } }
const SPEED = { 'very slow': 1.5, slow: 2.5, average: 4, fast: 6, 'very fast': 8 };
const unitDet = (s) => { s = strip(s ?? ''); if (!s || /^No\b/i.test(s)) return null; const l = s.match(/Level (\d+)/i); return l ? +l[1] : /yes/i.test(s) ? 0 : null; };
const units = {};
for (const [tw, list] of Object.entries(unitList)) list.forEach((u, order) => {
  const t = C(u); if (!t) { unknown.push({ unit: u, why: 'page missing' }); return; }
  const ib = t.slice(0, t.indexOf('\n}}') > 0 ? t.indexOf('\n}}') + 3 : undefined), f = (k) => field(ib, k);
  const n1 = (k) => num(strip((f(k) ?? '').split(/<br/)[0]));
  const sp = strip((f('speed') ?? '').split(/<br/)[0]), spn = num(sp), spd = spn ?? SPEED[sp.toLowerCase()] ?? null;
  if (spn == null && sp) unknown.push({ unit: u, why: `speed "${sp}" read as ${spd ?? 0} studs/s` });
  const every = (f('spawnrate') ?? '').match(/every ([\d.]+)\s*s/)?.[1], dt = strip(f('damage_type') ?? ''), type = strip(f('type') ?? '') || null;
  const splash = n1('explosion_radius') ?? n1('explosion_range') ?? n1('splash_radius');
  units[u] = { tower: tw, order, level: n1('level') ?? 0, type, hp: n1('health') ?? 0, spawnrate: every ? +every : n1('spawnrate'), lifespan: n1('lifespan'),
    dmg: n1('ranged_damage') ?? n1('damage') ?? 0, fr: n1('ranged_firerate') ?? n1('firerate'), range: n1('ranged_range') ?? n1('range') ?? 0, burst: n1('ranged_burst') ?? n1('burst'), burstCd: n1('cooldown'),
    splash: splash ?? (/splash/i.test(dt) ? 3 : null), splashDmg: n1('splash_damage') ?? n1('explosion_damage'), collision: /collision/i.test(dt), speed: spd ?? 0,
    stationary: spd === 0 || /stationary|sentry|turret/i.test(`${type ?? ''} ${u}`), detect: { hidden: unitDet(f('hidden')), lead: unitDet(f('lead')), flying: unitDet(f('flying') ?? f('fly')) } };
  if (!units[u].hp) unknown.push({ unit: u, why: 'health not on its page' });
  if (/splash/i.test(dt) && splash == null) unknown.push({ unit: u, why: 'splash radius not given (3 studs)' });
});

// ---------- skills (Skills page) ----------
const SKT = C('Skills'), skillList = [];
for (const x of SKT.matchAll(/\{\{Skill\n([\s\S]*?)\n\|cost =/g)) {
  const f = Object.fromEntries(x[1].split('\n').filter((l) => l.startsWith('|')).map((l) => { const i = l.indexOf('='); return [l.slice(1, i).trim(), l.slice(i + 1).trim()]; }));
  const d = strip(f.description ?? '');
  const N = '(\\d+(?:\\.\\d+)?)', R = (re) => d.match(new RegExp(re.replace(/N/g, N), 'i'));
  const ev = d.match(/every (\d+)(?:st|nd|rd|th)/i), mult = R('N ?x');
  const per = ev ? R('(?:decreasing|Decreases) by N') : R('by N(%)?') ?? R('N(%) more');
  const base = R('base cost of N'), exp = R('exponential value of N'), req = d.match(/reaching Level (\d+) in ([\w' -]+?) before/i);
  const duo = R('In duo, it is N'), trio = R('trio and higher it is N');
  skillList.push({ name: f.name, type: f.type, levels: +f.levels, per: per ? +per[1] : null, pct: !!per?.[2], base: base ? +base[1] : null, exp: exp ? +exp[1] : null,
    ...(req && { req: { level: +req[1], name: req[2].trim() } }), ...(ev && { every: +ev[1], mult: mult ? +mult[1] : 1 }), ...(duo && { duo: +duo[1] }), ...(trio && { trio: +trio[1] }) });
  if (!per || !base || !exp) unknown.push({ skill: f.name, why: 'effect or cost numbers not all on the page' });
}
const skCost = (sk, L) => Math.round(Math.floor(Math.pow(sk.base * L, sk.exp)) / 5) * 5;
{ const eo = skillList.find((x) => x.name === 'Enhanced Optics'); if (eo && (skCost(eo, 1) !== 20 || skCost(eo, 2) !== 75)) unknown.push({ skill: 'Enhanced Optics', why: `cost formula gives ${skCost(eo, 1)}/${skCost(eo, 2)} for levels 1/2 (page table: 20/75)` }); }
const skRaw = SKT.slice(SKT.indexOf('===Resetting Skills==='), SKT.indexOf('==Skills=='));
const SKILLS = { list: skillList, refund: num(skRaw.match(/given back ([\d.]+)%/)?.[1] ?? '') != null ? num(skRaw.match(/given back ([\d.]+)%/)[1]) / 100 : 0.95,
  resetCost: num(skRaw.match(/pay \{\{Coins\|([\d,]+)\}\} to reset/)?.[1] ?? '') ?? 200, resetStep: num(skRaw.match(/more expensive by \{\{Coins\|([\d,]+)\}\}/)?.[1] ?? '') ?? 200 };
unknown.push({ skill: 'Scholar', why: 'Logbooks are not part of this addon; the skill can be bought but does nothing' });

// ---------- badges (each mode page's Badges/Achievements section) ----------
const BADGES = [];
for (const m of [...MODES, 'Hidden Wave']) {
  const t = C(m === 'Hidden Wave' ? m : `${m} Mode`), at = t.search(/^===\s*(?:Badges|Achievements)[^=]*===/m); if (at < 0) continue;
  const rest = t.slice(at + 5), end = rest.search(/^==[^=]|^===\s*(?!Badges|Achievements)[^=]+===/m), sec = end > 0 ? rest.slice(0, end) : rest;
  for (const b of sec.matchAll(/\{\{\w+\s*\n([\s\S]*?)\n\}\}/g)) {
    const f = Object.fromEntries(b[1].split('\n').filter((l) => l.startsWith('|')).map((l) => { const i = l.indexOf('='); return [l.slice(1, i).trim(), l.slice(i + 1).trim()]; }));
    if (!f.description) continue;
    const desc = strip(f.description), tm = desc.match(/^Triumph (?:in )?([\w ]+?)(?: mode)?\.?$/i), rw = f.rewards ?? '';
    const name = strip(f.name ?? f.title ?? f.badge ?? '').slice(0, 40) || desc.slice(0, 40);
    const mode = tm && (MODES.includes(tm[1].trim()) || tm[1].trim() === 'Hidden Wave') ? (tm[1].trim() === 'Hidden Wave' ? 'Hidden Wave' : tm[1].trim()) : (m === 'Hidden Wave' ? 'Hidden Wave' : m);
    BADGES.push({ name, mode, cond: tm ? 'triumph' : 'other', coins: num(rw.match(/\{\{Coins\|([\d,]+)/)?.[1] ?? '') ?? 0, gems: num(rw.match(/\{\{Gem\|([\d,]+)/)?.[1] ?? '') ?? 0, crate: rw.match(/\[\[([^\]|]*Crate)/)?.[1] ?? null });
    if (!tm) unknown.push({ badge: name, mode: m, why: 'condition is not a plain triumph; not awarded here' });
  }
}

const rules = { sellRate: 1 / 3, cashSplit: 'equal, rounded half up', xpBoost: { mult: +xb[4], utcDays: Array.from({ length: (d1 - d0 + 7) % 7 }, (_, i) => (d0 + i) % 7) }, intermission: 5,
  elevators: { Survival: lift('Survival'), Hardcore: { ...lift('Hardcore'), rotate: /map changing every minute/.test(EL) ? 60 : null }, Voidcore: { ...lift('Voidcore'), rotate: /map changing every minute/.test(EL) ? 60 : null } }, levelRewards: Object.fromEntries(Object.entries(levelRewards).filter(([k]) => k !== 'fifthSlot')), fifthSlot: levelRewards.fifthSlot,
  quests: { daily, weekly, list: quests, statuses: ['Frost', 'Freeze', 'Poison', 'Shock'] }, skills: SKILLS, badges: BADGES };
// match modifiers the engine reproduces (each page's |rewards_increase; the effects are written in src/game.ts and src/modifiers.ts)
const MODS = ['Healthy Enemies', 'Speedy Enemies', 'Double Health', 'Small', 'Tanky Enemies', 'Hidden Enemies', 'Flying Enemies', 'Lost Souls', 'Exploding Enemies', 'Glass', 'Broke', 'Committed', 'Inflation', 'Limitation Makes Creativity', 'Quarantine', 'Fog', 'Random Tower Positions', 'Farm Banned', 'Gatling Gun Banned'];
rules.modifiers = MODS.map((n) => { const t = C(n), r = strip(field(t, 'rewards_increase') ?? ''); const pct = num(r); if (!t) unknown.push({ modifier: n, why: 'page missing' }); return { name: n, reward: /none/i.test(r) || pct == null ? 0 : pct / 100, affects: strip(field(t, 'affects') ?? '').replace(/\s+/g, ' ') || null }; });
w0('rules.json', rules);
const ratio = Object.entries(towers).filter(([n, t]) => { let cum = 0; const seq = [t.sell, ...[...C(n).matchAll(/Sell Price changes to \{\{Money\|([\d,.]+)\}\}/g)].map((x) => num(x[1]))].slice(0, t.levels.length); return !seq.every((g, i) => g == null || ((cum += t.levels[i].cost ?? 0), g === Math.floor(cum / 3) || g === Math.round(cum / 3))); }).map(([n]) => n);
unknown.push({ rule: 'sellRate', why: `sell = ⌊spent ÷ 3⌋ fits the wiki's sell prices of ${Object.keys(towers).length - ratio.length} of ${Object.keys(towers).length} towers; ${ratio.join(', ')} list prices that disagree with their own costs` });
for (const m of ['Molten', 'Fallen']) unknown.push({ mode: m, why: 'health_scale applied to health only (the page says health); shields are not scaled' });

for (const [k, v] of Object.entries({ spawnGap: '0.6 s between enemies of a group', groupGap: '1 s between groups', childCount: '2 children per spawn/summon', summonEvery: 'summoners every 8 s', units: 'units: 4 studs/s, 6-stud gun range, 3 per tower, ram = min(hp)', medic: 'Medic/healing: towers have no HP',
  xpBoost: 'Experience page: ×1.5 from 00:00 UTC Friday to 00:00 UTC Sunday (used); the XP Boost page says Friday to Sunday and the mode pages still say 2x',
  elevator: 'an elevator leaves when it is full or after its wait ("wait up to 20 seconds"); its first player chooses the party size (1 to its maximum)',
  intermission: 'the Survival Intermission Lobby is folded into the elevator wait: its map is voted there (no veto, ready button or VIP override)',
  questScale: 'quest needs scale linearly with the level, from the low end at level 0 to the high end at level 100 (the page gives only the ends)',
  questReset: 'daily quests renew at 00:00 UTC, weekly quests on Monday 00:00 UTC (the page says only "every day" / "every week")',
  questCredit: 'kills, damage, status effects and ability uses count for the owner of the tower; a boss kill counts for every player in the match',
  questPick: 'quests are drawn from the player name and the day/week; ROLE is Cliff, Spawner, Offense, Defense or Support; a major boss is the strongest boss of the last wave of a mode the player can enter; Confuse is not a status effect here',
  questMaps: 'Weekly Expedition asks for three maps; only as many maps as exist here are asked',
  crates: 'crates from quests are counted on the profile; opening them is not part of this addon' })) unknown.push({ rule: k, why: v });
const w = w0;
// guesses the engine makes (written by the engine side; listed here so _unknown.json stays the one list)
try { for (const g of JSON.parse(fs.readFileSync(new URL('./engine_guesses.json', import.meta.url), 'utf8'))) unknown.push(g); } catch { /* none yet */ }
w('towers.json', towers); w('modes.json', modes); w('enemies.json', enemies); w('units.json', units); w('_unknown.json', unknown);
console.log('towers', Object.keys(towers).length, 'modes', Object.keys(modes).length, 'enemies', Object.keys(enemies).length, 'units', Object.keys(units).length, 'skills', skillList.length, 'badges', BADGES.length, 'unknown', unknown.length);

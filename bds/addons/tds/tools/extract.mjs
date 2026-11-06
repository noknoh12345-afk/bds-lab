// wiki cache → data/*.json (deterministic; rerun any time)
import fs from 'node:fs'; import { waves } from './waves.mjs';
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
const SIM = { 'Call to Arms': 'Commander: firerate buff (callToArmsBuff) to towers in range for 10 s', 'Airstrike': 'damage (airstrikeDamage) in an 8-stud radius at the lead enemy', 'Frost Grenade': 'freezes up to five enemies for 2 s within 6 studs', 'War Cry': '65% firerate buff on itself (duration not on the page: 10 s)' };
for (const [name, tw] of Object.entries(towers)) {
  const t = C(name), seen = new Set(), list = [];
  for (const m of t.matchAll(/\{\{Ability\|([\s\S]*?)\n\}\}/g)) {
    const f = Object.fromEntries(m[1].split(/\|(?=[A-Z][\w ]+=)/).map(x => { const i = x.indexOf('='); return [x.slice(0, i).trim(), strip(x.slice(i + 1)).replace(/\s+/g, ' ').trim()]; }));
    const title = (f['Ability Title'] ?? '').replace(/This ability.*$/, '').trim(); if (!title || seen.has(title)) continue; seen.add(title);
    list.push({ title, unlock: num(f['Level Unlock']) ?? 0, cd: num(f['Cooldown Time']), cost: num(f.Cost ?? '') ?? 0, info: (f.Information ?? '').slice(0, 300), simulated: !!SIM[title] });
    if (!SIM[title]) unknown.push({ tower: name, why: `ability "${title}" not simulated` });
  }
  if (list.length) tw.abilities = list;
}

// ---------- modes ----------
const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore'];
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
  modes[m] = { waves: num(field(ib, 'waves')), level: num(strip(field(ib, 'level_requirement'))) ?? 0, startCash: num(strip(field(ib, 'starting_cash'))), baseHP: num(field(ib, 'max_health')) ?? 200,
    waveCash: CASH[m], clear: { solo: CLEAR[m][0], group: CLEAR[m][1], noDamage: CLEAR[m][2] }, startBy: START[m] ?? null, rewards: rewards(m, t, num(field(ib, 'waves')), field(ib, 'rewards') ?? ''), hpScale: hpScale(field(ib, 'health_scale')), timers, wave: w, src: `https://tds.fandom.com/wiki/${m}_Mode` };
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
const rules = { sellRate: 1 / 3, cashSplit: 'equal, rounded half up', xpBoost: { mult: +xb[4], utcDays: Array.from({ length: (d1 - d0 + 7) % 7 }, (_, i) => (d0 + i) % 7) }, intermission: 5,
  elevators: { Survival: lift('Survival'), Hardcore: { ...lift('Hardcore'), rotate: /map changing every minute/.test(EL) ? 60 : null } }, levelRewards: Object.fromEntries(Object.entries(levelRewards).filter(([k]) => k !== 'fifthSlot')), fifthSlot: levelRewards.fifthSlot,
  quests: { daily, weekly, list: quests, statuses: ['Frost', 'Freeze', 'Poison', 'Shock'] } };
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
w('towers.json', towers); w('modes.json', modes); w('enemies.json', enemies); w('_unknown.json', unknown);
console.log('towers', Object.keys(towers).length, 'modes', Object.keys(modes).length, 'enemies', Object.keys(enemies).length, 'unknown', unknown.length);

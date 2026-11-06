import fs from 'node:fs'; import { wt } from './fetch.mjs';
const pool = async (names) => { let i = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < names.length) await wt(names[i++]); })); };
const t = await wt('Towers');
const cats = {}; for (const s of t.split(/<span class="mainheader">/).slice(2)) { const h = s.match(/\|([^}|]+)\}\}<\/span>/)?.[1] ?? s.match(/^(.*?)<\/span>/)[1]; cats[h] = [...s.matchAll(/link=([^\]|]+)\]/g)].map(m => m[1]); }
const names = Object.values(cats).flat(); await pool(names);
fs.writeFileSync(new URL('../.cache/cats.json', import.meta.url), JSON.stringify(cats));
console.log(names.length, 'towers cached');
// modes, then every enemy linked from a mode's ==Enemies== section or its waves (an enemy page has |base_hp)
const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore', 'Frost', 'Voidcore']; await pool([...MODES.map(m => `${m} Mode`), 'Hidden Wave', 'Sandbox Mode']);
const roster = {}, prev = (() => { try { return JSON.parse(fs.readFileSync(new URL('../data/enemies.json', import.meta.url))); } catch { return {}; } })();
for (const m of MODES) {
  let p = await wt(`${m} Mode`), s = p.slice(p.search(/^==\s*Enemies\s*==/m), p.search(/^==\s*Wave Structure\s*==/m));
  if (m === 'Fallen') { const h = await wt('Hidden Wave'); s += h.slice(h.indexOf('===Enemies==='), h.indexOf('==Strategy==')); }   // the Hidden Wave is Fallen's waves 41-42
  const links = [...new Set([...s.matchAll(/\[\[(?!File:)([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(x => x[1].trim()))]; await pool(links);
  const ok = []; for (const l of links) if (/^\|base_hp ?=/m.test(await wt(l))) ok.push(l);
  for (const [n, e] of Object.entries(prev)) if (e.per?.[m] && !ok.includes(n)) ok.push(n);   // kept from the last extract (bosses' later phases are not linked there)
  roster[m] = ok;
}
const all = [...new Set(Object.values(roster).flat())]; await pool(all);
fs.writeFileSync(new URL('../.cache/modeenemies.json', import.meta.url), JSON.stringify(roster));
console.log(all.length, 'enemies cached');
// units of spawner towers (Units page → one page per unit)
const UT = await wt('Units'); await pool([...UT.matchAll(/^\|\[\[(?!File:)([^\]|]+)/gm)].map(x => x[1]));
await pool(['Healthy Enemies', 'Speedy Enemies', 'Double Health', 'Small', 'Tanky Enemies', 'Hidden Enemies', 'Flying Enemies', 'Lost Souls', 'Exploding Enemies', 'Glass', 'Broke', 'Committed', 'Inflation', 'Limitation Makes Creativity', 'Quarantine', 'Fog', 'Random Tower Positions', 'Farm Banned', 'Gatling Gun Banned']);
for (const p of ['Skills', 'Modifiers', 'Neuralyzed', 'Enemies', 'Maps', 'Attributes', 'Hidden (Attribute)', 'Lead (Attribute)', 'Cash', 'Elevators', 'Coins', 'Experience', 'Gems', 'Quests', 'Levels', 'XP Boost', 'Defense', 'Waves', 'Survival Intermission Lobby', 'Matchmaking']) { const s = await wt(p); console.log(p, s.length); }

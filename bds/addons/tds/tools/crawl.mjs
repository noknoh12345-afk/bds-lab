import fs from 'node:fs'; import { wt } from './fetch.mjs';
const t = await wt('Towers');
const cats = {}; for (const s of t.split(/<span class="mainheader">/).slice(2)) { const h = s.match(/\|([^}|]+)\}\}<\/span>/)?.[1] ?? s.match(/^(.*?)<\/span>/)[1]; cats[h] = [...s.matchAll(/link=([^\]|]+)\]/g)].map(m => m[1]); }
const names = Object.values(cats).flat();
let i = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < names.length) { const n = names[i++]; await wt(n); } }));
fs.writeFileSync(new URL('../.cache/cats.json', import.meta.url), JSON.stringify(cats));
console.log(names.length, 'towers cached');
for (const p of ['Enemies', 'Game Modes', 'Maps', 'Attributes', 'Difficulty', 'Hidden (Attribute)', 'Lead (Attribute)', 'Flying (Attribute)', 'Targeting', 'Placement Limit', 'Cash', 'Elevators', 'Loadout', 'Coins', 'Experience', 'Gems', 'Quests', 'Base Health', 'Defense', 'Status Effects']) { const s = await wt(p); console.log(p, s.length); }

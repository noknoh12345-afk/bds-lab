// wiki wikitext fetch with on-disk cache (never fetch a page twice)
import fs from 'node:fs'; import path from 'node:path';
const C = new URL('../.cache/', import.meta.url).pathname; fs.mkdirSync(C, { recursive: true });
export async function wt(page) {
  const f = path.join(C, page.replace(/[^\w.-]+/g, '_') + '.wt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const u = `https://tds.fandom.com/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&redirects=1&format=json`;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u); if (r.ok) { const j = await r.json(); const t = j.parse?.wikitext?.['*'] ?? ''; fs.writeFileSync(f, t); return t; }
    await new Promise(r => setTimeout(r, 1500));
  }
  fs.writeFileSync(f, ''); return '';
}
if (process.argv[2]) for (const p of process.argv.slice(2)) console.log((await wt(p)).slice(0, +process.env.N || 3000));

import fs from 'node:fs';
export function waves(t) {
  const s = t.slice(t.search(/sectionheader">'''Wave Structure/)); const out = {}; let w = null;
  for (const l of s.split('\n')) {
    let m = l.match(/^\|\s*(?:rowspan="\d+"\s*\|)?\s*(?:'''|<b>)?(\d+)(?:'''|<\/b>)?\s*$/); if (m) { w = +m[1]; continue; }
    m = l.startsWith("|") && l.match(/(\d+x\s*(?:''')?\[\[.*)$/);
    if (m && w && !out[w]) out[w] = parse(m[1]);
  }
  return out;
}
export function parse(c) {
  c = c.replace(/<ref.*?(<\/ref>|\/>)/g, '').replace(/<br\s*\/?>/g, ', ');
  const r = []; const re = /(\d+)x\s*(?:''')?\[\[([^\]|]+)(?:\|([^\]]+))?\]\](?:''')?((?:\s*\((?:[^()]|\([^()]*\))*\))*)/g; let m;
  while ((m = re.exec(c))) { const mods = [...m[4].matchAll(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g)].map(x => x[1]); r.push({ n: +m[1], e: m[2].trim(), ...(mods.length && { mods }) }); }
  return r;
}
if (process.argv[2]) { const w = waves(fs.readFileSync(process.argv[2], 'utf8')); console.log(Object.keys(w).length, JSON.stringify(w).slice(0, +process.env.N || 1500)); }

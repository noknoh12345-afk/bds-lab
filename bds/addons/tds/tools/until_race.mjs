// node tools/until_race.mjs tests.txt <LAB_DUMP file>: run `LAB_DUMP=<file> node lab.mjs test -a tds` first
// Which expectations under an `until` line pass only because a line printed AFTER the until's own line was read in the same
// segment? On a slower server the later line can arrive after the next command has started, and the check fails there.
import fs from 'node:fs';

const [tf, df] = process.argv.slice(2);
const rx = (v) => { let f = ''; if (v.startsWith('(?i)')) { f = 'i'; v = v.slice(4); } return new RegExp(v, f); };

// tests.txt → steps (as the lab reads them)
const steps = []; let sec = null;
fs.readFileSync(tf, 'utf8').split(/\r?\n/).forEach((raw, i) => {
  const l = raw.trim();
  if (l.startsWith('## ')) { sec = { title: l.slice(3), from: steps.length }; return; }
  if (!l || l.startsWith('#')) return;
  const m = /^(!~|[=~!])\s?(.*)$/.exec(l), last = steps.at(-1);
  if (!m && /^\s{2,}\S/.test(raw) && last && !last.exp.length && /^(py|lse|js) /.test(last.cmd)) { last.cmd += ' ' + l; return; }
  if (m) last.exp.push({ op: m[1], v: m[2], line: i + 1 });
  else steps.push({ cmd: l.replace(/^\//, ''), exp: [], sec, line: i + 1 });
});

// the dump → segments ("> cmd" then its lines); segs[0] is the boot, segs[k + 1] is step k
const segs = [];
for (const l of fs.readFileSync(df, 'utf8').split('\n')) {
  if (l.startsWith('> ')) segs.push({ cmd: l.slice(2), out: [] });
  else if (segs.length) segs.at(-1).out.push(l);
}
if (segs.length < steps.length + 1) console.log(`(the dump has ${segs.length - 1} steps, tests.txt ${steps.length}: a shorter run)`);

let n = 0;
steps.forEach((s, k) => {
  if (!/^until\s/.test(s.cmd)) return;
  const seg = segs[k + 1]; if (!seg) return;
  const parts = s.cmd.split(/\s+/).slice(1);
  if (/^\d+$/.test(parts.at(-1)) && parts.length > 1) parts.pop();
  let ure; try { ure = rx(parts.join(' ')); } catch { return; }
  const at = seg.out.findIndex((l) => ure.test(l));
  if (at < 0) return;   // the until itself was not seen (a failure of its own)
  const from = s.sec ? s.sec.from : k;
  for (const e of s.exp) {
    if (e.op !== '=' && e.op !== '~') continue;
    if (/^\^?@/.test(e.v)) continue;   // what a player saw: looked up across the whole section anyway
    let re; try { re = e.op === '~' ? rx(e.v) : null; } catch { continue; }
    const hit = (g) => (e.op === '=' ? g === e.v : re.test(g));
    // a hit before this until (earlier segments of the section) or at/before its own line: safe
    let safe = false;
    for (let q = from; q < k && !safe; q++) if ((segs[q + 1]?.out ?? []).some(hit)) safe = true;
    if (!safe && seg.out.slice(0, at + 1).some(hit)) safe = true;
    const late = seg.out.slice(at + 1).findIndex(hit);
    if (!safe && late >= 0) { n++; console.log(`tests.txt:${e.line}: under "${s.cmd.slice(0, 90)}" (line ${s.line}) — matched only ${late + 1} line(s) after the until's own line: ${seg.out[at + 1 + late].slice(0, 120)}`); }
  }
});
console.log(n ? `${n} racy expectation(s)` : 'none racy');

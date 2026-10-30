// Run /spectral:calib <program> in the real bundle against the recording mock, and write every SoundInstance call it makes
// to tools/sim/log_calib_<program>.json (what a client would receive): tools/emu/client.py renders it, tools/rig/analyze.py
// measures it — the same analysis a real recording gets.   node tools/sim/run_calib.mjs fade
import fs from 'fs';
import path from 'path';
import url from 'url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const mc = await import('./mock-server.js');
const src = fs.readFileSync(path.join(here, '..', '..', 'bp', 'scripts', 'main.js'), 'utf8')
  .split('"@minecraft/server-ui"').join('"./mock-ui.js"').split('"@minecraft/server"').join('"./mock-server.js"');
fs.writeFileSync(path.join(here, '.addon.mjs'), src);
await import('./.addon.mjs');
mc._startup();
const A = new mc.Player('A');
mc._setPlayers([A]);
mc.world.afterEvents.worldLoad._fire({});
const prog = process.argv[2] || 'fade';
mc.commands['spectral:calib']({ sourceEntity: A, initiator: A }, prog);
let done = false;
for (let i = 0; i < 20 * 900 && !done; i++) {
  await mc._step();
  if (A.msgs.some((m) => new RegExp(`calib ${prog === 'all' ? 'throughput' : prog} done`).test(m))) done = true;
}
const out = path.join(here, `log_calib_${prog}.json`);
fs.writeFileSync(out, JSON.stringify(mc.log));
const kinds = {}; for (const e of mc.log) kinds[e[0]] = (kinds[e[0]] || 0) + 1;
console.log(JSON.stringify({ program: prog, ticks: mc._tick(), done, calls: kinds, out: path.relative(process.cwd(), out) }));

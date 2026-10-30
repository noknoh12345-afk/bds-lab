// Play a song pack (a .song.json from tools/spectral.py) through the real bundle in the recording mock, the way a song pack
// delivers it (script event), and write every SoundInstance call: tools/sim/log_song_<id>.json for tools/emu/client.py.
//   node tools/sim/run_song.mjs <song.json> [quality|light]
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
const song = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mode = process.argv[3] || 'quality';
const id = song.meta.id;
mc.system.sendScriptEvent('spectral:song', JSON.stringify({ id, i: 0, n: 1, meta: song.meta, data: song.data }));
const run = (name, ...a) => mc.commands[name]({ sourceEntity: A, initiator: A }, ...a);
if (mode === 'light') { run('spectral:mode', 'light'); for (let i = 0; i < 2; i++) await mc._step(); }
mc.log.length = 0;
run('spectral:play', id, 'phones');
let ended = false;
for (let i = 0; i < 20 * 900 && !ended; i++) { await mc._step(); if (A.msgs.some((m) => /— end/.test(m))) ended = true; }
const out = path.join(here, `log_song_${id}${mode === 'light' ? '_light' : ''}.json`);
fs.writeFileSync(out, JSON.stringify(mc.log));
const per = {}; for (const e of mc.log) if (['pitch', 'fade', 'vol', 'play'].includes(e[0])) per[e[1]] = (per[e[1]] || 0) + 1;
const v = Object.values(per).sort((a, b) => a - b);
console.log(JSON.stringify({ id, mode, ended, ticks: mc._tick(), calls_per_tick: { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), p95: v[Math.floor(v.length * 0.95)], max: v[v.length - 1] }, out: path.relative(process.cwd(), out) }));

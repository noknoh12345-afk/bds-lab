// Play a song pack (a .song.json from tools/spectral.py) through the real bundle in the recording mock, the way a song pack
// delivers it (script event), and write every SoundInstance call: tools/sim/log_song_<id>.json for tools/emu/client.py.
//   node tools/sim/run_song.mjs <song.json> [quality|light] [--voices N] [--bundle <main.js>] [--out <log.json>] [--cmd '<name> <args>']...
//        [--play '<name> <args with {id}>']
//   (--voices: /spectral:voices N before playing; --bundle: another build of the add-on, e.g. an older commit's bp/scripts/main.js;
//   --play: what starts the song, 'spectral:play {id} phones' by default — e.g. 'spectral:live_demo {id} phones', the live path,
//   which ends 4 s after the song's last frame)
import fs from 'fs';
import path from 'path';
import url from 'url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const voices = opt('--voices'), bundle = opt('--bundle'), outArg = opt('--out'), playArg = opt('--play');
const extra = []; for (let c; (c = opt('--cmd')) !== undefined;) extra.push(c);   // more commands before playing (e.g. 'spectral:engine 11500 true 0')
const mc = await import('./mock-server.js');
const src = fs.readFileSync(bundle ? path.resolve(bundle) : path.join(here, '..', '..', 'bp', 'scripts', 'main.js'), 'utf8')
  .split('"@minecraft/server-ui"').join('"./mock-ui.js"').split('"@minecraft/server"').join('"./mock-server.js"');
const tmp = `.addon.${process.pid}.mjs`;
fs.writeFileSync(path.join(here, tmp), src);
try { await import('./' + tmp); } finally { fs.rmSync(path.join(here, tmp), { force: true }); }
mc._startup();
const A = new mc.Player('A');
mc._setPlayers([A]);
mc.world.afterEvents.worldLoad._fire({});
const song = JSON.parse(fs.readFileSync(argv[0], 'utf8'));
const mode = argv[1] || 'quality';
const id = song.meta.id;
mc.system.sendScriptEvent('spectral:song', JSON.stringify({ id, i: 0, n: 1, meta: song.meta, data: song.data }));
const run = (name, ...a) => mc.commands[name]({ sourceEntity: A, initiator: A }, ...a);
const argsOf = (c) => { const [name, ...args] = c.split(' '); return [name, ...args.map((a) => (a === 'true' ? true : a === 'false' ? false : /^-?\d+(\.\d+)?$/.test(a) ? Number(a) : a))]; };
if (mode === 'light') { run('spectral:mode', 'light'); for (let i = 0; i < 2; i++) await mc._step(); }
if (voices) { run('spectral:voices', Number(voices)); for (let i = 0; i < 2; i++) await mc._step(); }
for (const c of extra) {
  const [name, ...args] = c.split(' ');
  run(name, ...args.map((a) => (a === 'true' ? true : a === 'false' ? false : /^-?\d+(\.\d+)?$/.test(a) ? Number(a) : a)));
  for (let i = 0; i < 2; i++) await mc._step();
}
mc.log.length = 0;
const live = playArg && !/^spectral:play\b/.test(playArg);
if (playArg) run(...argsOf(playArg.split('{id}').join(id))); else run('spectral:play', id, 'phones');
let ended = false;
const most = live ? (song.meta.frames ?? 20 * 30) + 80 : 20 * 900;
for (let i = 0; i < most && !ended; i++) { await mc._step(); if (!live && A.msgs.some((m) => /— end/.test(m))) ended = true; }
const out = outArg ? path.resolve(outArg) : path.join(here, `log_song_${id}${mode === 'light' ? '_light' : ''}${voices ? '_v' + voices : ''}.json`);
fs.writeFileSync(out, JSON.stringify(mc.log));
const per = {}; for (const e of mc.log) if (['pitch', 'fade', 'vol', 'play'].includes(e[0])) per[e[1]] = (per[e[1]] || 0) + 1;
const v = Object.values(per).sort((a, b) => a - b);
console.log(JSON.stringify({ id, mode, voices: voices ? Number(voices) : undefined, ended, ticks: mc._tick(), calls_per_tick: { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), p95: v[Math.floor(v.length * 0.95)], max: v[v.length - 1] }, out: path.relative(process.cwd(), out) }));

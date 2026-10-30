// Run the real add-on bundle (bp/scripts/main.js) against a recording mock of @minecraft/server, tick by tick,
// and write every SoundInstance call it makes to log_<song>_<where>.json.  render_log.py turns that log into audio
// the way a client would play it, so the engine's actual output can be heard and measured without a client.
//   node tools/sim/run.mjs demo phones [speed05]   then   python3 tools/sim/render_log.py tools/sim/log_demo_phones.json <original.mp3> out.wav
import fs from 'fs';
import path from 'path';
import url from 'url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const mc = await import('./mock-server.js');
const src = fs.readFileSync(path.join(here, '..', '..', 'bp', 'scripts', 'main.js'), 'utf8')
  .split('"@minecraft/server-ui"').join('"./mock-ui.js"')
  .split('"@minecraft/server"').join('"./mock-server.js"');
fs.writeFileSync(path.join(here, '.addon.mjs'), src);
await import('./.addon.mjs');

mc._startup();
const A = new mc.Player('A');
mc._setPlayers([A]);
mc.world.afterEvents.worldLoad._fire({});
const [song = 'demo', where = 'phones', ...extra] = process.argv.slice(2);
const run = (name, ...args) => mc.commands[name]({ sourceEntity: A, initiator: A }, ...args);
run('spectral:play', song, where);
let ended = false;
for (let i = 0; i < 20 * 600 && !ended; i++) {
  await mc._step();
  if (extra.includes('speed05') && mc._tick() === 100) run('spectral:speed', 0.5);
  if (A.msgs.some((m) => /— end/.test(m))) ended = true;
}
fs.writeFileSync(path.join(here, `log_${song}_${where}.json`), JSON.stringify(mc.log));
const kinds = {};
for (const e of mc.log) kinds[e[0]] = (kinds[e[0]] || 0) + 1;
console.log(JSON.stringify({ ticks: mc._tick(), ended, calls: kinds, msgs: A.msgs.slice(0, 3) }));

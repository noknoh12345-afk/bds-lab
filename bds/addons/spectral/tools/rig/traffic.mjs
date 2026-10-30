// What the add-on costs on the wire, measured on a real BDS with a real protocol client (the lab's player A):
// bytes on the loopback interface (BDS -> A and A's acks, IP/UDP/RakNet included) while A listens, against A connected
// and idle, plus the SoundInstance packets A receives counted on A's side.
//   node lab.mjs up            (in the unit, once)
//   node tools/rig/traffic.mjs [--json out.json]
// Linux only (/proc/net/dev). Nothing else may use the loopback while it runs (the live link's own few hundred bytes
// per `do` are in every phase, idle included).
import fs from 'fs';
import path from 'path';
import url from 'url';
import { spawnSync } from 'child_process';

const unit = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
const WIN = 12000;                                   // ms per measured window
const lo = () => {
  const l = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').find((x) => x.trim().startsWith('lo:'));
  const f = l.split(':')[1].trim().split(/\s+/).map(Number);
  return { bytes: f[0], packets: f[1], t: Date.now() };
};
const run = (...cmds) => {
  const r = spawnSync(process.execPath, ['lab.mjs', 'do', ...cmds], { cwd: unit, encoding: 'utf8', timeout: 600000, maxBuffer: 256e6, env: { ...process.env, LAB_MAX: '10000000' } });
  return (r.stdout || '') + (r.stderr || '');
};
const reply = (out, re) => (out.split('\n').find((l) => re.test(l)) ?? '').trim();
// a toggle command until its reply says what we want
const want = (cmd, re) => { for (let i = 0; i < 3; i++) if (re.test(reply(run(`@A cmd ${cmd}`), /@A /))) return true; return false; };

const window = (name) => {
  const a = lo();
  const o = run('js system.currentTick', `wait ${WIN}`, 'js system.currentTick');
  const b = lo(), s = (b.t - a.t) / 1000;
  const t = o.split('\n').map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).map(Number);
  // server ticks per second over the wait (the byte rate is over the whole call, the song playing all through it)
  const tps = t.length >= 2 ? +((t[t.length - 1] - t[0]) / (WIN / 1000)).toFixed(2) : null;
  return { name, seconds: +s.toFixed(2), tps, bytes_per_s: Math.round((b.bytes - a.bytes) / s), packets_per_s: +((b.packets - a.packets) / s).toFixed(1) };
};
const status = () => {
  const l = reply(run('@A cmd /spectral:status'), /status:/);
  const m = l.match(/calls\/tick ([\d.]+) peak (\d+)/);
  return m ? { calls_per_tick: +m[1], peak: +m[2], line: l.replace(/^.*?status:/, 'status:') } : { line: l };
};

const REPS = +(process.env.REPS || 2);
const out = { when: new Date().toISOString(), window_ms: WIN, reps: REPS, phases: [] };
const j = run('@A join');
if (!/joined|already/.test(j)) { console.error('A did not join:\n' + j.slice(-2000)); process.exit(1); }
run('@A cmd /spectral:stop', 'wait 1000');
want('/spectral:loop', /loop on/);
for (let rep = 0; rep < REPS; rep++) {
  want('/spectral:viz', /spectrum off/);
  out.phases.push(window('idle'));
  for (const [mode, viz] of [['quality', false], ['light', false], ['quality', true]]) {
    if (viz) want('/spectral:viz', /spectrum on/);
    run(`@A cmd /spectral:mode ${mode}`, '@A cmd /spectral:play demo', 'wait 1500');
    const w = window(`${mode}${viz ? '+spectrum' : ''}`);
    Object.assign(w, status());
    run('@A cmd /spectral:stop', 'wait 1500');
    out.phases.push(w);
  }
}
out.phases.push(window('idle'));
want('/spectral:viz', /spectrum off/);
// the SoundInstance packets as A receives them (printing them costs loopback bytes too: no byte count here)
run('@A watch clientbound_update_sound_data,play_sound', '@A cmd /spectral:mode quality');
const w = run('@A cmd /spectral:play demo', `wait ${WIN / 2}`, '@A cmd /spectral:status', '@A watch off', '@A cmd /spectral:stop');
const saw = w.split('\n').filter((l) => /@A saw clientbound_update_sound_data/.test(l)).length;
const fr = reply(w, /status:/).match(/frame (\d+)\//), ct = reply(w, /status:/).match(/calls\/tick ([\d.]+)/);
out.received = { update_sound_data: saw, play_sound: w.split('\n').filter((l) => /@A saw play_sound/.test(l)).length,
  server_frames: fr ? +fr[1] : null, server_calls: fr && ct ? Math.round(+fr[1] * +ct[1]) : null };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const idle = out.phases.filter((p) => p.name === 'idle').map((p) => p.bytes_per_s);
out.idle = { bytes_per_s: Math.round(mean(idle)), sd: Math.round(sd(idle)), n: idle.length };
out.summary = {};
for (const name of ['quality', 'light', 'quality+spectrum']) {
  const ps = out.phases.filter((p) => p.name === name);
  const extra = ps.map((p) => p.bytes_per_s - out.idle.bytes_per_s);
  const cmds = ps.map((p) => p.calls_per_tick * p.tps);
  out.summary[name] = { extra_bytes_per_s: Math.round(mean(extra)), sd: Math.round(sd(extra)), commands_per_s: +mean(cmds).toFixed(1),
    bytes_per_command: +(mean(extra) / mean(cmds)).toFixed(1), calls_per_tick: +mean(ps.map((p) => p.calls_per_tick)).toFixed(1), peak: Math.max(...ps.map((p) => p.peak)) };
}
const txt = JSON.stringify(out, null, 1);
const i = process.argv.indexOf('--json');
if (i > 0) fs.writeFileSync(process.argv[i + 1], txt);
console.log(JSON.stringify({ idle: out.idle, summary: out.summary, received: out.received }, null, 1));

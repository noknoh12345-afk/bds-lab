#!/usr/bin/env node
// The Discord bridge without Discord: a test speech made into an Ogg Opus stream as a voice channel carries it (48 kHz stereo,
// 20 ms packets), its packets taken apart and decoded by the same prism-media decoder the bridge uses, through a Talker — the
// console lines checked (one frame each, the meta and the 3D place in the first, an end, all within /scriptevent's 2048
// characters), and the links (/mc) kept only when right. Needs `npm install` here. node tools/live/test_bridge.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Talker, monoOf, link, readLinks, streamId } from './bridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const prism = require('prism-media');
let fails = 0;
const ok = (c, m, d = '') => { console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-')), src = path.join(here, '..', '..', 'corpus', 'audio', 'speech_ja_soseki.mp3');
const ogg = path.join(tmp, 'voice.opus');
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-t', '6', '-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', '-frame_duration', '20', ogg]);
ok(r.status === 0, 'a test speech as a voice channel carries it (Opus, 48 kHz stereo, 20 ms packets)', String(r.stderr));
const lines = [];
const t = new Talker({ id: streamId('123456789012345678'), gamertag: 'Steve', voices: 16, send: (l) => lines.push(l), quietMs: 0 });
let packets = 0, samples = 0;
const heard = [];
await new Promise((res, rej) => {
  const dem = new prism.opus.OggDemuxer(), dec = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  dem.on('data', () => packets++);
  fs.createReadStream(ogg).pipe(dem).pipe(dec).on('data', (pcm) => { const m = monoOf(pcm); samples += m.length; heard.push(m); t.push(m); }).on('end', res).on('error', rej);
});
t.end();
const msgs = lines.map((l) => JSON.parse(l.replace(/^scriptevent spectral:live /, '')));
ok(packets >= 295 && Math.abs(samples / 48000 - 6) < 0.1, `the Opus packets decoded the bridge's way (${packets} packets, ${(samples / 48000).toFixed(2)} s)`);
ok(Math.abs(msgs.length - 1 - 120) <= 2 && msgs.slice(0, -1).every((m, i) => m.id === 'vc_789012345678' && m.s === i), `a frame a message, numbered (${msgs.length - 1} for 6 s)`);
ok(msgs[0].m?.N === 16 && msgs[0].m.M === 8 && msgs[0].at === 'follow:Steve' && !msgs[1].m && !msgs[1].at, 'the first message carries the meta and the place: in 3D from Steve');
ok(msgs.at(-1).end === true && lines.every((l) => l.length < 2048 && l.startsWith('scriptevent spectral:live {')), `an end; every line within /scriptevent's 2048 characters (longest ${Math.max(...lines.map((l) => l.length))})`);
const bytes = msgs.slice(0, -1).reduce((n, m) => n + Buffer.from(m.f, 'base64').length, 0);
ok(bytes / 6 < 2500, `the stream: ${(bytes * 8 / 6 / 1000).toFixed(1)} kbps of frames (${(lines.reduce((n, l) => n + l.length + 1, 0) * 8 / 6 / 1000).toFixed(1)} kbps of console text)`);
// a pause between two sentences (Discord sends nothing while someone is silent): two frames of silence end the first, and the
// second starts with rises — read back the add-on's way (src/main.ts LiveStream.push: a mask of changed voices, each its level
// code with bit 7 a rise and, sounding, two bytes of pitch; the noise bands; the fades)
function framesOf(msgs, N, M) {
  const nb = (N + 7) >> 3, fv = (N + 3) >> 2, fn = (M + 3) >> 2, cur = new Array(N).fill(0), out = [];
  for (const m of msgs) {
    if (!m.f) continue;
    const b = Buffer.from(m.f, 'base64'), rise = [];
    let p = nb;
    for (let v = 0; v < N; v++) {
      if (!((b[v >> 3] >> (v & 7)) & 1)) continue;
      const x = b[p++]; cur[v] = x & 0x7f; if (cur[v]) p += 2; if (x & 0x80) rise.push(v);
    }
    const nz = [...b.subarray(p, p + M)]; p += M + fv + fn;
    out.push({ amp: [...cur], nz, rise, whole: p === b.length });
  }
  return out;
}
const pl = [], tp = new Talker({ id: 'vc_pause', gamertag: 'Steve', voices: 16, send: (l) => pl.push(l), quietMs: 60 });
const pcm = (() => { const a = new Float32Array(samples); let o = 0; for (const h of heard) { a.set(h, o); o += h.length; } return a; })();
tp.push(pcm.subarray(48000, 96000));
await new Promise((r) => setTimeout(r, 200));
tp.push(pcm.subarray(96000, 144000));
tp.end();
const pf = framesOf(pl.map((l) => JSON.parse(l.replace(/^scriptevent spectral:live /, ''))), 16, 8);
const loud = (f) => f.amp.some((c) => c > 0) || f.nz.some((c) => c > 0);
ok(pf.length === 42 && tp.quiets === 1 && pf.every((f) => f.whole), `a pause: two frames of silence between the sentences (${pf.length} frames for 1 s + the pause + 1 s, ${tp.quiets} pause)`);
ok(loud(pf[19]) && !loud(pf[21]) && loud(pf[22]) && pf[22].rise.length > 0, `the first sentence fades out (frame 21: silent), the second starts with rises (frame 22: ${pf[22]?.rise.length} voices rise)`);
// links: /mc <gamertag>
const lf = path.join(tmp, 'links.json');
ok(link(lf, '123456789012345678', 'Steve') && link(lf, '223456789012345678', 'Alex Two') && !link(lf, 'nope', 'Steve') && !link(lf, '323456789012345678', 'bad;name') && !link(lf, '423456789012345678', 'x'.repeat(33)), 'links: a Discord id and a gamertag, nothing else');
fs.writeFileSync(lf, JSON.stringify({ ...JSON.parse(fs.readFileSync(lf, 'utf8')), evil: 'x', '523456789012345678': 'rm -rf /' }));
ok(JSON.stringify(readLinks(lf)) === JSON.stringify({ '123456789012345678': 'Steve', '223456789012345678': 'Alex Two' }), 'a links file read back: only the right entries', JSON.stringify(readLinks(lf)));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `✘ ${fails} failed` : '✔ all passed');
process.exit(fails ? 1 : 0);

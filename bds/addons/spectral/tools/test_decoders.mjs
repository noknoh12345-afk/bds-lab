#!/usr/bin/env node
// web/decoders.js against ffmpeg: the same test sound written by ffmpeg in each container and codec the converter page reads itself,
// decoded by the page's code and by ffmpeg — the samples must agree (exactly for PCM, G.711 and ADPCM: the same arithmetic as
// libavcodec). MIDI: a written file's notes come out at their pitches.   node tools/test_decoders.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), unit = path.dirname(here);
const D = createRequire(import.meta.url)(path.join(unit, 'web', 'decoders.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spectral-dec-'));
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) bad++; console.log(`${c ? '✔' : '✘'} ${m}`); };

// a test sound: a chirp in one channel, a chord with a little noise in the other, 0.7 s
const src = path.join(dir, 'src.wav');
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*(200+900*t)*t)|0.3*sin(2*PI*330*t)+0.2*sin(2*PI*495*t)+0.05*(random(0)-0.5):s=44100:d=0.7', '-c:a', 'pcm_f32le', src], { stdio: 'inherit' });
const ff = (file, ch, rate) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(ch), '-ar', String(rate), '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 2);
  return Array.from({ length: ch }, (_, c) => Float32Array.from({ length: f.length / ch }, (_, i) => f[i * ch + c]));
};
const cases = [
  // [name, ffmpeg output args, file extension, tolerance]
  ['WAV PCM u8', ['-c:a', 'pcm_u8'], 'wav', 0], ['WAV PCM s16', ['-c:a', 'pcm_s16le'], 'wav', 0], ['WAV PCM s24', ['-c:a', 'pcm_s24le'], 'wav', 0],
  ['WAV PCM s32', ['-c:a', 'pcm_s32le'], 'wav', 0], ['WAV float', ['-c:a', 'pcm_f32le'], 'wav', 0], ['WAV double', ['-c:a', 'pcm_f64le'], 'wav', 1e-7],
  ['WAV A-law', ['-c:a', 'pcm_alaw'], 'wav', 0], ['WAV μ-law', ['-c:a', 'pcm_mulaw'], 'wav', 0],
  ['WAV IMA ADPCM', ['-c:a', 'adpcm_ima_wav'], 'wav', 0], ['WAV MS ADPCM', ['-c:a', 'adpcm_ms'], 'wav', 0],
  ['WAV mono IMA ADPCM 8 kHz', ['-c:a', 'adpcm_ima_wav', '-ac', '1', '-ar', '8000'], 'wav', 0], ['WAV mono MS ADPCM 22 kHz', ['-c:a', 'adpcm_ms', '-ac', '1', '-ar', '22050'], 'wav', 0],
  ['RF64 PCM s16', ['-c:a', 'pcm_s16le', '-rf64', 'always'], 'wav', 0], ['Wave64 PCM s24', ['-c:a', 'pcm_s24le'], 'w64', 0],
  ['WAV extensible 6 ch s16', ['-c:a', 'pcm_s16le', '-ac', '6'], 'wav', 0],
  ['AIFF s16', ['-c:a', 'pcm_s16be'], 'aiff', 0], ['AIFF s8', ['-c:a', 'pcm_s8'], 'aiff', 0], ['AIFF s24', ['-c:a', 'pcm_s24be'], 'aiff', 0],
  ['AIFC sowt', ['-c:a', 'pcm_s16le'], 'aifc', 0], ['AIFC fl32', ['-c:a', 'pcm_f32be'], 'aifc', 0], ['AIFC ulaw', ['-c:a', 'pcm_mulaw'], 'aifc', 0],
  ['AIFC alaw', ['-c:a', 'pcm_alaw'], 'aifc', 0], ['AIFC ima4', ['-c:a', 'adpcm_ima_qt'], 'aifc', 0],
  ['AU s16', ['-c:a', 'pcm_s16be'], 'au', 0], ['AU μ-law', ['-c:a', 'pcm_mulaw'], 'au', 0], ['AU float', ['-c:a', 'pcm_f32be'], 'au', 0], ['AU A-law', ['-c:a', 'pcm_alaw'], 'au', 0],
  ['CAF s16le', ['-c:a', 'pcm_s16le'], 'caf', 0], ['CAF f32be', ['-c:a', 'pcm_f32be'], 'caf', 0], ['CAF ulaw', ['-c:a', 'pcm_mulaw'], 'caf', 0],
  ['CAF ima4', ['-c:a', 'adpcm_ima_qt'], 'caf', 0], ['VOC u8', ['-c:a', 'pcm_u8', '-ac', '1'], 'voc', 0], ['VOC s16', ['-c:a', 'pcm_s16le', '-ac', '1'], 'voc', 0],
];
for (const [name, args, ext, tol] of cases) {
  const f = path.join(dir, name.replace(/\W+/g, '_') + '.' + ext);
  const fmt = ext === 'aifc' ? ['-f', 'aiff'] : [];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...args, ...fmt, f]);
  if (r.status) { ok(false, `${name}: ffmpeg could not write it: ${String(r.stderr).trim().slice(0, 160)}`); continue; }
  let got;
  try { got = D.decode(new Uint8Array(fs.readFileSync(f))); } catch (e) { ok(false, `${name}: ${e.message}`); continue; }
  if (!got) { ok(false, `${name}: not recognised`); continue; }
  const want = ff(f, got.channels.length, got.sampleRate);
  let maxd = 0, len = Math.min(want[0].length, got.channels[0].length);
  for (let c = 0; c < want.length; c++) for (let i = 0; i < len; i++) maxd = Math.max(maxd, Math.abs(want[c][i] - got.channels[c][i]));
  // (ADPCM: ffmpeg gives the last block whole; the page cuts it at the fact chunk's count, the sound's own length.
  //  IMA4 has no such count: its last packet of 64 is whole in both)
  const adpcm = /ADPCM/.test(name), lenOk = adpcm ? got.channels[0].length === Math.round(0.7 * got.sampleRate) && got.channels[0].length <= want[0].length
    : Math.abs(want[0].length - got.channels[0].length) <= (ext === 'aifc' || ext === 'caf' ? 64 : 0);
  ok(maxd <= tol && lenOk && len > 1000, `${name} (${got.format}, ${got.sampleRate} Hz, ${got.channels.length} ch): ${len} samples, largest difference ${maxd.toExponential(1)}${lenOk ? '' : `, lengths ${got.channels[0].length} / ${want[0].length}`}`);
}
// not its kind: null; a codec it lacks: an error naming it (the page then tries ffmpeg)
ok(D.decode(new Uint8Array(fs.readFileSync(src)).subarray(0, 0)) === null && D.sniff(new TextEncoder().encode('ID3\x04 mp3')) === null, 'an MP3 / nothing: not one of its kinds');
{
  const f = path.join(dir, 'gsm.wav'); spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '8000', '-c:a', 'libgsm_ms', f]);
  let msg = ''; try { D.decode(new Uint8Array(fs.readFileSync(f))); } catch (e) { msg = e.message; }
  ok(/GSM/.test(msg), `WAV of a codec it lacks: "${msg}"`);
}
// MIDI: a format-1 file, two tracks (tempo; a piano C4 then an A4 with a bend up a whole tone, then drums), notes at their pitches
{
  const vlq = (x) => { const o = [x & 127]; while ((x >>= 7)) o.unshift((x & 127) | 128); return o; };
  const trk = (ev) => { const b = ev.flat(); return [...Buffer.from('MTrk'), 0, 0, (b.length + 4) >> 8, (b.length + 4) & 255, ...b, 0, 0xFF, 0x2F, 0]; };
  const t0 = trk([[0, 0xFF, 0x51, 3, 0x07, 0xA1, 0x20]]);                              // 120 bpm
  const t1 = trk([[0, 0xC0, 0], [0, 0x90, 60, 100], [...vlq(480), 0x80, 60, 0], [0, 0x90, 69, 100], [...vlq(480), 0xE0, 0, 0x7F],
    [...vlq(480), 0x80, 69, 0], [0, 0x99, 36, 120], [...vlq(240), 0x89, 36, 0]]);
  const mid = Uint8Array.from([...Buffer.from('MThd'), 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xE0, ...t0, ...t1]);
  const r = D.decode(mid), x = r.channels[0], sr = r.sampleRate;
  const peak = (a, b) => {           // the strongest frequency between seconds a and b (a 0.25 Hz-step scan of 60–1200 Hz)
    let best = 0, bf = 0; const i0 = Math.round(a * sr), i1 = Math.round(b * sr);
    for (let f = 60; f < 1200; f += 0.25) { let re = 0, im = 0; for (let i = i0; i < i1; i += 2) { re += x[i] * Math.cos(2 * Math.PI * f * i / sr); im += x[i] * Math.sin(2 * Math.PI * f * i / sr); } const m = re * re + im * im; if (m > best) { best = m; bf = f; } }
    return bf;
  };
  const c4 = peak(0.05, 0.45), a4 = peak(0.55, 0.95), bent = peak(1.05, 1.45);
  ok(r.format.startsWith('MIDI (3 notes') && Math.abs(c4 - 261.6) < 1 && Math.abs(a4 - 440) < 1 && Math.abs(bent - 493.9) < 1.5 && x.length > sr * 1.5,
    `MIDI: ${r.format}, ${(x.length / sr).toFixed(2)} s; C4 at ${c4} Hz, A4 at ${a4} Hz, bent a whole tone up to ${bent} Hz`);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${bad ? 'FAIL' : 'PASS'} ${n - bad}/${n}`);
process.exit(bad ? 1 : 0);

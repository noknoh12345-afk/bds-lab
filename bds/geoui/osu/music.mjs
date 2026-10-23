#!/usr/bin/env node
// The osu! samples' song and beatmap written to bds/geoui/osu/assets/: the composition, its two arrangements, the chip
// hitsounds and the beatmaps are bds/geoui/timeline/osusong.js (pure: the plugin makes them too); here they become files —
// the audio once as .ogg (ffmpeg, libvorbis), kept in the repository (demo.mjs reads it), and the .osu text (checked).
//   node bds/geoui/osu/music.mjs [--write | --check]   (neither: print what it would make)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// (the song itself: bds/geoui/timeline/osusong.js — a timeline part, so the plugin can make it too)
const S = createRequire(import.meta.url)('../timeline/osusong.js');
export const { BPM, BEAT, BAR, BARS, LEAD_IN, SONG, SECTIONS, score, render, chipHitsounds, beatmap } = S;

/** PCM → WAV bytes (16-bit) */
export function wav({ rate, channels }) {
  const n = channels[0].length, ch = channels.length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32767))), 44 + (i * ch + c) * 2);
  return buf;
}

/** ffmpeg: PCM → .ogg (libvorbis, quality q) */
export function ogg(pcm, q = 4) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'music-')), w = path.join(tmp, 'a.wav'), o = path.join(tmp, 'a.ogg');
  fs.writeFileSync(w, wav(pcm));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', w, '-c:a', 'libvorbis', '-q:a', String(q), '-map_metadata', '-1', '-fflags', '+bitexact', o], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr || r.error}`);
  const out = fs.readFileSync(o);
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write'), check = process.argv.includes('--check'), OUT = path.join(HERE, 'assets');
  const maps = { 'cubic_pulse_pixel.osu': beatmap('chip'), 'cubic_pulse_skin.osu': beatmap('synth') };
  if (check) {
    const stale = Object.entries(maps).filter(([f, txt]) => !fs.existsSync(path.join(OUT, f)) || fs.readFileSync(path.join(OUT, f), 'utf8') !== txt).map(([f]) => f);
    if (stale.length) { console.error(`bds/geoui/osu/assets: ${stale.join(', ')} is not what music.mjs makes (node bds/geoui/osu/music.mjs --write)`); process.exit(1); }
    console.log(`OK the beatmaps are up to date (${Object.keys(maps).length})`);
  } else if (write) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [f, txt] of Object.entries(maps)) fs.writeFileSync(path.join(OUT, f), txt);
    fs.writeFileSync(path.join(OUT, 'cubic_pulse.ogg'), ogg(render('synth'), 5));
    fs.writeFileSync(path.join(OUT, 'cubic_pulse_chip.ogg'), ogg(render('chip'), 3));
    for (const [name, pcm] of Object.entries(chipHitsounds())) fs.writeFileSync(path.join(OUT, `chip-${name}.ogg`), ogg(pcm, 3));
    for (const f of fs.readdirSync(OUT).sort()) console.log(`  ${f}  ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
  } else {
    const n = score();
    console.log(`${SONG.title}: ${BPM} BPM, ${BARS} bars, ${(LEAD_IN + BARS * BAR + 2.5).toFixed(1)} s, ${n.length} notes; maps: ${Object.entries(maps).map(([f, t]) => `${f} ${t.split('[HitObjects]')[1].trim().split(/\r?\n/).length} objects`).join(', ')}`);
  }
}

#!/usr/bin/env node
// A MIDI file (SMF 0/1/2, RMID, KAR) played by the converter page's synthesiser (web/decoders.js renderMidi: General MIDI's
// instrument families and drums) to a 44.1 kHz WAV — what tools/spectral.py converts when it is given a MIDI file.
//   node tools/render_midi.mjs <in.mid> <out.wav>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const unit = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = createRequire(import.meta.url)(path.join(unit, 'web', 'decoders.js'));
const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: node tools/render_midi.mjs <in.mid> <out.wav>'); process.exit(2); }
const r = D.renderMidi(new Uint8Array(fs.readFileSync(inp)), { sampleRate: 44100 });
if (!r) { console.error(`${inp}: not a MIDI file`); process.exit(1); }
const x = r.channels[0], n = x.length, b = Buffer.alloc(44 + n * 4);
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(r.sampleRate, 24); b.writeUInt32LE(r.sampleRate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
b.write('data', 36); b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) b.writeFloatLE(x[i], 44 + i * 4);
fs.writeFileSync(out, b);
console.error(`${path.basename(inp)}: ${r.format}, ${(n / r.sampleRate).toFixed(2)} s → ${out}`);

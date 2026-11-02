#!/usr/bin/env node
// Spectral Connect without a game: a fake Minecraft client (the /connect side: a WebSocket that answers each commandRequest and
// sends a chat event) against the server — a file is turned into a song, sent as spectral:song script events and played; a chat
// line `!spectral <file>` does the same.   node tools/connect/test.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.dirname(path.dirname(HERE));
const PORT = 18790 + Math.floor(Math.random() * 1000);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++; };

const srv = spawn('node', [path.join(HERE, 'server.mjs'), '--port', String(PORT), '--max', '6'], { stdio: ['ignore', 'pipe', 'pipe'] });
let srvOut = ''; srv.stdout.on('data', (d) => (srvOut += d)); srv.stderr.on('data', (d) => (srvOut += d));
await new Promise((r) => { const t = setInterval(() => { if (srvOut.includes('Spectral Connect on')) { clearInterval(t); r(); } }, 100); });

// the fake game: a WebSocket client (masked frames) that answers commands
const got = [];
const sock = net.connect(PORT, '127.0.0.1');
const key = crypto.randomBytes(16).toString('base64');
sock.write(`GET /mc HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
const sendFrame = (text) => {
  const data = Buffer.from(text), mask = crypto.randomBytes(4);
  const head = data.length < 126 ? Buffer.from([0x81, 0x80 | data.length]) : (() => { const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(data.length, 2); return h; })();
  sock.write(Buffer.concat([head, mask, Buffer.from(data.map((b, i) => b ^ mask[i & 3]))]));
};
let buf = Buffer.alloc(0), upgraded = false;
sock.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (!upgraded) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; ok(buf.slice(0, i).toString().includes('101 Switching'), 'the handshake (101)'); upgraded = true; buf = buf.subarray(i + 4); }
  for (;;) {
    if (buf.length < 2) return;
    let len = buf[1] & 0x7f, at = 2;
    if (len === 126) { len = buf.readUInt16BE(2); at = 4; } else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); at = 10; }
    if (buf.length < at + len) return;
    const m = JSON.parse(buf.subarray(at, at + len).toString()); buf = buf.subarray(at + len);
    got.push(m);
    if (m.header?.messagePurpose === 'commandRequest') {
      const line = m.body.commandLine;
      sendFrame(JSON.stringify({ header: { version: 1, requestId: m.header.requestId, messagePurpose: 'commandResponse' }, body: { statusCode: 0, statusMessage: line.startsWith('spectral:play') ? '▶ played' : 'ok' } }));
    }
  }
});
await new Promise((r) => setTimeout(r, 500));
ok(got.some((m) => m.header?.messagePurpose === 'subscribe' && m.body?.eventName === 'PlayerMessage'), 'the server subscribes to chat');

// a file through the page's API
const mid = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spectral-connect-test-')), 'etude.mid');
// (a MIDI file made on the spot: two octaves up and down, a piano)
const MIDI = `import mido, sys
m = mido.MidiFile(ticks_per_beat=480); t = mido.MidiTrack(); m.tracks.append(t)
t.append(mido.MetaMessage('set_tempo', tempo=500000))
keys = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
for k in keys + keys[::-1]:
    t.append(mido.Message('note_on', note=k, velocity=90, time=0)); t.append(mido.Message('note_off', note=k, velocity=0, time=240))
m.save(sys.argv[1])`;
const r0 = spawn('python3', ['-c', MIDI, mid]); await new Promise((r) => r0.on('close', r));
ok(fs.existsSync(mid), 'a MIDI file to send');
const res = await fetch(`http://127.0.0.1:${PORT}/api/play`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: mid, title: 'test étude' }) });
ok(res.status === 202, 'the page queues a file');
for (let k = 0; k < 120 && !got.some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 500));
const songs = got.filter((m) => m.body?.commandLine?.startsWith('scriptevent spectral:song '));
ok(songs.length > 0, `the song went as ${songs.length} spectral:song script events`);
const first = songs.length ? JSON.parse(songs[0].body.commandLine.slice('scriptevent spectral:song '.length)) : {};
ok(first.meta?.format?.startsWith('spectral-notes/') && first.i === 0, 'a MIDI file goes as a note song (the sampler)');
ok(songs.every((m) => m.body.commandLine.length <= 1800 + 'scriptevent spectral:song '.length), 'every part fits a script event');
ok(got.some((m) => m.body?.commandLine === `spectral:play ${first.id}`), 'and then it is played');
const st = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
ok(st.jobs[0]?.step === 'playing' && st.jobs[0]?.result === '▶ played', `the page sees the job: ${st.jobs[0]?.step} ${st.jobs[0]?.result}`);

// chat: !spectral <file>
const before = got.length;
sendFrame(JSON.stringify({ header: { version: 1, messagePurpose: 'event', eventName: 'PlayerMessage' }, body: { message: `!spectral ${mid} notes`, sender: 'Steve', type: 'chat' } }));
for (let k = 0; k < 120 && !got.slice(before).some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 500));
ok(got.slice(before).some((m) => m.body?.commandLine?.startsWith('spectral:play')), 'a chat line !spectral <file> plays it too');
const st2 = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
ok(st2.games[0]?.name === 'Steve', 'the game is known by its player');

// a recording (the sine engine: tools/spectral.py), a few seconds — in many parts, which put together are the song
const wav = path.join(path.dirname(mid), 'tones.wav');
const r1 = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=4', '-filter_complex', 'amix=inputs=2', wav]);
await new Promise((r) => r1.on('close', r));
const before2 = got.length;
const res2 = await fetch(`http://127.0.0.1:${PORT}/api/play`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: wav, where: 'speaker' }) });
ok(res2.status === 202, 'a recording is queued');
for (let k = 0; k < 360 && !got.slice(before2).some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 500));
const parts2 = got.slice(before2).filter((m) => m.body?.commandLine?.startsWith('scriptevent spectral:song ')).map((m) => JSON.parse(m.body.commandLine.slice('scriptevent spectral:song '.length)));
ok(parts2.length > 1 && parts2.every((p, i) => p.i === i && p.n === parts2.length), `a recording goes in ${parts2.length} parts, numbered`);
ok(parts2[0]?.meta && !String(parts2[0].meta.format ?? '').startsWith('spectral-notes/'), 'as a sine-engine song');
ok(parts2.map((p) => p.data).join('').length > 1800, 'and the parts together are the whole song');
ok(got.slice(before2).some((m) => /^spectral:play \S+ speaker$/.test(m.body?.commandLine ?? '')), 'played on the speaker when asked');

// the page itself
const page = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
ok(page.includes('Spectral Connect') && page.includes('/panel/styles.css') && page.includes('/panel/panel.css'), 'the page, in the lab\'s OreUI');
for (const f of ['styles.css', 'panel.css', 'fonts/fonts.css']) ok((await fetch(`http://127.0.0.1:${PORT}/panel/${f}`)).status === 200, `the panel's ${f} is served`);
const raw = await new Promise((r) => http.get({ host: '127.0.0.1', port: PORT, path: '/panel/../../AGENTS.md' }, (res) => { res.resume(); r(res.statusCode); }));
ok(raw === 404, 'nothing outside panel/ is served');
ok((await fetch(`http://127.0.0.1:${PORT}/api/command`, { method: 'POST', body: JSON.stringify({ line: 'op @a' }) })).status === 400, 'the page sends only Spectral Player\'s own commands');


sock.end(); srv.kill();
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exit(fails ? 1 : 0);

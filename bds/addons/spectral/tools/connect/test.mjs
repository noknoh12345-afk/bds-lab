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

// the fake game: a WebSocket client (masked frames) that answers commands (and keeps the player's tags, as /tag does)
const got = [], tags = new Set();
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
      let said = line.startsWith('spectral:play') ? '▶ played' : 'ok';
      if (line === 'tag @s list') said = tags.size ? `Steve has ${tags.size} tags: ${[...tags].map((t) => `§a${t}§r`).join(', ')}` : 'Steve has no tags';
      const rm = /^tag @s remove "(.+)"$/.exec(line); if (rm) tags.delete(rm[1]);
      sendFrame(JSON.stringify({ header: { version: 1, requestId: m.header.requestId, messagePurpose: 'commandResponse' }, body: { statusCode: 0, statusMessage: said } }));
    }
  }
});
await new Promise((r) => setTimeout(r, 500));
ok(got.some((m) => m.header?.messagePurpose === 'subscribe' && m.body?.eventName === 'PlayerMessage'), 'the server subscribes to chat');
ok(got.some((m) => m.body?.commandLine === 'scriptevent sr:show ws 1'), 'and tells the remote in the game it is connected');
ok(got.some((m) => m.body?.commandLine === 'scriptevent spectral:remote hello'), 'and Spectral Player says hello (what the device run waits for)');

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
// (the play command's answer comes back a moment after it went: the page is asked until it has it, at most 2 s)
let st = {};
for (let k = 0; k < 20; k++) { st = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json(); if (st.jobs[0]?.result) break; await new Promise((r) => setTimeout(r, 100)); }
ok(st.jobs[0]?.step === 'playing' && st.jobs[0]?.result === '▶ played', `the page sees the job: ${st.jobs[0]?.step} ${st.jobs[0]?.result}`);

// chat: !spectral <file>
const before = got.length;
sendFrame(JSON.stringify({ header: { version: 1, messagePurpose: 'event', eventName: 'PlayerMessage' }, body: { message: `!spectral ${mid} notes`, sender: 'Steve', type: 'chat' } }));
for (let k = 0; k < 120 && !got.slice(before).some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 500));
ok(got.slice(before).some((m) => m.body?.commandLine?.startsWith('spectral:play')), 'a chat line !spectral <file> plays it too');
const st2 = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
ok(st2.games[0]?.name === 'Steve', 'the game is known by its player');

// the remote in the game: its 「曲にして流す」 as a mail (bds/geoui/html runtime mail:play — the page's fields, base64url, on the
// player's tags in parts): read with /tag @s list, taken off, played, each step told back to the remote
const body = Buffer.from(JSON.stringify({ n: 'play', f: { url: mid, vol: 100 } })).toString('base64url');
const before3 = got.length;
for (let k = 0, n = Math.ceil(body.length / 200); k < n; k++) tags.add(`geoui.mail.sr.7.${k}.${n}.${body.slice(k * 200, (k + 1) * 200)}`);
for (let k = 0; k < 120 && !got.slice(before3).some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 250));
const after3 = got.slice(before3).map((m) => m.body?.commandLine ?? '');
ok(after3.some((l) => l.startsWith('spectral:play c')), 'a mail from the remote (geoui.mail.sr.… tags) is played');
ok(tags.size === 0 && after3.some((l) => /^tag @s remove "geoui\.mail\.sr\.7\.0\./.test(l)), 'and taken off the player');
ok(['st_conv 1', 'st_send 1', 'st_play 1'].every((x) => after3.includes(`scriptevent sr:show ${x}`)) && after3.includes('scriptevent sr:value sent 100'), 'the remote is told each step (sr:show st_conv / st_send / st_play, sr:value sent)');
tags.add(`geoui.mail.sr.7.0.1.${body.slice(0, 200)}`);                                // (the same mail again: already done)
const before4 = got.length; await new Promise((r) => setTimeout(r, 1600));
ok(!got.slice(before4).some((m) => m.body?.commandLine?.startsWith('spectral:play')) && tags.size === 0, 'a mail seen again is taken off but not played twice');

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

// live notes (the page's keys, a MIDI keyboard): /api/notes → every 50 ms one scriptevent spectral:note @<clock>;on …;off …, each note
// about 90 ms after it was played (its age taken off)
const before5 = got.length;
await fetch(`http://127.0.0.1:${PORT}/api/notes`, { method: 'POST', body: JSON.stringify({ events: [{ type: 'on', key: 60, vel: 100, prog: 0, age: 20 }, { type: 'on', key: 64, vel: 90, prog: 0, age: 0 }, { type: 'off', key: 60, prog: 0, age: 0 }] }) });
for (let k = 0; k < 40 && !got.slice(before5).some((m) => m.body?.commandLine?.startsWith('scriptevent spectral:note ')); k++) await new Promise((r) => setTimeout(r, 25));
const live = got.slice(before5).map((m) => m.body?.commandLine ?? '').find((l) => l.startsWith('scriptevent spectral:note '));
const lm = live && /^scriptevent spectral:note @(\d+);on 60 100 0 (\d+);on 64 90 0 (\d+);off 60 0 (\d+)$/.exec(live);
ok(lm && Math.abs(Date.now() - Number(lm[1])) < 2000, 'live notes go as one scriptevent with the server\'s clock', live);
ok(lm && Number(lm[2]) < Number(lm[3]) && Number(lm[3]) - Number(lm[2]) >= 15 && Number(lm[3]) <= 90, 'each a little before 90 ms on, the older one earlier by its age', live);

// a song already made, named inside the unit (what the device run sends: no converting there)
const before6 = got.length;
sendFrame(JSON.stringify({ header: { version: 1, messagePurpose: 'event', eventName: 'PlayerMessage' }, body: { message: '!spectral tools/exp/packs/notes/clicks_pulse.song.json', sender: 'Steve', type: 'chat' } }));
for (let k = 0; k < 80 && !got.slice(before6).some((m) => m.body?.commandLine?.startsWith('spectral:play')); k++) await new Promise((r) => setTimeout(r, 100));
ok(got.slice(before6).some((m) => m.body?.commandLine === 'spectral:play clicks_pulse'), 'a .song.json in the unit plays as it is (its own id)');
// the remote's mail scale: a C major scale on the live keys, each note when it is due
const before7 = got.length;
const sbody = Buffer.from(JSON.stringify({ n: 'scale', f: {} })).toString('base64url');
tags.add(`geoui.mail.sr.9.0.1.${sbody}`);
for (let k = 0; k < 60 && got.slice(before7).filter((m) => /spectral:note .*on 72 /.test(m.body?.commandLine ?? '')).length === 0; k++) await new Promise((r) => setTimeout(r, 100));
const scale = got.slice(before7).map((m) => m.body?.commandLine ?? '').filter((l) => l.startsWith('scriptevent spectral:note '));
const ons = scale.flatMap((l) => [...l.matchAll(/on (\d+) 100 0 (\d+)/g)].map((x) => Number(x[1])));
ok(JSON.stringify(ons) === JSON.stringify([60, 62, 64, 65, 67, 69, 71, 72]) && scale.length >= 6, `the mail scale plays C4 to C5 on the live keys, in ${scale.length} batches`, JSON.stringify(scale.slice(0, 3)));

// the page itself
const page = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
ok(page.includes('Spectral Connect') && page.includes('/panel/styles.css') && page.includes('/panel/panel.css') && page.includes('requestMIDIAccess'), 'the page, in the lab\'s OreUI, with its keys and Web MIDI');
for (const f of ['styles.css', 'panel.css', 'fonts/fonts.css']) ok((await fetch(`http://127.0.0.1:${PORT}/panel/${f}`)).status === 200, `the panel's ${f} is served`);
const raw = await new Promise((r) => http.get({ host: '127.0.0.1', port: PORT, path: '/panel/../../AGENTS.md' }, (res) => { res.resume(); r(res.statusCode); }));
ok(raw === 404, 'nothing outside panel/ is served');
ok((await fetch(`http://127.0.0.1:${PORT}/api/command`, { method: 'POST', body: JSON.stringify({ line: 'op @a' }) })).status === 400, 'the page sends only Spectral Player\'s own commands');


// the game's encryption ("Require Encrypted Websockets"): a second fake game that answers enableencryption with its key — from then on
// every frame both ways is AES-256-CFB8 (ECDH secp384r1, key = SHA-256(salt + secret), iv = its first 16 bytes)
{
  const s2 = net.connect(PORT, '127.0.0.1'), seen = [];
  let b2 = Buffer.alloc(0), up = false, enc = null, dec = null, keyAnswered = false;
  s2.write(`GET /mc HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  const frame = (payload, op) => {
    const mask = crypto.randomBytes(4), n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, 0x80 | n]) : (() => { const h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 0x80 | 126; h.writeUInt16BE(n, 2); return h; })();
    s2.write(Buffer.concat([head, mask, Buffer.from(payload.map((x, i) => x ^ mask[i & 3]))]));
  };
  const say = (obj) => { const raw = Buffer.from(JSON.stringify(obj)); if (enc) frame(enc.update(raw), 2); else frame(raw, 1); };
  s2.on('data', (chunk) => {
    b2 = Buffer.concat([b2, chunk]);
    if (!up) { const i = b2.indexOf('\r\n\r\n'); if (i < 0) return; up = true; b2 = b2.subarray(i + 4); }
    for (;;) {
      if (b2.length < 2) return;
      let len = b2[1] & 0x7f, at = 2;
      if (len === 126) { len = b2.readUInt16BE(2); at = 4; } else if (len === 127) { len = Number(b2.readBigUInt64BE(2)); at = 10; }
      if (b2.length < at + len) return;
      const raw = b2.subarray(at, at + len); b2 = b2.subarray(at + len);
      const m = JSON.parse(dec ? dec.update(raw).toString() : raw.toString());
      seen.push({ m, encrypted: Boolean(dec) });
      const line = m.body?.commandLine ?? '';
      if (line.startsWith('enableencryption ')) {
        const [pubB64, saltB64] = JSON.parse(`[${line.slice('enableencryption '.length).replace('" "', '","')}]`);
        const mine = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
        const secret = crypto.diffieHellman({ privateKey: mine.privateKey, publicKey: crypto.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }) });
        const key = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(saltB64, 'base64'), secret])).digest();
        say({ header: { version: 1, requestId: m.header.requestId, messagePurpose: 'commandResponse' }, body: { statusCode: 0, publicKey: mine.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') } });
        enc = crypto.createCipheriv('aes-256-cfb8', key, key.subarray(0, 16)); dec = crypto.createDecipheriv('aes-256-cfb8', key, key.subarray(0, 16)); keyAnswered = true;
      } else if (m.header?.messagePurpose === 'commandRequest') {
        say({ header: { version: 1, requestId: m.header.requestId, messagePurpose: 'commandResponse' }, body: { statusCode: 0, statusMessage: line === 'tag @s list' ? 'Alex has no tags' : 'ok' } });
      }
    }
  });
  for (let k = 0; k < 40 && !seen.some((x) => x.m.body?.eventName === 'PlayerMessage'); k++) await new Promise((r) => setTimeout(r, 100));
  ok(keyAnswered, 'the server asks the game for encryption first (enableencryption with its key and salt)');
  ok(seen.some((x) => x.encrypted && x.m.body?.eventName === 'PlayerMessage') && seen.filter((x) => !x.encrypted).length === 1, 'and everything after the game\'s key comes encrypted (the subscription waited for it)');
  say({ header: { version: 1, messagePurpose: 'event', eventName: 'PlayerMessage' }, body: { message: '!spectral tools/exp/packs/notes/clicks_pulse.song.json', sender: 'Alex', type: 'chat' } });
  for (let k = 0; k < 60 && !seen.some((x) => x.m.body?.commandLine === 'spectral:play clicks_pulse'); k++) await new Promise((r) => setTimeout(r, 100));
  ok(seen.some((x) => x.encrypted && x.m.body?.commandLine === 'spectral:play clicks_pulse'), 'an encrypted chat line is read, and the song goes back encrypted');
  s2.end();
}

sock.end(); srv.kill();
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exit(fails ? 1 : 0);

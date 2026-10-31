#!/usr/bin/env node
// Discord voice → Minecraft proximity voice. A bot sits in a voice channel and hears each person; the live encoder (web/live.js)
// turns each voice into Spectral Player's live frames as it comes, and the server plays it in 3D from the Minecraft player that
// person linked ("follow": the client turns and fades it with each listener's place and heading, the sound moves with the
// talker). Only linked people are heard in the game.
//
//   cd tools/live && npm install          (discord.js, @discordjs/voice — with Discord's voice encryption and DAVE — prism-media,
//                                          opusscript: package.json)
//   DISCORD_BOT_TOKEN=… node tools/live/bridge.mjs --guild <server id> --channel <voice channel id> [--links links.json]
//        [--bds <folder with bedrock_server>] [--stdout] [--lab [live.json]] [--voices 16] [--fake <audio> --as <gamertag>]
//
// In Discord: /mc <gamertag> links you (the bot's own command, in that server). Where the frames go:
//   --bds <folder>   starts the server itself and writes them into its console (what you type still reaches the server)
//   --stdout         prints the console lines (scriptevent spectral:live …) to pipe anywhere
//   --lab            bds-lab's live server (node lab.mjs up): its /do, the console of the server the lab runs
//   --fake <audio>   no Discord: that file as if <gamertag> spoke it (tries the way out: --bds / --stdout / --lab)
// The bot needs the Guilds and GuildVoiceStates intents (no privileged one), and Connect + Use Application Commands in the channel.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const L = require(path.join(here, '..', '..', 'web', 'live.js'));

// ---- the parts without Discord (pure, tried by tools/live/test_bridge.mjs)
export const GAMERTAG = /^[A-Za-z0-9 _-]{1,32}$/;
/** links.json: { "<discord user id>": "<gamertag>" } */
export function readLinks(file) { try { const o = JSON.parse(fs.readFileSync(file, 'utf8')); return Object.fromEntries(Object.entries(o).filter(([k, v]) => /^\d{15,22}$/.test(k) && GAMERTAG.test(String(v)))); } catch { return {}; } }
export function link(file, userId, gamertag) {
  if (!/^\d{15,22}$/.test(String(userId)) || !GAMERTAG.test(String(gamertag ?? '').trim())) return false;
  const o = readLinks(file); o[userId] = String(gamertag).trim();
  fs.writeFileSync(file, JSON.stringify(o, null, 1) + '\n');
  return true;
}
/** 16-bit stereo PCM (Discord's 48 kHz, as prism's Opus decoder gives it) → mono float samples */
export function monoOf(pcm) {
  const n = pcm.length >> 2, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 65536;
  return out;
}
/** a talker: their voice in (mono float, any chunks) → the console lines out, through `send` (one frame a message: the lowest
 *  latency; a message is ~150 characters, /scriptevent takes 2048) */
export class Talker {
  constructor({ id, gamertag, voices = 16, send }) {
    this.id = id; this.at = `follow:${gamertag}`; this.enc = new L.LiveEncoder({ voices }); this.send = send; this.seq = 0; this.first = true;
  }
  push(mono) {
    for (const f of this.enc.push(mono)) {
      this.send(`scriptevent spectral:live ${L.message(this.id, this.seq++, [f], this.first ? { meta: this.enc.meta(), at: this.at } : {})}`);
      this.first = false;
    }
  }
  end() { this.send(`scriptevent spectral:live ${JSON.stringify({ id: this.id, end: true })}`); }
}
export const streamId = (userId) => `vc_${String(userId).slice(-12)}`;

// ---- where the lines go
function sinkOf(o) {
  if (o.bds) {
    const dir = path.resolve(o.bds), exe = fs.existsSync(path.join(dir, 'bedrock_server.exe')) ? 'bedrock_server.exe' : './bedrock_server';
    const srv = spawn(exe, [], { cwd: dir, env: { ...process.env, LD_LIBRARY_PATH: dir }, stdio: ['pipe', 'inherit', 'inherit'] });
    process.stdin.on('data', (d) => srv.stdin.write(d));              // (the person's own console commands)
    srv.on('exit', (c) => { console.error(`[bridge] the server stopped (${c})`); process.exit(c ?? 0); });
    return (line) => srv.stdin.write(line + '\n');
  }
  if (o.lab) {
    // (one after another: the frames keep their order, and the end comes last)
    const info = JSON.parse(fs.readFileSync(path.resolve(o.lab), 'utf8'));
    let chain = Promise.resolve();
    const send = (line) => { chain = chain.then(() => fetch(`http://127.0.0.1:${info.http}/do`, { method: 'POST', body: JSON.stringify({ cmds: [line], wait: 0 }) })).catch((e) => console.error(`[bridge] lab: ${e.message}`)); };
    send.flush = () => chain;
    return send;
  }
  return (line) => process.stdout.write(line + '\n');
}

async function main() {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; };
  const o = { guild: opt('--guild'), channel: opt('--channel'), links: path.resolve(opt('--links', path.join(here, 'links.json'))), bds: opt('--bds'), lab: opt('--lab'), voices: Number(opt('--voices', 16)), fake: opt('--fake'), as: opt('--as') };
  if (o.lab === true) o.lab = path.join(here, '..', '..', '..', '..', '.lab', 'live.json');
  const send = sinkOf(o);
  if (o.fake) {
    // (no Discord: a file as a talker, paced as it plays)
    if (!o.as || !GAMERTAG.test(o.as)) { console.error('--fake needs --as <gamertag>'); process.exit(2); }
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', o.fake, '-f', 's16le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 30 });
    if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1); }
    const t = new Talker({ id: 'vc_fake', gamertag: o.as, voices: o.voices, send }), pcm = r.stdout, chunk = 3840, t0 = Date.now();   // 20 ms, as Discord sends
    for (let i = 0; i < pcm.length; i += chunk) {
      t.push(monoOf(pcm.subarray(i, i + chunk)));
      const wait = t0 + ((i / chunk + 1) * 20) - Date.now(); if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }
    t.end();
    await send.flush?.();
    console.error(`[bridge] --fake: ${(pcm.length / 192000).toFixed(1)} s as ${o.as}, ${t.seq} frames`);
    if (!o.bds) process.exit(0);
    return;
  }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !o.guild || !o.channel) { console.error('DISCORD_BOT_TOKEN, --guild and --channel are needed (or --fake <audio> --as <gamertag>)'); process.exit(2); }
  let djs, voice, prism;
  try { djs = require('discord.js'); voice = require('@discordjs/voice'); prism = require('prism-media'); }
  catch { console.error('cd tools/live && npm install (discord.js, @discordjs/voice, prism-media, opusscript)'); process.exit(2); }
  const { Client, GatewayIntentBits, ApplicationCommandOptionType } = djs;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const talkers = new Map(), unlinked = new Set();
  client.on('interactionCreate', async (it) => {
    if (!it.isChatInputCommand?.() || it.commandName !== 'mc') return;
    const tag = it.options.getString('gamertag');
    const ok = link(o.links, it.user.id, tag);
    await it.reply({ content: ok ? `🎧 ${tag} とつなぎました: Minecraft でその人の位置からあなたの声が聞こえます` : 'ゲーマータグは英数字・空白・_ - で 32 字まで', ephemeral: true }).catch(() => {});
  });
  client.once('ready', async () => {
    const guild = await client.guilds.fetch(o.guild);
    await guild.commands.create({ name: 'mc', description: 'Minecraft のプレイヤーとつなぐ（その人の位置から声が聞こえる）', options: [{ type: ApplicationCommandOptionType.String, name: 'gamertag', description: 'Minecraft のゲーマータグ', required: true }] });
    const conn = voice.joinVoiceChannel({ channelId: o.channel, guildId: o.guild, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
    await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 30_000);
    console.error(`[bridge] in the voice channel ${o.channel} of ${guild.name}: /mc <gamertag> links a person`);
    conn.receiver.speaking.on('start', (userId) => {
      if (talkers.has(userId)) return;
      const tag = readLinks(o.links)[userId];
      if (!tag) { if (!unlinked.has(userId)) { unlinked.add(userId); console.error(`[bridge] ${userId} is not linked (/mc <gamertag>): not played`); } return; }
      const t = new Talker({ id: streamId(userId), gamertag: tag, voices: o.voices, send });
      const opus = conn.receiver.subscribe(userId, { end: { behavior: voice.EndBehaviorType.AfterSilence, duration: 1000 } });
      const dec = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
      talkers.set(userId, t);
      opus.pipe(dec).on('data', (pcm) => t.push(monoOf(pcm)));
      const done = () => { if (talkers.get(userId) === t) { talkers.delete(userId); t.end(); } };
      opus.once('end', done); opus.once('close', done); dec.once('error', (e) => { console.error(`[bridge] ${tag}: ${e.message}`); done(); });
    });
  });
  await client.login(token);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(`[bridge] ${e.stack ?? e}`); process.exit(1); });

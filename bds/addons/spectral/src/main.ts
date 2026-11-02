// Spectral Player — MP3 resynthesised in Minecraft Bedrock by additive synthesis, at the limit of the Script API.
//
// Each sine voice is ONE looping SoundInstance (loopCount -1, a 1760 Hz sine) started once; every tick the engine
// steers it with setPitch(f/1760) and fade(): the phase never restarts, so a held note is a clean sine, not a
// train of retriggered grains. Noise bands (the part of the sound sine voices do not cover) are looping band-limited
// noises steered the same way; drum attacks are one-shot bursts whose 4 file variants carry 0/12.5/25/37.5 ms of
// leading silence, so they land between ticks. Songs are data (a few kB/s), not sounds: the resource pack never
// changes, new songs arrive as song packs over script events, and playback is fully dynamic (seek, time-stretch,
// transpose, EQ, freeze, reverse, 3D speaker).  tools/spectral.py renders the very same tick rules offline.
import { world, system, Player, Entity, Dimension, Vector3, SoundInstance, PlayerPermissionLevel } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { cmd, cmdAny, menu, ask, onItem, give, item, once, load, save } from './kit';
import { OSC_AMP, BASE_HZ, NOISE_RMS, NOISE_BANDS, BURST_RMS, BURST_BANDS, SUB } from './assets';
import demo from './songs/demo';
import programs, { Program } from './calib_programs';
import { readPart, joinParts, decodeSongJob, songHeader, payloadText, payloadFrom, Part, SongMeta, FIELD_CHARS, PHONE_CHARS } from './songtext';
import { NotePlayer, NoteSong, NoteMeta, isNoteMeta, decodeNotes } from './notes';
import notesDemo from './songs/notes_demo';
import { saySong } from './say';
import { VOICES } from './bank';

// ------------------------------------------------------------------ constants (same as tools/spectral.py)
const SILENT = 1e-4;            // voices never go to 0 so the client keeps every loop alive
const FADE_SMOOTH = 0.05;       // one tick: linear ramp that lands on the next frame
const FADE_ATTACK = 0.012;      // attacks land 12 ms after the tick
const P_MIN = 0.01, P_MAX = 10; // SoundInstance.setPitch bounds
// smaller pitch and level moves are not sent: 3 cents and 0.75 dB, under what an ear tells apart. Through the measured client model
// (tools/exp/results/next.jsonl, vnfade_thr against vnfade10, 10 songs) these cut the commands by 10-30 % and scored the same or
// higher (an analysis track's jitter of a cent or two is not sent as a warble); half a cent and 0.25 dB before 2026-10-31
const CENT = Math.pow(2, 3 / 1200) - 1;
const DB025 = Math.pow(10, 0.75 / 20);

// ------------------------------------------------------------------ song data
export interface Meta {
  id: string; title: string; artist?: string; fps: number; frames: number; voices: number; base: number;
  noise: number[][]; bursts: number; sub: number; seconds: number; amp: [number, number]; nz: [number, number];
  /** format 2: the fitted fades (tools/spectral.py fit_voice_fades, fit_noise_fades) follow the frames in the data — v bytes of
   *  the voices' codes, then nz bytes of the noise bands' (2 bits each, 4 a byte, a frame's together: frame k = the fade sent at
   *  tick k), ms = the lengths a code means. A song without it (format 1) ramps over the tick (50 ms) */
  fd?: { ms: number[]; v: number; nz: number };
}
/** a song: its data as base64 (song packs, the built-in demo) or as bytes (a song pasted as text: src/songtext.ts), or made by gen */
interface Song { meta: Meta; data?: string; bytes?: Uint8Array; spz?: Uint8Array; gen?: (d: Decoded) => void; dec?: Decoded; decoding?: Promise<Decoded>; pasted?: string; }
interface Decoded {
  F: number; N: number; M: number;
  freq: Float32Array; amp: Float32Array; att: Uint8Array; nz: Float32Array;
  evIdx: Uint32Array; evBand: Uint8Array; evSub: Uint8Array; evAmp: Float32Array;
  /** the noise bands' fitted fades unpacked: the fade length (s) of band b at tick k = nzdS[nzd[k * M + b]] */
  nzd?: Uint8Array; nzdS?: number[];
  /** the voices' the same way: vdS[vd[k * N + v]] */
  vd?: Uint8Array; vdS?: number[];
}
const songs = new Map<string, Song>();
export function addSong(meta: Meta, data?: string, gen?: (d: Decoded) => void) { songs.set(meta.id, { meta, data, gen }); }
/** note songs (src/notes.ts, tools/notes.py): a MIDI file's notes, played with the recorded instruments of the bank */
const noteSongs = new Map<string, NoteSong>();
export function addNoteSong(meta: NoteMeta, data: string) { noteSongs.set(meta.id, { meta, data }); }
addNoteSong(notesDemo.meta, notesDemo.data);

const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (B64[c.charCodeAt(0)] = i));

/** decode in a system job (never trips the watchdog, even for long songs) */
function* decodeJob(song: Song, out: { d?: Decoded }): Generator<void, void, void> {
  const m = song.meta, F = m.frames, N = m.voices, M = m.noise.length;
  const d: Decoded = {
    F, N, M, freq: new Float32Array(F * N), amp: new Float32Array(F * N), att: new Uint8Array(F * N), nz: new Float32Array(F * M),
    evIdx: new Uint32Array(F + 1), evBand: new Uint8Array(0), evSub: new Uint8Array(0), evAmp: new Float32Array(0),
  };
  if (song.gen) { song.gen(d); out.d = d; return; }
  let b: Uint8Array;
  if (song.bytes) b = song.bytes;
  else if (song.spz) {
    // (a pasted song kept in the world: its text decoded the first time it plays)
    const got: { bytes?: Uint8Array } = {};
    yield* decodeSongJob(song.spz, got);
    b = got.bytes!;
  } else {
    const s = song.data!;
    let len = (s.length * 3) >> 2; if (s.endsWith('==')) len -= 2; else if (s.endsWith('=')) len -= 1;
    b = new Uint8Array(len);
    for (let i = 0, o = 0; i < s.length; i += 4) {
      const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
      if (o < len) b[o++] = n >> 16; if (o < len) b[o++] = (n >> 8) & 255; if (o < len) b[o++] = n & 255;
      if ((i & 0xffff) === 0) yield;
    }
  }
  const [aF, aS] = m.amp, [nF, nS] = m.nz;
  const ampV = new Float32Array(128); for (let c = 1; c < 128; c++) ampV[c] = Math.pow(10, (aF + (c - 1) * aS) / 20);
  const nzV = new Float32Array(256); for (let c = 1; c < 256; c++) nzV[c] = Math.pow(10, (nF + (c - 1) * nS) / 20);
  const curF = new Float32Array(N), curA = new Float32Array(N), nb = (N + 7) >> 3;
  const evB: number[] = [], evS: number[] = [], evA: number[] = [];
  let p = 0;
  for (let k = 0; k < F; k++) {
    const mp = p; p += nb;
    for (let v = 0; v < N; v++) {
      if (!((b[mp + (v >> 3)] >> (v & 7)) & 1)) continue;
      const x = b[p++], ac = x & 0x7f;
      curA[v] = ampV[ac];
      if (ac) { curF[v] = 16 * Math.pow(2, (b[p] | (b[p + 1] << 8)) / 6000); p += 2; }
      if (x & 0x80) d.att[k * N + v] = 1;
    }
    d.freq.set(curF, k * N); d.amp.set(curA, k * N);
    for (let j = 0; j < M; j++) d.nz[k * M + j] = nzV[b[p++]];
    d.evIdx[k] = evB.length;
    const ne = b[p++];
    for (let e = 0; e < ne; e++) { const bb = b[p++]; evB.push(bb >> 2); evS.push(bb & 3); evA.push(nzV[b[p++]]); }
    if ((k & 63) === 63) yield;
  }
  d.evIdx[F] = evB.length;
  d.evBand = Uint8Array.from(evB); d.evSub = Uint8Array.from(evS); d.evAmp = Float32Array.from(evA);
  // format 2: the fitted fades after the frames (meta.fd: the voices' codes, then the noise bands')
  const fd = m.fd, fv = fd ? fd.v | 0 : 0, fn = fd ? fd.nz | 0 : 0;
  if (p !== b.length - fv - fn) throw new Error(`song ${m.id}: ${b.length - fv - fn - p} bytes left after decoding`);
  const codes2 = (at: number, len: number, n: number): Uint8Array | undefined => {
    const per = (n + 3) >> 2;
    if (!len || len !== F * per) return undefined;
    const c = new Uint8Array(F * n);
    for (let k = 0; k < F; k++) for (let j = 0; j < n; j++) c[k * n + j] = (b[at + k * per + (j >> 2)] >> (2 * (j & 3))) & 3;
    return c;
  };
  if (fd && fd.ms?.length === 4) {
    const ms = fd.ms.map((x) => x / 1000);
    d.vd = codes2(p, fv, N); if (d.vd) d.vdS = ms;
    d.nzd = codes2(p + fv, fn, M); if (d.nzd) d.nzdS = ms;
  }
  out.d = d;
}
function decoded(song: Song): Promise<Decoded> {
  if (song.dec) return Promise.resolve(song.dec);
  if (!song.decoding) {
    song.decoding = new Promise((res, rej) => {
      const out: { d?: Decoded } = {};
      const gen = decodeJob(song, out);
      const wrap = function* () { try { yield* gen; song.dec = out.d!; res(out.d!); } catch (e) { song.decoding = undefined; rej(e); } };
      system.runJob(wrap());
    });
  }
  return song.decoding;
}

// ------------------------------------------------------------------ built-in generated songs (no data at all)
const genMeta = (id: string, title: string, seconds: number, voices: number): Meta => ({
  id, title, artist: 'generated', fps: 20, frames: Math.round(seconds * 20), voices, base: BASE_HZ, noise: NOISE_BANDS,
  bursts: 3, sub: SUB, seconds, amp: [-90, 0.75], nz: [-100, 0.5],
});
/** Shepard–Risset glissando: an endlessly rising tone (only continuous oscillators can do it) */
addSong(genMeta('shepard', 'Shepard–Risset glissando', 40, 10), undefined, (d) => {
  for (let k = 0; k < d.F; k++) {
    const t = k / 20;
    for (let v = 0; v < 10; v++) {
      const oct = (v + t / 4) % 10;                                  // one octave every 4 s
      const f = 20 * Math.pow(2, oct);
      const w = Math.exp(-Math.pow((oct - 5) / 1.6, 2));            // bell over the octaves
      d.freq[k * d.N + v] = f; d.amp[k * d.N + v] = 0.16 * w;
    }
  }
});

// ------------------------------------------------------------------ playback sessions
type Mode = 'phones' | 'speaker';
interface Settings {
  volume: number; speed: number; semis: number; eq: [number, number, number]; voices: number; noise: boolean; bursts: boolean; viz: boolean; loop: boolean; budget?: number; mode?: Mode2;
  /** the client's sound engine: hf = the highest frequency it can play (half the rate it mixes at; 0 = no limit), fold = the
   *  voices not played go into the noise bands (their energy, not lost), sounds = at most this many audible sounds at once */
  hf?: number; fold?: boolean; sounds?: number;
  /** drums: ticks the one-shot bursts go before the tick of their frame (1, 0, -1), or none and the noise bands attack */
  burstLead?: number; attacks?: boolean;
  /** louder than the files, in dB: the game plays every sound 32.5 dB under its file into 16 bits, so a quiet song's floor is
   *  quantisation (SPEC.md). levelVia 'volume': every level sent that much higher (setVolume over 1); 'events': the headphones
   *  play the _l sound events (their definitions say volume 4 = +12 dB), the rest by setVolume */
  level?: number; levelVia?: 'volume' | 'events';
}
type Mode2 = 'quality' | 'light';
const DEFAULTS: Settings = { volume: 1, speed: 1, semis: 0, eq: [0, 0, 0], voices: 64, noise: true, bursts: true, viz: true, loop: false, budget: 0, mode: 'quality', hf: 0, fold: false, sounds: 0 };
// light mode (Realms, many listeners): the 16 strongest voices (songs keep their voices loudest first, so this is the base
// layer), and at most LIGHT_BUDGET commands per tick per listener (voices and noise bands together), chosen by how much
// each one matters (rate control); starting, seeking and ending a song are not held back
const LIGHT_VOICES = 16, LIGHT_BUDGET = 24;
const LOUD_EVENT_DB = 20 * Math.log10(4);          // the _l events' definition volume 4
// how many sounds a client plays at once, measured on a real one (SPEC.md: Minecraft 1.26.60.4 on Android 14 heard 32, the
// quietest or oldest going first — a song's 48 voices and 8 noise bands were over it. 24 voices beat 48 on the 4 songs played
// side by side, +0.17..+0.52 ViSQOL; over all 13 test songs the medians were 1.99 both, 2.05 with the bursts sent ahead, at a
// third fewer commands). A phone gets the voices that fit beside the noise bands; platforms not measured yet keep every voice
// of the song. A count the player sets (/spectral:voices, the sound form) is theirs
// drums: whether the one-shot drum bursts play by default. On the phone they do not (run 41142205810, the same run, 13 songs: the
// converter's residual 'voiced' with no bursts beat the shipped version — bursts a tick ahead — by +0.18 ViSQOL median, 11 of 13
// songs, rock 1.95 -> 3.04; bursts a tick behind were worse on 3 of 4 songs: a one-shot's delay against the SoundInstance
// commands changes from song to song)
// level: how much louder than the files the headphones play by default (dB, by setVolume). The phone plays every sound
// 32.5 dB under its file into 16 bits (most songs' floor is that quantisation), and clips the mix at about 2 file units
// (run 41147544874's calib loud: a sine of 0.91 at setVolume 2 exact, at 4 and 8 a hard clip at 2.0; the mixer calib's 16
// sines fit 1.7). Through the client model with that clip (tools/exp, emulated) +6 dB raised the median ViSQOL 2.59 -> 2.94 (quiet
// songs most: the 16-bit floor) and was the default until 1.2.0. Measured since (the real phone, the same run, 13 songs, the
// converter tuned to the level it plays at): +10 dB against +6 dB up on 10 of 13 songs in run 41200540880 (median +0.11) and
// again in run 41205071937 (median +0.06, mean +0.16; +8 dB between them, median +0.06), within 0.3 of the ceiling 12/13 and
// 10/13 against 10/13 and 8/13; drums +1.0 and Chopin +0.6 in both runs, the one steady loss Name of Love -0.07 (still above
// its ceiling). Songs converted for +6 dB gain about as much at +10 (emulated: median 3.33 -> 3.45, 9 of 13 up): what the level
// buys is the 16-bit floor further under the quiet passages. The clip of the loudest moments (its distortion -21 dB on the
// speech at +10, emulated) did not cost ViSQOL on the phone. /spectral:level sets another
interface Client { sounds: number; mixHz: number; fold: boolean; limit: boolean; drums?: boolean; level?: number; }
const CLIENTS: Partial<Record<string, Client>> = { Mobile: { sounds: 32, mixHz: 0, fold: false, limit: false, drums: false, level: 10 } };
function clientOf(p: Player): Client | undefined {
  let kind = '';
  try { kind = String(p.clientSystemInfo.platformType); } catch { /* not known (an older client) */ }
  return CLIENTS[kind];
}
/** noise bands a client can play: under a mixing rate of mixHz a band that starts above half of it only folds down */
const bandsFor = (hf: number) => NOISE_BANDS.filter((b) => !hf || b[0] < hf).length;
function platformVoices(p: Player): number {
  const c = clientOf(p);
  return c ? Math.max(4, c.sounds - bandsFor(c.mixHz / 2)) : DEFAULTS.voices;
}
/** what a client's own engine asks for (measured): the voices that fit, its frequency limit, folding, the sound budget */
function platformEngine(p: Player): Partial<Settings> {
  const c = clientOf(p);
  return c ? { voices: platformVoices(p), hf: c.mixHz ? Math.round(c.mixHz / 2 * 0.958) : 0, fold: c.fold, sounds: c.limit ? c.sounds : 0, bursts: c.drums ?? true,
    ...(c.level ? { level: c.level, levelVia: 'volume' as const } : {}) } : {};
}
/** a listener's (or a spot's) sounds. nv / nb: the voices and noise bands a live stream plays them (shareSounds: fewer when their
 *  client's sounds are shared with other streams; unset, all of the stream's), building: their sounds are being made */
interface Target { player?: Player; dim?: Dimension; loc?: Vector3; osc: SoundInstance[]; nz: (SoundInstance | undefined)[]; gone?: boolean; nv?: number; nb?: number; building?: boolean; }

class Session {
  ph = 0; paused = false; frozen = false; ending = 0; started = false; warm = 0; burstTo = -1;
  targets: Target[] = [];
  lastP: Float32Array; lastL: Float32Array; lastNL: Float32Array; lastNP = 1;
  calls = 0; ticks = 0; ms = 0; peakCalls = 0; vizText = ''; rebuilds = 0;
  constructor(public owner: Player, public song: Song, public d: Decoded, public mode: Mode, public s: Settings) {
    this.lastP = new Float32Array(d.N).fill(-1); this.lastL = new Float32Array(d.N).fill(SILENT); this.lastNL = new Float32Array(d.M).fill(SILENT);
  }
  get V() { return Math.min(this.s.voices, this.d.N); }
  /** a noise band this client can play (under its frequency limit) */
  bandOn(b: number) { return !this.s.hf || NOISE_BANDS[b][0] * this.ratio < this.s.hf; }
  /** ticks at which the bursts sent so far have finished (the sound budget counts them while they play) */
  burstEnds: number[] = [];
  /** bursts held for the next tick (s.burstLead -1) */
  pendingBursts: [number, number, number][] = [];
  get ratio() { return Math.pow(2, this.s.semis / 12); }
  ev(name: string) { return this.mode === 'speaker' ? name + '_3d' : this.loudEvents ? name + '_l' : name; }
  /** the headphones play the _l events (s.level by 'events') */
  get loudEvents() { return this.mode === 'phones' && (this.s.level ?? 0) > 0 && this.s.levelVia === 'events'; }
  /** the factor every level is sent with: s.level, less what the _l events already add (the headphones only: a 3D speaker's
   *  volume also sets how far it carries) */
  get lv() { return this.mode === 'phones' ? Math.pow(10, ((this.s.level ?? 0) - (this.loudEvents ? LOUD_EVENT_DB : 0)) / 20) : Math.pow(10, LEVEL_3D_DB / 20); }
  /** the events the instances of the targets were built with (a level change to or from 'events' rebuilds them) */
  builtLoud = false;

  /** start one looping instance at silence */
  private loop(t: Target, name: string): SoundInstance {
    if (t.player) return t.player.playSound(this.ev(name), { volume: SILENT, pitch: 1, loopCount: -1 });
    // 3D: the play volume also sets the audible range, so start at RANGE_3D — at P_MIN, under hearing, for the ticks it plays as
    // made (SETTLE_TICKS) — and silence it in the same tick; build() sends the state again
    const s = t.dim!.playSound(this.ev(name), t.loc!, { volume: RANGE_3D, pitch: P_MIN, loopCount: -1 });
    s.setVolume(SILENT);
    return s;
  }
  /** create the voices of one target over a few ticks (a burst of 70 starts in one tick is avoided) */
  async build(t: Target) {
    const want = this.V, M = this.d.M;
    this.builtLoud = this.loudEvents;
    while (t.osc.length < want) {
      for (let i = 0; i < 16 && t.osc.length < want; i++) t.osc.push(this.loop(t, 'spectral.osc'));
      await system.waitTicks(1);
    }
    for (let b = 0; b < M; b++) {
      if (this.bandOn(b) && !t.nz[b]) t.nz[b] = this.loop(t, 'spectral.n' + b);
      else if (!this.bandOn(b) && t.nz[b]) { try { t.nz[b]!.stop(); } catch { /* gone */ } t.nz[b] = undefined; }
    }
    t.nz.length = M;
    // (3D: made at P_MIN and played as made for SETTLE_TICKS — the state now, and again once they play)
    if (!t.player) {
      try { this.resync(t); } catch { /* gone */ }
      system.runTimeout(() => { if (this.targets.includes(t)) { try { this.resync(t); } catch { /* gone */ } } }, SETTLE_TICKS);
    }
  }
  async addListener(p: Player) {
    if (this.mode !== 'phones' || this.targets.some((t) => t.player?.id === p.id)) return;
    const t: Target = { player: p, osc: [], nz: [] };
    this.targets.push(t);
    await this.build(t);
    this.resync(t);
  }
  /** every target's instances made again (the level moved to or from the loud events) */
  async rebuildAll() {
    for (const t of this.targets) {
      for (const x of [...t.osc, ...t.nz]) { try { x?.stop(); } catch { /* gone */ } }
      t.osc = []; t.nz = [];
      await this.build(t); this.resync(t);
    }
  }
  /** bring a target that joined late (or was rebuilt) to the current levels */
  resync(t: Target) {
    for (let v = 0; v < t.osc.length; v++) { if (this.lastP[v] > 0) t.osc[v].setPitch(this.lastP[v]); t.osc[v].setVolume(this.lastL[v]); }
    for (let b = 0; b < t.nz.length; b++) { const x = t.nz[b]; if (!x) continue; x.setPitch(this.lastNP); x.setVolume(this.lastNL[b]); }
  }
  async start() {
    for (const t of this.targets) await this.build(t);
    this.warm = 2; this.started = true;
  }
  stop() {
    for (const t of this.targets) { for (const s of [...t.osc, ...t.nz]) { try { s?.stop(); } catch { /* gone */ } } t.osc = []; t.nz = []; }
    this.targets = [];
  }
  /** a voice count change while playing: grow or shrink the instance set */
  async setVoices(n: number) {
    this.s.voices = n;
    for (const t of this.targets) {
      while (t.osc.length > this.V) { try { t.osc.pop()!.stop(); } catch { /* gone */ } }
      await this.build(t);
      this.resync(t);
    }
    for (let v = this.V; v < this.d.N; v++) { this.lastP[v] = -1; this.lastL[v] = SILENT; }
  }
  seek(frame: number) {
    this.ph = Math.max(0, Math.min(this.d.F - 1, Math.round(frame)));
    this.burstTo = -1;
    // fall silent for a tick; the next tick fades in at the new place
    const b = this.s.budget; this.s.budget = 0;
    for (let v = 0; v < this.V; v++) this.send(v, 0, FADE_ATTACK, SILENT);
    this.s.budget = b;
    this.warm = 1;
  }

  eqGain(f: number) {
    const [lo, mid, hi] = this.s.eq;
    if (lo === 0 && mid === 0 && hi === 0) return 1;
    const x = Math.log2(Math.max(f, 20) / 1000);                    // octaves from 1 kHz
    const db = x < 0 ? mid + (lo - mid) * Math.min(1, -x / 3) : mid + (hi - mid) * Math.min(1, x / 3);
    return Math.pow(10, db / 20);
  }
  /** commands of this tick waiting for the budget: [priority, voice (< 0: noise band -1-v), pitch (-1 none), fade duration, level (-1 none)] */
  private queue: [number, number, number, number, number][] = [];
  deferred = 0;
  /** attack: a note's start (always sent, first under a budget); a fitted fade (format 2) of the same length is not one */
  private send(v: number, hz: number, dur: number | undefined, level: number, attack = dur === FADE_ATTACK) {
    let p = -1;
    if (hz > 0) {
      p = Math.min(P_MAX, Math.max(P_MIN, (hz * this.ratio) / BASE_HZ));
      if (this.lastP[v] > 0 && Math.abs(p / this.lastP[v] - 1) < CENT) p = -1;
    }
    let L = -1;
    if (dur !== undefined) {
      L = Math.min(10, Math.max(SILENT, level));
      const last = this.lastL[v];
      if (!attack && L / last < DB025 && last / L < DB025) L = -1;
    }
    if (p < 0 && L < 0) return;
    if (this.s.budget) {
      // priority: how far the level moves (dB, weighted by how loud it is) and how far the pitch moves (cents, while audible);
      // attacks and silencing go first so notes start and stop on time
      const last = this.lastL[v], lv = L >= 0 ? L : last;
      const dDb = L >= 0 ? Math.abs(20 * Math.log10(L / last)) : 0;
      const loud = Math.max(0, 80 + 20 * Math.log10(Math.max(lv, last)));
      const dCents = p > 0 && this.lastP[v] > 0 ? Math.abs(1200 * Math.log2(p / this.lastP[v])) : p > 0 ? 100 : 0;
      const prio = (attack ? 1e6 : 0) + dDb * loud + Math.min(dCents, 200) * loud * 0.05;
      this.queue.push([prio, v, p, dur ?? 0, L]);
      return;
    }
    this.apply(v, p, dur ?? 0, L);
  }
  /** fades shorter than a tick that are not attacks (a song's fitted fades), sent so far */
  shortFades = 0;
  private apply(v: number, p: number, dur: number, L: number) {
    if (L >= 0 && dur > 0 && dur < FADE_SMOOTH && dur !== FADE_ATTACK) this.shortFades += this.targets.length;
    if (v < 0) { this.applyNoise(-1 - v, L, dur || FADE_SMOOTH); return; }
    for (const t of this.targets) {
      const s = t.osc[v]; if (!s) continue;
      try { if (p > 0) s.setPitch(p); if (L >= 0) s.fade(dur, L); } catch { /* listener gone: cleaned up below */ }
    }
    if (p > 0) { this.lastP[v] = p; this.calls += this.targets.length; }
    if (L >= 0) { this.lastL[v] = L; this.calls += this.targets.length; }
  }
  /** the queued commands, most important first, up to the budget (a command is a setPitch or a fade of a voice or a noise band, per listener) */
  private flush() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let left = this.s.budget!;
    for (const [, v, p, dur, L] of this.queue) {
      const cost = (p > 0 ? 1 : 0) + (L >= 0 ? 1 : 0);
      if (cost > left) { this.deferred++; continue; }
      left -= cost; this.apply(v, p, dur, L);
    }
    this.queue = [];
  }

  /** level and frequency of voice v at fractional frame q (linear amp, log freq; a silent end takes the other's pitch) */
  at(v: number, q: number): [number, number] {
    const d = this.d, N = d.N, i = Math.max(0, Math.min(d.F - 1, Math.floor(q))), j = Math.min(i + 1, d.F - 1), t = q - i;
    const a0 = d.amp[i * N + v], f0 = d.freq[i * N + v];
    if (t === 0 || i === j) return [a0, a0 > 0 ? f0 : 0];          // speed 1: whole frames, no interpolation
    const a1 = d.amp[j * N + v], f1 = d.freq[j * N + v];
    const a = a0 + (a1 - a0) * t;
    const f = a0 > 0 && a1 > 0 ? f0 * Math.pow(f1 / f0, t) : a1 > 0 ? f1 : f0;
    return [a, a > 0 ? f : 0];
  }
  attackAt(v: number, from: number, to: number): number {
    const m = Math.ceil(from - 1e-9), d = this.d;
    return m < to - 1e-9 && m < d.F && d.att[m * d.N + v] && d.amp[m * d.N + v] > 0 ? m : -1;
  }

  /** under a sound budget (s.sounds): is there room for one more burst beside the voices and bands that are sounding and
   *  the bursts still playing (a burst lasts BURST_LEN after up to 37.5 ms of silence and the ~49 ms a one-shot lands late)?
   *  Takes the room when there is */
  roomForBurst(): boolean {
    const now = this.ticks;
    this.burstEnds = this.burstEnds.filter((t) => t > now);
    let n = this.burstEnds.length;
    for (let v = 0; v < this.V; v++) if (this.lastL[v] > SILENT * 4) n++;
    for (let b = 0; b < this.d.M; b++) if (this.bandOn(b) && this.lastNL[b] > SILENT * 4) n++;
    if (n + 1 > this.s.sounds!) return false;
    this.burstEnds.push(now + 5);
    return true;
  }
  tick() {
    if (!this.started || this.paused || this.ending) return;
    const t0 = Date.now();
    // listeners that left: drop them
    this.targets = this.targets.filter((t) => !t.player || t.player.isValid);
    if (!this.targets.length) { this.ending = -1; return; }
    if (this.warm > 0) { this.warm--; return; }
    // a song with fitted fades plays them on whole frames: back at speed 1 after another speed, the playhead goes to the nearest
    // frame (under half a frame, 25 ms)
    if ((this.d.vd || this.d.nzd) && this.s.speed === 1 && !this.frozen && !Number.isInteger(this.ph)) this.ph = Math.round(this.ph);
    const d = this.d, N = d.N, sp = this.frozen ? 0 : this.s.speed, ph = this.ph, ph2 = ph + sp;
    const gain = (this.s.volume * this.lv) / OSC_AMP, r = this.ratio, lv = this.lv;
    if ((sp > 0 && ph >= d.F - 1) || (sp < 0 && ph <= 0)) {
      if (this.s.loop) { this.seek(sp > 0 ? 0 : d.F - 1); return; }
      const b0 = this.s.budget; this.s.budget = 0;
      for (let v = 0; v < this.V; v++) this.send(v, 0, FADE_SMOOTH, SILENT);
      for (let b = 0; b < d.M; b++) this.noise(b, SILENT);
      this.s.budget = b0;
      this.ending = 1; return;
    }
    const q2 = Math.max(0, Math.min(d.F - 1, ph2));
    // a voice above what the client can play (hf) is not played: under a mixing rate of 24 kHz it would only fold down to
    // 24 kHz - f. With `fold`, its energy and that of the voices not played at all go into the noise band they fall in
    const hf = this.s.hf ?? 0, extra = this.s.fold ? new Float32Array(d.M) : undefined;
    const fold = (f: number, a: number) => {
      if (!extra || a <= 0) return;
      for (let b = 0; b < d.M; b++) if (f >= NOISE_BANDS[b][0] && f < NOISE_BANDS[b][1]) { extra[b] += (a * a) / 2; return; }
    };
    if (extra) for (let v = this.V; v < N; v++) { const [a1, f1] = this.at(v, q2); fold(f1, a1); }
    for (let v = 0; v < this.V; v++) {
      if (hf) {
        const [a1, f1] = this.at(v, q2);
        if (a1 > 0 && f1 * r >= hf) { this.send(v, 0, FADE_SMOOTH, SILENT); fold(f1, a1); continue; }
      }
      if (d.vd && sp === 1 && Number.isInteger(ph)) {
        // a song with fitted fades (format 2): the fade of this tick to frame ph+1, its own length (an attack is a short one)
        const [a0, f0] = this.at(v, ph), [a1, f1] = this.at(v, q2);
        this.send(v, f0 && f1 ? Math.sqrt(f0 * f1) : f1 || f0, d.vdS![d.vd[ph * N + v]], a1 * gain * this.eqGain((f1 || f0) * r), false);
        continue;
      }
      const m = sp > 0 && sp <= 1.5 ? this.attackAt(v, ph, ph2) : -1;
      if (m >= 0) {                                   // attack lands now
        const f = d.freq[m * N + v];
        this.send(v, f, FADE_ATTACK, d.amp[m * N + v] * gain * this.eqGain(f * r));
        continue;
      }
      if (sp > 0 && sp <= 1.5 && this.attackAt(v, ph2, ph2 + sp) >= 0) {   // next tick attacks: hold
        const [a, f] = this.at(v, ph);
        if (a > 0) this.send(v, f, undefined, 0);
        continue;
      }
      const [a0, f0] = this.at(v, ph), [a1, f1] = this.at(v, q2);
      const hz = f0 && f1 ? Math.sqrt(f0 * f1) : f1 || f0;
      this.send(v, hz, FADE_SMOOTH, a1 * gain * this.eqGain((f1 || f0) * r));
    }
    // noise bands (under a budget they wait in the same queue as the voices)
    if (Math.abs(this.lastNP - r) > 1e-4) {
      this.lastNP = r;
      for (const t of this.targets) { if (this.s.hf) this.build(t); for (const s of t.nz) { try { s?.setPitch(r); } catch { /* gone */ } } }
    }
    // (s.attacks: a drum onset's frame is reached at its own tick in a 12 ms fade — the tick before holds — with the energy the
    // converter took out of the band for the burst given back: the bursts' attack without one-shots)
    const att = this.s.attacks && this.s.bursts && this.s.noise && sp > 0 && sp <= 1.5;
    const onset = (from: number, to: number, b: number): [number, number] => {      // [frame, energy] of the first onset in [from, to)
      for (let m = Math.ceil(from - 1e-9); m < to - 1e-9 && m < d.F; m++) {
        let e = 0;
        for (let x = d.evIdx[m]; x < d.evIdx[m + 1]; x++) { const bb = BURST_BANDS[d.evBand[x]]; if (NOISE_BANDS[b][0] < bb[1] && NOISE_BANDS[b][1] > bb[0]) e += (d.evAmp[x] * d.evAmp[x] * 0.35) / 3; }
        if (e > 0) return [m, e];
      }
      return [-1, 0];
    };
    for (let b = 0; b < d.M; b++) {
      if (!this.bandOn(b)) continue;
      const i = Math.floor(q2), j = Math.min(i + 1, d.F - 1), tt = q2 - i;
      let a = d.nz[i * d.M + b] * (1 - tt) + d.nz[j * d.M + b] * tt;
      if (extra && extra[b] > 0) a = Math.sqrt(a * a + extra[b]);
      const c = Math.sqrt(NOISE_BANDS[b][0] * NOISE_BANDS[b][1]) * r;
      if (att) {
        const [mNow, eNow] = onset(ph, ph2, b);
        if (eNow > 0) {
          const la = Math.sqrt(d.nz[mNow * d.M + b] ** 2 + eNow + (extra ? extra[b] : 0));
          this.noiseAttack(b, (la * this.s.volume * lv * this.eqGain(c)) / NOISE_RMS[b]);
          continue;
        }
        if (onset(ph2, ph2 + sp, b)[1] > 0) continue;                      // the next tick attacks: hold
      }
      // a song with fitted fades (format 2) gives each band its own fade length at speed 1 (whole frames)
      const dur = d.nzd && sp === 1 && Number.isInteger(ph) ? d.nzdS![d.nzd[ph * d.M + b]] : FADE_SMOOTH;
      this.noise(b, this.s.noise ? (a * this.s.volume * lv * this.eqGain(c)) / NOISE_RMS[b] : SILENT, dur);
    }
    this.flush();
    // drum bursts: one-shots with sub-tick offsets. When they go (s.burstLead, ticks before the tick of their frame): the
    // timing calibration had a one-shot sound ~49 ms after the SoundInstance commands of its tick (run 41076646541), so the
    // shipped engine sent them a tick ahead (1); in the songs themselves the one-shots came ~45 ms BEFORE the voices of
    // their tick (runs 41083086951 and 41089050799, SPEC.md), so 0 or -1 may land closer. s.attacks: no one-shots at all,
    // the noise bands rise in a 12 ms fade at the onset's tick instead (the same path and timing as the voices)
    const lead = this.s.burstLead ?? 1;
    if (this.s.bursts && !this.s.attacks && sp > 0) {
      const play: [number, number, number][] = [];
      const add = (m: number, base: number) => {
        const evs: number[] = [];
        for (let e = d.evIdx[m]; e < d.evIdx[m + 1]; e++) evs.push(e);
        if (this.s.sounds) evs.sort((x, y) => d.evAmp[y] - d.evAmp[x] || x - y);      // under a sound budget the loudest go first
        for (const e of evs) {
          const off = Math.round((((m + d.evSub[e] / SUB) - base) / sp) * SUB);
          const sub = Math.max(0, Math.min(SUB - 1, off)), band = d.evBand[e];
          const c = band === 0 ? 90 : band === 1 ? 900 : 8000;
          play.push([band, sub, Math.min(10, (d.evAmp[e] * this.s.volume * lv * this.eqGain(c * r)) / BURST_RMS[band])]);
        }
      };
      if (lead >= 1) {
        // the next tick's bursts go now (and right after a start or a seek those of this tick too, late by that tick)
        const to = ph2 + sp;
        for (let m = Math.ceil(Math.max(ph, this.burstTo) - 1e-9); m < to - 1e-9 && m < d.F; m++) add(m, m < ph2 - 1e-9 ? ph : ph2);
      } else {
        for (let m = Math.ceil(ph - 1e-9); m < ph2 - 1e-9 && m < d.F; m++) add(m, ph);
      }
      let go = play;
      if (lead < 0) { go = this.pendingBursts; this.pendingBursts = play; }
      for (const [band, sub, vol] of go) {
        if (this.s.sounds && !this.roomForBurst()) continue;
        for (const t of this.targets) {
          try {
            if (t.player) t.player.playSound(this.ev(`spectral.b${band}_${sub}`), { volume: vol, pitch: r });
            else t.dim!.playSound(`spectral.b${band}_${sub}_3d`, t.loc!, { volume: 1, pitch: r }).setVolume(vol);   // range of volume 1, level as multiplier
          } catch { /* gone */ }
          this.calls++;
        }
        if (this.mode === 'speaker' && band === 0) { try { this.targets[0].dim!.spawnParticle('minecraft:note_particle', { x: this.targets[0].loc!.x, y: this.targets[0].loc!.y + 1.2, z: this.targets[0].loc!.z }); } catch { /* unloaded */ } }
      }
    } else this.pendingBursts = [];
    this.burstTo = this.s.bursts && !this.s.attacks && sp > 0 && lead >= 1 ? ph2 + sp : -1;
    this.ph = Math.max(0, Math.min(d.F - 1, ph2));
    if (this.s.viz && (this.ticks & 1) === 0) this.viz();
    const ms = Date.now() - t0;
    this.ticks++; this.ms += ms; this.peakCalls = Math.max(this.peakCalls, this.calls); this.totalCalls += this.calls; this.calls = 0;
  }
  totalCalls = 0;
  private noise(b: number, L: number, dur = FADE_SMOOTH) {
    L = Math.min(10, Math.max(SILENT, L));
    const last = this.lastNL[b];
    if (L / last < DB025 && last / L < DB025) return;
    if (this.s.budget) {
      const loud = Math.max(0, 80 + 20 * Math.log10(Math.max(L, last)));
      this.queue.push([Math.abs(20 * Math.log10(L / last)) * loud, -1 - b, -1, dur, L]);
      return;
    }
    this.applyNoise(b, L, dur);
  }
  /** a noise band's attack (s.attacks): a 12 ms fade now, never held back by a budget */
  private noiseAttack(b: number, L: number) {
    L = Math.min(10, Math.max(SILENT, L));
    this.lastNL[b] = L;
    for (const t of this.targets) { const s = t.nz[b]; if (s) { try { s.fade(FADE_ATTACK, L); } catch { /* gone */ } this.calls++; } }
  }
  private applyNoise(b: number, L: number, dur = FADE_SMOOTH) {
    this.lastNL[b] = L;
    if (dur < FADE_SMOOTH) this.shortFades += this.targets.length;
    for (const t of this.targets) { const s = t.nz[b]; if (s) { try { s.fade(dur, L); } catch { /* gone */ } this.calls++; } }
  }

  /** a 24-column spectrum on the action bar, from the voice levels and noise bands */
  viz() {
    const COLS = 24, lo = Math.log2(40), hi = Math.log2(16000), e = new Float32Array(COLS);
    const r = this.ratio, d = this.d, q = Math.min(d.F - 1, Math.max(0, this.ph));
    for (let v = 0; v < this.V; v++) {
      const [a, f] = this.at(v, q); if (a <= 0) continue;
      const c = Math.floor(((Math.log2(f * r) - lo) / (hi - lo)) * COLS); if (c >= 0 && c < COLS) e[c] += a * a;
    }
    for (let b = 0; b < d.M; b++) {
      const a = d.nz[Math.floor(q) * d.M + b]; if (!a) continue;
      const c0 = Math.floor(((Math.log2(NOISE_BANDS[b][0] * r) - lo) / (hi - lo)) * COLS), c1 = Math.floor(((Math.log2(NOISE_BANDS[b][1] * r) - lo) / (hi - lo)) * COLS);
      for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) e[c] += (a * a) / Math.max(1, c1 - c0 + 1);
    }
    const bars = '▁▂▃▄▅▆▇█';
    let s = '';
    for (let c = 0; c < COLS; c++) {
      const db = 10 * Math.log10(e[c] * this.s.volume * this.s.volume + 1e-12);
      const lv = Math.max(0, Math.min(7, Math.floor((db + 60) / 7)));
      s += (lv >= 6 ? '§c' : lv >= 4 ? '§e' : '§a') + bars[lv];
    }
    const sec = (q / 20), tot = d.F / 20;
    const state = this.frozen ? '❄' : this.paused ? '⏸' : this.s.speed < 0 ? '◀' : '▶';
    this.vizText = `${s}\n§f${state} ${this.song.meta.title}  ${fmt(sec)} / ${fmt(tot)}`;
    for (const p of this.listeners()) { try { p.onScreenDisplay.setActionBar(this.vizText); } catch { /* gone */ } }
  }
  listeners(): Player[] {
    if (this.mode === 'phones') return this.targets.map((t) => t.player!).filter((p) => p?.isValid);
    const t = this.targets[0]; if (!t) return [];
    return world.getPlayers().filter((p) => p.dimension.id === t.dim!.id && dist(p.location, t.loc!) < 48);
  }
  status(): string {
    const m = this.song.meta, avg = this.ticks ? this.ms / this.ticks : 0, calls = this.ticks ? this.totalCalls / this.ticks : 0;
    const inst = this.targets.reduce((n, t) => n + t.osc.length + t.nz.filter((x) => x).length, 0);
    return `status: ${this.paused ? 'paused' : this.frozen ? 'frozen' : 'playing'} ${m.id} ${fmt(this.ph / 20)}/${fmt(m.seconds)} frame ${Math.round(this.ph)}/${this.d.F} ` +
      `mode ${this.mode} voices ${this.V} instances ${inst} speed ${this.s.speed} semis ${this.s.semis} volume ${Math.round(this.s.volume * 100)}% ` +
      `calls/tick ${calls.toFixed(1)} peak ${this.peakCalls} ms/tick ${avg.toFixed(2)} rebuilds ${this.rebuilds} quality ${this.s.mode ?? 'quality'} budget ${this.s.budget || 'none'} deferred ${this.deferred} ` +
      `engine hf ${this.s.hf || 'none'} fold ${this.s.fold ? 'on' : 'off'} sounds ${this.s.sounds || 'any'} drums ${!this.s.bursts ? 'off' : this.s.attacks ? 'noise' : ['behind', 'tick', 'ahead'][Math.max(-1, Math.min(1, this.s.burstLead ?? 1)) + 1]} ` +
      `level ${this.s.level ? `+${this.s.level} dB ${this.builtLoud ? 'events' : 'volume'}` : 'none'} ` +
      `fades ${this.d.vd || this.d.nzd ? `fitted (${[this.d.vd ? 'voices' : '', this.d.nzd ? 'noise' : ''].filter((x) => x).join(' and ')}) short ${this.shortFades}` : 'ramps'}`;
  }
}
const fmt = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
const dist = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const sessions = new Map<string, Session>();
/** the note songs playing, by player */
const notePlays = new Map<string, NotePlayer>();
// (settings are saved whole whenever one changes, so a saved value may only be the default of its time: rev 2 = saved by this
// version. A phone's drums saved before it (rev 1) were the old default, not a choice: the client's default replaces them)
const SETTINGS_REV = 2;
const settingsOf = (p: Player): Settings => {
  const plat = platformEngine(p), saved = load<Partial<Settings> & { rev?: number }>(p, 'spectral:settings', {});
  if (plat.bursts === false && (saved.rev ?? 1) < SETTINGS_REV) { delete saved.bursts; delete saved.burstLead; delete saved.attacks; }
  delete saved.rev;
  return { ...DEFAULTS, ...plat, ...saved };
};
const keep = (p: Player, s: Settings) => save(p, 'spectral:settings', { ...s, rev: SETTINGS_REV });

system.runInterval(() => {
  for (const [id, s] of sessions) {
    try { s.tick(); } catch (e) { console.warn(`[spectral] tick: ${e}`); s.ending = -1; }
    if (s.ending > 0 && ++s.ending > 4) { s.stop(); sessions.delete(id); if (s.owner.isValid) s.owner.sendMessage(`§7■ ${s.song.meta.title} — end`); }
    else if (s.ending < 0) { s.stop(); sessions.delete(id); }
  }
  for (const [id, s] of notePlays) {
    try { s.tick(); } catch (e) { console.warn(`[spectral] notes: ${e}`); s.ending = -1; }
    if (s.ending > 0 && ++s.ending > 2) { s.stop(); notePlays.delete(id); if (s.owner.isValid) s.owner.sendMessage(`§7■ ${s.title} — end`); }
    else if (s.ending < 0) { s.stop(); notePlays.delete(id); }
  }
}, 1);

async function play(p: Player, id: string | undefined, mode: Mode): Promise<string> {
  if (id && !songs.has(id)) {
    const pre = (t: string) => t.toLowerCase().startsWith(id.toLowerCase());
    const ns = noteSongs.get(id) ?? ([...songs.values()].some((x) => pre(x.meta.title)) ? undefined : [...noteSongs.values()].find((x) => pre(x.meta.title)));
    if (ns) return playNotes(p, ns, mode);
  }
  const oldN = notePlays.get(p.id); if (oldN) { oldN.stop(); notePlays.delete(p.id); }
  const song = id ? songs.get(id) ?? [...songs.values()].find((s) => s.meta.title.toLowerCase().startsWith(id.toLowerCase())) : songs.get('demo');
  if (!song) return `§cno song "${id}" — /spectral:songs`;
  const old = sessions.get(p.id); if (old) { old.stop(); sessions.delete(p.id); }
  let d: Decoded;
  try { d = await decoded(song); } catch (e) { return `§csong ${song.meta.id} is broken: ${e}`; }
  if (!p.isValid) return '';
  const s = new Session(p, song, d, mode, settingsOf(p));
  if (mode === 'phones') s.targets.push({ player: p, osc: [], nz: [] });
  else s.targets.push({ dim: p.dimension, loc: { x: p.location.x, y: p.location.y + 1, z: p.location.z }, osc: [], nz: [] });
  sessions.set(p.id, s);
  await s.start();
  const m = song.meta;
  return `§a▶ ${m.title}${m.artist ? ' — ' + m.artist : ''} §7(${fmt(m.seconds)}, ${s.V}/${m.voices} voices, ${mode === 'phones' ? 'headphones' : 'speaker'})`;
}
/** the sampler (/spectral:sampler): place each note inside its tick by seekTo, the notes of `bundle` ticks started together,
 *  `ahead3d` ms more for a 3D speaker (a 3D sound plays as made for 100-200 ms); at most `voices` notes at once (the phone plays
 *  32 sounds); `volume`: the level of a velocity-127 note */
const SAMPLER = { place: true, bundle: 4, ahead3d: 250, voices: 28, volume: 1.2, log: false };
async function playNotes(p: Player, song: NoteSong, mode: Mode): Promise<string> {
  const old = sessions.get(p.id); if (old) { old.stop(); sessions.delete(p.id); }
  const oldN = notePlays.get(p.id); if (oldN) { oldN.stop(); notePlays.delete(p.id); }
  let nt;
  try { nt = decodeNotes(song); } catch (e) { return `§csong ${song.meta.id} is broken: ${e}`; }
  const s = settingsOf(p);
  const np = new NotePlayer(p, song, nt, {
    where: mode, place: SAMPLER.place, bundle: SAMPLER.bundle, ahead: mode === 'speaker' ? SAMPLER.ahead3d : 0,
    maxVoices: Math.max(1, Math.min(SAMPLER.voices, s.sounds ? s.sounds - 2 : SAMPLER.voices)), volume: SAMPLER.volume * s.volume,
    range3d: RANGE_3D, level3d: Math.pow(10, LEVEL_3D_DB / 20), semis: s.semis, speed: s.speed > 0 ? s.speed : 1, loop: s.loop, log: SAMPLER.log,
  }, p.dimension, { x: p.location.x, y: p.location.y + 1, z: p.location.z });
  notePlays.set(p.id, np);
  np.start();
  const m = song.meta;
  console.warn(`[spectral] notes ${m.id}: ${m.notes} notes, ${mode}, ${SAMPLER.place ? `placed, bundle ${SAMPLER.bundle}` : 'tick-bound'}`);
  return `§a▶ ${m.title}${m.artist ? ' — ' + m.artist : ''} §7(${fmt(m.seconds)}, ${m.notes} notes, ${mode === 'phones' ? 'headphones' : 'speaker'})`;
}
const mine = (p: Player) => sessions.get(p.id);
const none = '§7nothing is playing — /spectral:play';
function stopFor(p: Player) {
  const n = notePlays.get(p.id); if (n) { n.stop(); notePlays.delete(p.id); return '§7■ stopped'; }
  const s = mine(p); if (!s) return none; s.stop(); sessions.delete(p.id); return '§7■ stopped';
}
function pauseFor(p: Player) {
  const n = notePlays.get(p.id); if (n) { n.setPaused(!n.paused); return n.paused ? '§e⏸ paused' : '§a▶ resumed'; }
  const s = mine(p); if (!s) return none;
  s.paused = !s.paused;
  for (const t of s.targets) for (const x of [...t.osc, ...t.nz]) { try { if (s.paused) x?.pause(); else x?.resume(); } catch { /* gone */ } }
  return s.paused ? '§e⏸ paused' : '§a▶ resumed';
}
function freezeFor(p: Player) { const s = mine(p); if (!s) return none; s.frozen = !s.frozen; return s.frozen ? '§b❄ frozen' : '§a▶ thawed'; }
function seekFor(p: Player, sec: number) {
  const n = notePlays.get(p.id); if (n) { n.seekMs(Math.max(0, sec) * 1000); return `§b⇥ ${fmt(Math.max(0, sec))}`; }
  const s = mine(p); if (!s) return none; s.seek(sec * 20); return `§b⇥ ${fmt(s.ph / 20)}`; }

// ------------------------------------------------------------------ commands
cmd('spectral:play', 'Play a song (headphones: follows you; speaker: 3D at this spot for everyone)', { 'song?': 'string', 'where?': ['phones', 'speaker'] },
  (p, a) => play(p, a.song, (a.where ?? 'phones') as Mode));
cmd('spectral:stop', 'Stop playback', {}, stopFor);
cmd('spectral:pause', 'Pause / resume', {}, pauseFor);
cmd('spectral:seek', 'Jump to a time in seconds', { seconds: 'float' }, (p, a) => seekFor(p, a.seconds));
cmd('spectral:speed', 'Playback speed without changing pitch (negative = reverse, 0 = freeze)', { x: 'float' }, (p, a) => {
  const s = settingsOf(p); s.speed = Math.max(-4, Math.min(4, a.x)); keep(p, s); const m = mine(p); if (m) m.s.speed = s.speed; return `§bspeed ${s.speed}x`;
});
cmd('spectral:pitch', 'Transpose in semitones without changing speed', { semitones: 'float' }, (p, a) => {
  const s = settingsOf(p); s.semis = Math.max(-36, Math.min(36, a.semitones)); keep(p, s); const m = mine(p); if (m) m.s.semis = s.semis; return `§bpitch ${s.semis >= 0 ? '+' : ''}${s.semis} st`;
});
cmd('spectral:eq', 'Bass / mid / treble in dB', { low: 'float', mid: 'float', high: 'float' }, (p, a) => {
  const c = (x: number) => Math.max(-30, Math.min(12, x));
  const s = settingsOf(p); s.eq = [c(a.low), c(a.mid), c(a.high)]; keep(p, s); const m = mine(p); if (m) m.s.eq = s.eq; return `§beq ${s.eq.join(' / ')} dB`;
});
cmd('spectral:volume', 'Volume in percent', { percent: 'int' }, (p, a) => {
  const s = settingsOf(p); s.volume = Math.max(0, Math.min(400, a.percent)) / 100; keep(p, s); const m = mine(p); if (m) m.s.volume = s.volume; return `§bvolume ${Math.round(s.volume * 100)}%`;
});
cmd('spectral:voices', 'How many sine voices to use (quality vs load)', { n: 'int' }, async (p, a) => {
  const s = settingsOf(p); s.voices = Math.max(1, Math.min(128, a.n)); keep(p, s); const m = mine(p); if (m) await m.setVoices(s.voices); return `§bvoices ${s.voices}`;
});
cmd('spectral:layers', 'Noise bands and drum bursts on/off', { noise: 'bool', bursts: 'bool' }, (p, a) => {
  const s = settingsOf(p); s.noise = a.noise; s.bursts = a.bursts; keep(p, s); const m = mine(p); if (m) { m.s.noise = s.noise; m.s.bursts = s.bursts; } return `§bnoise ${s.noise ? 'on' : 'off'}, bursts ${s.bursts ? 'on' : 'off'}`;
});
cmd('spectral:freeze', 'Freeze the sound where it is (an endless drone) / thaw', {}, freezeFor);
cmd('spectral:mode', 'quality: every voice, every command · light (Realms, many players): 16 voices, at most 24 commands per tick per listener', { mode: ['quality', 'light'] }, async (p, a) => {
  const s = settingsOf(p), light = a.mode === 'light';
  const full = platformVoices(p);
  s.mode = light ? 'light' : 'quality'; s.budget = light ? LIGHT_BUDGET : 0; s.voices = light ? LIGHT_VOICES : full; s.bursts = !light && (platformEngine(p).bursts ?? true);
  keep(p, s);
  const m = mine(p);
  if (m) { m.s.mode = s.mode; m.s.budget = s.budget; m.s.bursts = s.bursts; await m.setVoices(s.voices); }
  return light ? `§bquality light: ${LIGHT_VOICES} voices, ≤${LIGHT_BUDGET} commands/tick per listener, no bursts`
    : `§bquality full: ${full === DEFAULTS.voices ? 'every voice' : `${full} voices (as many sounds as this client plays at once)`}, no command budget`;
});
cmd('spectral:engine', 'The client\'s sound engine (measuring): highest frequency it plays in Hz (0 = no limit), fold the voices not played into the noise, at most this many sounds at once (0 = no limit), at most this many commands a tick (0 = no limit)',
  { hf: 'int', fold: 'bool', sounds: 'int', 'budget?': 'int' }, async (p, a) => {
    const s = settingsOf(p); s.hf = Math.max(0, Math.min(24000, a.hf)); s.fold = a.fold; s.sounds = Math.max(0, Math.min(255, a.sounds));
    if (a.budget !== undefined) s.budget = Math.max(0, Math.min(1000, a.budget));
    keep(p, s);
    const m = mine(p);
    if (m) { m.s.hf = s.hf; m.s.fold = s.fold; m.s.sounds = s.sounds; m.s.budget = s.budget; for (const t of m.targets) await m.build(t); }
    return `§bengine: hf ${s.hf || 'none'} · fold ${s.fold ? 'on' : 'off'} · sounds ${s.sounds || 'no limit'} · budget ${s.budget || 'none'}`;
  });
cmd('spectral:drums', 'Drum attacks: one-shot bursts a tick ahead / in their tick / a tick behind, or the noise bands attack (no one-shots), or off',
  { how: ['ahead', 'tick', 'behind', 'noise', 'off'] }, (p, a) => {
    const s = settingsOf(p), how = a.how as string;
    s.bursts = how !== 'off'; s.attacks = how === 'noise'; s.burstLead = how === 'tick' ? 0 : how === 'behind' ? -1 : 1;
    keep(p, s);
    const m = mine(p); if (m) { m.s.bursts = s.bursts; m.s.attacks = s.attacks; m.s.burstLead = s.burstLead; }
    return `§bdrums: ${how}`;
  });
cmd('spectral:level', 'Louder than the files (the game plays every sound 32.5 dB under its file, into 16 bits): dB, by setVolume or by the loud sound events (definition volume 4)',
  { db: 'float', 'via?': ['volume', 'events'] }, async (p, a) => {
    const s = settingsOf(p); s.level = Math.max(0, Math.min(18, Math.round(a.db * 10) / 10)); s.levelVia = a.via === 'events' ? 'events' : 'volume';
    keep(p, s);
    const m = mine(p);
    if (m) { m.s.level = s.level; m.s.levelVia = s.levelVia; if (m.loudEvents !== m.builtLoud) await m.rebuildAll(); }
    return s.level ? `§blevel: +${s.level} dB by ${s.levelVia === 'events' ? 'the loud sound events' : 'setVolume'}` : '§blevel: as the files';
  });
cmd('spectral:loop', 'Loop the song on/off', {}, (p) => { const s = settingsOf(p); s.loop = !s.loop; keep(p, s); const m = mine(p); if (m) m.s.loop = s.loop; return `§bloop ${s.loop ? 'on' : 'off'}`; });
cmd('spectral:viz', 'Spectrum on the action bar on/off', {}, (p) => { const s = settingsOf(p); s.viz = !s.viz; keep(p, s); const m = mine(p); if (m) m.s.viz = s.viz; return `§bspectrum ${s.viz ? 'on' : 'off'}`; });
cmd('spectral:join', 'Listen in on another player\'s headphones', { who: 'player' }, async (p, a) => {
  const other: Player | undefined = a.who?.[0]; const s = other && mine(other);
  if (!s) return '§cthey are not playing anything'; if (s.mode !== 'phones') return '§7that one is a speaker: walk up to it';
  await s.addListener(p); return `§a♪ listening with ${other!.name}`;
});
cmd('spectral:songs', 'List the songs', {}, (p) => {
  for (const s of songs.values()) p.sendMessage(`§f♪ ${s.meta.id} §7— ${s.meta.title} (${fmt(s.meta.seconds)}, ${s.meta.voices} voices${s.pasted ? `, pasted by ${s.pasted}` : ''})`);
  for (const s of noteSongs.values()) p.sendMessage(`§f♫ ${s.meta.id} §7— ${s.meta.title} (${fmt(s.meta.seconds)}, ${s.meta.notes} notes${s.pasted ? `, pasted by ${s.pasted}` : ''})`);
  return `§7${songs.size + noteSongs.size} songs — /spectral:play <id> [phones|speaker] · /spectral:paste adds one`;
});
cmd('spectral:status', 'Playback state and engine load', {}, (p) => notePlays.get(p.id)?.status() ?? mine(p)?.status() ?? 'status: idle');
cmd('spectral:say', 'Read kana aloud with the voice, mora by mora like notes (kanji: tools/speech.py makes a speech song): headphones, or the speaker for everyone near',
  { text: 'string', 'out?': ['phones', 'speaker'], 'speed?': 'float' }, async (p, a) => {
    if (!VOICES.length) return '§cno voice in this pack';
    const r = saySong(a.text, 0, 150 / Math.max(0.25, Math.min(4, a.speed ?? 1)));
    if (!r) return '§cnothing to say: kana only in the game (tools/speech.py reads kanji, the converter page too)';
    const said = await playNotes(p, r.song, (a.out ?? 'phones') as Mode);
    return r.skipped ? `${said} §7(${r.skipped} characters not kana: not read)` : said;
  });
cmd('spectral:sampler', 'Note songs (MIDI, the instrument bank): notes of this many ticks started together, each placed inside its tick by seekTo (0 = no placement: every note at the start of its tick), ms more ahead for a 3D speaker, at most this many notes at once, level in percent',
  { bundle: 'int', 'ahead?': 'int', 'voices?': 'int', 'volume?': 'int', 'log?': 'bool' }, (p, a) => {
    SAMPLER.place = a.bundle > 0; SAMPLER.bundle = Math.max(1, Math.min(40, a.bundle || 1));
    if (a.ahead !== undefined) SAMPLER.ahead3d = Math.max(0, Math.min(400, a.ahead));
    if (a.voices !== undefined) SAMPLER.voices = Math.max(1, Math.min(64, a.voices));
    if (a.volume !== undefined) SAMPLER.volume = Math.max(0, Math.min(200, a.volume)) / 100;
    if (a.log !== undefined) SAMPLER.log = a.log;
    return `§bsampler: ${SAMPLER.place ? `placed to the ms, ${SAMPLER.bundle} tick${SAMPLER.bundle > 1 ? 's' : ''} a bundle` : 'tick-bound (no placement)'}, 3D ahead ${SAMPLER.ahead3d} ms, ${SAMPLER.voices} notes at once, level ${Math.round(SAMPLER.volume * 100)} %`;
  }, true);
cmd('spectral:menu', 'Open the player', {}, (p) => { openMenu(p); });
cmd('spectral:probe', 'Voice-limit probe: a 110 Hz saw built one harmonic at a time (listen where it stops getting brighter)', { 'n?': 'int' }, (p, a) => {
  const n = Math.max(1, Math.min(128, a.n ?? 64));
  addSong(genMeta('probe', `voice probe ×${n}`, n * 0.25 + 2, n), undefined, (d) => {
    for (let k = 0; k < d.F; k++) for (let h = 1; h <= n; h++) {
      if (k / 20 < (h - 1) * 0.25) continue;
      const f = 110 * h; if (f > 16000) continue;
      d.freq[k * d.N + h - 1] = f; d.amp[k * d.N + h - 1] = 0.35 / h;
    }
  });
  songs.get('probe')!.dec = undefined;
  const s = settingsOf(p); s.voices = Math.max(s.voices, n); keep(p, s);
  return play(p, 'probe', 'phones').then((r) => { p.sendMessage(r); return `§7one more harmonic every 0.25 s: §fthe voice the sound stops changing at = your device's limit`; });
});

// ------------------------------------------------------------------ calibration programs (tools/rig): a recording of a real client playing
// these is how the client's limits are measured (voice count, fade shape, when commands land, seekTo, pitch range, stereo, mixer,
// commands per tick). The programs are data (src/calib_programs.ts from tools/rig/programs.py), the analysis reads the same file.
interface CalibRun { p: Player; prog: Program; t: number; i: number; slots: (SoundInstance | undefined)[]; queue: Program[]; errors: number; }
const calibs = new Map<string, CalibRun>();
function calibStop(r: CalibRun) { for (const s of r.slots) { try { s?.stop(); } catch { /* gone */ } } r.slots = []; }
function calibStep(r: CalibRun) {
  const steps = r.prog.steps;
  while (r.i < steps.length && steps[r.i][0] <= r.t) {
    const [, op, slot, a, b] = steps[r.i++];
    try {
      if (op === 'click') r.p.playSound('spectral.sync', { volume: 1 });
      else if (op === 'play') r.slots[slot] = r.p.playSound(r.prog.slots[slot][0], { volume: a, pitch: b, loopCount: r.prog.slots[slot][1] ? -1 : 0 });
      else if (op === 'pitch') r.slots[slot]?.setPitch(a);
      else if (op === 'vol') r.slots[slot]?.setVolume(a);
      else if (op === 'fade') r.slots[slot]?.fade(a, b);
      else if (op === 'seek') r.slots[slot]?.seekTo(a);
      else if (op === 'stop') { r.slots[slot]?.stop(); r.slots[slot] = undefined; }
    } catch (e) { if (r.errors++ < 5) console.warn(`[spectral calib] ${r.prog.id} tick ${r.t} ${op}: ${e}`); }
  }
}
system.runInterval(() => {
  for (const [id, r] of calibs) {
    if (!r.p.isValid) { calibStop(r); calibs.delete(id); continue; }
    if (r.t === 0) console.warn(`[spectral calib] start ${r.prog.id} tick ${system.currentTick} ms ${Date.now()}`);
    calibStep(r);
    if (++r.t > r.prog.ticks) {
      calibStop(r);
      console.warn(`[spectral calib] end ${r.prog.id} tick ${system.currentTick} ms ${Date.now()} errors ${r.errors}`);
      r.p.sendMessage(`§7calib ${r.prog.id} done (${r.errors} errors)`);
      const next = r.queue.shift();
      if (next) { r.prog = next; r.t = 0; r.i = 0; r.errors = 0; } else calibs.delete(id);
    }
  }
}, 1);
cmdAny('spectral:calib', 'Calibration program for measuring the client (tools/rig): a name, "all" or "list"', { 'program?': 'string' }, (p, a) => {
  const who = p ?? world.getAllPlayers()[0];
  if (a.program === 'list' || !a.program) return `calib: ${programs.map((x) => `${x.id} (${(x.ticks / 20).toFixed(0)} s)`).join(', ')} · all`;
  const list = a.program === 'all' ? [...programs] : programs.filter((x) => x.id === a.program);
  if (!list.length) return `§cno calibration program "${a.program}" — /spectral:calib list`;
  if (!who) return 'calib: no player to play it to';
  const s = mine(who); if (s) { s.stop(); sessions.delete(who.id); }
  const old = calibs.get(who.id); if (old) calibStop(old);
  calibs.set(who.id, { p: who, prog: list[0], t: 0, i: 0, slots: [], queue: list.slice(1), errors: 0 });
  return `§b▶ calib ${list.map((x) => x.id).join(' → ')} (${(list.reduce((n, x) => n + x.ticks, 0) / 20).toFixed(0)} s)`;
});

// ------------------------------------------------------------------ song packs (other behaviour packs send songs as script events)
const partial = new Map<string, { meta?: Meta; parts: string[]; got: number; n: number }>();
system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id === 'spectral:echo') { world.sendMessage(`echo ${e.message.length}`); return; }
  if (e.id === 'spectral:live') { const why = liveMessage(e.message); if (why) console.warn(`[spectral] live: ${why}`); return; }
  if (e.id !== 'spectral:song') return;
  let m: { id: string; i: number; n: number; meta?: Meta; data: string };
  try { m = JSON.parse(e.message); } catch { console.warn('[spectral] song pack: bad message'); return; }
  if (!m.id || typeof m.data !== 'string' || !(m.n > 0) || !(m.i >= 0 && m.i < m.n)) return;
  if (songs.has(m.id) && songs.get(m.id)!.data !== undefined && !partial.has(m.id) && m.i === 0) partial.delete(m.id);
  let s = partial.get(m.id);
  if (!s || s.n !== m.n) { s = { parts: new Array(m.n), got: 0, n: m.n }; partial.set(m.id, s); }
  if (m.meta) s.meta = m.meta;
  if (s.parts[m.i] === undefined) { s.parts[m.i] = m.data; s.got++; }
  if (s.got === s.n && s.meta) {
    const known: { data?: string } | undefined = songs.get(m.id) ?? noteSongs.get(m.id), data = s.parts.join('');
    partial.delete(m.id);
    if (known?.data === data) return;
    if (isNoteMeta(s.meta as { format?: unknown })) addNoteSong({ ...(s.meta as unknown as NoteMeta), id: m.id }, data);
    else addSong({ ...s.meta, id: m.id }, data);
    world.sendMessage(`§d♪ song pack: ${s.meta.title} (${fmt(s.meta.seconds)}) — /spectral:play ${m.id}`);
  }
});

// ------------------------------------------------------------------ songs pasted as text (/spectral:paste, src/songtext.ts)
// The converter page (「ゲームで貼り付け」) or tools/songtext.mjs gives a song as text: SPZ2 (SPZ1 is read too), its fields on grids
// an ear does not tell apart, range-coded and written 15 bits a character (SPA2: 6, in ASCII), in numbered parts of at most FIELD_CHARS characters — what a phone's form text field takes whole (this pack's
// rp/ui/server_form.json widens it from vanilla's 100; a phone's box stops at 5000 all the same). A player pastes the parts into the form one after another;
// the song is decoded as a job (its check sum tells a cut or broken text), joins the songs, and is kept in the world (dynamic
// properties, PASTE_PIECE characters a piece: under the 32,767 a string takes even counted in UTF-8 bytes) for later starts,
// where only its header is read until it is played.
const PASTE_INDEX = 'spectral:pasted', PASTE_PIECE = 10000, PASTE_SONGS = 64, PASTE_CHARS = 4000000;
interface PastedEntry { id: string; title: string; by: string; pieces: number; chars: number }
const pastedIndex = (): PastedEntry[] => load<PastedEntry[]>(world, PASTE_INDEX, []);
/** the parts of a song a player has pasted so far (10 minutes) */
const pending = new Map<string, { key: string; n: number; parts: Part[]; at: number }>();
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);
/** a song id from the text's own (a-z 0-9 _), another if a song pack or a built-in song has it */
function pasteId(want: string, key: string): string {
  let id = want.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || `song_${key}`;
  for (let n = 2; songs.has(id) && !songs.get(id)!.pasted; n++) id = `${id.replace(/_p\d*$/, '')}_p${n}`;
  return id;
}
function forgetPieces(e: PastedEntry) { for (let k = 0; k < e.pieces; k++) world.setDynamicProperty(`spectral:pz:${e.id}:${k}`, undefined); }
/** a pasted song kept in the world → undefined, or why not */
function keepPasted(id: string, title: string, by: string, payload: Uint8Array): string | undefined {
  const text = payloadText(payload), pieces = Math.ceil(text.length / PASTE_PIECE), all = pastedIndex();
  const old = all.find((e) => e.id === id), rest = all.filter((e) => e.id !== id);
  if (rest.length >= PASTE_SONGS) return `the world keeps ${PASTE_SONGS} pasted songs: /spectral:forget one first`;
  const used = rest.reduce((n, e) => n + e.chars, 0);
  if (used + text.length > PASTE_CHARS) return `the world keeps ${PASTE_CHARS} characters of pasted songs (${used} used): /spectral:forget one first`;
  try {
    if (old) forgetPieces(old);
    for (let k = 0; k < pieces; k++) world.setDynamicProperty(`spectral:pz:${id}:${k}`, text.slice(k * PASTE_PIECE, (k + 1) * PASTE_PIECE));
    save(world, PASTE_INDEX, [...rest, { id, title, by, pieces, chars: text.length }]);
  } catch (e) { return errText(e); }
  return undefined;
}
function decodePayload(payload: Uint8Array): Promise<{ meta: SongMeta; bytes: Uint8Array }> {
  return new Promise((res, rej) => {
    const got: { meta?: SongMeta; bytes?: Uint8Array } = {};
    system.runJob((function* () { try { yield* decodeSongJob(payload, got); res(got as { meta: SongMeta; bytes: Uint8Array }); } catch (e) { rej(e); } })());
  });
}
/** one pasted text: a part kept until the song is whole; whole, the song decoded, added and (keep) kept in the world */
async function pasted(p: Player, text: string, keep: boolean): Promise<{ say: string; more?: boolean }> {
  let part: Part;
  // (each paste in the server's log too: how many characters came — a text field that cut them would show here)
  try { part = readPart(text); } catch (e) {
    console.warn(`[spectral] paste refused (${text.length} characters from ${p.name}): ${errText(e)}`);
    // (a song text stopped at 100 characters: the game's own text box — this pack's rp/ui/server_form.json, which widens it, is not
    // on that player's game: the server's resource packs declined, or the world without the pack. At PHONE_CHARS: a phone's own
    // box, which stops there whatever the pack says — a text made with longer parts)
    const t = text.trim();
    if (t.length === 100 && /^SP[ZA][12]\./.test(t)) return { say: `§cthe text box took only 100 characters (the game's own limit): Spectral Player's resource pack lets it take a whole part (${FIELD_CHARS} characters) — accept the server's resource packs (or add the pack to the world) and paste it again` };
    if (t.length === PHONE_CHARS && /^SP[ZA][12]\./.test(t) && /cut short/.test(errText(e))) return { say: `§cthe text box took only ${PHONE_CHARS} characters (a phone's limit): make the text again on the converter page — its parts are ${FIELD_CHARS} characters at most now — and paste them one by one` };
    // (a kanji text cut short well before a part's end: a text box that counts bytes takes a third of the characters — not measured
    // on a phone; the ASCII text, measured whole at 4977 characters, fits)
    if (t.length >= 1000 && t.length < PHONE_CHARS && /^SPZ[12]\./.test(t) && /cut short/.test(errText(e))) return { say: `§cthe text came cut at ${t.length} characters: if the text box cut it, choose 英数字 (ASCII letters) for the text on the converter page — a phone takes ${FIELD_CHARS} of those — and paste it again` };
    return { say: `§c${errText(e)}` };
  }
  console.warn(`[spectral] paste part ${part.i}/${part.n} of ${part.key}: ${text.length} characters from ${p.name}`);
  let pend = pending.get(p.id);
  if (!pend || pend.key !== part.key || pend.n !== part.n || system.currentTick - pend.at > 20 * 600) { pend = { key: part.key, n: part.n, parts: [], at: 0 }; pending.set(p.id, pend); }
  if (!pend.parts.some((x) => x.i === part.i)) pend.parts.push(part);
  pend.at = system.currentTick;
  if (pend.parts.length < pend.n) {
    const next = [...Array(pend.n).keys()].map((i) => i + 1).find((i) => !pend!.parts.some((x) => x.i === i));
    return { say: `§e♪ part ${part.i} of ${part.n} in (${pend.parts.length}/${pend.n}) — paste part ${next}`, more: true };
  }
  pending.delete(p.id);
  let payload: Uint8Array, got: { meta: SongMeta; bytes: Uint8Array };
  try { payload = joinParts(pend.parts); got = await decodePayload(payload); } catch (e) { console.warn(`[spectral] paste refused (${pend.key}): ${errText(e)}`); return { say: `§cthe song text is broken: ${errText(e)}` }; }
  const meta = { ...got.meta, id: pasteId(got.meta.id, pend.key) } as unknown as Meta;
  songs.set(meta.id, { meta, bytes: got.bytes, pasted: p.name });
  let note = '';
  if (keep) { const why = keepPasted(meta.id, meta.title, p.name, payload); note = why ? ` §c(not kept in the world: ${why})` : ' §7(kept in this world)'; }
  console.warn(`[spectral] pasted ${meta.id} (${meta.title}, ${meta.seconds} s, ${meta.voices} voices, ${payload.length} bytes in ${pend.n} part${pend.n > 1 ? 's' : ''}) from ${p.name}${keep ? '' : ', not kept'}`);
  return { say: `§d♪ ${meta.title} (${fmt(meta.seconds)}, ${meta.voices} voices) — /spectral:play ${meta.id}${note}` };
}
/** the paste form, again for each part a long song still wants */
async function pasteForm(p: Player) {
  for (;;) {
    const pend = pending.get(p.id), live = pend && system.currentTick - pend.at <= 20 * 600 ? pend : undefined;
    const f = new ModalFormData().title('Spectral Player: paste a song')
      .label(live ? `§e${live.parts.length} of ${live.n} parts in§r: paste the next part.`
        : `The song text from the converter page (SPZ2.…, up to ${FIELD_CHARS} characters a part). A long song comes in parts: paste them one after another.`)
      .textField('Song text', 'Paste the song text here (SPZ2.…)')
      .toggle('Keep it in this world', { defaultValue: true });
    const r = await ask(p, f);
    if (!r || r.canceled || !r.formValues) return;
    const text = r.formValues.find((v) => typeof v === 'string') as string | undefined;
    const keep = r.formValues.find((v) => typeof v === 'boolean') !== false;
    const out = await pasted(p, text ?? '', keep);
    p.sendMessage(out.say);
    if (!out.more) return;
  }
}
cmd('spectral:paste', 'Paste a song as text (the converter page: ゲームで貼り付け): a form, again for each part of a long song', {}, (p) => { pasteForm(p); });
cmd('spectral:forget', 'Forget a pasted song (the one who pasted it, or an operator)', { song: 'string' }, (p, a) => {
  const s = songs.get(a.song);
  if (!s?.pasted) return `§cno pasted song "${a.song}" — /spectral:songs`;
  if (s.pasted !== p.name && p.playerPermissionLevel !== PlayerPermissionLevel.Operator) return `§c${s.pasted} pasted it: they or an operator can forget it`;
  songs.delete(a.song);
  const e = pastedIndex().find((x) => x.id === a.song);
  if (e) { forgetPieces(e); save(world, PASTE_INDEX, pastedIndex().filter((x) => x.id !== a.song)); }
  return `§7♪ forgot ${s.meta.title} (${a.song})`;
});
// (the pasted songs kept in the world: their headers read at the start, each decoded when it first plays)
world.afterEvents.worldLoad.subscribe(() => {
  for (const e of pastedIndex()) {
    try {
      let text = '';
      for (let k = 0; k < e.pieces; k++) { const x = world.getDynamicProperty(`spectral:pz:${e.id}:${k}`); if (typeof x !== 'string') throw new Error(`piece ${k} is missing`); text += x; }
      const payload = payloadFrom(text), h = songHeader(payload);
      songs.set(e.id, { meta: { ...h.meta, id: e.id } as unknown as Meta, spz: payload, pasted: e.by });
    } catch (err) { console.warn(`[spectral] pasted song ${e.id}: ${errText(err)}`); }
  }
});

// ------------------------------------------------------------------ live streams (a voice chat, a microphone, another pack)
// Frames arrive while they are made — script event `spectral:live` {"id": the stream, "s": the first frame's number, "f": base64
// frames, "m": the stream's meta (its first message), "at": where it plays} — and play LIVE_DELAY ticks behind the newest frame (a
// jitter buffer of 100 ms), on headphones, as a 3D speaker at a spot, or in 3D from a player as they move ("follow": a proximity
// voice — the client turns and fades it with each listener's place and heading; it moves with the talker a few sounds a tick).
// A frame: the voices' mask (N bits), for each one in it its level code (bit 7: an attack) and, sounding, its pitch code (2 bytes),
// the M noise bands' codes, then the fade codes (2 bits) of the N voices and of the M bands — tools/live/encoder.mjs (web/live.js)
// makes them from audio as it comes (a causal analysis of each 50 ms); tools/live/bridge.mjs brings a Discord voice channel in.
export interface LiveMeta { N: number; M: number; amp: [number, number]; nz: [number, number]; fd: number[]; title?: string; }
type LiveAt = { kind: 'phones'; who: string[] } | { kind: 'speaker' | 'near'; dim: string; loc: Vector3 } | { kind: 'follow'; who: string };
const LIVE_CAP = 512;           // frames kept (25.6 s)
const LIVE_DELAY = 2;           // ticks behind the newest frame
const LIVE_LATE = 6;            // further behind than this over the delay: jump ahead (the latency stays bounded)
const LIVE_IDLE = 4;            // ticks without a new frame: the voice falls silent (a talker stopped)
/** blocks a followed talker moves before the sounds move with them (spectral:handover's second value; 1.5 by default): every move
 *  makes the talker's sounds again for each listener (a low thump for each: tools/rig/low_bursts.py) */
let FOLLOW_MOVE = 1.5;
let FOLLOW_STEP = 2;            // sounds moved a tick (each handed over two ticks later: SETTLE_TICKS; spectral:handover's fifth value; 8 until run 41292284148)
const FOLLOW_RANGE = 48;        // blocks: the farthest a talker is heard (the 3D sounds' own max_distance)
/** the volume a 3D sound is made at (spectral:range): the client takes its audible distance from it, 16 blocks a unit, and
 *  plays it no louder for it. Measured, a listener's own 3D sound to their left (runs 41200540880 and 41205071937, the level
 *  against the original): made at 1, -31.7 dB at 3 blocks, -42.5 at 12, silent at 24; made at 2, -48.0 at 24; made at 4, -49.2
 *  at 24 and -53.5 at 40 — one law for all, within 1.5 dB of 6 dB less a doubling of the distance from the definitions'
 *  min_distance 3, cut off past 16 blocks times the volume (bracketed: made at 1, heard at 12 and not at 24). 3 reaches
 *  FOLLOW_RANGE. Its level is set after, by setVolume */
let RANGE_3D = 3;
/** how far a talker (follow) or a spot (near) is heard: the 3D sounds' reach, at most FOLLOW_RANGE (nobody farther gets sounds) */
const reach3D = () => Math.min(FOLLOW_RANGE, 16 * RANGE_3D);
/** ticks a new 3D sound plays as it was made (measured: every 3D recording of runs 9 to 12 starts with 100 ms of the 1760 Hz loop
 *  at full volume — the silence sent with it came late). So 3D sounds are made at P_MIN (17.6 Hz, under hearing) and their state
 *  is sent again this many ticks later */
const SETTLE_TICKS = 2;
/** a followed talker moved (follow): until their handover the old sounds hold their last level (false, 1.2.0 as measured in runs
 *  41272459953 and 41277993333) or keep following the voice (true, spectral:handover steer: to measure — a voice that ends or starts
 *  a syllable in those two ticks is not held as it was) */
let HANDOVER_STEER = false;
/** a followed talker moved: the old sound stopped as its new one is made (spectral:handover cut, the default since run
 *  41292284148). A talker's 32 sounds and their new ones are more than a phone plays at once (32, measured), and the client then
 *  drops some: measured, a talker walking 2 blocks a step with 24 voices — the old sounds kept until the handover (1.2.0): ViSQOL
 *  2.68 / 2.68, the voice lost for 500 / 950 ms (syllables just after a move, tools/rig/gaps.py) and 6 dB quieter; stopped at once,
 *  2 a tick: 2.77 / 2.73, nothing lost; 8 voices (16 sounds, never over 32), kept: 2.74 / 2.74, nothing lost */
let HANDOVER_CUT = true;
/** a followed talker moved: ticks until the new sounds take over (spectral:handover's third value; SETTLE_TICKS by default) and how
 *  many times after that their state is sent again, every 2 ticks (its fourth; 0 by default). Measured, run 41286094409: after a
 *  move the new sounds stayed silent for 300-400 ms at the start of a syllable (hold and steer alike, run 41284187721 too) — what
 *  is sent to a sound the client has not started yet seems lost, and the add-on sends only what changes */
let HANDOVER_TICKS = SETTLE_TICKS;
let HANDOVER_RESEND = 0;
/** how much louder than the files 3D sounds are steered (dB, spectral:range's second number; +10 by default since 1.2.0, as the
 *  headphones' level). A far 3D voice loses its quiet parts under the phone's 16-bit floor, and the level lifts them — measured,
 *  run 41270487804, a listener's own 3D sound to the left, 0 / +6 / +10 dB: at 3 blocks -30.7 / -23.9 / -20.3 dB (setVolume over
 *  1 is played louder in 3D too), ViSQOL 3.16 / 3.17 / 3.20 (no loss to the clip); at 24 blocks ViSQOL 2.38 / 2.60 / 2.79, the 10 ms
 *  the original has 40-50 dB under its loudest a digital zero 42 % / – / 5 % of the time; at 46 blocks 68 % -> 33 % (ViSQOL 2.62 ->
 *  2.46 there, the one pair against it). It also puts the low thump of a new sound (SETTLE_TICKS) 12-15 dB further under the voice */
let LEVEL_3D_DB = 10;
/** voices that follow a talker made quietly (spectral:range's third value; on by default): the _3q events play the same loops at
 *  definition volume Q3D and the add-on steers them 1/Q3D times up. A new 3D sound plays as made for 100-200 ms, and its loops,
 *  in phase at full volume, clip into a low thump even at P_MIN — and follow makes its sounds again at every move of the talker
 *  (8 a tick). Measured, a talker walking 3 blocks ahead, made quietly against as before, the same run: ViSQOL 2.87 / 2.41 (run
 *  41272459953) and 2.95 / 2.39 (run 41277993333); as loud and as far, the start 19-24 dB further under the voice. A sound that
 *  stays put does not need it and loses a little far off (24 blocks 2.57 / 2.82, 46 blocks 2.16 / 2.47; 3 blocks +0.05 / -0.06):
 *  near and speaker streams are made as before. The voice's floor stays SILENT in what is heard */
let QUIET_3D = true;
/** the definition volume of the quiet events (spectral:range's fourth value): 0.1 (_3q, 1.2.0), 0.01 (_3r, the default) or 0.001
 *  (_3s) — the add-on steers them 1/Q3D times up. Measured: a talker walking 2 blocks a step (a move every ~0.7 s) made at 0.1 left
 *  a low thump at every move (run 41284187721: 44 in 20 s, up to -36 dB at 60-250 Hz where the voice's loud parts over 250 Hz are
 *  -50 dB); run 41286094409, the same walk: 0.1 / 0.01 / 0.001 ViSQOL 2.39, 2.36 / 2.66, 2.65 / 2.28, 2.33 (thumps 57, 54 / 4, 0 /
 *  0, 0); a talker standing, 0.1 / 0.001: 3.09 / 3.23 at the same level (setVolume 1000 times up plays as asked) */
let Q3D = 0.01;
const Q3D_EVENTS: Record<string, string> = { '0.1': '_3q', '0.01': '_3r', '0.001': '_3s' };
/** the live streams a listener hears with sounds of their own (follow, near, phones) share what the listener's client plays at once
 *  (spectral:share, operators; on by default). A phone plays 32 sounds (measured), a talker's stream takes 24 (16 voices, 8 noise
 *  bands: tools/live/bridge.mjs), and over 32 the client drops some — measured, one walking talker over it lost syllables for
 *  0.1-0.4 s and 6 dB (run 41292284148). Each stream gets an equal part (water filling: what a small one leaves goes to the
 *  others); a part short of the whole stream gives up its two lowest noise bands (180-720 Hz: its voices are there), then plays
 *  its first voices (a live encoder gives a starting voice the lowest free slot, the strongest peaks first), at least SHARE_VMIN
 *  (more low bands go for them). Emulated (tools/exp/trim_song.py, a 16-voice stream, a phone at +10 dB; ViSQOL of the two speech
 *  songs and a sung one): all 24 sounds 3.44 / 3.12 / 3.56; 16 sounds as 10 voices + 6 bands 3.41 / 3.12 / 3.51 (8 + 8: 3.41 /
 *  3.10 / 3.50); 10 sounds as 4 + 6 3.29 / 3.03 / 3.40 (2 + 8: 3.09 / 2.98 / 3.43); 8 sounds as 3 + 5 3.22 / 3.00 / 3.43 (the top
 *  bands instead, 2 voices + the 6 lowest: 2.58 / 2.37 / 3.49 — the high bands carry speech) */
let SHARE = true;
/** the sounds a client with no measured limit plays at once, for sharing (spectral:share's second value; 0: no limit, all voices) */
let SHARE_ANY = 0;
const SHARE_VMIN = 3;
const soundsOf = (p: Player) => clientOf(p)?.sounds ?? SHARE_ANY;
/** water filling: each gets what it needs, or an equal part of what is left once the smaller needs are met */
function fill(need: number[], lim: number): number[] {
  const order = need.map((_, i) => i).sort((a, b) => need[a] - need[b]), out = need.map(() => 0);
  let left = lim;
  order.forEach((i, k) => { const g = Math.max(0, Math.min(need[i], Math.floor(left / (order.length - k)))); out[i] = g; left -= g; });
  return out;
}
/** each listener's share of every live stream they hear (Target nv / nb). What is over a new share stops now — before the sounds a
 *  new stream or listener needs are made (LivePlayer.build calls this first) — and what a larger share adds is made by the
 *  stream's own tick */
function shareSounds() {
  const by = new Map<string, [LivePlayer, Target][]>();
  for (const st of lives.values()) {
    const lp = st.player; if (!lp) continue;
    for (const t of lp.targets) {
      if (!t.player || t.gone) continue;
      const l = by.get(t.player.id); if (l) l.push([lp, t]); else by.set(t.player.id, [[lp, t]]);
    }
  }
  for (const list of by.values()) {
    let lim = 0; try { lim = SHARE ? soundsOf(list[0][1].player!) : 0; } catch { /* gone */ }
    const need = list.map(([lp]) => lp.st.meta.N + lp.st.meta.M), give = lim > 0 ? fill(need, lim) : need;
    list.forEach(([lp, t], j) => {
      const { N, M } = lp.st.meta, s = give[j];
      let nv = N, nb = M;
      if (s < N + M) {
        // (the two lowest noise bands go first, then the voices that fit; under SHARE_VMIN voices, more low bands go for them)
        nb = Math.max(0, M - 2); nv = s - nb;
        if (nv > N) { nv = N; nb = Math.min(M, s - N); }
        while (nv < Math.min(SHARE_VMIN, N) && nb > 0) { nb--; nv++; }
        nv = Math.max(0, Math.min(N, nv)); nb = Math.max(0, Math.min(M, nb));
      }
      t.nv = nv; t.nb = nb;
      lp.trim(t);
    });
  }
}

class LiveStream {
  w = -1; frames = 0; gaps = 0; lastAt = 0;
  /** the first frame of the latest talkspurt (frames after LIVE_IDLE ticks without a message): where the player starts again */
  burst = 0;
  freq: Float32Array; amp: Float32Array; att: Uint8Array; nz: Float32Array; vd: Uint8Array; nzd: Uint8Array;
  curF: Float32Array; curA: Float32Array; ampV = new Float32Array(128); nzV = new Float32Array(256);
  player?: LivePlayer;
  constructor(public id: string, public meta: LiveMeta) {
    const { N, M } = meta;
    this.freq = new Float32Array(LIVE_CAP * N); this.amp = new Float32Array(LIVE_CAP * N); this.att = new Uint8Array(LIVE_CAP * N);
    this.nz = new Float32Array(LIVE_CAP * M); this.vd = new Uint8Array(LIVE_CAP * N).fill(3); this.nzd = new Uint8Array(LIVE_CAP * M).fill(3);
    this.curF = new Float32Array(N); this.curA = new Float32Array(N);
    const [aF, aS] = meta.amp, [nF, nS] = meta.nz;
    for (let c = 1; c < 128; c++) this.ampV[c] = Math.pow(10, (aF + (c - 1) * aS) / 20);
    for (let c = 1; c < 256; c++) this.nzV[c] = Math.pow(10, (nF + (c - 1) * nS) / 20);
  }
  /** a frame's state copied to slot k (a gap: the frames that never came hold the last one, silent noise) */
  private store(k: number, nzRow?: Uint8Array, vf?: Uint8Array, nf?: Uint8Array) {
    const { N, M } = this.meta, i = ((k % LIVE_CAP) + LIVE_CAP) % LIVE_CAP;
    this.freq.set(this.curF, i * N); this.amp.set(this.curA, i * N);
    for (let j = 0; j < M; j++) { this.nz[i * M + j] = nzRow ? this.nzV[nzRow[j]] : 0; this.nzd[i * M + j] = nf ? nf[j] : 3; }
    for (let v = 0; v < N; v++) this.vd[i * N + v] = vf ? vf[v] : 3;
  }
  /** frames from number `seq` on → how many were read (a broken frame stops the reading: the rest of that message is lost) */
  push(seq: number, b: Uint8Array): number {
    const { N, M } = this.meta, nb = (N + 7) >> 3, fv = (N + 3) >> 2, fn = (M + 3) >> 2;
    let p = 0, k = seq, n = 0;
    if (seq > this.w && (this.w < 0 || system.currentTick - this.lastAt >= LIVE_IDLE)) this.burst = seq;
    const nzRow = new Uint8Array(M), vf = new Uint8Array(N), nf = new Uint8Array(M);
    while (p < b.length) {
      if (k > this.w + 1 && this.w >= 0) { for (let g = this.w + 1; g < k && g < this.w + 1 + LIVE_CAP; g++) { this.store(g); this.gaps++; } }
      const mp = p; p += nb;
      if (p > b.length) break;
      const i = ((k % LIVE_CAP) + LIVE_CAP) % LIVE_CAP;
      let bad = false;
      for (let v = 0; v < N; v++) {
        this.att[i * N + v] = 0;
        if (!((b[mp + (v >> 3)] >> (v & 7)) & 1)) continue;
        if (p >= b.length) { bad = true; break; }
        const x = b[p++], ac = x & 0x7f;
        this.curA[v] = this.ampV[ac];
        if (ac) { if (p + 2 > b.length) { bad = true; break; } this.curF[v] = 16 * Math.pow(2, (b[p] | (b[p + 1] << 8)) / 6000); p += 2; }
        if (x & 0x80) this.att[i * N + v] = 1;
      }
      if (bad || p + M + fv + fn > b.length) break;
      for (let j = 0; j < M; j++) nzRow[j] = b[p++];
      for (let v = 0; v < N; v++) vf[v] = (b[p + (v >> 2)] >> (2 * (v & 3))) & 3;
      p += fv;
      for (let j = 0; j < M; j++) nf[j] = (b[p + (j >> 2)] >> (2 * (j & 3))) & 3;
      p += fn;
      this.store(k, nzRow, vf, nf);
      this.w = Math.max(this.w, k); this.frames++; n++; k++;
    }
    this.lastAt = system.currentTick;
    return n;
  }
  slot(k: number) { return ((k % LIVE_CAP) + LIVE_CAP) % LIVE_CAP; }
}

class LivePlayer {
  targets: Target[] = []; p = -1; playing = false; idle = 0; underruns = 0; skips = 0; moves = 0; calls = 0; ticks = 0; started = false; ms = 0;
  lastP: Float32Array; lastL: Float32Array; lastNL: Float32Array;
  anchor?: Vector3; moving: number[] = []; dying: [SoundInstance, number][] = [];
  /** follow: sounds made at the new place, each taking over from its old one at tick `at` (SETTLE_TICKS later); i < 0: band -1-i */
  handover: { t: Target; i: number; s: SoundInstance; old?: SoundInstance; at: number }[] = [];
  /** follow: sounds a move made that get their state again (HANDOVER_RESEND times, every 2 ticks after their handover) */
  resends: { t: Target; i: number; s: SoundInstance; left: number; at: number }[] = [];
  constructor(public st: LiveStream, public at: LiveAt) {
    this.q = QUIET_3D && at.kind === 'follow' ? Q3D : 1;
    this.lastP = new Float32Array(st.meta.N).fill(-1); this.lastL = new Float32Array(st.meta.N).fill(this.floor); this.lastNL = new Float32Array(st.meta.M).fill(this.floor);
  }
  get three() { return this.at.kind !== 'phones'; }
  /** the definition volume of its 3D sounds: Q3D made quietly (QUIET_3D, a stream that follows a talker; set when it starts playing
   *  here), else 1 */
  q: number;
  get q3() { return this.q < 1; }
  ev(name: string) { return this.three ? name + (this.q3 ? Q3D_EVENTS[String(this.q)] ?? '_3q' : '_3d') : name; }
  /** the highest level sent (10 file units, or 10 over the quiet events' definition volume) */
  get cap() { return 10 / this.q; }
  /** the lowest level sent: SILENT as heard (made quietly, 1/q times it — the loops kept alive at the same level either way) */
  get floor() { return SILENT / this.q; }
  /** the level over the files: headphones as the listener's own setting (a phone +10 dB), 3D sounds LEVEL_3D_DB (their play volume is
   *  their range) */
  lv = 1;
  where(): { dim: Dimension; loc: Vector3 } | undefined {
    if (this.at.kind === 'speaker' || this.at.kind === 'near') { try { return { dim: world.getDimension(this.at.dim), loc: this.at.loc }; } catch { return undefined; } }
    if (this.at.kind === 'follow') {
      const who = this.at.who, q = world.getPlayers({ name: who })[0], e: Entity | undefined = q?.isValid ? q : this.named(who);
      if (!e) return undefined;
      const l = e.getHeadLocation(); return { dim: e.dimension, loc: { x: l.x, y: l.y, z: l.z } };
    }
    return undefined;
  }
  /** follow: no player of that name — an entity with that name tag (an armor stand, a pet, an NPC that talks), looked for at most
   *  every 10 ticks while there is none */
  private talker?: Entity; private lookedAt = -100;
  private named(who: string): Entity | undefined {
    if (this.talker?.isValid && this.talker.nameTag === who) return this.talker;
    this.talker = undefined;
    const now = system.currentTick;
    if (now - this.lookedAt < 10) return undefined;
    this.lookedAt = now;
    for (const id of ['overworld', 'nether', 'the_end']) {
      try { const x = world.getDimension(id).getEntities({ name: who })[0]; if (x) return (this.talker = x); } catch { /* not loaded */ }
    }
    return undefined;
  }
  private loop(t: Target, name: string, at = t.loc): SoundInstance {
    if (t.player && !at) return t.player.playSound(this.ev(name), { volume: SILENT, pitch: 1, loopCount: -1 });
    // (3D: the play volume also sets the audible range, so RANGE_3D — at P_MIN, under hearing, for the ticks it plays as made —
    // and silenced in the same tick; a listener's own 3D sound — follow, near — at the talker's place, heard by that listener alone)
    const s = t.player ? t.player.playSound(this.ev(name), { location: at, volume: RANGE_3D, pitch: P_MIN, loopCount: -1 }) : t.dim!.playSound(this.ev(name), at!, { volume: RANGE_3D, pitch: P_MIN, loopCount: -1 });
    s.setVolume(this.floor);
    return s;
  }
  /** the voices and noise bands a target plays: its share of its listener's sounds (shareSounds), else all of the stream's */
  nvOf(t: Target) { return Math.min(this.st.meta.N, t.nv ?? this.st.meta.N); }
  nbOf(t: Target) { return Math.min(this.st.meta.M, t.nb ?? this.st.meta.M); }
  /** the lowest noise band a target plays (its share keeps the top ones: the high bands carry speech) */
  low(t: Target) { return this.st.meta.M - this.nbOf(t); }
  /** a target's sounds over its share stop: its last voices, its lowest noise bands */
  trim(t: Target) {
    const nv = this.nvOf(t), lo = this.low(t);
    while (t.osc.length > nv) { const s = t.osc.pop(); try { s?.stop(); } catch { /* gone */ } this.calls++; }
    for (let b = 0; b < lo && b < t.nz.length; b++) { const s = t.nz[b]; if (!s) continue; try { s.stop(); } catch { /* gone */ } t.nz[b] = undefined; this.calls++; }
  }
  /** a target with fewer sounds than its share (a new one, or a share that grew) */
  private short(t: Target) {
    if (t.osc.length < this.nvOf(t)) return true;
    for (let b = this.low(t); b < this.st.meta.M; b++) if (!t.nz[b]) return true;
    return false;
  }
  /** a target's sounds made (16 a tick), up to its share — after the share is worked out again, so that another stream's sounds
   *  over it stop before these are made — then settled */
  async build(t: Target) {
    if (t.building) return;
    t.building = true;
    try {
      shareSounds();
      while (t.osc.length < this.nvOf(t)) {
        for (let i = 0; i < 16 && t.osc.length < this.nvOf(t); i++) t.osc.push(this.loop(t, 'spectral.osc'));
        await system.waitTicks(1);
        // (the listener went away, or the stream stopped, while their sounds were made: what was made stops, nothing more)
        if (t.gone) { this.drop(t); return; }
      }
      for (let b = this.low(t); b < this.st.meta.M; b++) if (!t.nz[b]) t.nz[b] = this.loop(t, 'spectral.n' + b);
    } catch { this.drop(t); return; }      // (the listener left the game in between: their client is gone)
    finally { t.building = false; }
    this.settle(t);
  }
  /** a target's sounds were made: the stream's state now, and for 3D sounds (made at P_MIN, played as made for a while) again
   *  SETTLE_TICKS later */
  private settle(t: Target) {
    this.resync(t);
    if (!this.three) return;
    system.runTimeout(() => { if (!t.gone && this.targets.includes(t)) this.resync(t); }, SETTLE_TICKS);
  }
  private drop(t: Target) {
    t.gone = true;
    for (const x of [...t.osc, ...t.nz]) { try { x?.stop(); } catch { /* gone */ } }
    this.handover = this.handover.filter((h) => { if (h.t !== t) return true; try { h.old?.stop(); } catch { /* gone */ } return false; });
  }
  async start() {
    if (this.at.kind === 'phones') {
      for (const name of this.at.who) { const q = world.getPlayers({ name })[0]; if (q) this.targets.push({ player: q, osc: [], nz: [] }); }
      const first = this.targets[0]?.player;
      if (first) this.lv = Math.pow(10, (settingsOf(first).level ?? 0) / 20);
    } else if (this.at.kind === 'speaker') {
      const w = this.where(); if (w) { this.targets.push({ dim: w.dim, loc: w.loc, osc: [], nz: [] }); this.anchor = w.loc; }
      this.lv = Math.pow(10, LEVEL_3D_DB / 20) / this.q;
    } else {
      // (follow / near: listen() builds each listener's sounds as they come near)
      this.lv = Math.pow(10, LEVEL_3D_DB / 20) / this.q;
      const w = this.where(); if (w) { this.anchor = w.loc; this.dim = w.dim.id; this.listen(w); }
      this.started = true;
      return;
    }
    for (const t of this.targets) await this.build(t);
    this.started = true;
  }
  /** follow: everyone within reach of the talker hears them (reach3D() blocks, the same dimension), each with sounds of their
   *  own at the talker's place — the talker never hears their own voice; who comes near is added, who goes away loses theirs */
  private listen(w: { dim: Dimension; loc: Vector3 }) {
    if (this.at.kind !== 'follow' && this.at.kind !== 'near') return;
    // (near: the same per-listener 3D sounds at a fixed spot, every player within reach — what follow does, without a talker)
    const who = this.at.kind === 'follow' ? this.at.who : undefined, r = reach3D();
    const near = world.getPlayers().filter((q) => q.isValid && q.name !== who && q.dimension.id === w.dim.id && dist(q.location, w.loc) <= r);
    for (const t of [...this.targets]) {
      if (near.some((q) => q.id === t.player?.id)) continue;
      this.drop(t);
      this.targets.splice(this.targets.indexOf(t), 1);
    }
    for (const q of near) {
      if (this.targets.some((t) => t.player?.id === q.id)) continue;
      const t: Target = { player: q, loc: this.anchor ?? w.loc, osc: [], nz: [] };
      this.targets.push(t);
      this.build(t);
    }
  }
  stop() {
    for (const t of this.targets) this.drop(t);
    for (const [x] of this.dying) { try { x.stop(); } catch { /* gone */ } }
    for (const h of this.handover) { try { h.old?.stop(); } catch { /* gone */ } }
    this.targets = []; this.dying = []; this.handover = []; this.resends = [];
  }
  private sendVoice(v: number, hz: number, dur: number, L: number, force = false) {
    let p = -1;
    if (hz > 0) { p = Math.min(P_MAX, Math.max(P_MIN, hz / BASE_HZ)); if (this.lastP[v] > 0 && Math.abs(p / this.lastP[v] - 1) < CENT) p = -1; }
    L = Math.min(this.cap, Math.max(this.floor, L));
    const last = this.lastL[v];
    if (!force && L / last < DB025 && last / L < DB025) L = -1;
    if (p < 0 && L < 0) return;
    for (const t of this.targets) { const s = t.osc[v]; if (!s) continue; try { if (p > 0) s.setPitch(p); if (L >= 0) s.fade(dur, L); } catch { /* gone */ } this.calls++; }
    // (HANDOVER_STEER: the sounds a move left behind follow the voice too, until their handover)
    if (HANDOVER_STEER) for (const h of this.handover) { if (h.i !== v || !h.old) continue; try { if (p > 0) h.old.setPitch(p); if (L >= 0) h.old.fade(dur, L); } catch { /* gone */ } this.calls++; }
    if (p > 0) this.lastP[v] = p;
    if (L >= 0) this.lastL[v] = L;
  }
  private sendNoise(b: number, dur: number, L: number) {
    L = Math.min(this.cap, Math.max(this.floor, L));
    const last = this.lastNL[b];
    if (L / last < DB025 && last / L < DB025) return;
    for (const t of this.targets) { const s = t.nz[b]; if (s) { try { s.fade(dur, L); } catch { /* gone */ } this.calls++; } }
    if (HANDOVER_STEER) for (const h of this.handover) { if (h.i !== -1 - b || !h.old) continue; try { h.old.fade(dur, L); } catch { /* gone */ } this.calls++; }
    this.lastNL[b] = L;
  }
  /** the followed player moved: the sounds go to the new place a few a tick. A new 3D sound plays as made (P_MIN, under hearing)
   *  for a while, so its old one sounds on until SETTLE_TICKS later: then the new one gets the stream's state again and the old
   *  one fades out over a tick and stops */
  private follow() {
    const now = system.currentTick;
    this.dying = this.dying.filter(([x, at]) => { if (at > now) return true; try { x.stop(); } catch { /* gone */ } return false; });
    this.handover = this.handover.filter((h) => {
      if (h.at > now) return true;
      if ((h.i >= 0 ? h.t.osc[h.i] : h.t.nz[-1 - h.i]) === h.s && !h.t.gone) {
        try {
          if (h.i >= 0) { if (this.lastP[h.i] > 0) h.s.setPitch(this.lastP[h.i]); h.s.setVolume(this.lastL[h.i]); }
          else { h.s.setPitch(1); h.s.setVolume(this.lastNL[-1 - h.i]); }
        } catch { /* gone */ }
        this.calls += 2;
      }
      if (h.old) {
        try { h.old.fade(FADE_SMOOTH, this.floor); } catch { /* gone */ }
        this.calls++;
        this.dying.push([h.old, now + 2]);
      }
      if (HANDOVER_RESEND > 0) this.resends.push({ t: h.t, i: h.i, s: h.s, left: HANDOVER_RESEND, at: now + 2 });
      return false;
    });
    // (the state again to the sounds a move made, every 2 ticks, while they are still the ones playing that voice)
    this.resends = this.resends.filter((r) => {
      if (r.at > now) return true;
      if ((r.i >= 0 ? r.t.osc[r.i] : r.t.nz[-1 - r.i]) !== r.s || r.t.gone) return false;
      try {
        if (r.i >= 0) { if (this.lastP[r.i] > 0) r.s.setPitch(this.lastP[r.i]); r.s.setVolume(this.lastL[r.i]); }
        else { r.s.setPitch(1); r.s.setVolume(this.lastNL[-1 - r.i]); }
      } catch { /* gone */ }
      this.calls += 2;
      r.at = now + 2;
      return --r.left > 0;
    });
    if (this.at.kind !== 'follow' && this.at.kind !== 'near') return;
    const w = this.where();
    // (the talker is not in the world — left, or not joined yet: nobody hears them until they are back, then listen() again)
    if (!w) { if (this.at.kind === 'follow' && this.targets.length) this.stop(); return; }
    if (this.ticks % 10 === 0 || w.dim.id !== this.dim) { this.dim = w.dim.id; this.listen(w); }
    if (this.at.kind === 'follow' && !this.moving.length && dist(w.loc, this.anchor ?? w.loc) > FOLLOW_MOVE) {
      this.anchor = w.loc; this.moves++;
      const N = this.st.meta.N, M = this.st.meta.M;
      this.moving = [...Array(N).keys(), ...Array.from({ length: M }, (_, b) => -1 - b)];
    }
    // (FOLLOW_STEP sounds a tick, for every listener: each moved one is made at the new place and steered from now on — what it
    // is sent waits until it plays — while the old one keeps sounding until the handover above)
    for (let n = 0; n < FOLLOW_STEP && this.moving.length; n++) {
      const i = this.moving.shift()!, voice = i >= 0;
      for (const t of this.targets) {
        const old = voice ? t.osc[i] : t.nz[-1 - i];
        if (!old) continue;
        let s: SoundInstance;
        try { s = this.loop(t, voice ? 'spectral.osc' : 'spectral.n' + (-1 - i), this.anchor); } catch { continue; }
        try {
          if (!voice) s.setPitch(1);
          else if (this.lastP[i] > 0) s.setPitch(this.lastP[i]);
          s.fade(FADE_SMOOTH, voice ? this.lastL[i] : this.lastNL[-1 - i]);
        } catch { /* gone */ }
        // (cut: the old one stops now, so a talker never has more sounds than the phone plays at once)
        if (HANDOVER_CUT) { try { old.stop(); } catch { /* gone */ } this.calls++; }
        this.handover.push({ t, i, s, old: HANDOVER_CUT ? undefined : old, at: now + HANDOVER_TICKS });
        if (voice) t.osc[i] = s; else t.nz[-1 - i] = s;
        this.calls += 4;
      }
    }
    for (const t of this.targets) t.loc = this.anchor;
  }
  dim = '';
  resync(only?: Target) {
    for (const t of only ? [only] : this.targets) {
      for (let v = 0; v < t.osc.length; v++) { try { if (this.lastP[v] > 0) t.osc[v].setPitch(this.lastP[v]); t.osc[v].setVolume(this.lastL[v]); } catch { /* gone */ } }
      // (3D noise loops are made at P_MIN: a live stream plays them at 1)
      for (let b = 0; b < t.nz.length; b++) { try { if (this.three) t.nz[b]?.setPitch(1); t.nz[b]?.setVolume(this.lastNL[b]); } catch { /* gone */ } }
    }
  }
  /** a tick, its script time counted (ms/tick in the status: Date.now's milliseconds, averaged) */
  tick() { const t0 = Date.now(); try { this.step(); } finally { this.ms += Date.now() - t0; } }
  private step() {
    if (!this.started) return;
    this.ticks++;
    this.targets = this.targets.filter((t) => { if (!t.player || t.player.isValid) return true; t.gone = true; return false; });
    this.follow();
    // (a share that grew — another stream stopped, its talker went away, sharing was turned off: the sounds it adds)
    for (const t of this.targets) if (!t.building && !t.gone && this.short(t)) this.build(t);
    const st = this.st, { N, M, fd } = st.meta, fdS = fd.map((x) => x / 1000);
    if (st.w < 0) return;
    if (!this.playing) {
      // (from the first frame of the talkspurt — its rise is not lost, and the last sentence's frames are not heard again — once
      // a jitter buffer's worth has come; further behind than that, from LIVE_DELAY frames behind the newest)
      const first = Math.max(st.burst, st.w - LIVE_DELAY + 1);
      if (st.w - first + 1 < LIVE_DELAY) return;
      this.p = first - 1; this.playing = true;
    }
    if (st.w - this.p > LIVE_DELAY + LIVE_LATE) { this.p = st.w - LIVE_DELAY; this.skips++; }
    if (this.p + 1 > st.w) {
      // no frame yet: hold; a talker who stopped falls silent
      if (++this.idle === LIVE_IDLE) { this.underruns++; for (let v = 0; v < N; v++) this.sendVoice(v, 0, FADE_SMOOTH, this.floor); for (let b = 0; b < M; b++) this.sendNoise(b, FADE_SMOOTH, this.floor); }
      if (this.idle >= LIVE_IDLE) this.playing = false;
      return;
    }
    this.idle = 0;
    // (the tick from frame p to p+1: levels and pitch of p+1, the fade INTO p+1 — the live encoder knows a frame's own rise as
    // it makes it, without waiting for the next one)
    const i0 = st.slot(this.p), i1 = st.slot(this.p + 1), gain = this.lv / OSC_AMP;
    for (let v = 0; v < N; v++) {
      const a0 = this.lastL[v] > this.floor ? st.amp[i0 * N + v] : 0, f0 = a0 > 0 ? st.freq[i0 * N + v] : 0, a1 = st.amp[i1 * N + v], f1 = a1 > 0 ? st.freq[i1 * N + v] : 0;
      this.sendVoice(v, f0 && f1 ? Math.sqrt(f0 * f1) : f1 || f0, fdS[st.vd[i1 * N + v]], a1 * gain, st.att[i1 * N + v] === 1);
    }
    for (let b = 0; b < M; b++) this.sendNoise(b, fdS[st.nzd[i1 * M + b]], (st.nz[i1 * M + b] * this.lv) / NOISE_RMS[b]);
    this.p++;
  }
  status() {
    const where = this.at.kind === 'phones' ? `phones ${this.at.who.join(',')}` : this.at.kind === 'follow' ? `follow ${this.at.who} listeners ${this.targets.length}`
      : `${this.at.kind} ${Math.round(this.at.loc.x)} ${Math.round(this.at.loc.y)} ${Math.round(this.at.loc.z)}${this.at.kind === 'near' ? ` listeners ${this.targets.length}` : ''}`;
    // (listeners who get fewer sounds than the stream has: its share of their client's — voices + noise bands, each share once)
    const { N, M } = this.st.meta, shared = [...new Set(this.targets.filter((t) => this.nvOf(t) < N || this.nbOf(t) < M).map((t) => `${this.nvOf(t)}+${this.nbOf(t)}`))];
    return `${where}${shared.length ? ` sharing ${shared.join('/')} sounds` : ''} delay ${!this.playing ? '-' : this.st.w - this.p} ticks underruns ${this.underruns} skips ${this.skips} moves ${this.moves} calls/tick ${(this.ticks ? this.calls / this.ticks : 0).toFixed(1)} ms/tick ${(this.ticks ? this.ms / this.ticks : 0).toFixed(2)}`;
  }
}
const lives = new Map<string, LiveStream>();
const LIVE_ID = /^[\w.-]{1,40}$/;
/** "follow:Name" | "phones:A,B" | "speaker:x,y,z[,dimension]" (one 3D sound for everyone) | "near:x,y,z[,dimension]" (each listener
 *  their own 3D sound there, as follow) → where a stream plays */
function liveAt(s: string | undefined, by?: Player): LiveAt | undefined {
  if (!s) return undefined;
  const [kind, rest = ''] = s.split(':', 2).length === 2 ? [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)] : [s, ''];
  if (kind === 'follow') { const who = rest || by?.name; return who ? { kind, who } : undefined; }
  if (kind === 'phones') { const who = rest ? rest.split(',').filter((x) => x) : by ? [by.name] : []; return who.length ? { kind, who } : undefined; }
  if (kind === 'speaker' || kind === 'near') {
    if (!rest && by) { const l = by.location; return { kind, dim: by.dimension.id, loc: { x: l.x, y: l.y + 1, z: l.z } }; }
    const n = rest.split(','), [x, y, z] = n.slice(0, 3).map(Number);
    return [x, y, z].every(Number.isFinite) ? { kind, dim: n[3] || 'overworld', loc: { x, y, z } } : undefined;
  }
  return undefined;
}
async function livePlay(st: LiveStream, at: LiveAt): Promise<string> {
  st.player?.stop();
  const lp = new LivePlayer(st, at);
  st.player = lp;
  await lp.start();
  return `§a● live ${st.id}: ${lp.status()}`;
}
function liveB64(s: string): Uint8Array {
  let len = (s.length * 3) >> 2; if (s.endsWith('==')) len -= 2; else if (s.endsWith('=')) len -= 1;
  const b = new Uint8Array(Math.max(0, len));
  for (let i = 0, o = 0; i < s.length; i += 4) {
    const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    if (o < len) b[o++] = n >> 16; if (o < len) b[o++] = (n >> 8) & 255; if (o < len) b[o++] = n & 255;
  }
  return b;
}
const liveMetaOk = (m: any): m is LiveMeta => m && m.N > 0 && m.N <= 128 && m.M === NOISE_BANDS.length && Array.isArray(m.amp) && Array.isArray(m.nz) && Array.isArray(m.fd) && m.fd.length === 4;
/** one live message: frames for a stream (made on its first message with a meta) */
export function liveMessage(text: string): string | undefined {
  let m: { id?: string; s?: number; f?: string; m?: LiveMeta; at?: string; end?: boolean };
  try { m = JSON.parse(text); } catch { return 'bad message'; }
  if (!m.id || !LIVE_ID.test(m.id)) return 'bad id';
  let st = lives.get(m.id);
  if (m.end) { st?.player?.stop(); lives.delete(m.id); return `end ${m.id}`; }
  let was: LiveAt | undefined;
  if (m.m) {
    if (!liveMetaOk(m.m)) return 'bad meta';
    // (frame 0 with a meta: a sender's first message — a sender that started again with the same id begins a new stream)
    if (!st || st.meta.N !== m.m.N || m.s === 0) { was = st?.player?.at; st?.player?.stop(); st = new LiveStream(m.id, m.m); lives.set(m.id, st); }
  }
  if (!st) return `no meta yet for ${m.id}`;
  if (typeof m.f === 'string' && Number.isInteger(m.s)) st.push(m.s!, liveB64(m.f));
  const at = liveAt(m.at) ?? was;
  if (at && (!st.player || JSON.stringify(st.player.at) !== JSON.stringify(at))) livePlay(st, at);
  return undefined;
}
system.runInterval(() => {
  // (the shares again every 5 ticks: a stream or a listener that went is given back; a new one works them out as it is built)
  if (lives.size && system.currentTick % 5 === 0) shareSounds();
  for (const [id, st] of lives) {
    const lp = st.player;
    if (lp) { try { lp.tick(); } catch (e) { console.warn(`[spectral] live ${id}: ${e}`); lp.stop(); st.player = undefined; } }
    // a stream nothing has come for in a minute goes
    if (system.currentTick - st.lastAt > 20 * 60) { lp?.stop(); lives.delete(id); }
  }
}, 1);
cmdAny('spectral:live', 'Live streams (a voice chat, a microphone): the list, or one played on headphones, as a 3D speaker here, 3D here for each listener (near), from a player in 3D as they move (follow), or stopped',
  { 'stream?': 'string', 'place?': ['phones', 'speaker', 'near', 'follow', 'stop'], 'who?': 'player' }, async (p, a) => {
    if (!a.stream) {
      if (!lives.size) return 'live: no stream (tools/live/bridge.mjs, or /spectral:live_demo)';
      // (a line a stream, a message each: several people talking at once are each listed as their own line)
      const lines = [...lives.values()].map((st) => `live ${st.id}: ${st.frames} frames, ${st.meta.N} voices${st.gaps ? `, ${st.gaps} lost` : ''}${st.player ? ', ' + st.player.status() : ', not playing'}`);
      if (p) for (const l of lines.slice(0, -1)) p.sendMessage(l);
      return p ? lines[lines.length - 1] : lines.join('\n');
    }
    const st = lives.get(a.stream); if (!st) return `§cno live stream "${a.stream}"`;
    const who: Player | undefined = a.who?.[0] ?? p;
    if (a.place === 'stop') { st.player?.stop(); st.player = undefined; return `§7■ live ${st.id}`; }
    const at = liveAt(a.place ?? 'phones', who);
    if (!at) return '§cwho? (a player for phones / follow, or run it as a player)';
    return livePlay(st, at);
  });
/** a song sent as a live stream, frame by frame as a voice chat would (the whole live path in the add-on itself: the frames are
 *  written as bytes and read back) */
// (spectral:range, spectral:handover and spectral:share set every stream on the server: operators only)
cmdAny('spectral:range', 'How far 3D sounds reach: the volume they are made at (3 = 48 blocks, the default; the client takes the distance from it, 16 blocks a unit), how much louder than the files they play (dB, +10 by default), whether voices that follow a talker are made quietly (on by default) and how quietly (the definition volume: 0.1, 0.01 or 0.001)', { 'volume?': 'float', 'level?': 'float', 'quiet?': 'bool', 'made?': 'float' }, (_p, a) => {
  if (a.volume !== undefined) RANGE_3D = Math.max(0.25, Math.min(16, a.volume));
  if (a.level !== undefined) LEVEL_3D_DB = Math.max(0, Math.min(18, Math.round(a.level * 10) / 10));
  if (a.quiet !== undefined) QUIET_3D = Boolean(a.quiet);
  // (the nearest of the quiet events' definition volumes)
  if (a.made !== undefined) Q3D = [0.1, 0.01, 0.001].reduce((x, y) => (Math.abs(Math.log10(Math.max(1e-6, a.made!)) - Math.log10(y)) < Math.abs(Math.log10(Math.max(1e-6, a.made!)) - Math.log10(x)) ? y : x));
  return `range: 3D sounds made at volume ${RANGE_3D}, heard to ${reach3D()} blocks (level ${LEVEL_3D_DB ? `+${LEVEL_3D_DB} dB` : 'as the files'}${QUIET_3D ? `, followed voices made quietly (${Q3D})` : ''}; new speakers and live streams)`;
}, true);
cmdAny('spectral:handover', 'A voice that follows a talker who moves: the old sounds stop as the new ones are made (cut, the default: a talker never has more sounds than a phone plays at once), hold their last level until the new ones take over (hold) or keep following the voice (steer); how far the talker moves before the sounds move (blocks, 1.5 by default); the ticks until the new ones take over (2), how many times their state is sent again after that, every 2 ticks (0), and how many sounds move a tick (2)', { 'old?': ['hold', 'steer', 'cut'], 'move?': 'float', 'settle?': 'int', 'resend?': 'int', 'step?': 'int' }, (_p, a) => {
  if (a.old !== undefined) { HANDOVER_STEER = a.old === 'steer'; HANDOVER_CUT = a.old === 'cut'; }
  if (a.step !== undefined) FOLLOW_STEP = Math.max(1, Math.min(64, Math.round(a.step)));
  if (a.move !== undefined) FOLLOW_MOVE = Math.max(0.5, Math.min(16, a.move));
  if (a.settle !== undefined) HANDOVER_TICKS = Math.max(1, Math.min(20, Math.round(a.settle)));
  if (a.resend !== undefined) HANDOVER_RESEND = Math.max(0, Math.min(10, Math.round(a.resend)));
  return `handover: the old sounds ${HANDOVER_CUT ? 'stop as the new ones are made' : HANDOVER_STEER ? 'follow the voice until they fade' : 'hold their last level until they fade'}, the sounds move after ${FOLLOW_MOVE} blocks, ${FOLLOW_STEP} a tick, the new ones take over after ${HANDOVER_TICKS} ticks and get their state again ${HANDOVER_RESEND} times (a voice that follows a talker who moves)`;
}, true);
cmdAny('spectral:share', 'Whether the live streams a listener hears share the sounds their client plays at once (on by default: a phone plays 32, and over them it drops some), and how many a client with no measured limit plays (0: no limit)', { 'share?': ['on', 'off'], 'sounds?': 'int' }, (_p, a) => {
  if (a.share !== undefined) SHARE = a.share === 'on';
  if (a.sounds !== undefined) SHARE_ANY = Math.max(0, Math.min(1024, Math.round(a.sounds)));
  shareSounds();
  return SHARE ? `share: on, the live streams a listener hears share the sounds their client plays at once (a phone ${CLIENTS.Mobile?.sounds ?? 0}, other clients ${SHARE_ANY || 'no limit'})`
    : 'share: off, every live stream plays all its voices to every listener';
}, true);
cmdAny('spectral:live_demo','Send a song as a live stream, frame by frame as a voice chat bridge would (tests the live path)',
  { song: 'string', 'to?': ['phones', 'speaker', 'near', 'follow'], 'who?': 'player', 'voices?': 'int', 'at?': 'string' }, async (p, a) => {
    const song = songs.get(a.song); if (!song) return `§cno song "${a.song}"`;
    let d: Decoded; try { d = await decoded(song); } catch (e) { return `§csong ${a.song}: ${e}`; }
    const who: Player | undefined = a.who?.[0] ?? p;
    const N = Math.max(1, Math.min(d.N, a.voices ?? 24)), M = d.M, id = `demo_${a.song}`.slice(0, 40);
    const meta: LiveMeta = { N, M, amp: song.meta.amp, nz: song.meta.nz, fd: song.meta.fd?.ms ?? [50, 50, 50, 50], title: song.meta.title };
    const [aF, aS] = meta.amp, [nF, nS] = meta.nz;
    const ac = (x: number) => (x <= 0 ? 0 : Math.max(1, Math.min(127, Math.round((20 * Math.log10(x) - aF) / aS) + 1)));
    const nc = (x: number) => { if (x <= 0) return 0; const c = Math.round((20 * Math.log10(x) - nF) / nS) + 1; return c > 0 ? Math.min(255, c) : 0; };
    const pc = (f: number) => Math.max(0, Math.min(65535, Math.round(6000 * Math.log2(f / 16))));
    const frame = (k: number): number[] => {
      const out: number[] = [], mask = new Array((N + 7) >> 3).fill(0), body: number[] = [];
      for (let v = 0; v < N; v++) {
        const c = ac(d.amp[k * d.N + v]); mask[v >> 3] |= 1 << (v & 7);
        body.push(c | (d.att[k * d.N + v] ? 0x80 : 0));
        if (c) { const q = pc(d.freq[k * d.N + v]); body.push(q & 255, q >> 8); }
      }
      out.push(...mask, ...body);
      for (let j = 0; j < M; j++) out.push(nc(d.nz[k * M + j]));
      const fv = new Array((N + 3) >> 2).fill(0), fn = new Array((M + 3) >> 2).fill(0);
      // (the live format's fade is the one INTO the frame: a song's fade at tick k-1, which leads to frame k)
      for (let v = 0; v < N; v++) fv[v >> 2] |= (d.vd && k > 0 ? d.vd[(k - 1) * d.N + v] : 3) << (2 * (v & 3));
      for (let j = 0; j < M; j++) fn[j >> 2] |= (d.nzd && k > 0 ? d.nzd[(k - 1) * M + j] : 3) << (2 * (j & 3));
      return [...out, ...fv, ...fn];
    };
    const b64 = (b: number[]) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < b.length; i += 3) { const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0); s += A[n >> 18] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '='); } return s; };
    const at = a.to === 'speaker' || a.to === 'near' ? (who ? `${a.to}:${Math.round(who.location.x)},${Math.round(who.location.y + 1)},${Math.round(who.location.z)},${who.dimension.id.replace('minecraft:', '')}` : undefined)
      : who ? `${a.to ?? 'phones'}:${who.name}` : undefined;
    // (at: a place of its own — "speaker:x,y,z[,dimension]", "follow:<name>", "phones:<name>" — over to / who)
    if (a.at !== undefined && !liveAt(a.at)) return `§cat: speaker:x,y,z[,dimension] | follow:<name> | phones:<name> (${a.at})`;
    const place = a.at ?? at;
    if (!place) return '§cwho? (run it as a player, or name one)';
    let k = 0;
    liveMessage(JSON.stringify({ id, m: meta, s: 0, f: b64(frame(k++)), at: place }));
    const job = system.runInterval(() => {
      if (k >= d.F) { system.clearRun(job); system.runTimeout(() => liveMessage(JSON.stringify({ id, end: true })), 20); return; }
      liveMessage(JSON.stringify({ id, s: k, f: b64(frame(k)) })); k++;
    }, 1);
    return `§a● live demo ${id}: ${song.meta.title} (${d.F} frames, ${N} voices) → ${place}`;
  });

// ------------------------------------------------------------------ the remote (item) and its menu
onItem('spectral:remote', { onUse(e) { openMenu(e.source); } });
async function openMenu(p: Player) {
  const s = mine(p);
  const title = s ? `${s.paused ? '⏸' : '▶'} ${s.song.meta.title}  ${fmt(s.ph / 20)} / ${fmt(s.song.meta.seconds)}` : 'Spectral Player';
  await menu(p, 'Spectral Player', [
    ['♫ Songs', async (p) => {
      const list = [...songs.values()];
      await menu(p, 'Songs', list.map((x) => [`${x.meta.title}\n§8${fmt(x.meta.seconds)} · ${x.meta.voices} voices`, async (p) => {
        const where = await menu(p, x.meta.title, [['🎧 Headphones (follows you)'], ['🔊 Speaker here (3D, everyone)']]);
        if (where !== undefined) p.sendMessage(await play(p, x.meta.id, where === 0 ? 'phones' : 'speaker'));
      }] as const));
    }],
    [s?.paused ? '▶ Resume' : '⏸ Pause', (p) => p.sendMessage(pauseFor(p))],
    ['⏹ Stop', (p) => p.sendMessage(stopFor(p))],
    ['⏪ -10 s', (p) => { const x = mine(p); if (x) p.sendMessage(seekFor(p, x.ph / 20 - 10)); }],
    ['⏩ +10 s', (p) => { const x = mine(p); if (x) p.sendMessage(seekFor(p, x.ph / 20 + 10)); }],
    [s?.frozen ? '▶ Thaw' : '❄ Freeze', (p) => p.sendMessage(freezeFor(p))],
    ['⚙ Sound', settingsForm],
    ['📋 Paste a song (text)', pasteForm],
  ], title);
}
async function settingsForm(p: Player) {
  const s = settingsOf(p);
  const f = new ModalFormData().title('Sound')
    .slider('Volume %', 0, 400, { valueStep: 5, defaultValue: Math.round(s.volume * 100) })
    .slider('Speed ×0.05  (20 = normal, 0 = freeze, minus = reverse)', -80, 80, { valueStep: 1, defaultValue: Math.round(s.speed * 20) })
    .slider('Pitch (semitones)', -24, 24, { valueStep: 1, defaultValue: Math.round(s.semis) })
    .slider('Bass dB', -30, 12, { valueStep: 1, defaultValue: s.eq[0] })
    .slider('Mid dB', -30, 12, { valueStep: 1, defaultValue: s.eq[1] })
    .slider('Treble dB', -30, 12, { valueStep: 1, defaultValue: s.eq[2] })
    .slider('Voices', 4, 128, { valueStep: 4, defaultValue: Math.max(4, Math.min(128, Math.round(s.voices / 4) * 4)) })
    .toggle('Noise bands', { defaultValue: s.noise }).toggle('Drum bursts', { defaultValue: s.bursts })
    .toggle('Spectrum', { defaultValue: s.viz }).toggle('Loop', { defaultValue: s.loop });
  const r = await ask(p, f);
  if (!r?.formValues) return;
  const v = r.formValues as any[];
  const n: Settings = { ...s, volume: v[0] / 100, speed: v[1] / 20, semis: v[2], eq: [v[3], v[4], v[5]], voices: v[6], noise: v[7], bursts: v[8], viz: v[9], loop: v[10] };
  keep(p, n);
  const m = mine(p);
  if (m) { const old = m.s.voices; m.s = { ...n, voices: old }; if (n.voices !== old) await m.setVoices(n.voices); }
  p.sendMessage(`§bvolume ${Math.round(n.volume * 100)}% · speed ${n.speed}x · pitch ${n.semis} st · eq ${n.eq.join('/')} dB · voices ${n.voices}`);
}

// a remote for every new player; a song pack loaded before us gets asked again
world.afterEvents.playerSpawn.subscribe((e) => {
  if (e.initialSpawn && once(e.player, 'spectral-remote')) give(e.player, item('spectral:remote', '§dSpectral Remote'), 1);
  if (!e.initialSpawn) { const s = mine(e.player); if (s?.mode === 'phones') rebuild(s, e.player); }
});
world.afterEvents.playerDimensionChange.subscribe((e) => { const s = mine(e.player); if (s?.mode === 'phones') rebuild(s, e.player); });
async function rebuild(s: Session, p: Player) {
  const t = s.targets.find((t) => t.player?.id === p.id); if (!t) return;
  for (const x of [...t.osc, ...t.nz]) { try { x?.stop(); } catch { /* gone */ } }
  t.osc = []; t.nz = [];
  await s.build(t); s.resync(t); s.rebuilds++;
}
world.afterEvents.playerLeave.subscribe((e) => {
  const s = sessions.get(e.playerId); if (s) { s.stop(); sessions.delete(e.playerId); }
  const n = notePlays.get(e.playerId); if (n) { n.stop(); notePlays.delete(e.playerId); }
});
world.afterEvents.worldLoad.subscribe(() => system.sendScriptEvent('spectral:hello', '1'));

cmdAny('spectral:library', 'Song count (console too)', {}, () => `library ${songs.size}: ${[...songs.keys()].join(' ')}`);
addSong(demo.meta as unknown as Meta, demo.data);

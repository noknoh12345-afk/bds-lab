// Spectral Player — MP3 resynthesised in Minecraft Bedrock by additive synthesis, at the limit of the Script API.
//
// Each sine voice is ONE looping SoundInstance (loopCount -1, a 1760 Hz sine) started once; every tick the engine
// steers it with setPitch(f/1760) and fade(): the phase never restarts, so a held note is a clean sine, not a
// train of retriggered grains. Noise bands (the part of the sound sine voices do not cover) are looping band-limited
// noises steered the same way; drum attacks are one-shot bursts whose 4 file variants carry 0/12.5/25/37.5 ms of
// leading silence, so they land between ticks. Songs are data (a few kB/s), not sounds: the resource pack never
// changes, new songs arrive as song packs over script events, and playback is fully dynamic (seek, time-stretch,
// transpose, EQ, freeze, reverse, 3D speaker).  tools/spectral.py renders the very same tick rules offline.
import { world, system, Player, Dimension, Vector3, SoundInstance } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { cmd, cmdAny, menu, ask, onItem, give, item, once, load, save } from './kit';
import { OSC_AMP, BASE_HZ, NOISE_RMS, NOISE_BANDS, BURST_RMS, BURST_BANDS, SUB } from './assets';
import demo from './songs/demo';
import programs, { Program } from './calib_programs';

// ------------------------------------------------------------------ constants (same as tools/spectral.py)
const SILENT = 1e-4;            // voices never go to 0 so the client keeps every loop alive
const FADE_SMOOTH = 0.05;       // one tick: linear ramp that lands on the next frame
const FADE_ATTACK = 0.012;      // attacks land 12 ms after the tick
const P_MIN = 0.01, P_MAX = 10; // SoundInstance.setPitch bounds
const CENT = Math.pow(2, 1 / 2400) - 1;   // half a cent: smaller pitch moves are not sent
const DB025 = Math.pow(10, 0.25 / 20);    // 0.25 dB: smaller level moves are not sent

// ------------------------------------------------------------------ song data
export interface Meta {
  id: string; title: string; artist?: string; fps: number; frames: number; voices: number; base: number;
  noise: number[][]; bursts: number; sub: number; seconds: number; amp: [number, number]; nz: [number, number];
}
interface Song { meta: Meta; data?: string; gen?: (d: Decoded) => void; dec?: Decoded; decoding?: Promise<Decoded>; }
interface Decoded {
  F: number; N: number; M: number;
  freq: Float32Array; amp: Float32Array; att: Uint8Array; nz: Float32Array;
  evIdx: Uint32Array; evBand: Uint8Array; evSub: Uint8Array; evAmp: Float32Array;
}
const songs = new Map<string, Song>();
export function addSong(meta: Meta, data?: string, gen?: (d: Decoded) => void) { songs.set(meta.id, { meta, data, gen }); }

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
  const s = song.data!;
  let len = (s.length * 3) >> 2; if (s.endsWith('==')) len -= 2; else if (s.endsWith('=')) len -= 1;
  const b = new Uint8Array(len);
  for (let i = 0, o = 0; i < s.length; i += 4) {
    const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    if (o < len) b[o++] = n >> 16; if (o < len) b[o++] = (n >> 8) & 255; if (o < len) b[o++] = n & 255;
    if ((i & 0xffff) === 0) yield;
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
  if (p !== b.length) throw new Error(`song ${m.id}: ${b.length - p} bytes left after decoding`);
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
interface Client { sounds: number; mixHz: number; fold: boolean; limit: boolean; }
const CLIENTS: Partial<Record<string, Client>> = { Mobile: { sounds: 32, mixHz: 0, fold: false, limit: false } };
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
  return c ? { voices: platformVoices(p), hf: c.mixHz ? Math.round(c.mixHz / 2 * 0.958) : 0, fold: c.fold, sounds: c.limit ? c.sounds : 0 } : {};
}
interface Target { player?: Player; dim?: Dimension; loc?: Vector3; osc: SoundInstance[]; nz: (SoundInstance | undefined)[]; }

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
  /** the factor every level is sent with: s.level, less what the _l events already add */
  get lv() { return Math.pow(10, ((this.s.level ?? 0) - (this.loudEvents ? LOUD_EVENT_DB : 0)) / 20); }
  /** the events the instances of the targets were built with (a level change to or from 'events' rebuilds them) */
  builtLoud = false;

  /** start one looping instance at silence */
  private loop(t: Target, name: string): SoundInstance {
    if (t.player) return t.player.playSound(this.ev(name), { volume: SILENT, pitch: 1, loopCount: -1 });
    // 3D: the play volume also sets the audible range, so start at 1 and silence it in the same tick
    const s = t.dim!.playSound(this.ev(name), t.loc!, { volume: 1, pitch: 1, loopCount: -1 });
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
  private send(v: number, hz: number, dur: number | undefined, level: number) {
    let p = -1;
    if (hz > 0) {
      p = Math.min(P_MAX, Math.max(P_MIN, (hz * this.ratio) / BASE_HZ));
      if (this.lastP[v] > 0 && Math.abs(p / this.lastP[v] - 1) < CENT) p = -1;
    }
    let L = -1;
    if (dur !== undefined) {
      L = Math.min(10, Math.max(SILENT, level));
      const last = this.lastL[v];
      if (dur === FADE_SMOOTH && L / last < DB025 && last / L < DB025) L = -1;
    }
    if (p < 0 && L < 0) return;
    if (this.s.budget) {
      // priority: how far the level moves (dB, weighted by how loud it is) and how far the pitch moves (cents, while audible);
      // attacks and silencing go first so notes start and stop on time
      const last = this.lastL[v], lv = L >= 0 ? L : last;
      const dDb = L >= 0 ? Math.abs(20 * Math.log10(L / last)) : 0;
      const loud = Math.max(0, 80 + 20 * Math.log10(Math.max(lv, last)));
      const dCents = p > 0 && this.lastP[v] > 0 ? Math.abs(1200 * Math.log2(p / this.lastP[v])) : p > 0 ? 100 : 0;
      const prio = (dur === FADE_ATTACK ? 1e6 : 0) + dDb * loud + Math.min(dCents, 200) * loud * 0.05;
      this.queue.push([prio, v, p, dur ?? 0, L]);
      return;
    }
    this.apply(v, p, dur ?? 0, L);
  }
  private apply(v: number, p: number, dur: number, L: number) {
    if (v < 0) { this.applyNoise(-1 - v, L); return; }
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
      this.noise(b, this.s.noise ? (a * this.s.volume * lv * this.eqGain(c)) / NOISE_RMS[b] : SILENT);
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
  private noise(b: number, L: number) {
    L = Math.min(10, Math.max(SILENT, L));
    const last = this.lastNL[b];
    if (L / last < DB025 && last / L < DB025) return;
    if (this.s.budget) {
      const loud = Math.max(0, 80 + 20 * Math.log10(Math.max(L, last)));
      this.queue.push([Math.abs(20 * Math.log10(L / last)) * loud, -1 - b, -1, FADE_SMOOTH, L]);
      return;
    }
    this.applyNoise(b, L);
  }
  /** a noise band's attack (s.attacks): a 12 ms fade now, never held back by a budget */
  private noiseAttack(b: number, L: number) {
    L = Math.min(10, Math.max(SILENT, L));
    this.lastNL[b] = L;
    for (const t of this.targets) { const s = t.nz[b]; if (s) { try { s.fade(FADE_ATTACK, L); } catch { /* gone */ } this.calls++; } }
  }
  private applyNoise(b: number, L: number) {
    this.lastNL[b] = L;
    for (const t of this.targets) { const s = t.nz[b]; if (s) { try { s.fade(FADE_SMOOTH, L); } catch { /* gone */ } this.calls++; } }
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
      `level ${this.s.level ? `+${this.s.level} dB ${this.builtLoud ? 'events' : 'volume'}` : 'none'}`;
  }
}
const fmt = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
const dist = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const sessions = new Map<string, Session>();
const settingsOf = (p: Player): Settings => ({ ...DEFAULTS, ...platformEngine(p), ...load<Partial<Settings>>(p, 'spectral:settings', {}) });
const keep = (p: Player, s: Settings) => save(p, 'spectral:settings', s);

system.runInterval(() => {
  for (const [id, s] of sessions) {
    try { s.tick(); } catch (e) { console.warn(`[spectral] tick: ${e}`); s.ending = -1; }
    if (s.ending > 0 && ++s.ending > 4) { s.stop(); sessions.delete(id); if (s.owner.isValid) s.owner.sendMessage(`§7■ ${s.song.meta.title} — end`); }
    else if (s.ending < 0) { s.stop(); sessions.delete(id); }
  }
}, 1);

async function play(p: Player, id: string | undefined, mode: Mode): Promise<string> {
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
const mine = (p: Player) => sessions.get(p.id);
const none = '§7nothing is playing — /spectral:play';
function stopFor(p: Player) { const s = mine(p); if (!s) return none; s.stop(); sessions.delete(p.id); return '§7■ stopped'; }
function pauseFor(p: Player) {
  const s = mine(p); if (!s) return none;
  s.paused = !s.paused;
  for (const t of s.targets) for (const x of [...t.osc, ...t.nz]) { try { if (s.paused) x?.pause(); else x?.resume(); } catch { /* gone */ } }
  return s.paused ? '§e⏸ paused' : '§a▶ resumed';
}
function freezeFor(p: Player) { const s = mine(p); if (!s) return none; s.frozen = !s.frozen; return s.frozen ? '§b❄ frozen' : '§a▶ thawed'; }
function seekFor(p: Player, sec: number) { const s = mine(p); if (!s) return none; s.seek(sec * 20); return `§b⇥ ${fmt(s.ph / 20)}`; }

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
  s.mode = light ? 'light' : 'quality'; s.budget = light ? LIGHT_BUDGET : 0; s.voices = light ? LIGHT_VOICES : full; s.bursts = !light;
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
  for (const s of songs.values()) p.sendMessage(`§f♪ ${s.meta.id} §7— ${s.meta.title} (${fmt(s.meta.seconds)}, ${s.meta.voices} voices)`);
  return `§7${songs.size} songs — /spectral:play <id> [phones|speaker]`;
});
cmd('spectral:status', 'Playback state and engine load', {}, (p) => mine(p)?.status() ?? 'status: idle');
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
    const known = songs.get(m.id), data = s.parts.join('');
    partial.delete(m.id);
    if (known?.data === data) return;
    addSong({ ...s.meta, id: m.id }, data);
    world.sendMessage(`§d♪ song pack: ${s.meta.title} (${fmt(s.meta.seconds)}) — /spectral:play ${m.id}`);
  }
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
world.afterEvents.playerLeave.subscribe((e) => { const s = sessions.get(e.playerId); if (s) { s.stop(); sessions.delete(e.playerId); } });
world.afterEvents.worldLoad.subscribe(() => system.sendScriptEvent('spectral:hello', '1'));

cmdAny('spectral:library', 'Song count (console too)', {}, () => `library ${songs.size}: ${[...songs.keys()].join(' ')}`);
addSong(demo.meta as unknown as Meta, demo.data);

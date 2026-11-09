// Note songs (tools/notes.py): a MIDI file's notes played with recorded instruments (src/bank.ts, rp/sounds/spectral/i), not
// with sine waves. Each note is ONE one-shot SoundInstance of the nearest sample, setPitch'd to its key, as loud as its
// velocity, faded out at its note-off.
//
// Past the tick: every sample begins with LEAD seconds of silence, and a note is started in the tick before it with
// seekTo(LEAD - delay * pitch) in that same tick, so that it sounds `delay` ms after the tick's commands land — to the millisecond
// (SPEC.md: a one-shot seeked in the tick it starts plays from there; the commands of one tick land within 1.4 ms of each other).
// The notes of the next `bundle` ticks are started together, so the ticks' own spread (sd 7.3 ms, measured) falls only between
// bundles: inside one, the notes keep their distances to the millisecond. A 3D sound plays as it was made for 100-200 ms
// (SPEC.md), so the speaker starts its notes `ahead` ms earlier still, and that time passes in the silence.
import { system, Player, Dimension, Vector3, SoundInstance } from '@minecraft/server';
import { BANK, GM, DRUMS, LEAD, VOICES, ALIASES, Inst } from './bank';

export const NOTES_FORMAT = 'spectral-notes/1';
export interface NoteMeta { format: string; id: string; title: string; artist?: string; seconds: number; notes: number; programs: number[]; }
export interface NoteSong { meta: NoteMeta; data?: string; bytes?: Uint8Array; dec?: Notes; pasted?: string; }
/** a song's notes in the order they start: start (ms), length (ms), key (a voice's unit), velocity, program (an index into
 *  meta.programs), cents (version 2: an instrument's off its key; a voice's against the voice's own pitch) */
export interface Notes { n: number; on: Float64Array; dur: Float32Array; key: Uint8Array; vel: Uint8Array; prog: Uint8Array; cents?: Int16Array; }

export const isNoteMeta = (m: { format?: unknown }) => typeof m.format === 'string' && m.format.startsWith('spectral-notes/');

const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (B64[c.charCodeAt(0)] = i));
B64['-'.charCodeAt(0)] = 62; B64['_'.charCodeAt(0)] = 63;
function b64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/_-]/g, ''), n = Math.floor(clean.length * 3 / 4), out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64[clean.charCodeAt(i)], b = B64[clean.charCodeAt(i + 1)], c = i + 2 < clean.length ? B64[clean.charCodeAt(i + 2)] : 0, d = i + 3 < clean.length ? B64[clean.charCodeAt(i + 3)] : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < n) out[o++] = (v >> 16) & 255;
    if (o < n && i + 2 < clean.length) out[o++] = (v >> 8) & 255;
    if (o < n && i + 3 < clean.length) out[o++] = v & 255;
  }
  return out.subarray(0, o);
}

/** the notes of a song (tools/notes.py encode) */
export function decodeNotes(song: NoteSong): Notes {
  if (song.dec) return song.dec;
  const b = song.bytes ?? b64(song.data ?? '');
  if (b[0] !== 1 && b[0] !== 2) throw new Error(`unknown note data (version ${b[0]})`);
  const v2 = b[0] === 2;
  let i = 1;
  const rv = () => { let n = 0, sh = 0; for (;;) { if (i >= b.length) throw new Error('note data cut short'); const c = b[i++]; n += (c & 0x7f) * Math.pow(2, sh); sh += 7; if (!(c & 0x80)) return n; } };
  const on: number[] = [], dur: number[] = [], key: number[] = [], vel: number[] = [], prog: number[] = [], cents: number[] = [];
  let t = 0;
  while (i < b.length) {
    t += rv(); const d = rv();
    if (i + 3 > b.length) throw new Error('note data cut short');
    on.push(t / 4); dur.push(d); key.push(b[i]); vel.push(b[i + 1]); prog.push(b[i + 2]); i += 3;
    if (v2) { const z = rv(); cents.push(z % 2 ? -(z + 1) / 2 : z / 2); }
  }
  const P = song.meta.programs.length;
  if (prog.some((p) => p >= P)) throw new Error('a note names a program the song does not list');
  return (song.dec = { n: on.length, on: Float64Array.from(on), dur: Float32Array.from(dur), key: Uint8Array.from(key), vel: Uint8Array.from(vel), prog: Uint8Array.from(prog),
    ...(v2 ? { cents: Int16Array.from(cents) } : {}) });
}

// ------------------------------------------------------------------ which sample plays a note
/** General MIDI families (programs in eights) -> the nearest instrument the bank has, by its id, for a program GM lists none for */
const FAMILY: string[][] = [['piano'], ['vibes', 'piano'], ['organ', 'piano'], ['harp', 'piano'], ['bass', 'cello', 'piano'], ['strings', 'piano'],
  ['strings', 'piano'], ['trumpet', 'horn', 'piano'], ['trombone', 'horn', 'piano'], ['sax', 'clarinet', 'piano'], ['flute', 'piano'],
  ['flute', 'organ', 'piano'], ['strings', 'organ', 'piano'], ['vibes', 'piano'], ['harp', 'piano'], ['drums', 'piano']];
const byId = new Map(BANK.map((b, i) => [b.id, i] as [string, number]));
/** the instrument (index in BANK) for a program code (0-127, 128 = drums) */
export function instOf(code: number): number {
  if (code >= 128) return byId.get('drums') ?? -1;
  if (GM[code] !== undefined && GM[code] >= 0) return GM[code];
  for (const id of FAMILY[code >> 3] ?? ['piano']) { const i = byId.get(id); if (i !== undefined) return i; }
  return 0;
}
/** per instrument, per key: the samples at the nearest key, by velocity layer */
const nearest: number[][][] = BANK.map((inst) => {
  const t: number[][] = [];
  for (let k = 0; k < 128; k++) {
    let best = Infinity; let list: number[] = [];
    inst.samples.forEach((s, j) => { const d = Math.abs(s[0] - k); if (d < best) { best = d; list = [j]; } else if (d === best && s[0] === inst.samples[list[0]][0]) list.push(j); });
    t.push(list);
  }
  return t;
});
/** [instrument, sample, pitch ratio] for a note: drums by their key, a voice (program 200 + v) its unit at the pitch layer
 *  nearest its cents, the rest the nearest key then the nearest velocity layer */
export function pick(code: number, key: number, vel: number, cents = 0): [number, number, number] | undefined {
  if (code >= 200) {
    const v = VOICES[code - 200]; if (!v || key >= v.units.length) return undefined;
    const st = cents / 100; let l = 0;
    v.layers.forEach((x, j) => { if (Math.abs(x - st) < Math.abs(v.layers[l] - st)) l = j; });
    return [v.inst, key * v.layers.length + l, Math.pow(2, (st - v.layers[l]) / 12)];
  }
  if (code >= 128) { const d = DRUMS[key]; if (!d) return undefined; return [d[0], d[1], 1]; }
  const ii = instOf(code); if (ii < 0) return undefined;
  const inst = BANK[ii], list = nearest[ii][Math.max(0, Math.min(127, key))];
  let j = list[0];
  for (const c of list) if (Math.abs(inst.samples[c][1] - vel) < Math.abs(inst.samples[j][1] - vel)) j = c;
  return [ii, j, Math.pow(2, (key - inst.samples[j][0]) / 12 + cents / 1200)];
}

// ------------------------------------------------------------------ warming
/** Measured on the phone (p09 run 41531478311, p11 run 41536705472, p13 run 41561994201): a sample not loaded is loaded when it is
 *  asked for and then played from the head of its file — its seekTo not taken — so it sounds 0.65-0.7 s late (p13: a 1 s note on a
 *  sample not played before came 650-705 ms after its place, every one of 8), and a note shorter than that is let go before its
 *  sound comes: lost (p13: 12 short notes on samples not played before, 0 heard — the recording digital silence; p09: each of the
 *  voice's units sounded only from its second time). A sample not played for a while is dropped again (p13: the same 12 samples
 *  1.5-2.5 min later, 0 heard; 20-40 s later they played). So a sample is warmed before a note: started where no one hears it
 *  (inside its own leading silence, at `vol`) and stopped `hold` ticks later, before that silence ends — loaded by the time its note
 *  comes (p13: warmed 150, 300, 600 or 1000 ms ahead, 12 of 12 heard each; for 1 tick, 9 of 9; at volume 1, 12 of 12).
 *  ms: how far ahead (the default; /spectral:sampler … warm: 150 ms was enough on the rig, 600 leaves a slower phone its time),
 *  perTick: at most this many a tick, ttl: a sample played or warmed this recently is taken as loaded (no lead before a song for
 *  it), gap: a note whose sample the song has not played for this long (song ms) is warmed again */
export const WARM = { ms: 600, hold: 4, perTick: 8, ttl: 15000, gap: 15000, vol: 0.001 };
/** who (a player's id; 'speaker:' + id for their speaker) -> sound (a sample: instrument * 4096 + sample; a file song's part:
 *  its event) -> Date.now() it last started */
const warmMem = new Map<string, Map<number | string, number>>();
export function touchSample(who: string, ak: number | string) { let m = warmMem.get(who); if (!m) warmMem.set(who, (m = new Map())); m.set(ak, Date.now()); }
export function isWarm(who: string, ak: number | string) { return Date.now() - (warmMem.get(who)?.get(ak) ?? -Infinity) < WARM.ttl; }
export function forgetWarm(who: string) { warmMem.delete(who); }
/** start one sound event where no one hears it so that the game loads its file (the event's file begins with LEAD s of silence,
 *  and it is stopped `hold` ticks later); the calls it took */
export function warmEvent(ev: string, where: 'phones' | 'speaker', owner: Player, dim: Dimension, loc: Vector3, range3d = 1): number {
  let s: SoundInstance;
  try {
    if (where === 'phones') s = owner.playSound(ev, { volume: WARM.vol });
    else { s = dim.playSound(ev + '_3d', loc, { volume: range3d }); s.setVolume(WARM.vol); }
  } catch { return 0; }
  system.runTimeout(() => { try { s.stop(); } catch { /* gone */ } }, WARM.hold);
  return where === 'phones' ? 2 : 3;
}

// ------------------------------------------------------------------ the player
export interface NoteOpts {
  where: 'phones' | 'speaker';
  /** place each note inside its tick (seekTo into the sample's leading silence); false: every note at the start of the tick it
   *  falls in, as a player bound to the tick would (the comparison) */
  place: boolean;
  /** notes of this many ticks are started together (1 = every tick) */
  bundle: number;
  /** ms the notes are started early on top of that (a 3D sound plays as it was made for 100-200 ms) */
  ahead: number;
  /** at most this many notes sound at once (the phone plays 32 sounds; the quietest goes first) */
  maxVoices: number;
  /** level of a velocity-127 note (setVolume: up to 2 exact on the phone) */
  volume: number;
  /** 3D: the volume a sound is made with (its range: 16 blocks a unit) and how much louder than its file it plays */
  range3d: number; level3d: number;
  semis: number; speed: number; loop: boolean;
  /** each sample is warmed this many ms before its first note (0: not; the song waits that long when its first notes need it) */
  warm?: number;
  /** each note's choice and placement on the content log (testing, measuring) */
  log?: boolean;
  /** loop: the next lap starts when the song's last note ends, its notes' tails still ringing (q84: waiting for every voice to
   *  end, then stopping and starting again, made each 14.7 s lap 15.05 s with a 155-185 ms silent seam; q87: with it, none and
   *  the laps are the song's length — on by default since 1.5.5). false = as before */
  seam?: boolean;
  /** phones: a note louder than 1 is made at 1 and raised by setVolume (playSound's volume stops at 1 on the phone — q80: at 300 %
   *  every velocity from 72 up sounded the same; setVolume is exact to 2; q86: with it the ramp follows to 127 and
   *  each song scores higher — on by default since 1.5.5). false = as before (made at its gain, so held at 1) */
  over?: boolean;
}
/** a sounding note. A held note of an instrument that sustains (strings, organ, winds) is handed over before its sample ends to a
 *  new copy of the same sample started at its steady part (relayFrom ms in) — the two crossfade in one tick, so they line up */
interface Voice { s: SoundInstance; inst: Inst; gain: number; on: number; off: number; end: number; released: boolean; stopAt: number;
  ev: string; p: number; len: number; relayAt: number; relays: number; peak: number; }
/** the headroom (measured on the phone, p02: the étude through the sampler at 1.2 scored ViSQOL 2.47, through the sine engine at
 *  +10 dB 4.14 — the phone's output path is 16 bits 32.5 dB under the files, so a quiet note loses its quiet parts): the sampler
 *  plays near the top, and each bundle's new notes are turned down together when what still sounds (its peaks, a struck note
 *  falling with HEAD_DECAY_MS) and they would pass HEAD_LIMIT — the phone's mix clips at about 2 file units (measured) */
const HEAD_LIMIT = 1.9, HEAD_DECAY_MS = 1200;
/** a sustained note is relayed RELAY_MS before its sample ends, crossfading over RELAY_FADE s, from RELAY_FROM of the sample */
const RELAY_MS = 350, RELAY_FADE = 0.15, RELAY_FROM = 0.4;

export class NotePlayer {
  ending = 0; paused = false; started = false;
  idx = 0; t0 = 0; pausedAt = 0;
  /** the tick (from t0) the next bundle starts at */
  nextBundle = -Infinity;
  voices: Voice[] = [];
  starts = 0; steals = 0; skipped = 0; calls = 0; peakVoices = 0; ticks = 0; headDown = 0; warmed = 0; preroll = 0;
  /** no note starts before this tick (the song waits for its first samples to load: WARM) */
  private holdTick = 0;
  /** the alias each sample was last started under (a sample started again goes under the next: spectral.i.<id>.<k><alias>) */
  private alias = new Map<number, number>();
  /** the samples still to warm: [song ms of the sample's first note, instrument, sample], in order (WARM) */
  private warmList: [number, number, number][] = [];
  private widx = 0;
  constructor(public owner: Player, public song: NoteSong, public nt: Notes, public o: NoteOpts, public dim: Dimension, public loc: Vector3) {}
  get title() { return this.song.meta.title; }
  /** whose loaded sounds these are: a player's own (headphones) or what their speaker reaches */
  get who() { return (this.o.where === 'phones' ? '' : 'speaker:') + this.owner.id; }
  start(atMs = 0) { this.started = true; this.seekMs(atMs); }
  /** song time (ms) at the current tick's landing */
  now() { return (system.currentTick - this.t0) * 50 * this.o.speed; }

  tick() {
    if (!this.started || this.paused) return;
    this.ticks++;
    const t = this.now(), sp = this.o.speed;
    for (const v of this.voices) if (!v.released && v.off <= t + 25 * sp) this.release(v, v.inst.release, t);
    for (const v of this.voices) if (!v.released && v.relayAt <= t && v.off > t + RELAY_MS * sp) this.relay(v, t);
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.stopAt && t >= v.stopAt) { this.stopVoice(v); continue; }
      if (t >= v.end) continue;                         // played to its end by itself
      keep.push(v);
    }
    this.voices = keep;
    const tk = system.currentTick - this.t0;
    if (this.o.warm) this.warmAhead(t + (this.o.ahead + Math.max(1, this.o.bundle) * 50 + this.o.warm) * sp);
    if (system.currentTick < this.holdTick) return;
    if (!this.o.place) {
      const from = this.idx;
      while (this.idx < this.nt.n && this.nt.on[this.idx] < t + 50 * sp) this.idx++;
      const g = this.headroom(from, this.idx, t);
      for (let i = from; i < this.idx; i++) this.noteOn(i, t, false, g);
    } else if (tk >= this.nextBundle) {
      this.nextBundle = tk + Math.max(1, this.o.bundle);
      const until = t + (this.o.ahead + Math.max(1, this.o.bundle) * 50) * sp, from = this.idx;
      while (this.idx < this.nt.n && this.nt.on[this.idx] < until) this.idx++;
      const g = this.headroom(from, this.idx, t);
      for (let i = from; i < this.idx; i++) this.noteOn(i, t, true, g);
    }
    this.peakVoices = Math.max(this.peakVoices, this.voices.length);
    if (this.o.loop && this.o.seam && this.idx >= this.nt.n && this.nt.n > 0 && t >= this.songEnd()) { this.nextLap(); return; }
    if (this.idx >= this.nt.n && this.voices.length === 0) {
      if (this.o.loop) this.seekMs(0);
      else if (!this.ending) this.ending = 1;
    }
  }

  /** song ms where its last note ends */
  private endMs = -1;
  songEnd() {
    if (this.endMs < 0) { let e = 0; for (let i = 0; i < this.nt.n; i++) e = Math.max(e, this.nt.on[i] + Math.max(0, this.nt.dur[i])); this.endMs = e; }
    return this.endMs;
  }
  /** the next lap from here (seam): the song's clock goes back by whole ticks of its length, the sounding notes keep ringing on
   *  the same clock moved back with it, the first notes are placed from the next bundle on, samples warmed again from the top */
  laps = 0;
  private nextLap() {
    const L = Math.max(1, Math.ceil(this.songEnd() / 50 / this.o.speed)), ms = L * 50 * this.o.speed;
    this.t0 += L; this.nextBundle -= L; this.idx = 0; this.laps++;
    for (const v of this.voices) {
      v.on -= ms; v.off -= ms; v.end -= ms;
      if (v.stopAt) v.stopAt -= ms;
      if (v.relayAt !== Infinity) v.relayAt -= ms;
    }
    if (this.o.warm) this.planWarm(0);
  }

  /** the samples of the notes from note `from` on, each at its first note and where it comes back after WARM.gap (WARM) */
  private planWarm(from: number) {
    // (each sample at its first note, and again at a note it comes back to after WARM.gap without: the phone drops it meanwhile)
    const last = new Map<number, number>(), list: [number, number, number][] = [];
    for (let i = from; i < this.nt.n; i++) {
      const g = this.choose(i).got; if (!g) continue;
      const ak = g[0] * 4096 + g[1], before = last.get(ak), on = this.nt.on[i];
      last.set(ak, on + this.nt.dur[i]);
      if (before !== undefined && on - before < WARM.gap) continue;
      list.push([on, g[0], g[1]]);
    }
    this.warmList = list; this.widx = 0;
  }
  /** warm the samples whose first note comes before `until` (song ms), at most WARM.perTick this tick; one played or warmed within
   *  WARM.ttl is not started again */
  private warmAhead(until: number) {
    let n = 0;
    while (this.widx < this.warmList.length && this.warmList[this.widx][0] < until && n < WARM.perTick) {
      const [at, ii, j] = this.warmList[this.widx++], ak = ii * 4096 + j;
      if (isWarm(this.who, ak)) continue;
      this.calls += warmEvent(`spectral.i.${BANK[ii].id}.${j}`, this.o.where, this.owner, this.dim, this.loc, this.o.range3d);
      touchSample(this.who, ak);
      this.warmed++; n++;
      if (this.o.log) console.warn(`[spectral] warm ${BANK[ii].id}.${j} for ${Math.round(at)} ms at ${Math.round(this.now())} ms`);
    }
  }
  /** note i's sample: [instrument, sample, pitch ratio] and its key as played */
  private choose(i: number): { got: [number, number, number] | undefined; key: number } {
    const nt = this.nt, code = this.song.meta.programs[nt.prog[i]];
    const drum = code >= 128 && code < 200, voice = code >= 200;
    const cents = (nt.cents ? nt.cents[i] : 0) + (drum ? 0 : voice ? this.o.semis * 100 : 0);
    const key = drum || voice ? nt.key[i] : nt.key[i] + this.o.semis;
    return { got: pick(code, drum || voice ? nt.key[i] : Math.max(0, Math.min(127, Math.round(key))), nt.vel[i], voice ? cents : cents + (key - Math.round(key)) * 100), key };
  }
  /** how much the notes from..to (one bundle) are turned down: 1 while what still sounds and they stay under HEAD_LIMIT */
  private headroom(from: number, to: number, t: number): number {
    if (to <= from) return 1;
    const k3 = this.o.where === 'phones' ? 1 : this.o.level3d;
    let now = 0, add = 0;
    for (const v of this.voices) {
      const age = Math.max(0, t - v.on) / this.o.speed;
      now += v.gain * k3 * v.peak * (v.inst.sustain && !v.released ? 1 : Math.exp(-age / HEAD_DECAY_MS)) * (v.released ? 0.3 : 1);
    }
    for (let i = from; i < to; i++) {
      const c = this.choose(i).got; if (!c) continue;
      add += this.o.volume * Math.pow(this.nt.vel[i] / 127, 2) * k3 * (BANK[c[0]].samples[c[1]][4] ?? 0.89);
    }
    if (now + add <= HEAD_LIMIT || add <= 0) return 1;
    this.headDown++;
    return Math.max(0.25, Math.min(1, (HEAD_LIMIT - Math.min(now, HEAD_LIMIT * 0.75)) / add));
  }

  private noteOn(i: number, t: number, placed = true, head = 1) {
    const nt = this.nt, sp = this.o.speed, code = this.song.meta.programs[nt.prog[i]];
    const voice = code >= 200;
    const { got, key } = this.choose(i);
    if (!got) { this.skipped++; return; }
    const [ii, j, p] = got, inst = BANK[ii], smp = inst.samples[j];
    if (!(p >= 0.01 && p <= 10)) { this.skipped++; return; }
    const delay = placed ? Math.max(0, (nt.on[i] - t) / sp) : 0, late = Math.max(0, (t - nt.on[i]) / sp);   // real ms
    if (late > smp[2] / p - 30) { this.skipped++; return; }                                    // over before it could sound
    if (late > 0 && nt.on[i] + nt.dur[i] <= t) { this.skipped++; return; }
    while (this.voices.length >= this.o.maxVoices) this.steal(t);
    const gain = this.o.volume * Math.pow(nt.vel[i] / 127, 2) * head;
    const ak = ii * 4096 + j, an = ((this.alias.get(ak) ?? -1) + 1) % ALIASES.length;
    this.alias.set(ak, an);
    const ev = `spectral.i.${inst.id}.${j}${ALIASES[an]}`;
    let s: SoundInstance;
    try {
      if (this.o.where === 'phones') {
        s = this.owner.playSound(ev, { volume: this.o.over ? Math.min(1, gain) : gain, pitch: p });
        if (this.o.over && gain > 1) { s.setVolume(gain); this.calls++; }
      }
      else { s = this.dim.playSound(ev + '_3d', this.loc, { volume: this.o.range3d, pitch: p }); s.setVolume(gain * this.o.level3d); this.calls++; }
      const seek = Math.max(0, LEAD - (delay / 1000) * p + (late / 1000) * p);
      s.seekTo(seek);
      this.calls += 2;
      if (this.o.log) console.warn(`[spectral] note ${i} ${inst.id}.${j} key ${key} pitch ${p.toFixed(4)} seek ${seek.toFixed(4)} at ${Math.round(t)} ms alias ${ALIASES[an] || '-'}${head < 1 ? ` head ${head.toFixed(2)}` : ''}`);
    } catch { this.skipped++; return; }
    touchSample(this.who, ak);
    this.starts++;
    const on = nt.on[i];
    const end = on + (smp[2] / p - late + 60) * sp;
    this.voices.push({ s, inst, gain, on, off: on + nt.dur[i], end, released: false, stopAt: 0, ev: this.o.where === 'phones' ? ev : ev + '_3d', p, len: smp[2], peak: smp[4] ?? 0.89,
      // (not in 3D: a new 3D sound plays as made for 100-200 ms — a relay would start loud there)
      relayAt: inst.sustain && smp[2] > 1500 && this.o.where === 'phones' ? end - (RELAY_MS + 60) * sp : Infinity, relays: 0 });
  }

  /** the held note goes on in a new copy of its sample from the steady part; the old copy fades out (both in this tick) */
  private relay(v: Voice, t: number) {
    const from = v.len * RELAY_FROM;
    let s: SoundInstance;
    try {
      const vol = this.o.where === 'phones' ? v.gain : v.gain * this.o.level3d;
      s = this.o.where === 'phones' ? this.owner.playSound(v.ev, { volume: 1e-4, pitch: v.p }) : this.dim.playSound(v.ev, this.loc, { volume: this.o.range3d, pitch: v.p });
      s.seekTo(LEAD + from / 1000);
      if (this.o.where !== 'phones') { s.setVolume(1e-4); this.calls++; }
      s.fade(RELAY_FADE, vol);
      v.s.fade(RELAY_FADE, 0);
      this.calls += 4;
    } catch { v.relayAt = Infinity; return; }
    const old = v.s;
    system.runTimeout(() => { try { old.stop(); } catch { /* gone */ } }, Math.ceil(RELAY_FADE * 20) + 2);
    v.s = s; v.relays++;
    v.end = t + ((v.len - from) / v.p + 60) * this.o.speed;
    v.relayAt = v.end - (RELAY_MS + 60) * this.o.speed;
  }

  private release(v: Voice, sec: number, t: number) {
    try { v.s.fade(sec, 0); this.calls++; } catch { /* gone */ }
    v.released = true; v.stopAt = t + (sec * 1000 + 100) * this.o.speed;
  }
  private stopVoice(v: Voice) { try { v.s.stop(); this.calls++; } catch { /* gone */ } }
  /** room for one more: the quietest-sounding voice (one already let go first) fades out in 20 ms */
  private steal(t: number) {
    let w = 0, best = Infinity;
    this.voices.forEach((v, k) => {
      const age = Math.max(0, t - v.on) / this.o.speed;
      const loud = v.gain * Math.exp(-age / 2500) * (v.released ? 0.25 : 1);
      if (loud < best) { best = loud; w = k; }
    });
    const v = this.voices.splice(w, 1)[0];
    try { v.s.fade(0.02, 0); this.calls++; } catch { /* gone */ }
    system.runTimeout(() => this.stopVoice(v), 2);
    this.steals++;
  }

  stopAll() { for (const v of this.voices) this.stopVoice(v); this.voices = []; }
  stop() { this.stopAll(); this.started = false; }
  /** jump to a time (ms of the song): the notes still sounding there start inside their samples. The song's time `ms` is put a
   *  tick ahead (and `ahead` more when notes are placed), so that the first bundle has the lead its notes are placed with */
  seekMs(ms: number) {
    this.stopAll();
    const nt = this.nt; let i = 0;
    while (i < nt.n && nt.on[i] + Math.max(nt.dur[i], 0) < ms) i++;
    this.idx = i;
    // (warming: the samples from here on, and the song waits `warm` ms when one of its first notes' samples is not loaded yet)
    this.preroll = 0;
    if (this.o.warm) {
      this.planWarm(i);
      const first = this.warmList.findIndex(([at, ii, j]) => at < ms + (this.o.warm! + this.o.ahead + Math.max(1, this.o.bundle) * 50) * this.o.speed && !isWarm(this.who, ii * 4096 + j));
      if (first >= 0) this.preroll = Math.ceil(this.o.warm / 50);
    }
    const lead = 1 + (this.o.place ? Math.ceil(this.o.ahead / 50) : 0) + this.preroll;
    this.holdTick = system.currentTick + 1 + this.preroll;
    this.t0 = system.currentTick + lead - Math.round(ms / 50 / this.o.speed);
    this.nextBundle = -Infinity;
  }
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    if (on) this.pausedAt = system.currentTick;
    else this.t0 += system.currentTick - this.pausedAt;
    for (const v of this.voices) { try { if (on) v.s.pause(); else v.s.resume(); this.calls++; } catch { /* gone */ } }
  }
  get position() { return Math.max(0, this.now()) / 1000; }
  status(): string {
    const m = this.song.meta;
    return `§bnotes §f${m.title}§b: ${this.idx}/${this.nt.n} notes at ${this.position.toFixed(1)} s · sounding ${this.voices.length} (most ${this.peakVoices}, at most ${this.o.maxVoices}) · ` +
      `started ${this.starts}, stolen ${this.steals}, skipped ${this.skipped}${this.headDown ? `, ${this.headDown} bundle${this.headDown > 1 ? 's' : ''} turned down` : ''}${this.warmed ? `, ${this.warmed} sample${this.warmed > 1 ? 's' : ''} warmed` : ''} · ${this.ticks ? (this.calls / this.ticks).toFixed(1) : 0} calls/tick · bundle ${this.o.bundle} ticks, ahead ${this.o.ahead} ms · ${this.o.where === 'phones' ? 'headphones' : 'speaker'}`;
  }
}

// ------------------------------------------------------------------ live keys (a MIDI keyboard through Spectral Connect)
/** notes played as they come — a MIDI keyboard or the page's keys through Spectral Connect (tools/connect: the game's /connect),
 *  `scriptevent spectral:note on <key> <velocity> [program] [delay ms]` · `off <key> [program] [delay ms]` · `alloff`, run as the
 *  player. The server sends what was played in each 50 ms with each note's place in it (delay: when it was played, plus a steady
 *  latency): placed by seekTo into the sample's silence like a song's notes, the rhythm keeps to the millisecond behind that
 *  latency. A key let go fades with its instrument's release (in its tick) */
export class LiveKeys {
  held = new Map<string, { s: SoundInstance; inst: Inst; at: number }>();
  starts = 0; skipped = 0; calls = 0; cold = 0;
  private alias = new Map<number, number>();
  /** samples still to warm (warmProgram), WARM.perTick a tick */
  private warmQueue: number[] = [];
  constructor(public owner: Player, public volume: number, public log = false) {}
  /** warm every sample of a program's instrument (the page asks when one is chosen, and for the piano when it connects): a key's
   *  first note would be lost otherwise (WARM) — a piano's 126 samples take 16 ticks; the samples played or warmed within
   *  WARM.ttl are left */
  warmProgram(code: number): number {
    const ii = instOf(code);
    if (ii < 0 || !BANK[ii]) return 0;
    const before = this.warmQueue.length;
    BANK[ii].samples.forEach((_, j) => { const ak = ii * 4096 + j; if (!isWarm(this.owner.id, ak) && !this.warmQueue.includes(ak)) this.warmQueue.push(ak); });
    const added = this.warmQueue.length - before;
    if (this.log) console.warn(`[spectral] live warm ${BANK[ii].id}: ${added} samples`);
    if (before === 0 && added) this.drainWarm();
    return added;
  }
  private drainWarm() {
    const owner = this.owner;
    if (!owner.isValid) { this.warmQueue = []; return; }
    for (const ak of this.warmQueue.splice(0, WARM.perTick)) {
      const ii = Math.floor(ak / 4096), j = ak % 4096;
      this.calls += warmEvent(`spectral.i.${BANK[ii].id}.${j}`, 'phones', owner, owner.dimension, owner.location);
      touchSample(owner.id, ak);
    }
    if (this.warmQueue.length) system.runTimeout(() => this.drainWarm(), 1);
  }
  on(code: number, key: number, vel: number, delayMs = 0) {
    const got = pick(code, key, vel);
    if (!got) { this.skipped++; return `§cno sample for program ${code} key ${key}`; }
    const [ii, j, p] = got, inst = BANK[ii];
    if (!(p >= 0.01 && p <= 10)) { this.skipped++; return '§cout of range'; }
    const id = `${code}:${key}`, old = this.held.get(id);
    if (old) { try { old.s.fade(0.03, 0); } catch { /* gone */ } this.held.delete(id); }
    const ak = ii * 4096 + j, an = ((this.alias.get(ak) ?? -1) + 1) % ALIASES.length;
    this.alias.set(ak, an);
    // (a sample not warmed: this note loads it and is likely lost on a phone — counted, and it is warm from now on)
    if (!isWarm(this.owner.id, ak)) this.cold++;
    touchSample(this.owner.id, ak);
    const ev = `spectral.i.${inst.id}.${j}${ALIASES[an]}`, delay = Math.max(0, Math.min(500, delayMs));
    try {
      const s = this.owner.playSound(ev, { volume: this.volume * Math.pow(vel / 127, 2), pitch: p });
      const seek = Math.max(0, LEAD - (delay / 1000) * p);
      s.seekTo(seek);
      this.calls += 2; this.starts++;
      this.held.set(id, { s, inst, at: system.currentTick });
      if (this.log) console.warn(`[spectral] live note on ${key} ${inst.id}.${j} pitch ${p.toFixed(4)} seek ${seek.toFixed(4)} delay ${Math.round(delay)} ms`);
    } catch { this.skipped++; return '§cthe sound did not start'; }
    return '';
  }
  off(code: number, key: number, delayMs = 0) {
    const id = `${code}:${key}`, v = this.held.get(id);
    if (!v) return;
    this.held.delete(id);
    const go = () => { try { v.s.fade(Math.max(0.02, v.inst.release), 0); this.calls++; } catch { /* gone */ } };
    const ticks = Math.round(Math.max(0, Math.min(500, delayMs)) / 50);
    if (ticks) system.runTimeout(go, ticks); else go();
    if (this.log) console.warn(`[spectral] live note off ${key} after ${ticks} ticks`);
  }
  allOff() { for (const [, v] of this.held) { try { v.s.fade(0.05, 0); } catch { /* gone */ } } this.held.clear(); }
}

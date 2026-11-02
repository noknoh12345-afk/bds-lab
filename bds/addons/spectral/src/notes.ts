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
import { BANK, GM, DRUMS, LEAD, VOICES, Inst } from './bank';

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
  /** each note's choice and placement on the content log (testing, measuring) */
  log?: boolean;
}
/** a sounding note. A held note of an instrument that sustains (strings, organ, winds) is handed over before its sample ends to a
 *  new copy of the same sample started at its steady part (relayFrom ms in) — the two crossfade in one tick, so they line up */
interface Voice { s: SoundInstance; inst: Inst; gain: number; on: number; off: number; end: number; released: boolean; stopAt: number;
  ev: string; p: number; len: number; relayAt: number; relays: number; }
/** a sustained note is relayed RELAY_MS before its sample ends, crossfading over RELAY_FADE s, from RELAY_FROM of the sample */
const RELAY_MS = 350, RELAY_FADE = 0.15, RELAY_FROM = 0.4;

export class NotePlayer {
  ending = 0; paused = false; started = false;
  idx = 0; t0 = 0; pausedAt = 0;
  /** the tick (from t0) the next bundle starts at */
  nextBundle = -Infinity;
  voices: Voice[] = [];
  starts = 0; steals = 0; skipped = 0; calls = 0; peakVoices = 0; ticks = 0;
  constructor(public owner: Player, public song: NoteSong, public nt: Notes, public o: NoteOpts, public dim: Dimension, public loc: Vector3) {}
  get title() { return this.song.meta.title; }
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
    if (!this.o.place) {
      while (this.idx < this.nt.n && this.nt.on[this.idx] < t + 50 * sp) this.noteOn(this.idx++, t, false);
    } else if (tk >= this.nextBundle) {
      this.nextBundle = tk + Math.max(1, this.o.bundle);
      const until = t + (this.o.ahead + Math.max(1, this.o.bundle) * 50) * sp;
      while (this.idx < this.nt.n && this.nt.on[this.idx] < until) this.noteOn(this.idx++, t);
    }
    this.peakVoices = Math.max(this.peakVoices, this.voices.length);
    if (this.idx >= this.nt.n && this.voices.length === 0) {
      if (this.o.loop) this.seekMs(0);
      else if (!this.ending) this.ending = 1;
    }
  }

  private noteOn(i: number, t: number, placed = true) {
    const nt = this.nt, sp = this.o.speed, code = this.song.meta.programs[nt.prog[i]];
    const drum = code >= 128 && code < 200, voice = code >= 200;
    const cents = (nt.cents ? nt.cents[i] : 0) + (drum ? 0 : voice ? this.o.semis * 100 : 0);
    const key = drum || voice ? nt.key[i] : nt.key[i] + this.o.semis;
    const got = pick(code, drum || voice ? nt.key[i] : Math.max(0, Math.min(127, Math.round(key))), nt.vel[i], voice ? cents : cents + (key - Math.round(key)) * 100);
    if (!got) { this.skipped++; return; }
    const [ii, j, p] = got, inst = BANK[ii], smp = inst.samples[j];
    if (!(p >= 0.01 && p <= 10)) { this.skipped++; return; }
    const delay = placed ? Math.max(0, (nt.on[i] - t) / sp) : 0, late = Math.max(0, (t - nt.on[i]) / sp);   // real ms
    if (late > smp[2] / p - 30) { this.skipped++; return; }                                    // over before it could sound
    if (late > 0 && nt.on[i] + nt.dur[i] <= t) { this.skipped++; return; }
    while (this.voices.length >= this.o.maxVoices) this.steal(t);
    const gain = this.o.volume * Math.pow(nt.vel[i] / 127, 2);
    const ev = `spectral.i.${inst.id}.${j}`;
    let s: SoundInstance;
    try {
      if (this.o.where === 'phones') s = this.owner.playSound(ev, { volume: gain, pitch: p });
      else { s = this.dim.playSound(ev + '_3d', this.loc, { volume: this.o.range3d, pitch: p }); s.setVolume(gain * this.o.level3d); this.calls++; }
      const seek = Math.max(0, LEAD - (delay / 1000) * p + (late / 1000) * p);
      s.seekTo(seek);
      this.calls += 2;
      if (this.o.log) console.warn(`[spectral] note ${i} ${inst.id}.${j} key ${key} pitch ${p.toFixed(4)} seek ${seek.toFixed(4)} at ${Math.round(t)} ms`);
    } catch { this.skipped++; return; }
    this.starts++;
    const on = nt.on[i];
    const end = on + (smp[2] / p - late + 60) * sp;
    this.voices.push({ s, inst, gain, on, off: on + nt.dur[i], end, released: false, stopAt: 0, ev: this.o.where === 'phones' ? ev : ev + '_3d', p, len: smp[2],
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
    const lead = 1 + (this.o.place ? Math.ceil(this.o.ahead / 50) : 0);
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
      `started ${this.starts}, stolen ${this.steals}, skipped ${this.skipped} · ${this.ticks ? (this.calls / this.ticks).toFixed(1) : 0} calls/tick · bundle ${this.o.bundle} ticks, ahead ${this.o.ahead} ms · ${this.o.where === 'phones' ? 'headphones' : 'speaker'}`;
  }
}

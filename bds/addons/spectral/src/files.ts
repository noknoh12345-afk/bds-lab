// File songs (tools/filepack.py): a recording played as itself — mp3's quality, not sine waves. Its parts are sounds of an add-on
// the song came in (spectral.f.<id>.<k>), 48 kHz (`rate`; measured on the phone, p03: better than 24 kHz cut at 11.5 kHz — the
// same spectrum, ViSQOL 3.09 against 2.71), each with 0.6 s of silence in front. A part starts in the tick before it is due with seekTo into that silence, so that the parts meet
// to the millisecond (they overlap by `x` ms with the fades written in); a seek starts the part it lands in from inside.
import { system, Player, Dimension, Vector3, SoundInstance } from '@minecraft/server';
import { WARM, warmEvent, isWarm, touchSample } from './notes';

export interface FileMeta { id: string; title: string; artist?: string; seconds: number; parts: [number, number][]; x: number; hi?: boolean; lead?: number;
  /** the parts' sample rate (packs before it: 24000, with a 48 kHz set beside them when `hi`) */
  rate?: number; }
export interface FileOpts { where: 'phones' | 'speaker'; volume: number; range3d: number; level3d: number; ahead: number; hi: boolean; loop: boolean; log?: boolean;
  /** each part is warmed this many ms before it is due (src/notes.ts WARM: a sound's first play on a phone is lost) */
  warm?: number; }

interface Part { k: number; s: SoundInstance; end: number; }

/** phones: the file's level above 1 by setVolume (playSound's volume stops at 1 on the phone, q80 — so the 1.8 a file song is
 *  given played at 1). Off until the phone compares (q88): `scriptevent spectral:fileover true|false` */
export const FILE_OVER = { on: true };
export class FilePlayer {
  ending = 0; paused = false; started = false; t0 = 0; pausedAt = 0;
  next = 0; playing: Part[] = []; starts = 0; calls = 0; wnext = 0; warmed = 0; preroll = 0;
  /** no part starts before this tick (the song waits for its first part to load) */
  private holdTick = 0;
  constructor(public owner: Player, public meta: FileMeta, public o: FileOpts, public dim: Dimension, public loc: Vector3) {}
  get title() { return this.meta.title; }
  get lead() { return this.meta.lead ?? 0.6; }
  now() { return (system.currentTick - this.t0) * 50; }
  start(atMs = 0) { this.started = true; this.seekMs(atMs); }

  private ev(k: number) { return `spectral.f.${this.meta.id}.${k}${this.o.where === 'speaker' ? '_3d' : this.o.hi && this.meta.hi ? 'h' : ''}`; }
  /** the event without its _3d (warmEvent adds it for a speaker) */
  private baseEv(k: number) { return `spectral.f.${this.meta.id}.${k}${this.o.where === 'phones' && this.o.hi && this.meta.hi ? 'h' : ''}`; }
  private get who() { return (this.o.where === 'phones' ? '' : 'speaker:') + this.owner.id; }
  /** part k, sounding `delay` ms after this tick (or, late, from `into` ms inside it) */
  private startPart(k: number, delay: number, into: number, t: number) {
    const [, len] = this.meta.parts[k];
    let s: SoundInstance;
    try {
      if (this.o.where === 'phones') {
        s = this.owner.playSound(this.ev(k), { volume: FILE_OVER.on ? Math.min(1, this.o.volume) : this.o.volume });
        if (FILE_OVER.on && this.o.volume > 1) { s.setVolume(this.o.volume); this.calls++; }
      }
      else { s = this.dim.playSound(this.ev(k), this.loc, { volume: this.o.range3d }); s.setVolume(this.o.volume * this.o.level3d); this.calls++; }
      const seek = Math.max(0, this.lead - delay / 1000 + into / 1000);
      s.seekTo(seek);
      this.calls += 2;
      if (this.o.log) console.warn(`[spectral] part ${k} of ${this.meta.id} seek ${seek.toFixed(4)} at ${Math.round(t)} ms`);
    } catch (e) { console.warn(`[spectral] file song ${this.meta.id} part ${k}: ${e}`); return; }
    this.starts++;
    touchSample(this.who, this.baseEv(k));
    this.playing.push({ k, s, end: t + delay + (len - into) + 60 });
  }

  tick() {
    if (!this.started || this.paused) return;
    const t = this.now();
    this.playing = this.playing.filter((p) => p.end > t);
    // the parts coming within `warm` ms, warmed (a part's first play on a phone is lost: src/notes.ts WARM)
    if (this.o.warm) {
      while (this.wnext < this.meta.parts.length && this.meta.parts[this.wnext][0] < t + 50 + this.o.ahead + this.o.warm) {
        const k = this.wnext++, ev = this.baseEv(k);
        if (isWarm(this.who, ev)) continue;
        this.calls += warmEvent(ev, this.o.where, this.owner, this.dim, this.loc, this.o.range3d);
        touchSample(this.who, ev); this.warmed++;
        if (this.o.log) console.warn(`[spectral] warm ${this.meta.id}.${k} at ${Math.round(t)} ms`);
      }
    }
    if (system.currentTick < this.holdTick) return;
    // the next part, started in the tick before it is due (and `ahead` ms more for a 3D speaker)
    while (this.next < this.meta.parts.length && this.meta.parts[this.next][0] < t + 50 + this.o.ahead) {
      const at = this.meta.parts[this.next][0];
      this.startPart(this.next, Math.max(0, at - t), Math.max(0, t - at), t);
      this.next++;
    }
    if (this.next >= this.meta.parts.length && this.playing.length === 0) {
      if (this.o.loop) this.seekMs(0); else if (!this.ending) this.ending = 1;
    }
  }
  stopAll() { for (const p of this.playing) { try { p.s.stop(); } catch { /* gone */ } } this.playing = []; }
  stop() { this.stopAll(); this.started = false; }
  seekMs(ms: number) {
    this.stopAll();
    const P = this.meta.parts;
    let k = 0;
    while (k + 1 < P.length && P[k + 1][0] <= ms) k++;
    this.next = k; this.wnext = k;
    // (the song waits `warm` ms when the part it starts in is not loaded yet)
    this.preroll = this.o.warm && !isWarm(this.who, this.baseEv(k)) ? Math.ceil(this.o.warm / 50) : 0;
    this.t0 = system.currentTick + 1 + Math.ceil(this.o.ahead / 50) + this.preroll - Math.round(ms / 50);
    this.holdTick = system.currentTick + 1 + this.preroll;
  }
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    if (on) this.pausedAt = system.currentTick; else this.t0 += system.currentTick - this.pausedAt;
    for (const p of this.playing) { try { if (on) p.s.pause(); else p.s.resume(); } catch { /* gone */ } }
  }
  get position() { return Math.max(0, this.now()) / 1000; }
  status(): string {
    return `§bfile song §f${this.meta.title}§b: part ${Math.max(0, this.next - 1) + 1}/${this.meta.parts.length} at ${this.position.toFixed(1)} s of ${this.meta.seconds.toFixed(1)} · ` +
      `${this.o.where === 'phones' ? `headphones, ${this.o.hi && this.meta.hi ? 48 : Math.round((this.meta.rate ?? 24000) / 1000)} kHz` : 'speaker'} · parts started ${this.starts}${this.warmed ? `, warmed ${this.warmed}` : ''}`;
  }
}

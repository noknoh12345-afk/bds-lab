// File songs (tools/filepack.py): a recording played as itself — mp3's quality, not sine waves. Its parts are sounds of an add-on
// the song came in (spectral.f.<id>.<k>), 24 kHz (the phone folds everything above 12 kHz: nothing in them does), each with
// 0.6 s of silence in front. A part starts in the tick before it is due with seekTo into that silence, so that the parts meet
// to the millisecond (they overlap by `x` ms with the fades written in); a seek starts the part it lands in from inside.
import { system, Player, Dimension, Vector3, SoundInstance } from '@minecraft/server';

export interface FileMeta { id: string; title: string; artist?: string; seconds: number; parts: [number, number][]; x: number; hi?: boolean; lead?: number; }
export interface FileOpts { where: 'phones' | 'speaker'; volume: number; range3d: number; level3d: number; ahead: number; hi: boolean; loop: boolean; log?: boolean; }

interface Part { k: number; s: SoundInstance; end: number; }

export class FilePlayer {
  ending = 0; paused = false; started = false; t0 = 0; pausedAt = 0;
  next = 0; playing: Part[] = []; starts = 0; calls = 0;
  constructor(public owner: Player, public meta: FileMeta, public o: FileOpts, public dim: Dimension, public loc: Vector3) {}
  get title() { return this.meta.title; }
  get lead() { return this.meta.lead ?? 0.6; }
  now() { return (system.currentTick - this.t0) * 50; }
  start(atMs = 0) { this.started = true; this.seekMs(atMs); }

  private ev(k: number) { return `spectral.f.${this.meta.id}.${k}${this.o.where === 'speaker' ? '_3d' : this.o.hi && this.meta.hi ? 'h' : ''}`; }
  /** part k, sounding `delay` ms after this tick (or, late, from `into` ms inside it) */
  private startPart(k: number, delay: number, into: number, t: number) {
    const [, len] = this.meta.parts[k];
    let s: SoundInstance;
    try {
      if (this.o.where === 'phones') s = this.owner.playSound(this.ev(k), { volume: this.o.volume });
      else { s = this.dim.playSound(this.ev(k), this.loc, { volume: this.o.range3d }); s.setVolume(this.o.volume * this.o.level3d); this.calls++; }
      const seek = Math.max(0, this.lead - delay / 1000 + into / 1000);
      s.seekTo(seek);
      this.calls += 2;
      if (this.o.log) console.warn(`[spectral] part ${k} of ${this.meta.id} seek ${seek.toFixed(4)} at ${Math.round(t)} ms`);
    } catch (e) { console.warn(`[spectral] file song ${this.meta.id} part ${k}: ${e}`); return; }
    this.starts++;
    this.playing.push({ k, s, end: t + delay + (len - into) + 60 });
  }

  tick() {
    if (!this.started || this.paused) return;
    const t = this.now();
    this.playing = this.playing.filter((p) => p.end > t);
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
    this.next = k;
    this.t0 = system.currentTick + 1 + Math.ceil(this.o.ahead / 50) - Math.round(ms / 50);
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
      `${this.o.where === 'phones' ? (this.o.hi && this.meta.hi ? 'headphones, 48 kHz' : 'headphones, 24 kHz') : 'speaker'} · parts started ${this.starts}`;
  }
}

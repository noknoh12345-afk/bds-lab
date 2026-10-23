// GeoUI timeline — the lab's own song and beatmap for osu! (pure): "Cubic Pulse" (140 BPM, 40 bars, C major / A minor,
// vi–IV–I–V) in two arrangements — chiptune (pulse waves, a triangle bass, noise drums: the pixel look) and a modern synth (detuned
// saws, a sub bass, punchy drums, a pad, a delay: osu!'s own skin) — its chip hitsounds (blips), and a beatmap mapped to it
// (circles on the drums and the melody, sliders on long notes, streams on the fills, jumps in the kiai, a break, a spinner at
// the end). Deterministic (a seeded noise): the same numbers every time. bds/geoui/osu/music.mjs writes them as .ogg and .osu
// for the sample add-ons; the plugin makes them in the browser (osu! を丸ごと作る, the lab's song).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const BPM = 140, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 40, LEAD_IN = 1.0;   // (seconds: the song starts after a second of silence)
  const SONG = { title: 'Cubic Pulse', artist: 'bds-lab', bpm: BPM, bars: BARS };
  // (sections, in bars: what plays and what the map does)
  const SECTIONS = [
    { name: 'intro', from: 0, to: 4 }, { name: 'verse', from: 4, to: 12 }, { name: 'chorus', from: 12, to: 20, kiai: true },
    { name: 'break', from: 20, to: 24 }, { name: 'build', from: 24, to: 32 }, { name: 'chorus2', from: 32, to: 38, kiai: true }, { name: 'outro', from: 38, to: 40 },
  ];
  const sectionAt = (bar) => SECTIONS.find((s) => bar >= s.from && bar < s.to) || SECTIONS[SECTIONS.length - 1];
  // the chords, a bar each (vi IV I V): root (MIDI) and the triad
  const PROG = [[57, [57, 60, 64]], [53, [53, 57, 60]], [48, [48, 52, 55]], [55, [55, 59, 62]]];
  const chordAt = (bar) => PROG[bar % 4];
  // the hook: 4 bars of [beat, length (beats), MIDI] — sung over vi IV I V, in C major's pentatonic-ish shape
  const HOOK = [
    [0, 0.5, 76], [0.5, 0.5, 74], [1, 1, 72], [2, 0.5, 69], [2.5, 0.5, 72], [3, 1, 74],
    [4, 0.5, 72], [4.5, 0.5, 69], [5, 1.5, 65], [6.5, 0.5, 67], [7, 1, 69],
    [8, 0.5, 67], [8.5, 0.5, 69], [9, 1, 72], [10, 0.5, 76], [10.5, 0.5, 79], [11, 1, 76],
    [12, 0.75, 74], [12.75, 0.75, 72], [13.5, 0.5, 74], [14, 2, 71],
  ];
  // the verse's answer: lower, sparser
  const VERSE = [[0, 1.5, 69], [1.5, 0.5, 67], [2, 2, 64], [4, 1, 65], [5, 1, 69], [6, 2, 72], [8, 1.5, 67], [9.5, 0.5, 69], [10, 2, 72], [12, 1, 74], [13, 1, 71], [14, 2, 67]];
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const tOf = (bar, beat = 0) => LEAD_IN + bar * BAR + beat * BEAT;

  /** every note of the song: { t, len (s), m (MIDI), part: 'lead'|'bass'|'arp'|'pad'|'kick'|'snare'|'hat'|'crash'|'tom' , vel } */
  function score() {
    const notes = [], add = (o) => notes.push(o);
    for (let bar = 0; bar < BARS; bar++) {
      const sec = sectionAt(bar), [root, triad] = chordAt(bar), b = (beat) => tOf(bar, beat);
      const full = ['verse', 'chorus', 'build', 'chorus2'].includes(sec.name), kiai = Boolean(sec.kiai);
      // pad: always but in the outro's last bar; softer in the verse
      if (sec.name !== 'outro' || bar === 38) for (const m of triad) add({ t: b(0), len: BAR, m: m + 12, part: 'pad', vel: sec.name === 'break' ? 0.9 : kiai ? 0.55 : 0.45 });
      // bass: 8ths on the root (octave jumps in the kiai), held in the intro and the break
      if (full) for (let i = 0; i < 8; i++) add({ t: b(i / 2), len: BEAT / 2 * 0.9, m: root - 12 + (kiai && i % 2 ? 12 : 0), part: 'bass', vel: i % 2 ? 0.75 : 1 });
      else if (sec.name !== 'outro') add({ t: b(0), len: BAR, m: root - 12, part: 'bass', vel: 0.6 });
      // arpeggio: 16ths over the triad in the build and the kiai, 8ths in the verse
      if (full) { const step = sec.name === 'verse' ? 0.5 : 0.25, seq = [0, 1, 2, 1]; for (let k = 0; k * step < 4; k++) add({ t: b(k * step), len: BEAT * step * 0.8, m: triad[seq[k % 4]] + 24, part: 'arp', vel: 0.5 + (k % 4 === 0 ? 0.2 : 0) }); }
      // drums
      if (full || sec.name === 'intro' || sec.name === 'outro') {
        const kicks = kiai ? [0, 1, 2, 3] : sec.name === 'intro' ? [0, 2] : sec.name === 'outro' ? [0] : [0, 1.5, 2, 3.5];
        for (const k of kicks) add({ t: b(k), len: 0.3, m: 36, part: 'kick', vel: 1 });
        if (full) for (const k of [1, 3]) add({ t: b(k), len: 0.25, m: 38, part: 'snare', vel: 1 });
        if (full || sec.name === 'intro') for (let k = 0; k < 8; k++) add({ t: b(k / 2), len: 0.05, m: 42, part: 'hat', vel: k % 2 ? 0.55 : 0.8 });
        if (kiai) for (let k = 0; k < 4; k++) add({ t: b(k + 0.5), len: 0.08, m: 46, part: 'hat', vel: 0.6 });
      }
      // crash at each section's start (not the break's), a fill (16th snares, toms) in its last bar
      if (bar === sec.from && sec.name !== 'break' && bar > 0) add({ t: b(0), len: 1.5, m: 49, part: 'crash', vel: 1 });
      if (bar === sec.to - 1 && full) for (let k = 0; k < 4; k++) add({ t: b(3 + k / 4), len: 0.15, m: [50, 47, 45, 43][k], part: 'tom', vel: 0.9 });
      // melody: the hook in the kiai (and its last bar's long note), the verse's answer in the verse and the build (an octave up
      // in the build's second half)
      const phrase = kiai ? HOOK : ['verse', 'build'].includes(sec.name) ? VERSE : null;
      if (phrase) {
        const p0 = (bar - sec.from) % 4, up = sec.name === 'build' && bar >= 28 ? 12 : 0;
        for (const [beat, len, m] of phrase) if (beat >= p0 * 4 && beat < p0 * 4 + 4) add({ t: b(beat - p0 * 4), len: len * BEAT * 0.95, m: m + up, part: 'lead', vel: 0.9 });
      }
      if (sec.name === 'outro' && bar === 38) add({ t: b(0), len: BAR * 2, m: 72, part: 'lead', vel: 0.7 });
    }
    return notes.sort((a, b) => a.t - b.t);
  }

  // ---- synthesis (deterministic: a seeded noise)
  function noiseGen(seed = 1) { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; }; }
  // (band-limited edges: polyBLEP — a naive saw or pulse folds its harmonics back down as a hiss)
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  const sawB = (ph, dt) => { const p = ph - Math.floor(ph); return 2 * p - 1 - blep(p, dt); };
  const pulseB = (ph, duty, dt) => sawB(ph, dt) - sawB(ph + 1 - duty, dt);
  const env = (t, len, a, d, s, r) => (t < 0 ? 0 : t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : t < len ? s : t < len + r ? s * (1 - (t - len) / r) : 0);
  /** the song as PCM: arrangement 'chip' (mono, 22050 Hz) or 'synth' (stereo, 44100 Hz) → { rate, channels: [Float32Array] } */
  function render(arr = 'synth') {
    const rate = arr === 'chip' ? 22050 : 44100, dur = tOf(BARS) + 2.5, n = Math.ceil(dur * rate), L = new Float32Array(n), R = new Float32Array(n);
    const rnd = noiseGen(arr === 'chip' ? 7 : 11), notes = score();
    const put = (i, v, pan = 0) => { if (i >= 0 && i < n) { L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); } };
    for (const nt of notes) {
      const i0 = Math.round(nt.t * rate), f = midiHz(nt.m);
      if (arr === 'chip') {
        const dtc = f / rate, pulse = (ph, duty) => pulseB(ph, duty, dtc);
        if (nt.part === 'lead') { const len = nt.len; for (let i = 0; i < (len + 0.08) * rate; i++) { const t = i / rate, vib = t > 0.15 ? Math.sin(t * 2 * Math.PI * 5.5) * 0.004 : 0; put(i0 + i, pulse(t * f * (1 + vib), 0.25) * 0.16 * nt.vel * env(t, len, 0.005, 0.05, 0.75, 0.06)); } }
        else if (nt.part === 'arp') { for (let i = 0; i < nt.len * rate; i++) { const t = i / rate; put(i0 + i, pulse(t * f, 0.125) * 0.07 * nt.vel * env(t, nt.len, 0.002, 0.04, 0.5, 0.01)); } }
        else if (nt.part === 'pad') { for (let i = 0; i < nt.len * rate; i++) { const t = i / rate; put(i0 + i, pulse(t * f, 0.5) * 0.025 * nt.vel * env(t, nt.len, 0.08, 0.2, 0.7, 0.1)); } }
        else if (nt.part === 'bass') { for (let i = 0; i < (nt.len + 0.02) * rate; i++) { const t = i / rate, ph = (t * f) % 1; put(i0 + i, (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) * 0.22 * nt.vel * env(t, nt.len, 0.003, 0.05, 0.85, 0.02)); } }
        else if (nt.part === 'kick') { let ph = 0; for (let i = 0; i < 0.18 * rate; i++) { const t = i / rate; ph += (55 + 180 * Math.exp(-t * 35)) / rate; put(i0 + i, (ph % 1 < 0.5 ? 1 : -1) * 0.3 * Math.exp(-t * 18)); } }
        else if (nt.part === 'snare') { let ph = 0; for (let i = 0; i < 0.16 * rate; i++) { const t = i / rate; ph += 190 / rate; put(i0 + i, (rnd() * 0.7 + (ph % 1 < 0.5 ? 0.3 : -0.3)) * 0.2 * Math.exp(-t * 22)); } }
        else if (nt.part === 'hat') { for (let i = 0; i < (nt.m === 46 ? 0.09 : 0.035) * rate; i++) { const t = i / rate; put(i0 + i, (rnd() > 0.6 ? 1 : -1) * 0.05 * nt.vel * Math.exp(-t * (nt.m === 46 ? 30 : 90))); } }
        else if (nt.part === 'crash') { for (let i = 0; i < 1.2 * rate; i++) { const t = i / rate; put(i0 + i, rnd() * 0.09 * Math.exp(-t * 3.2)); } }
        else if (nt.part === 'tom') { let ph = 0; for (let i = 0; i < 0.15 * rate; i++) { const t = i / rate; ph += (midiHz(nt.m) * 0.5 * (1 + Math.exp(-t * 20))) / rate; put(i0 + i, (ph % 1 < 0.5 ? 1 : -1) * 0.18 * Math.exp(-t * 16)); } }
      } else {
        const dts = f / rate, saw = (ph) => sawB(ph, dts * 1.01);
        if (nt.part === 'lead') {
          const det = [-0.12, -0.05, 0, 0.05, 0.12], len = nt.len; let lp = 0;
          for (let i = 0; i < (len + 0.25) * rate; i++) {
            const t = i / rate, vib = t > 0.18 ? Math.sin(t * 2 * Math.PI * 5.2) * 0.003 : 0;
            let v = 0; det.forEach((d, k) => { v += saw(t * f * Math.pow(2, d / 12) * (1 + vib) + k * 0.13); });
            lp += (v / det.length - lp) * 0.22;
            const e = env(t, len, 0.01, 0.12, 0.7, 0.22) * 0.18 * nt.vel;
            put(i0 + i, lp * e, -0.15); put(i0 + i, lp * e * 0.0, 0);
            // (a dotted-8th delay, quieter, panned the other way)
            put(i0 + i + Math.round(BEAT * 0.75 * rate), lp * e * 0.35, 0.5);
          }
        } else if (nt.part === 'arp') { let lp = 0; for (let i = 0; i < nt.len * rate; i++) { const t = i / rate, v = saw(t * f) * 0.5 + saw(t * f * 1.005) * 0.5; lp += (v - lp) * 0.22; put(i0 + i, lp * 0.07 * nt.vel * env(t, nt.len, 0.002, 0.06, 0.4, 0.02), (nt.m % 2 ? 0.45 : -0.45)); } }
        else if (nt.part === 'pad') {
          let lp = 0;
          for (let i = 0; i < (nt.len + 0.4) * rate; i++) { const t = i / rate, v = saw(t * f * 0.997) + saw(t * f * 1.004 + 0.3) + saw(t * f * 2.001 + 0.6) * 0.4; lp += (v - lp) * 0.04; put(i0 + i, lp * 0.05 * nt.vel * env(t, nt.len, 0.35, 0.3, 0.8, 0.4), Math.sin(t * 0.7) * 0.6); }
        } else if (nt.part === 'bass') {
          let lp = 0;
          for (let i = 0; i < (nt.len + 0.03) * rate; i++) { const t = i / rate, sub = Math.sin(2 * Math.PI * f * t), v = saw(t * f); lp += (v - lp) * (0.05 + 0.25 * Math.exp(-t * 18)); put(i0 + i, (sub * 0.5 + lp * 0.5) * 0.3 * nt.vel * env(t, nt.len, 0.004, 0.08, 0.8, 0.03)); }
        } else if (nt.part === 'kick') {
          let ph = 0;
          for (let i = 0; i < 0.35 * rate; i++) { const t = i / rate; ph += (48 + 150 * Math.exp(-t * 28)) / rate; put(i0 + i, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7) + (t < 0.004 ? rnd() * 0.5 : 0)) * 0.55); }
        } else if (nt.part === 'snare') {
          let lp = 0, ph = 0;
          for (let i = 0; i < 0.25 * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.6; ph += 185 / rate; put(i0 + i, ((w - lp) * 0.8 * Math.exp(-t * 14) + Math.sin(2 * Math.PI * ph) * 0.5 * Math.exp(-t * 30)) * 0.32); }
        } else if (nt.part === 'hat') {
          let lp = 0;
          for (let i = 0; i < (nt.m === 46 ? 0.18 : 0.05) * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.5; put(i0 + i, (w - lp) * 0.06 * nt.vel * Math.exp(-t * (nt.m === 46 ? 16 : 70)), 0.3); }
        } else if (nt.part === 'crash') {
          let lp = 0;
          for (let i = 0; i < 2.2 * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.3; put(i0 + i, (w - lp) * 0.14 * Math.exp(-t * 1.8), (i % 2 ? 0.3 : -0.3)); }
        } else if (nt.part === 'tom') {
          let ph = 0;
          for (let i = 0; i < 0.3 * rate; i++) { const t = i / rate; ph += (midiHz(nt.m) * 0.5 * (1 + 0.6 * Math.exp(-t * 18))) / rate; put(i0 + i, Math.sin(2 * Math.PI * ph) * 0.35 * Math.exp(-t * 9)); }
        }
      }
    }
    // (a gentle bus: the kick ducks the pad and the arp a little; a soft clip; normalised to −1 dB)
    let peak = 0;
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
    const g = peak > 0 ? 0.89 / peak : 1;
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return { rate, channels: arr === 'chip' ? [L] : [L, R] };
  }

  /** the chip version's hitsounds (osu!'s names: normal-hitnormal, …-hitwhistle, …-hitfinish, …-hitclap, slidertick, combobreak,
   *  spinnerbonus) and the play's own (failsound: a fall down the scale; applause: a fanfare, the results'): short blips made here
   *  → { name: { rate, channels } } */
  function chipHitsounds() {
    const rate = 22050, out = {}, rnd = noiseGen(3);
    const make = (len, fn) => { const a = new Float32Array(Math.round(len * rate)); for (let i = 0; i < a.length; i++) a[i] = fn(i / rate, i); return { rate, channels: [a] }; };
    const sq = (ph, d = 0.5) => ((ph % 1) < d ? 1 : -1);
    out['normal-hitnormal'] = make(0.07, (t) => sq(t * (1320 - t * 6000), 0.5) * 0.45 * Math.exp(-t * 45));
    out['normal-hitwhistle'] = make(0.16, (t) => sq(t * (1760 + 400 * Math.sin(t * 90)), 0.25) * 0.3 * Math.exp(-t * 14));
    out['normal-hitfinish'] = make(0.6, (t) => (rnd() * 0.5 + sq(t * 330, 0.5) * 0.3 * Math.exp(-t * 10)) * 0.5 * Math.exp(-t * 5));
    out['normal-hitclap'] = make(0.12, (t) => rnd() * 0.5 * Math.exp(-t * 30));
    out['normal-slidertick'] = make(0.04, (t) => sq(t * 2640, 0.5) * 0.25 * Math.exp(-t * 80));
    out.combobreak = make(0.5, (t) => sq(t * (440 - t * 500), 0.5) * 0.35 * Math.exp(-t * 4));
    out.spinnerbonus = make(0.25, (t) => sq(t * (880 + t * 2400), 0.125) * 0.3 * Math.exp(-t * 9));
    // (the fail: a square wave sliding from 660 Hz to 82 Hz, wobbling — the phase summed so the slide stays smooth)
    let ph = 0;
    out.failsound = make(1.5, (t) => { const f = 82 + 578 * Math.pow(1 - t / 1.5, 2.2), v = 1 + 0.03 * Math.sin(t * 38); ph += (f * v) / rate; return sq(ph, 0.5) * 0.32 * Math.min(1, t * 60) * Math.exp(-t * 1.1); });
    // (the applause: C E G C' as 16ths up, then the chord held with a sparkle of noise)
    const ARP = [523.25, 659.26, 783.99, 1046.5];
    out.applause = make(1.6, (t) => { const k = Math.min(3, Math.floor(t / 0.09)), held = t >= 0.36; const tone = held ? ARP.reduce((a, f, i) => a + sq(t * f * (1 + i * 0.002), 0.25), 0) / 4 : sq(t * ARP[k], 0.25); return (tone * 0.34 * (held ? Math.exp(-(t - 0.36) * 1.8) : 1) + (held ? rnd() * 0.07 * Math.exp(-(t - 0.36) * 2.4) : 0)) * Math.min(1, t * 80); });
    return out;
  }

  // ---- the beatmap: objects on the music, placed by flowing patterns (osu! pixels: 512 x 384)
  const clampP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  /** the beatmap for an arrangement: the .osu text (v14). The same rhythm for both (its sample set: soft for chip, normal for
   *  synth); AR 8.5, OD 7, CS 4, HP 5 */
  function beatmap(arr = 'synth', { version } = {}) {
    const ms = (t) => Math.round(t * 1000), bt = BEAT * 1000;
    const objs = [];   // { t (ms), kind: 'c'|'s'|'p', x, y, nc, hs, slider? }
    const lead = score().filter((n) => n.part === 'lead');
    // the cursor's flow: a slow Lissajous over the field — patterns are cut along it
    const flow = (t) => [256 + 170 * Math.sin(t * 0.61 + 0.5) * Math.cos(t * 0.13), 192 + 120 * Math.sin(t * 0.47 + 1.3)];
    let last = [256, 192];
    const place = (t, spacing, jump = false) => {
      const f = flow(t / 1000), dx = f[0] - last[0], dy = f[1] - last[1], d = Math.hypot(dx, dy) || 1;
      let p = [last[0] + (dx / d) * spacing, last[1] + (dy / d) * spacing];
      if (jump) p = [512 - last[0] + (f[0] - 256) * 0.3, 384 - last[1] + (f[1] - 192) * 0.3];
      if (p[0] < 40 || p[0] > 472 || p[1] < 40 || p[1] > 344) p = [last[0] - (dx / d) * spacing, last[1] - (dy / d) * spacing];
      p = [clampP(Math.round(p[0]), 32, 480), clampP(Math.round(p[1]), 32, 352)];
      last = p;
      return p;
    };
    const HS = { normal: 0, whistle: 2, finish: 4, clap: 8 };
    for (let bar = 0; bar < BARS; bar++) {
      const sec = sectionAt(bar), b0 = ms(tOf(bar)), kiai = Boolean(sec.kiai), newCombo = (bar - sec.from) % 2 === 0;
      if (sec.name === 'break') continue;
      if (sec.name === 'outro') {
        if (bar === 38) objs.push({ t: b0, kind: 'p', end: ms(tOf(39, 3)), nc: true, hs: HS.finish });
        continue;
      }
      const at = (beat) => b0 + Math.round(beat * bt);
      if (sec.name === 'intro') {
        // beats 1 and 3, a slider over the last two beats of every other bar
        const p0 = place(at(0), 110);
        objs.push({ t: at(0), kind: 'c', x: p0[0], y: p0[1], nc: newCombo, hs: bar === 0 ? HS.finish : 0 });
        if (bar % 2) { const p = place(at(2), 120); objs.push({ t: at(2), kind: 's', x: p[0], y: p[1], beats: 1.5, slides: 1, curve: 'B', hs: HS.whistle }); }
        else { const p = place(at(2), 120); objs.push({ t: at(2), kind: 'c', x: p[0], y: p[1], hs: 0 }); }
        continue;
      }
      // the bar's melody notes (their starts, in beats from the bar) and whether long
      const notes = lead.filter((n) => n.t >= tOf(bar) - 1e-6 && n.t < tOf(bar + 1) - 1e-6).map((n) => ({ beat: Math.round(((n.t - tOf(bar)) / BEAT) * 4) / 4, len: n.len / BEAT }));
      const used = new Set();
      let first = true;
      for (const n of notes) {
        if (used.has(n.beat)) continue;
        used.add(n.beat);
        const t = at(n.beat), hs = n.beat % 2 === 1 ? HS.clap : n.beat === 0 ? (kiai ? HS.finish : HS.whistle) : 0;
        if (n.len >= 1.4 && n.beat + 1 <= 4) {
          // a long note: a slider over it (a turn on the longest), along the flow
          const p = place(t, kiai ? 140 : 100), beats = Math.min(Math.floor(n.len * 2) / 2, 4 - n.beat);
          objs.push({ t, kind: 's', x: p[0], y: p[1], beats, slides: n.len >= 1.9 && kiai ? 2 : 1, curve: ['B', 'P', 'L', 'B'][objs.length % 4], hs, nc: first && newCombo });
          for (let k = n.beat + 0.5; k < n.beat + beats; k += 0.5) used.add(k);
        } else {
          const p = place(t, kiai ? (n.beat % 1 === 0 ? 150 : 90) : 80, kiai && n.beat % 2 === 0 && n.beat > 0);
          objs.push({ t, kind: 'c', x: p[0], y: p[1], hs, nc: first && newCombo });
        }
        first = false;
      }
      // the drums where the melody rests: the snares on 2 and 4 (and kicks in the kiai) as circles
      for (const beat of kiai ? [0, 1, 2, 3] : [1, 3]) if (![...used].some((u) => Math.abs(u - beat) < 0.49)) { const p = place(at(beat), kiai ? 130 : 90); objs.push({ t: at(beat), kind: 'c', x: p[0], y: p[1], hs: beat % 2 ? HS.clap : 0 }); used.add(beat); }
      // the fill in a section's last bar: a stream of 1/4s over beat 3 (four notes on an arc: the next bar's downbeat ends it)
      if (bar === sec.to - 1) {
        for (const u of [...used]) if (u >= 3) used.delete(u);
        for (let i = objs.length - 1; i >= 0 && objs[i].t >= at(3); i--) objs.splice(i, 1);
        const c = place(at(3), 60), a0 = Math.atan2(192 - c[1], 256 - c[0]);
        for (let k = 0; k < 4; k++) { const a = a0 + (k - 1.5) * 0.35, p = [clampP(Math.round(c[0] + Math.cos(a) * k * 22), 32, 480), clampP(Math.round(c[1] + Math.sin(a) * k * 22), 32, 352)]; objs.push({ t: at(3 + k / 4), kind: 'c', x: p[0], y: p[1], hs: k === 3 ? HS.whistle : 0 }); last = p; }
      }
    }
    objs.sort((a, b) => a.t - b.t);
    // (no two on the same moment; a slider's end not over the next one's start)
    const clean = [];
    for (const o of objs) { const p = clean[clean.length - 1]; if (p && o.t - (p.kind === 's' ? p.t + p.beats * p.slides * bt : p.kind === 'p' ? p.end : p.t) < bt / 4 - 2) continue; clean.push(o); }
    // the slider curves: from its head along the flow, its length from its beats (SliderMultiplier 1.6, SV 1)
    const SM = 1.6, pxPerBeat = SM * 100;
    const lines = [];
    for (const o of clean) {
      const type = (o.kind === 'c' ? 1 : o.kind === 's' ? 2 : 8) | (o.nc ? 4 : 0);
      if (o.kind === 'c') lines.push(`${o.x},${o.y},${o.t},${type},${o.hs},0:0:0:0:`);
      else if (o.kind === 'p') lines.push(`256,192,${o.t},${type},${o.hs},${o.end},0:0:0:0:`);
      else {
        const len = Math.round(o.beats * pxPerBeat), f = flow(o.t / 1000 + 0.4), dx = f[0] - o.x, dy = f[1] - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const end = [clampP(Math.round(o.x + ux * len * 0.85), 24, 488), clampP(Math.round(o.y + uy * len * 0.85), 24, 360)], nx = -uy, ny = ux, bend = (o.t / 97) % 2 < 1 ? 1 : -1;
        const mid = [clampP(Math.round((o.x + end[0]) / 2 + nx * len * 0.3 * bend), 16, 496), clampP(Math.round((o.y + end[1]) / 2 + ny * len * 0.3 * bend), 16, 368)];
        const pts = o.curve === 'L' ? [end] : o.curve === 'P' ? [mid, end] : [mid, end];
        const edge = Array.from({ length: o.slides + 1 }, (_, k) => (k === 0 ? o.hs : k === o.slides ? HS.finish * (o.slides > 1 ? 1 : 0) : HS.clap)).join('|');
        lines.push(`${o.x},${o.y},${o.t},${type},${o.hs},${o.curve}|${pts.map((p) => p.join(':')).join('|')},${o.slides},${len},${edge}`);
      }
    }
    const kiaiPts = [];
    for (const s of SECTIONS) {
      const t0 = ms(tOf(s.from)), t1 = ms(tOf(s.to));
      kiaiPts.push(`${t0},-100,4,${arr === 'chip' ? 2 : 1},0,${s.name === 'break' ? 40 : 70},0,${s.kiai ? 1 : 0}`);
      if (s.kiai) kiaiPts.push(`${t1},-100,4,${arr === 'chip' ? 2 : 1},0,70,0,0`);
    }
    const brk = SECTIONS.find((s) => s.name === 'break'), bs = ms(tOf(brk.from)) + 400, be = ms(tOf(brk.to)) - 600;
    return ['osu file format v14', '', '[General]', `AudioFilename: ${arr === 'chip' ? 'cubic_pulse_chip' : 'cubic_pulse'}.ogg`, 'AudioLeadIn: 0', 'PreviewTime: ' + ms(tOf(12)), 'Countdown: 0', `SampleSet: ${arr === 'chip' ? 'Soft' : 'Normal'}`, 'StackLeniency: 0.7', 'Mode: 0', '',
      '[Metadata]', `Title:${SONG.title}${arr === 'chip' ? ' (8-bit)' : ''}`, `Artist:${SONG.artist}`, 'Creator:bds-lab', `Version:${version || (arr === 'chip' ? 'Pixel' : 'Skin')}`, 'Source:GeoUI timeline', 'Tags:bds-lab geoui minecraft', '',
      '[Difficulty]', 'HPDrainRate:5', 'CircleSize:4', 'OverallDifficulty:7', 'ApproachRate:8.5', `SliderMultiplier:${SM}`, 'SliderTickRate:2', '',
      '[Events]', `2,${bs},${be}`, '', '[TimingPoints]', `${ms(LEAD_IN)},${(bt).toFixed(6)},4,${arr === 'chip' ? 2 : 1},0,70,1,0`, ...kiaiPts, '',
      '[Colours]', ...(arr === 'chip' ? ['Combo1 : 255,92,92', 'Combo2 : 92,220,255', 'Combo3 : 255,214,64', 'Combo4 : 140,255,110'] : ['Combo1 : 255,192,0', 'Combo2 : 0,202,0', 'Combo3 : 18,124,255', 'Combo4 : 242,24,57']), '',
      '[HitObjects]', ...lines, ''].join('\r\n');
  }

  T.osusong = { BPM, BEAT, BAR, BARS, LEAD_IN, SONG, SECTIONS, score, render, chipHitsounds, beatmap };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osusong;
})(typeof globalThis !== 'undefined' ? globalThis : this);

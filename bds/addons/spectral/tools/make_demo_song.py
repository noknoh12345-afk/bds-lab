#!/usr/bin/env python3
"""Render an original demo piece (no third-party material) to exercise every layer
of the spectral player: drums (transients + noise), bass, sustained pad chords,
a vibrato lead melody and a bell arpeggio.  Output: 44.1 kHz stereo WAV/MP3."""
import numpy as np, subprocess, sys, os
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 112
BEAT = 60.0 / BPM
BARS = 10
DUR = BARS * 4 * BEAT + 1.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

def add(sig, t0, pan=0.0, gain=1.0):
    i0 = int(t0 * SR); i1 = min(N, i0 + len(sig))
    if i1 <= i0: return
    s = sig[: i1 - i0] * gain
    L[i0:i1] += s * np.sqrt(0.5 * (1 - pan)); R[i0:i1] += s * np.sqrt(0.5 * (1 + pan))

def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))

def bp(x, lo, hi, order=4):
    sos = butter(order, [lo, hi], btype='band', fs=SR, output='sos'); return sosfilt(sos, x)
def hp(x, f, order=4):
    sos = butter(order, f, btype='high', fs=SR, output='sos'); return sosfilt(sos, x)

# ---------- drums ----------
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = np.exp(-t * 900) * rng.standard_normal(n) * 0.25
    return (np.sin(ph) * np.exp(-t * 7.5) + click) * 0.9
def snare():
    n = int(0.3 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    noise = bp(rng.standard_normal(n), 1200, 9000) * np.exp(-t * 18) * 0.7
    return body + noise
def hat(open_=False):
    n = int((0.35 if open_ else 0.06) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (9 if open_ else 70)) * 0.35

# ---------- tones ----------
def tone(freq, dur, harm, vib=0.0, vib_rate=5.5, env=None, detune=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * (1 + vib * np.sin(2 * np.pi * vib_rate * t) * np.clip(t / 0.25, 0, 1))
    out = np.zeros(n)
    for k, a in harm:
        for d in ((0.0,) if detune == 0 else (-detune, detune)):
            out += a * np.sin(2 * np.pi * np.cumsum(f * k * (1 + d)) / SR + rng.uniform(0, 6.28))
    if env is not None: out *= env
    return out

prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
melody = [  # (bar, beat, midi, beats)
    (2, 0, 76, 1), (2, 1, 74, 0.5), (2, 1.5, 72, 0.5), (2, 2, 69, 2),
    (3, 0, 72, 1), (3, 1, 74, 1), (3, 2, 76, 1.5), (3, 3.5, 77, 0.5),
    (4, 0, 79, 2), (4, 2, 76, 1), (4, 3, 74, 1),
    (5, 0, 74, 1.5), (5, 1.5, 72, 0.5), (5, 2, 71, 2),
    (6, 0, 76, 1), (6, 1, 79, 1), (6, 2, 81, 2),
    (7, 0, 79, 0.5), (7, 0.5, 77, 0.5), (7, 1, 76, 1), (7, 2, 72, 2),
    (8, 0, 74, 1), (8, 1, 72, 1), (8, 2, 71, 1), (8, 3, 67, 1),
    (9, 0, 69, 4),
]

for bar in range(BARS):
    root, chord = prog[bar % 4]
    t_bar = bar * 4 * BEAT
    # drums from bar 1
    if bar >= 1:
        for b in range(4):
            tb = t_bar + b * BEAT
            if b in (0, 2): add(kick(), tb, 0, 0.9)
            if b == 2 and bar % 2 == 1: add(kick(), tb + BEAT * 0.75, 0, 0.6)
            if b in (1, 3): add(snare(), tb, 0.05, 0.75)
            for h in range(2):
                add(hat(open_=(b == 3 and h == 1)), tb + h * BEAT / 2, 0.35, 0.8 if h == 0 else 0.55)
    # bass (8ths)
    if bar >= 1:
        for e in range(8):
            n = root - 12 if e not in (3, 7) else root - 12 + 12
            d = BEAT / 2 * 0.92
            add(tone(midi(n), d, [(1, 1), (2, 0.45), (3, 0.25), (4, 0.12)], env=env_adsr(int(d * SR), 0.004, 0.12, 0.5, 0.03)), t_bar + e * BEAT / 2, -0.1, 0.32)
    # pad chords
    d = 4 * BEAT
    for n in chord:
        add(tone(midi(n), d, [(1, 1), (2, 0.3), (3, 0.12)], detune=0.003, env=env_adsr(int(d * SR), 0.35, 0.3, 0.75, 0.4)), t_bar, -0.4 if n == chord[0] else 0.4, 0.075)
    # bell arpeggio (bars 4..9)
    if 4 <= bar <= 9:
        for s in range(8):
            n = chord[s % 3] + 12 + (12 if s >= 6 else 0)
            dd = 0.6
            add(tone(midi(n), dd, [(1, 1), (2.76, 0.35), (5.4, 0.12)], env=np.exp(-np.arange(int(dd * SR)) / SR * 7)), t_bar + s * BEAT / 2, 0.55, 0.11)

for bar, beat, n, beats in melody:
    d = beats * BEAT * 0.97
    add(tone(midi(n), d, [(1, 1), (3, 0.11), (5, 0.04), (2, 0.08)], vib=0.006, env=env_adsr(int(d * SR), 0.02, 0.1, 0.8, 0.08)), bar * 4 * BEAT + beat * BEAT, -0.15, 0.30)

mix = np.stack([L, R], 1)
mix *= 0.89 / np.max(np.abs(mix))
out = sys.argv[1] if len(sys.argv) > 1 else 'demo'
wavfile.write(out + '.wav', SR, (mix * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out + '.wav', '-b:a', '192k', out + '.mp3'], check=True)
print('wrote', out + '.wav', out + '.mp3', f'{DUR:.1f}s')

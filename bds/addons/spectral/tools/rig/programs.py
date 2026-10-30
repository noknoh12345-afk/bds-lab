#!/usr/bin/env python3
"""Calibration programs: what the add-on plays (/spectral:calib <id>) so that a recording of a real client shows how it
plays SoundInstances. The same JSON drives the add-on (src/calib_programs.ts, written by `programs.py --ts`) and the
analysis (tools/rig/analyze.py), so the two never disagree about what was sent when.

Program: {id, title, ticks, slots: [[event, loop]], steps: [[tick, op, slot, a, b]]}
  op: play (a = volume, b = pitch) | pitch (a) | vol (a) | fade (a = seconds, b = volume) | seek (a = seconds) | stop |
      click (the sync click, slot unused)
Every program starts with clicks at ticks 0, 4, 8 and has one every SYNC_EVERY ticks and three at the end: the analysis
fits sample = offset + rate * tick through them (and their spread is the one-shot start jitter).
"""
import json, math, os, sys

SYNC_EVERY = 40
F_OSC = 1760.0          # spectral.osc


def program(pid, title, body_ticks, slots, steps):
    st = [[0, 'click', 0, 0, 0], [4, 'click', 0, 0, 0], [8, 'click', 0, 0, 0]]
    t0 = 20                       # the body starts here
    for s in steps:
        st.append([s[0] + t0] + list(s[1:]) + [0] * (5 - len(s)))
    end = t0 + body_ticks + 10
    for t in range(t0, end, SYNC_EVERY):
        if t > 8:
            st.append([t, 'click', 0, 0, 0])
    st += [[end, 'click', 0, 0, 0], [end + 4, 'click', 0, 0, 0], [end + 8, 'click', 0, 0, 0]]
    # at the end every slot stops
    st += [[end + 10, 'stop', i, 0, 0] for i in range(len(slots))]
    st.sort(key=lambda s: (s[0], s[1] != 'click'))
    return {'id': pid, 'title': title, 'ticks': end + 12, 'body': t0, 'slots': slots, 'steps': st}


def voices():
    """one more sine every 5 ticks at its own frequency (110 Hz * 1.04^i, 70 cents apart) up to 128, equal level;
    then a second ramp where each new voice is 0.3 dB louder than the one before: which ones go when the limit is passed"""
    n = 128
    slots = [['spectral.osc', 1] for _ in range(2 * n)]
    steps = []
    for i in range(n):
        f = 110.0 * 1.04 ** i
        steps.append([i * 5, 'play', i, 0.012, f / F_OSC])
    t = n * 5 + 20
    steps += [[t, 'stop', i] for i in range(n)]
    t += 20
    for i in range(n):              # newest = loudest here: 'quietest first' and 'newest refused' part ways
        f = 110.0 * 1.04 ** i
        steps.append([t + i * 5, 'play', n + i, 0.012 * 10 ** (-0.3 * (n - 1 - i) / 20), f / F_OSC])
    return program('voices', 'voice limit and which voices go first', t + n * 5 + 20, slots, steps)


FADES = [0.0, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4]


def fade():
    """1 kHz sine: fade 1 -> 0.1 and back for each duration (8 ticks apart): the shape (linear in amplitude or in dB)
    and the shortest fade the client really does"""
    slots = [['spectral.osc', 1]]
    steps = [[0, 'play', 0, 0.5, 1000 / F_OSC]]
    t = 10
    for d in FADES:
        steps.append([t, 'fade', 0, d, 0.05]); t += 12
        steps.append([t, 'fade', 0, d, 0.5]); t += 12
    return program('fade', 'fade shape and the shortest fade', t, slots, steps)


def timing():
    """voice A steps 1000 <-> 1500 Hz every tick, voice B steps 0.4 <-> 0.1 every tick (3 kHz), for 200 ticks: when each
    tick's commands land, how the landing times spread, and whether two commands of one tick land together"""
    slots = [['spectral.osc', 1], ['spectral.osc', 1]]
    steps = [[0, 'play', 0, 0.3, 1000 / F_OSC], [0, 'play', 1, 0.4, 3000 / F_OSC]]
    for k in range(10, 210):
        steps.append([k, 'pitch', 0, (1500 if k % 2 else 1000) / F_OSC])
        steps.append([k, 'vol', 1, 0.1 if k % 2 else 0.4])
    return program('timing', 'when commands land (per tick, spread, together)', 220, slots, steps)


SEEKS = [0.0, 0.1234, 0.25, 0.5, 0.731, 0.9]


def seek():
    """the chirp loop (1 s, 500 -> 4500 -> 500 Hz) seeked to known positions; then the one-shot chirp started and seeked
    at once: where it lands (frequency gives the position, phase the fine part) and how long it takes"""
    slots = [['spectral.chirp', 1]] + [['spectral.chirp1', 0] for _ in SEEKS]
    steps = [[0, 'play', 0, 0.4, 1.0]]
    t = 20
    for p in SEEKS:
        steps.append([t, 'seek', 0, p]); t += 20
    steps.append([t, 'stop', 0]); t += 10
    for i, p in enumerate(SEEKS):
        steps.append([t, 'play', 1 + i, 0.4, 1.0])
        steps.append([t, 'seek', 1 + i, p]); t += 24
    return program('seek', 'seekTo on a loop and on a one-shot', t, slots, steps)


PITCHES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0]
BASES = [('spectral.osc', 1760.0), ('spectral.osc220', 220.0), ('spectral.osc7040', 7040.0)]


def pitch():
    """each base sine at each pitch for 10 ticks: frequency error and spurious tones (resampler, aliasing)"""
    slots = [[ev, 1] for ev, _ in BASES]
    steps = []
    t = 0
    for i, (ev, f0) in enumerate(BASES):
        steps.append([t, 'play', i, 0.3, PITCHES[0]])
        for p in PITCHES:
            steps.append([t, 'pitch', i, p]); t += 10
        steps.append([t, 'stop', i]); t += 6
    return program('pitch', 'setPitch range: accuracy and distortion per base sound', t, slots, steps)


def stereo():
    """left-only and right-only sines (is3D false): do the channels stay apart"""
    slots = [['spectral.oscL', 1], ['spectral.oscR', 1]]
    steps = [[0, 'play', 0, 0.4, 1000 / F_OSC], [30, 'play', 1, 0.4, 1500 / F_OSC], [60, 'stop', 0], [90, 'stop', 1]]
    return program('stereo', 'stereo files keep left and right', 100, slots, steps)


LEVELS = [0.005, 0.01, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5]


def mixer():
    """16 sines summed, every level for 10 ticks (the sum's peak goes past 1): clip, limiter or compressor; then the
    same sine in the ui, music and record categories"""
    k = 16
    slots = [['spectral.osc', 1] for _ in range(k)] + [['spectral.osc', 1], ['spectral.osc_music', 1], ['spectral.osc_record', 1]]
    steps = []
    for i in range(k):
        steps.append([0, 'play', i, LEVELS[0], (300 * 1.17 ** i) / F_OSC])
    t = 5
    for v in LEVELS:
        for i in range(k):
            steps.append([t, 'vol', i, v])
        t += 10
    steps += [[t, 'stop', i] for i in range(k)]
    t += 5
    for j in range(3):
        steps.append([t, 'play', k + j, 0.3, 1000 / F_OSC]); t += 10
        steps.append([t, 'stop', k + j]); t += 5
    return program('mixer', 'summing: clip / limiter / compressor, and category levels', t, slots, steps)


COUNTS = [16, 32, 64, 128]
TP_F0, TP_DF = 300.0, 120.0      # 128 sines 120 Hz apart: each one's level step can be timed to a few ms


def throughput():
    """128 sines (300 Hz + 120 Hz * i); in one tick n of them step their level (n = 16 .. 128, then 128 level + 128 pitch commands):
    do all of one tick's commands land in the same audio block"""
    n = 128
    slots = [['spectral.osc', 1] for _ in range(n)]
    steps = [[i // 16, 'play', i, 0.01, (TP_F0 + TP_DF * i) / F_OSC] for i in range(n)]
    t = 20
    for c in COUNTS:
        for i in range(c):
            steps.append([t, 'vol', i, 0.02])
        t += 10
        for i in range(c):
            steps.append([t, 'vol', i, 0.01])
        t += 10
    for i in range(n):
        steps.append([t, 'vol', i, 0.02]); steps.append([t, 'pitch', i, (TP_F0 + TP_DF * i + 20) / F_OSC])
    t += 10
    return program('throughput', 'how many commands one tick can carry', t, slots, steps)


ALL = [voices, fade, timing, seek, pitch, stereo, mixer, throughput]


def build():
    return [f() for f in ALL]


def main():
    progs = build()
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, 'programs.json')
    json.dump(progs, open(out, 'w'), separators=(',', ':'))
    if '--ts' in sys.argv:
        ts = os.path.join(here, '..', '..', 'src', 'calib_programs.ts')
        with open(ts, 'w') as f:
            f.write('// generated by tools/rig/programs.py (do not edit): the calibration programs of /spectral:calib\n')
            f.write('export type Step = [number, string, number, number, number];\n')
            f.write('export interface Program { id: string; title: string; ticks: number; body: number; slots: [string, number][]; steps: Step[]; }\n')
            f.write('const programs: Program[] = ' + json.dumps(progs, separators=(',', ':')) + ';\nexport default programs;\n')
    for p in progs:
        per = {}
        for s in p['steps']:
            per[s[0]] = per.get(s[0], 0) + 1
        print(f"{p['id']:11s} {p['ticks'] / 20:6.1f} s  {len(p['slots']):3d} slots  {len(p['steps']):5d} steps  max {max(per.values()):3d}/tick  — {p['title']}")


if __name__ == '__main__':
    main()

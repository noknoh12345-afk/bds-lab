#!/usr/bin/env python3
"""The rig's analysis against clients whose behaviour we chose: render the real bundle's calibration logs with the
emulator under a hidden spec, add noise and a random start, and check tools/rig/analyze.py finds the spec again.
  python3 tests/test_rig.py            (needs tools/sim/log_calib_*.json: node tools/sim/run_calib.mjs <program>)"""
import json, os, sys
import numpy as np
UNIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(UNIT, 'tools', 'rig'))
import analyze as A, synth as Y, programs as P

PROGS = {p['id']: p for p in P.build()}
HIDDEN = dict(latency_ms=83.0, jitter_ms=3.0, frame_ms=16.667, block=256, fade_shape='db', fade_min_ms=10.0,
              max_voices=48, mix='clip', stereo='keep', category_gain_db={'ui': 0.0, 'music': -6.0, 'record': -3.0})
fails = []


def check(name, ok, got):
    print(f"{'✔' if ok else '✘'} {name}: {got}")
    if not ok:
        fails.append(name)


def run(prog, **over):
    x = Y.synth(prog, seed=3, lead_s=1.37, **over)
    return A.analyse(x, PROGS[prog])


r = run('fade')
check('ideal client: fade is linear', r['fade']['shape'] == 'linear', r['fade']['shape'])
check('ideal client: 400 ms fade measures 400 ms', abs(r['fade']['steps'][-1]['measured_s'] - 0.4) < 0.01, r['fade']['steps'][-1]['measured_s'])
r = run('fade', **HIDDEN)
check('hidden: fade is dB-linear', r['fade']['shape'] == 'db', r['fade']['shape'])
check('hidden: shortest fade 10 ms', 7 <= (r['fade']['fade_min_ms'] or 0) <= 14, r['fade']['fade_min_ms'])
check('hidden: grid tick 50 ms', abs(r['grid']['tick_ms'] - 50) < 0.2, round(r['grid']['tick_ms'], 3))
r = run('timing', **HIDDEN)
t = r['timing']
# landings: latency 83 ms is common to clicks and commands (cancels), jitter 3 ms + 16.7 ms frames + 256-sample blocks spread them
check('hidden: commands of one tick land together', abs(t['pitch_minus_volume_ms']['mean']) < 1.0 and t['pitch_minus_volume_ms']['std'] < 1.0, t['pitch_minus_volume_ms'])
check('hidden: landing spread seen (3 ms jitter + 16.7 ms frames)', 3.0 < t['volume_lands_ms']['std'] < 9.0, t['volume_lands_ms'])
r = run('timing')
check('ideal client: landings within 0.5 ms', r['timing']['volume_lands_ms']['p95'] - r['timing']['volume_lands_ms']['p5'] < 0.5, r['timing']['volume_lands_ms'])
r = run('stereo', **HIDDEN)
check('hidden: stereo kept', r['stereo']['separation_dB'] > 40, r['stereo']['separation_dB'])
r = run('stereo', stereo='mono')
check('folded client: stereo lost', r['stereo']['separation_dB'] < 3, r['stereo']['separation_dB'])
r = run('mixer', **HIDDEN)
check('hidden: mixer clips', r['mixer']['behaviour'] == 'clip', r['mixer']['behaviour'])
check('hidden: category levels', abs(r['mixer']['category_db']['music'] + 6) < 0.7 and abs(r['mixer']['category_db']['record'] + 3) < 0.7, r['mixer']['category_db'])
r = run('mixer')
check('ideal client (clip at 1.0 too): the sum of 16 x 0.5 clips', r['mixer']['behaviour'] == 'clip', r['mixer']['behaviour'])
r = run('voices', **HIDDEN)
check('hidden: voice limit 48', abs(r['voices']['limit'] - 48) <= 1, r['voices']['limit'])
check('hidden: quietest go first', r['voices']['policy'] is not None and 'quietest' in r['voices']['policy'], r['voices']['policy'])
r = run('voices')
check('ideal client: all 128 voices', r['voices']['limit'] >= 127, r['voices']['limit'])
r = run('pitch', resampler='linear')
pts = [p for p in r['pitch']['points'] if 'found_hz' in p]
worst = max(abs(p['error_cents']) for p in pts if p['expected_hz'] >= 50)
check('pitch: frequencies within 2 cents (50 Hz and up; lower is the window\'s resolution)', worst < 2.0, worst)
spurs = {(p['event'], p['pitch']): p['spur_db'] for p in pts}
check('linear resampler: spurs at pitch 10 of the 1760 Hz loop below -40 dB', spurs.get(('spectral.osc', 10.0), 0) < -40, spurs.get(('spectral.osc', 10.0)))
r = run('seek', **HIDDEN)
s = r['seek']
check('hidden: loop seek lands (late by about the frame/block)', s['loop_summary'] and abs(s['loop_summary']['late_ms_mean']) < 25, s['loop_summary'])
r = run('throughput', **HIDDEN)
c = r['throughput']['counts']
check('hidden: 128 commands of one tick land within one frame', all(x['spread_ms'] < 17 for x in c), [(x['commands'], x['spread_ms']) for x in c])
print(f"\n{len(fails)} failed" if fails else '\nall passed')
sys.exit(1 if fails else 0)

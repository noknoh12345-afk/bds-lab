#!/usr/bin/env python3
"""A recording of a client that does not exist: the calibration log of the real bundle (tools/sim/run_calib.mjs)
rendered by the client emulator with chosen ("hidden") behaviour, plus room noise and a random start. tests check that
tools/rig/analyze.py finds the hidden behaviour again from the audio alone.
  python3 tools/rig/synth.py <program> <out.wav> [key=value ...]   (spec keys of tools/emu/client.py)"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools', 'emu'))
import client as E


def synth(program, seed=1, lead_s=0.73, noise_db=-70.0, **over):
    log = json.load(open(os.path.join(UNIT, 'tools', 'sim', f'log_calib_{program}.json')))
    spec, _ = E.load_spec(path='/nonexistent', **over)
    y = E.render(log, spec, seed=seed)
    rng = np.random.default_rng(seed)
    y = np.concatenate([np.zeros((int(lead_s * 48000), 2)), y])        # the recorder started earlier than the game
    y += rng.normal(0, 10 ** (noise_db / 20), y.shape)
    return y


if __name__ == '__main__':
    kw = {}
    for a in sys.argv[3:]:
        k, v = a.split('=', 1)
        try:
            v = json.loads(v)
        except Exception:
            pass
        kw[k] = v
    y = synth(sys.argv[1], **kw)
    from scipy.io import wavfile
    wavfile.write(sys.argv[2], 48000, np.clip(y, -1, 1).astype(np.float32))

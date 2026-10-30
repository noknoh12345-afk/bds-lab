#!/usr/bin/env python3
"""Score systems on the test songs (corpus/manifest.json) against the original MP3 excerpt.

  python3 tools/eval.py <system> [<system> ...] [--songs a,b] [--jobs 2] [--no-visqol]

Systems (renders are cached in corpus/renders/<system>/<song>.wav, results in corpus/results/<system>.json):
  ceiling_ogg8   the original as an OGG Vorbis q8 sound played as it is (the emulated "ceiling")
  v1_preview     tools/spectral.py as shipped (48 voices), offline preview renderer (the add-on's tick rules)
  others         registered by tools/systems.py (each: song -> 48 kHz mono float signal)
Every number here is an EMULATOR number unless the system's name says it is a recording (rec_*).
"""
import argparse, json, os, sys, time, warnings
import numpy as np
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, 'metrics'))
import corpus as C
import metrics as MT

UNIT = os.path.dirname(HERE)
RENDERS = os.path.join(UNIT, 'corpus', 'renders')
RESULTS = os.path.join(UNIT, 'corpus', 'results')


def wav_write(path, x, sr=48000):
    from scipy.io import wavfile
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wavfile.write(path, sr, np.asarray(x, np.float32))


def wav_read(path):
    from scipy.io import wavfile
    sr, x = wavfile.read(path)
    return np.asarray(x, np.float64)


def render(system, song):
    path = os.path.join(RENDERS, system, song + '.wav')
    if os.path.exists(path):
        return wav_read(path)
    import systems
    t0 = time.time()
    y = systems.SYSTEMS[system](song)
    wav_write(path, y)
    json.dump({'seconds': round(time.time() - t0, 2)}, open(path + '.json', 'w'))
    return y


def score(args):
    system, song, do_visqol = args
    ref = C.load(song, 48000)
    y = render(system, song)
    r = MT.report(ref, y, do_visqol=do_visqol)
    meta_p = os.path.join(RENDERS, system, song + '.wav.json')
    if os.path.exists(meta_p):
        r.update({k: v for k, v in json.load(open(meta_p)).items() if k != 'seconds'})
    return system, song, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('systems', nargs='+'); ap.add_argument('--songs'); ap.add_argument('--jobs', type=int, default=2)
    ap.add_argument('--no-visqol', action='store_true')
    a = ap.parse_args()
    songs = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
    tasks = [(s, g, not a.no_visqol) for s in a.systems for g in songs]
    os.makedirs(RESULTS, exist_ok=True)
    out = {s: (json.load(open(os.path.join(RESULTS, s + '.json'))) if os.path.exists(os.path.join(RESULTS, s + '.json')) else {}) for s in a.systems}
    if a.jobs > 1:
        from multiprocessing import Pool
        with Pool(a.jobs) as pool:
            it = pool.imap_unordered(score, tasks)
            for system, song, r in it:
                out[system][song] = r; print(json.dumps({'system': system, 'song': song, **r}), flush=True)
                json.dump(out[system], open(os.path.join(RESULTS, system + '.json'), 'w'), indent=1)
    else:
        for t in tasks:
            system, song, r = score(t)
            out[system][song] = r; print(json.dumps({'system': system, 'song': song, **r}), flush=True)
            json.dump(out[system], open(os.path.join(RESULTS, system + '.json'), 'w'), indent=1)
    for s in a.systems:
        v = [out[s][g]['visqol'] for g in songs if 'visqol' in out[s].get(g, {})]
        if v:
            print(f'{s}: ViSQOL median {np.median(v):.3f} mean {np.mean(v):.3f} min {np.min(v):.3f}')


if __name__ == '__main__':
    main()

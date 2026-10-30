#!/usr/bin/env python3
"""web/core.js and tools/spectral.py must give the same song data, byte for byte: run both on every test song.
  python3 tools/parity.py [--analysis v2|v1] [--songs a,b] [--voices 48]"""
import argparse, base64, json, os, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import corpus as C, spectral as S


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--analysis', default='v2'); ap.add_argument('--songs'); ap.add_argument('--voices', type=int, default=48)
    ap.add_argument('--opts', default='{}', help='the converter\'s options for both (JSON, e.g. {"residual": "fit", "salience": "erb"})')
    a = ap.parse_args()
    ids = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
    bad = 0
    with tempfile.TemporaryDirectory() as d:
        for i in ids:
            path = C.excerpt_path(i)
            f32 = os.path.join(d, i + '.f32')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(S.SR), f32], check=True)
            js = subprocess.Popen(['node', os.path.join(HERE, 'parity_run.cjs'), f32, str(a.voices), a.analysis, os.path.join(d, i + '.js.json'), a.opts])
            t0 = time.time()
            x, meta, blob, stats = S.convert(path, a.voices, title='t', artist='', analysis=a.analysis, **json.loads(a.opts))
            meta['id'] = 't'
            tp = time.time() - t0
            js.wait()
            j = json.load(open(os.path.join(d, i + '.js.json')))
            pb = base64.b64encode(blob).decode()
            same = pb == j['data']
            mdiff = [k for k in meta if meta[k] != j['meta'].get(k)]
            nd = 0
            if not same:
                jb = base64.b64decode(j['data'])
                nd = sum(1 for p, q in zip(blob, jb) if p != q) + abs(len(blob) - len(jb))
            bad += (not same) or bool(mdiff)
            print(json.dumps({'song': i, 'identical': same, 'meta_diff': mdiff, 'bytes': len(blob), 'differing_bytes': nd,
                              'noise_py': stats.get('noise_bands'), 'noise_js': j['stats'].get('noiseBands'), 'bursts_py': stats.get('burst_bands'), 'bursts_js': j['stats'].get('burstBands'),
                              'py_s': round(tp, 1), 'js_s': round(j['ms'] / 1000, 1)}), flush=True)
    print(f"parity {a.analysis}: {len(ids) - bad}/{len(ids)} identical")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

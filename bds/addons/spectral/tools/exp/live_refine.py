"""How much would the converter's analysis by synthesis (tools/spectral.py refine_client) add to a live encoding? A live song
(tools/live/encoder.mjs --song) refined offline — the whole song, its future included, as the converter refines — and written as
another song for score_pack.py. An upper bound for a refinement the live encoder could do as it goes (emulated, not recordings).
The live frames lag the converter's by 28.7 ms (each is the 2048 samples before the frame's end: its centre 1024 samples before
the end, the converter's frames are centred on their time), so the original is taken that much later.
  cd tools/exp && python3 live_refine.py <song id> <live song.json> <out song.json> [sweeps 5] [level dB 10] [lag samples at 44.1 kHz, 1265 = 28.7 ms]"""
import sys, os, json, base64
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import spectral as SP

if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    sid, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    sweeps = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    level = float(sys.argv[5]) if len(sys.argv) > 5 else 10.0
    song = json.load(open(src))
    meta = song['meta']; blob = base64.b64decode(song['data'])
    F, N, M = meta['frames'], meta['voices'], len(meta['noise'])
    tail = SP.song_tail(meta)
    fq, am, att, nz, ev = SP.decode(blob, F, N, M, tail)
    fd = meta['fd']; vd = blob[len(blob) - tail: len(blob) - tail + fd['v']]; nzd = blob[len(blob) - fd['nz']:]
    vc, nc = SP.unpack2(vd, F, N), SP.unpack2(nzd, F, M)
    x = C.load(sid, SP.SR)                    # (the converter's rate, 44.1 kHz: refine_client's bands and ticks are in it)
    # (samples at that rate: the live frame's centre, 1024 of 48 kHz before its end, against the converter's, on its time)
    lag = int(sys.argv[6]) if len(sys.argv) > 6 else int(round((2400 - 1024) / 48000 * SP.SR))
    x = np.concatenate([x[lag:], np.zeros(lag)]) if lag >= 0 else np.concatenate([np.zeros(-lag), x[:lag]])
    info = {}
    am2, vc2, nz2, nc2 = SP.refine_client(x, fq, am, vc, nz, nc, 1.0, n_voices=N, level_db=level, sweeps=sweeps, weights='svr', info=info, hold=True)
    blob2, stats = SP.encode(fq, am2, att, nz2, [], 1.0)
    vd2, nzd2 = SP.pack2(vc2), SP.pack2(nc2)
    meta2 = dict(meta); meta2['fd'] = {'ms': fd['ms'], 'v': len(vd2), 'nz': len(nzd2)}; meta2['id'] = meta['id'] + '_r'
    json.dump({'meta': meta2, 'data': base64.b64encode(blob2 + vd2 + nzd2).decode()}, open(out, 'w'))
    print(json.dumps({'song': sid, 'loss': info.get('refine_loss'), 'changes': info.get('refine_changes'), 'db': info.get('refine_db')}))

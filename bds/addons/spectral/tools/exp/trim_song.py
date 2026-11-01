"""A song (format 2) with fewer voices and noise bands: what a listener gets when several streams share a phone's 32 sounds — the
first `voices` voices (a live stream's are in the encoder's slots: a voice that starts takes the lowest free one, the strongest
peaks first; a converted song's are the most energetic first) and the noise bands kept (`bands`: how many from the bottom, or
which ones, "2-7" / "1,3,5"; the others silent), the rest byte for byte as they were (all voices and bands kept: the same data).
For score_pack.py (emulated, not a recording).
  cd tools/exp && python3 trim_song.py <in.song.json> <out.song.json> <voices> [bands]"""
import sys, os, json, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import spectral as SP


def trim(song, voices, bands=None):
    meta = song['meta']; blob = base64.b64decode(song['data'])
    F, N, M = meta['frames'], meta['voices'], len(meta['noise'])
    n = max(1, min(N, int(voices)))
    keep = set(range(M)) if bands is None else set(range(min(M, int(bands)))) if str(bands).isdigit() else \
        {j for part in str(bands).split(',') for j in (range(int(part.split('-')[0]), int(part.split('-')[1]) + 1) if '-' in part else [int(part)])}
    tail = SP.song_tail(meta)
    nb, nb2 = (N + 7) // 8, (n + 7) // 8
    out = bytearray(); p = 0
    for k in range(F):
        mask = blob[p:p + nb]; p += nb
        mask2 = bytearray(nb2); body = bytearray()
        for v in range(N):
            if not (mask[v >> 3] >> (v & 7)) & 1:
                continue
            b = blob[p]; size = 3 if b & 0x7F else 1
            if v < n:
                mask2[v >> 3] |= 1 << (v & 7); body += blob[p:p + size]
            p += size
        out += mask2 + body
        out += bytes(blob[p + j] if j in keep else 0 for j in range(M)); p += M
        ne = blob[p]; out += blob[p:p + 1 + 2 * ne]; p += 1 + 2 * ne
    assert p == len(blob) - tail, (p, len(blob), tail)
    meta2 = dict(meta); meta2['voices'] = n
    fd = meta.get('fd')
    if fd:
        vd = blob[len(blob) - tail: len(blob) - tail + fd['v']]; nzd = blob[len(blob) - fd['nz']:]
        vd2 = SP.pack2(SP.unpack2(vd, F, N)[:, :n]) if n < N else vd
        meta2['fd'] = {'ms': fd['ms'], 'v': len(vd2), 'nz': len(nzd)}
        out += vd2 + nzd
    return {'meta': meta2, 'data': base64.b64encode(bytes(out)).decode()}


if __name__ == '__main__':
    src, dst, v = sys.argv[1], sys.argv[2], int(sys.argv[3])
    b = sys.argv[4] if len(sys.argv) > 4 else None
    s = trim(json.load(open(src)), v, b)
    s['meta']['id'] = os.path.basename(dst).replace('.song.json', '')
    json.dump(s, open(dst, 'w'))
    print(json.dumps({'out': dst, 'voices': s['meta']['voices'], 'bands': b, 'bytes': len(base64.b64decode(s['data']))}))

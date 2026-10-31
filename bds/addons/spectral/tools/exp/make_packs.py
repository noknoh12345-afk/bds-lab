"""songs converted beforehand for a real-client run: the very data the client model scored (exp.song_pack's cache), written
as <out>/<song><suffix>.song.json for app.txt's `audio song <songs> suffix=<suffix> pack=<out>` (tools/rig/songpack.py sends
them as they are: no converter run inside the app run's 40 minutes).

  cd tools/exp && python3 make_packs.py <out dir, from the unit> '<converter options JSON>' <suffix> [song,song,...]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exp import song_pack, U, SONGS

if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    out, conv, suffix = sys.argv[1], json.loads(sys.argv[2] or '{}'), sys.argv[3]
    songs = sys.argv[4].split(',') if len(sys.argv) > 4 and sys.argv[4] else SONGS
    os.makedirs(os.path.join(U, out), exist_ok=True)
    from multiprocessing import Pool
    with Pool(2) as pool:
        paths = pool.starmap(song_pack, [(s, conv or None) for s in songs])
    for s, p in zip(songs, paths):
        j = json.load(open(p))
        meta = {**j['meta'], 'id': s + suffix}
        keep = {k: j.get('stats', {}).get(k) for k in ('refine_loss', 'refine_db', 'noise_bands') if k in j.get('stats', {})}
        with open(os.path.join(U, out, f'{s}{suffix}.song.json'), 'w') as fh:
            json.dump({'meta': meta, 'data': j['data'], 'conv': conv, 'stats': keep}, fh, separators=(',', ':'))
        print(json.dumps({'song': s + suffix, 'bytes': len(j['data']) * 3 // 4, 'from': os.path.basename(p)}), flush=True)

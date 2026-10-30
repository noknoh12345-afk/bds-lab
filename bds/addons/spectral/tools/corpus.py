#!/usr/bin/env python3
"""Test songs for Spectral Player (corpus/manifest.json): self-made, CC0 or CC BY only.

  python3 tools/corpus.py fetch            download each source once (corpus/cache/), cut the 20 s excerpt without
                                           re-encoding (corpus/audio/<id>.mp3) and record sha256 of both in
                                           corpus/lock.json (a later fetch checks them)
  python3 tools/corpus.py list             the songs, their licences and what is fetched
  python3 tools/corpus.py credits          the attribution lines (CC BY needs them wherever the audio is shown)

The excerpt is the "original MP3" of the test: the source's own MP3 frames (ffmpeg -c copy), decoded at 48 kHz for
the metrics. Nothing here is committed except the manifest and the lock (corpus/.gitignore keeps audio out).
"""
import hashlib, json, os, subprocess, sys, time

UNIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(UNIT, 'corpus')
MANIFEST = os.path.join(CORPUS, 'manifest.json')
LOCK = os.path.join(CORPUS, 'lock.json')
CACHE = os.path.join(CORPUS, 'cache')
AUDIO = os.path.join(CORPUS, 'audio')


def manifest():
    return json.load(open(MANIFEST, encoding='utf-8'))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def excerpt_path(song_id):
    return os.path.join(AUDIO, song_id + '.mp3')


def fetch(only=None):
    m = manifest()
    os.makedirs(CACHE, exist_ok=True); os.makedirs(AUDIO, exist_ok=True)
    lock = json.load(open(LOCK)) if os.path.exists(LOCK) else {}
    dur = m['excerpt_seconds']
    for s in m['songs']:
        if only and s['id'] not in only:
            continue
        src = os.path.join(CACHE, s['id'] + '.src.mp3')
        if s['url'] == 'selfmade:demo':
            if not os.path.exists(src):
                base = os.path.join(CACHE, 'demo')
                subprocess.run([sys.executable, os.path.join(UNIT, 'tools', 'make_demo_song.py'), base], check=True, capture_output=True)
                os.replace(base + '.mp3', src)
                os.remove(base + '.wav')
        elif not os.path.exists(src):
            for attempt in range(4):        # CDNs answer 403/429 to quick successive requests now and then
                r = subprocess.run(['curl', '-sSfL', '-m', '300', '-o', src + '.part', s['url']])
                if r.returncode == 0:
                    break
                time.sleep(5 * (attempt + 1))
            else:
                raise SystemExit(f"{s['id']}: cannot download {s['url']}")
            os.replace(src + '.part', src)
            time.sleep(1)
        h = sha256(src)
        want = lock.get(s['id'], {}).get('source_sha256')
        if want and want != h and s['url'] != 'selfmade:demo':
            raise SystemExit(f"{s['id']}: the source changed (sha256 {h[:12]}… ≠ locked {want[:12]}…)")
        out = excerpt_path(s['id'])
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(s['start']), '-t', str(dur), '-i', src,
                        '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1', out], check=True)
        info = probe(out)
        lock[s['id']] = {'source_sha256': h, 'excerpt_sha256': sha256(out), **info}
        print(json.dumps({'id': s['id'], **info}, ensure_ascii=False))
    json.dump(lock, open(LOCK, 'w'), indent=1, ensure_ascii=False)


def probe(path):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels,bit_rate:format=duration,bit_rate',
                                   '-of', 'json', path], check=True, capture_output=True, text=True).stdout)
    st = j['streams'][0]
    # the decoded length (a VBR file's header estimate can be far off)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-'], check=True, capture_output=True).stdout
    secs = len(pcm) / 2 / int(st['sample_rate'])
    return {'seconds': round(secs, 2), 'sample_rate': int(st['sample_rate']), 'channels': int(st['channels']),
            'kbps': round(os.path.getsize(path) * 8 / secs / 1000)}


def load(song_id, sr=48000, stereo=False):
    """decoded excerpt as float64 (n,) or (n, 2)"""
    import numpy as np
    ch = 2 if stereo else 1
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', excerpt_path(song_id), '-f', 'f32le', '-ac', str(ch), '-ar', str(sr), '-'],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, ch) if stereo else x


def credits():
    lines = []
    for s in manifest()['songs']:
        if s['license'] == 'self-made':
            lines.append(f"{s['title']} — {s['author']} (self-made)")
        else:
            lines.append(f"\"{s['title']}\" — {s['author']}, {s['license']} ({s['license_url']}), source {s['page'] or s['url']}; 20 s excerpt")
    return lines


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'fetch':
        fetch(set(sys.argv[2:]) or None)
    elif cmd == 'credits':
        print('\n'.join(credits()))
    else:
        lock = json.load(open(LOCK)) if os.path.exists(LOCK) else {}
        for s in manifest()['songs']:
            print(f"{s['id']:24s} {s['category']:40s} {s['license']:10s} {'fetched' if os.path.exists(excerpt_path(s['id'])) else '-'} {lock.get(s['id'], {}).get('kbps', '')}")


if __name__ == '__main__':
    main()

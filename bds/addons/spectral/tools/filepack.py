#!/usr/bin/env python3
"""A song as itself — mp3's quality, not sine waves: an add-on (a resource pack with the song's audio, a behaviour pack that
tells Spectral Player it is there) that plays the recording as it is, with seek, pause and the 3D speaker of the player.

The parts are 48 kHz (--rate). Measured on the phone (p03, run 41475752440: 13 songs, the recording itself as one sound at 24 kHz
cut at 11.5 kHz against the same at 48 kHz, in one run): the two came out with the same spectrum (1/3-octave bands within 0.8 dB,
nothing folded into the middle that the 24 kHz one did not have) but ViSQOL 3.090 at 48 kHz against 2.709 at 24 kHz (median; 10
songs of 13 better at 48 kHz). So 48 kHz it is; --rate 24000 makes the old 24 kHz parts (and --hi then adds a 48 kHz set).

The song is cut into parts of about --part seconds at its quietest moments near each cut (a part is one sound: the game keeps it
in memory); the parts overlap by X ms with the fades written in, and the add-on starts each in the tick before it is due with
seekTo into the part's 0.6 s of leading silence (src/files.ts), so they meet to the millisecond inside the tick.

  python3 tools/filepack.py <audio> [--id x] [--title "…"] [--artist "…"] [--part 30] [--rate 48000|24000] [--hi] [--quality 5]
        [--out dir] [--unit dir]
    -> <out>/<id>.mcaddon (and with --unit a lab unit folder bds/addons/<name> with bp/ and rp/ for an app run)"""
import argparse, json, os, subprocess, sys, tempfile, uuid, zipfile
import numpy as np

LEAD = 0.6
X_MS = 80


def decode(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def lowpass(x, sr, hz):
    from scipy.signal import butter, sosfiltfilt
    return sosfiltfilt(butter(10, hz, 'lp', fs=sr, output='sos'), x, axis=0)


def cuts(x, sr, part_s):
    """part boundaries (samples): every part_s, moved to the quietest 20 ms within 1.5 s of it"""
    n = len(x)
    if n <= part_s * sr * 1.3:
        return [0, n]
    w = int(0.02 * sr)
    e = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(w) / w, 'same'))
    out = [0]
    t = part_s * sr
    while t < n - part_s * sr * 0.3:
        a, b = int(max(out[-1] + sr, t - 1.5 * sr)), int(min(n - sr, t + 1.5 * sr))
        out.append(a + int(np.argmin(e[a:b])))
        t = out[-1] + part_s * sr
    return out + [n]


def write_ogg(y, sr, path, q):
    import soundfile as sf
    y = np.concatenate([np.zeros((int(LEAD * sr), 2)), y])
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, np.clip(y, -1, 1), sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-c:a', 'libvorbis', '-q:a', str(q), path], check=True)
    os.unlink(t.name)
    return os.path.getsize(path)


def parts_of(x, sr, bounds):
    """the parts with X_MS of overlap at each inner boundary, faded (equal power) in and out there"""
    X = int(X_MS / 1000 * sr)
    out = []
    for k in range(len(bounds) - 1):
        a = bounds[k] - (X // 2 if k else 0)
        b = bounds[k + 1] + (X - X // 2 if k < len(bounds) - 2 else 0)
        y = x[max(0, a): min(len(x), b)].copy()
        if k:
            y[:X] *= np.sin(np.linspace(0, np.pi / 2, X))[:, None]
        if k < len(bounds) - 2:
            y[-X:] *= np.cos(np.linspace(0, np.pi / 2, X))[:, None]
        out.append((max(0, a), y))
    return out


def manifest(name, desc, kind, deps):
    return {'format_version': 2,
            'header': {'name': name, 'description': desc, 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0], 'min_engine_version': [1, 26, 60]},
            'modules': [{'type': 'script', 'language': 'javascript', 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0], 'entry': 'scripts/main.js'}] if kind == 'bp'
            else [{'type': 'resources', 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0]}],
            'dependencies': deps}


def build(audio, sid, title, artist='', part_s=30.0, hi=False, quality=5, work=None, rate=48000):
    """{relative path: bytes} of the RP (rp/...) and BP (bp/...), and the meta the BP announces. rate: the parts' sample rate (48000;
    24000 = cut at 11.5 kHz, the old way, with --hi a 48 kHz set beside it)"""
    work = work or tempfile.mkdtemp()
    sr = int(rate)
    x24 = decode(audio, sr)
    if sr < 48000:
        x24 = lowpass(x24, sr, sr * 0.479)
    peak = np.abs(x24).max() + 1e-12
    x24 *= 0.89 / peak
    bounds = cuts(x24, sr, part_s)
    files, defs, meta_parts = {}, {}, []
    hi = hi and sr < 48000
    x48 = decode(audio, 48000) * (0.89 / peak) if hi else None
    for k, (a, y) in enumerate(parts_of(x24, sr, bounds)):
        p = os.path.join(work, f'{k}.ogg')
        write_ogg(y, sr, p, quality)
        files[f'rp/sounds/spectral_f/{sid}/{k}.ogg'] = open(p, 'rb').read()
        base = f'sounds/spectral_f/{sid}/{k}'
        defs[f'spectral.f.{sid}.{k}'] = {'category': 'ui', 'sounds': [{'name': base, 'is3D': False, 'volume': 1.0}]}
        defs[f'spectral.f.{sid}.{k}_3d'] = {'category': 'record', 'min_distance': 3.0, 'max_distance': 48.0, 'sounds': [{'name': base, 'is3D': True, 'volume': 1.0}]}
        if hi:
            a48, b48 = a * 48000 // sr, (a + len(y)) * 48000 // sr
            yh = x48[a48: b48].copy()
            X = int(X_MS / 1000 * 48000)
            if k:
                yh[:X] *= np.sin(np.linspace(0, np.pi / 2, X))[:, None]
            if k < len(bounds) - 2:
                yh[-X:] *= np.cos(np.linspace(0, np.pi / 2, X))[:, None]
            ph = os.path.join(work, f'{k}h.ogg')
            write_ogg(yh, 48000, ph, quality)
            files[f'rp/sounds/spectral_f/{sid}/{k}h.ogg'] = open(ph, 'rb').read()
            defs[f'spectral.f.{sid}.{k}h'] = {'category': 'ui', 'sounds': [{'name': base + 'h', 'is3D': False, 'volume': 1.0}]}
        meta_parts.append([round(a / sr * 1000, 2), round(len(y) / sr * 1000, 2)])
    meta = {'id': sid, 'title': title, 'artist': artist, 'seconds': round(len(x24) / sr, 3), 'parts': meta_parts, 'x': X_MS, 'hi': hi, 'lead': LEAD, 'rate': sr}
    rpm = manifest(f'{title} (Spectral, as recorded)', f'{title}{" — " + artist if artist else ""}: the recording itself for Spectral Player', 'rp', [])
    bpm = manifest(f'{title} (Spectral song)', f'adds {title} to Spectral Player: /spectral:play {sid}', 'bp',
                   [{'module_name': '@minecraft/server', 'version': '2.11.0'}, {'uuid': rpm['header']['uuid'], 'version': [1, 0, 0]}])
    js = ("// a song as itself for Spectral Player (tools/filepack.py): tells the player its parts; the sounds are in the resource pack\n"
          "import { world, system } from '@minecraft/server';\n"
          f"const META = {json.dumps(meta, ensure_ascii=False)};\n"
          "const send = () => system.sendScriptEvent('spectral:file', JSON.stringify(META));\n"
          "world.afterEvents.worldLoad.subscribe(() => system.runTimeout(send, 10));\n"
          "system.afterEvents.scriptEventReceive.subscribe((e) => { if (e.id === 'spectral:hello') system.runTimeout(send, 2); });\n")
    files['rp/manifest.json'] = json.dumps(rpm, indent=1).encode()
    files['rp/sounds/sound_definitions.json'] = json.dumps({'format_version': '1.20.20', 'sound_definitions': defs}, indent=1).encode()
    files['bp/manifest.json'] = json.dumps(bpm, indent=1).encode()
    files['bp/scripts/main.js'] = js.encode()
    return files, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('--id'); ap.add_argument('--title'); ap.add_argument('--artist', default='')
    ap.add_argument('--part', type=float, default=30.0); ap.add_argument('--hi', action='store_true'); ap.add_argument('--quality', type=float, default=5)
    ap.add_argument('--rate', type=int, default=48000, choices=[48000, 24000])
    ap.add_argument('--out', default='.'); ap.add_argument('--unit')
    a = ap.parse_args()
    base = os.path.splitext(os.path.basename(a.audio))[0]
    sid = a.id or ('f_' + ''.join(c if c.isalnum() else '_' for c in base.lower()))[:32]
    files, meta = build(a.audio, sid, a.title or base, a.artist, a.part, a.hi, a.quality, rate=a.rate)
    if a.unit:
        import shutil
        shutil.rmtree(a.unit, ignore_errors=True)
        for name, data in files.items():
            os.makedirs(os.path.dirname(os.path.join(a.unit, name)), exist_ok=True)
            open(os.path.join(a.unit, name), 'wb').write(data)
    os.makedirs(a.out, exist_ok=True)
    out = os.path.join(a.out, f'{sid}.mcaddon')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            top, rest = name.split('/', 1)
            z.writestr(f"{meta['title'][:40]} {'RP' if top == 'rp' else 'BP'}/{rest}", data)
    size = sum(len(d) for n, d in files.items() if n.endswith('.ogg'))
    print(json.dumps({'id': sid, 'seconds': meta['seconds'], 'parts': len(meta['parts']), 'audio_kb': round(size / 1024), 'mcaddon': out}, ensure_ascii=False))


if __name__ == '__main__':
    main()

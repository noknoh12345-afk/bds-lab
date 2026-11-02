#!/usr/bin/env python3
"""The built-in file song (piano_file: /spectral:play piano_file): the étude (src/songs/notes_demo.ts) rendered through the bank's
piano here, then made a file song by tools/filepack.py (48 kHz: p03 on the phone) and put in this pack's own resource pack —
rp/sounds/spectral_f/piano_file/ and its sound definitions (tools/make_rp_assets.py keeps spectral.f.* as they are). Prints the
meta src/main.ts announces for it (fileSongs.set('piano_file', …)): it must match.

  python3 tools/make_file_demo.py"""
import json, os, re, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(HERE)
sys.path[:0] = [HERE]
import notes as N
import filepack as FP


def main():
    demo = json.loads(open(os.path.join(UNIT, 'src', 'songs', 'notes_demo.ts')).read().split('export default ', 1)[1].rstrip().rstrip(';'))
    work = tempfile.mkdtemp()
    wav = os.path.join(work, 'etude.wav')
    N.render(N.decode(demo), wav)
    files, meta = FP.build(wav, 'piano_file', 'Piano étude (as recorded)', 'Spectral Player', work=work)
    sounds = os.path.join(UNIT, 'rp', 'sounds', 'spectral_f', 'piano_file')
    shutil.rmtree(sounds, ignore_errors=True)
    os.makedirs(sounds)
    for name, data in files.items():
        if name.startswith('rp/sounds/spectral_f/'):
            open(os.path.join(UNIT, name), 'wb').write(data)
    defs_path = os.path.join(UNIT, 'rp', 'sounds', 'sound_definitions.json')
    defs = json.load(open(defs_path))
    new = json.loads(files['rp/sounds/sound_definitions.json'])['sound_definitions']
    sd = defs['sound_definitions']
    for k in [k for k in sd if k.startswith('spectral.f.piano_file.') and k not in new]:
        del sd[k]
    sd.update(new)                                    # (in place where they were: the file changes only where they did)
    # (written as the bank writes it: compact — tools/samples/bank.py write_defs)
    text = json.dumps(defs, separators=(',', ':'))
    open(defs_path, 'w').write(text)
    src = open(os.path.join(UNIT, 'src', 'main.ts')).read()
    m = re.search(r"fileSongs\.set\('piano_file', \{[^\n]*seconds: ([\d.]+), parts: (\[\[.*?\]\]), x: (\d+)", src)
    said = {'seconds': float(m.group(1)), 'parts': json.loads(m.group(2)), 'x': int(m.group(3))} if m else None
    print(json.dumps({'meta': {k: meta[k] for k in ('seconds', 'parts', 'x', 'hi')}, 'main.ts': said,
                      'same': bool(said) and said['seconds'] == meta['seconds'] and said['parts'] == meta['parts'] and said['x'] == meta['x'],
                      'kb': round(sum(len(d) for n, d in files.items() if n.endswith('.ogg')) / 1024)}, ensure_ascii=False))


if __name__ == '__main__':
    main()

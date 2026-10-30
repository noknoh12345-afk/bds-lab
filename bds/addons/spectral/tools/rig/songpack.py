#!/usr/bin/env python3
"""Song pack and "ceiling" pack for recording the test songs on a real client.

  python3 tools/rig/songpack.py [--songs a,b] [--out dist/rig]
    -> <out>/Spectral Songs (rig).mcpack   a behaviour pack that hands every corpus song to Spectral Player
                                           (the same script event as the converter page's song packs)
    -> <out>/Spectral Ceiling.mcpack       a resource pack with each original excerpt as an OGG sound
                                           (sound event spectral_ceiling.<id>, category ui, 2D) and a behaviour script
                                           that plays one on /scriptevent spectral:ceiling <id>
The ceiling is the original played as an ordinary game sound through the same client and recorder: the best any
in-game playback can be (ViSQOL of the song's recording is judged against it).
"""
import argparse, base64, io, json, os, subprocess, sys, uuid, zipfile
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools'))
import corpus as C
import spectral as S


def convert(song_id, voices=48):
    x, meta, blob, stats = S.convert(C.excerpt_path(song_id), voices, title=song_id, artist='corpus')
    meta['id'] = song_id
    return {'meta': meta, 'data': base64.b64encode(blob).decode()}


def manifest(name, desc, kind, deps):
    return {'format_version': 2,
            'header': {'name': name, 'description': desc, 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0], 'min_engine_version': [1, 26, 60]},
            'modules': [{'type': 'script', 'language': 'javascript', 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0], 'entry': 'scripts/main.js'}] if kind == 'bp'
            else [{'type': 'resources', 'uuid': str(uuid.uuid4()), 'version': [1, 0, 0]}],
            'dependencies': deps}


def zipdir(files, path):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def fetched(song_id):
    """the corpus excerpt, fetched (tools/corpus.py) when it is not here yet; corpus's own lines go to stderr"""
    p = C.excerpt_path(song_id)
    if not os.path.exists(p):
        import contextlib
        with contextlib.redirect_stdout(sys.stderr):
            C.fetch({song_id})
    return p


def parts(song_id, voices=48, size=1800):
    """a test song as the server console's script events for Spectral Player (the app run's `audio song <id>`): spectral:song
    messages of at most `size` characters (/scriptevent takes 2048) — the first carries the meta, each a slice of the data"""
    fetched(song_id)
    s = convert(song_id, voices)
    meta, data = s['meta'], s['data']
    msg = lambda i, n, chunk, m=None: json.dumps({'id': song_id, 'i': i, 'n': n, **({'meta': m} if m else {}), 'data': chunk}, separators=(',', ':'))
    room = size - len(msg(999, 999, ''))
    first = size - len(msg(999, 999, '', meta))
    if first < 200:
        raise SystemExit(f'{song_id}: the meta alone takes {size - first} of {size} characters')
    chunks = [data[:first]] + [data[k: k + room] for k in range(first, len(data), room)]
    out = [msg(i, len(chunks), c, meta if i == 0 else None) for i, c in enumerate(chunks)]
    assert all(len(m) <= size for m in out) and ''.join(chunks) == data
    return {'id': song_id, 'parts': out, 'bytes': len(base64.b64decode(data)), 'seconds': meta.get('seconds'),
            'kbps': round(len(base64.b64decode(data)) * 8 / max(1e-9, meta.get('seconds') or 1) / 1000, 1)}


def write_unit(unit_dir, ids):
    """the ceiling as a lab unit (bp/ + rp/, plain JS: bds/addons/<name>) for an app run's `addon <name>`: the BDS restarted
    with it and the game joined again, `/scriptevent spectral:ceiling <id>` plays that original excerpt as an ordinary sound
    to every player — category ui, 2D, the headphones' own path. Made where the run is (the excerpts are never committed)"""
    import shutil
    shutil.rmtree(unit_dir, ignore_errors=True)
    snd = os.path.join(unit_dir, 'rp', 'sounds', 'spectral_ceiling')
    os.makedirs(snd); os.makedirs(os.path.join(unit_dir, 'bp', 'scripts'))
    defs, size = {}, 0
    for i in ids:
        f = os.path.join(snd, i + '.ogg')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', fetched(i), '-ar', '48000', '-c:a', 'libvorbis', '-q:a', '8', f], check=True)
        size += os.path.getsize(f)
        defs[f'spectral_ceiling.{i}'] = {'category': 'ui', 'sounds': [{'name': f'sounds/spectral_ceiling/{i}', 'is3D': False, 'volume': 1.0, 'stream': True}]}
    rpm = manifest('Spectral Ceiling RP', 'the test songs as plain sounds (the ceiling)', 'rp', [])
    bpm = manifest('Spectral Ceiling', 'plays a test song as a plain sound: /scriptevent spectral:ceiling <id>', 'bp',
                   [{'module_name': '@minecraft/server', 'version': '2.11.0'}, {'uuid': rpm['header']['uuid'], 'version': [1, 0, 0]}])
    files = {'rp/manifest.json': json.dumps(rpm, indent=1),
             'rp/sounds/sound_definitions.json': json.dumps({'format_version': '1.20.20', 'sound_definitions': defs}, indent=1),
             'bp/manifest.json': json.dumps(bpm, indent=1),
             'bp/scripts/main.js': ("// the ceiling (bds/addons/spectral/tools/rig/songpack.py --unit): the original excerpt as an ordinary game sound\n"
                                    "import { world, system } from '@minecraft/server';\n"
                                    "system.afterEvents.scriptEventReceive.subscribe((e) => {\n"
                                    "  if (e.id !== 'spectral:ceiling') return;\n"
                                    "  const ps = world.getAllPlayers();\n"
                                    "  for (const p of ps) p.playSound('spectral_ceiling.' + e.message, { volume: 1 });\n"
                                    "  console.warn(`[spectral ceiling] ${e.message} to ${ps.length} player(s)`);\n"
                                    "});\n")}
    for name, text in files.items():
        with open(os.path.join(unit_dir, name), 'w', encoding='utf-8') as fh:
            fh.write(text)
    return {'unit': unit_dir, 'songs': ids, 'mb': round(size / 1e6, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--songs'); ap.add_argument('--out', default=os.path.join(UNIT, 'dist', 'rig')); ap.add_argument('--voices', type=int, default=48)
    ap.add_argument('--parts', help='one song as console script events (JSON: parts, bytes, seconds, kbps)')
    ap.add_argument('--unit', help='write the ceiling as a lab unit folder (bds/addons/<name>) for the songs')
    ap.add_argument('--json', help='--parts: write the JSON here instead of printing it')
    a = ap.parse_args()
    if a.parts:
        res = json.dumps(parts(a.parts, a.voices), ensure_ascii=False)
        if a.json:
            open(a.json, 'w', encoding='utf-8').write(res)
        else:
            print(res)
        return
    ids = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
    if a.unit:
        print(json.dumps(write_unit(a.unit, ids), ensure_ascii=False))
        return
    os.makedirs(a.out, exist_ok=True)
    songs = [convert(i, a.voices) for i in ids]
    script = ('// Spectral Player song pack (test songs, tools/rig/songpack.py)\n'
              "import { world, system } from '@minecraft/server';\n"
              f'const SONGS = {json.dumps(songs, separators=(",", ":"))};\n'
              "function send() { for (const s of SONGS) system.sendScriptEvent('spectral:song', JSON.stringify({ id: s.meta.id, i: 0, n: 1, meta: s.meta, data: s.data })); }\n"
              'world.afterEvents.worldLoad.subscribe(() => system.runTimeout(send, 10));\n'
              "system.afterEvents.scriptEventReceive.subscribe((e) => { if (e.id === 'spectral:hello') system.runTimeout(send, 2); });\n")
    zipdir({'manifest.json': json.dumps(manifest('Spectral Songs (rig)', 'test songs: ' + ', '.join(ids), 'bp', [{'module_name': '@minecraft/server', 'version': '2.11.0'}]), indent=1),
            'scripts/main.js': script}, os.path.join(a.out, 'Spectral Songs (rig).mcpack'))
    # ceiling: the originals as sounds
    rp, defs = {}, {}
    for i in ids:
        ogg = subprocess.run(['ffmpeg', '-v', 'error', '-i', C.excerpt_path(i), '-ar', '48000', '-c:a', 'libvorbis', '-q:a', '8', '-f', 'ogg', '-'],
                             check=True, capture_output=True).stdout
        rp[f'sounds/spectral_ceiling/{i}.ogg'] = ogg
        defs[f'spectral_ceiling.{i}'] = {'category': 'ui', 'sounds': [{'name': f'sounds/spectral_ceiling/{i}', 'is3D': False, 'volume': 1.0, 'stream': True}]}
    rpm = manifest('Spectral Ceiling RP', 'the test songs as plain sounds (the ceiling)', 'rp', [])
    rp['manifest.json'] = json.dumps(rpm, indent=1)
    rp['sounds/sound_definitions.json'] = json.dumps({'format_version': '1.20.20', 'sound_definitions': defs}, indent=1)
    bp_script = ("import { world, system } from '@minecraft/server';\n"
                 "system.afterEvents.scriptEventReceive.subscribe((e) => {\n"
                 "  if (e.id !== 'spectral:ceiling') return;\n"
                 "  for (const p of world.getAllPlayers()) { system.sendScriptEvent('spectral:sync', '1'); p.playSound('spectral.sync', { volume: 1 }); system.runTimeout(() => p.playSound('spectral_ceiling.' + e.message, { volume: 1 }), 20); }\n"
                 "});\n")
    bpm = manifest('Spectral Ceiling', 'plays a test song as a plain sound: /scriptevent spectral:ceiling <id>', 'bp',
                   [{'module_name': '@minecraft/server', 'version': '2.11.0'}, {'uuid': rpm['header']['uuid'], 'version': [1, 0, 0]}])
    zipdir(rp, os.path.join(a.out, 'Spectral Ceiling RP.mcpack'))
    zipdir({'manifest.json': json.dumps(bpm, indent=1), 'scripts/main.js': bp_script}, os.path.join(a.out, 'Spectral Ceiling.mcpack'))
    print(json.dumps({'out': a.out, 'songs': ids, 'files': sorted(os.listdir(a.out))}, ensure_ascii=False))


if __name__ == '__main__':
    main()

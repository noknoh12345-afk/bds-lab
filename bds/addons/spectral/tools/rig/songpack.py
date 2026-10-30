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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--songs'); ap.add_argument('--out', default=os.path.join(UNIT, 'dist', 'rig')); ap.add_argument('--voices', type=int, default=48)
    a = ap.parse_args()
    ids = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
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

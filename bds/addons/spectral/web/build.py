import base64, json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'converter.html')).read()
core = open(os.path.join(here, 'core.js')).read()
song = json.load(open(sys.argv[1]))
mp3 = base64.b64encode(open(sys.argv[2], 'rb').read()).decode()
addon = base64.b64encode(open(sys.argv[3], 'rb').read()).decode()
# the game's own sound in the page: the add-on's bundle with the recording mock (web/build_engine.mjs), the worker that plays
# it through the measured client model (web/game.js), and the RP's sound files the client plays, decoded to 16 bits
import subprocess
unit = os.path.dirname(here)
subprocess.run(['node', os.path.join(here, 'build_engine.mjs'), os.path.join(here, 'dist', 'engine.js')], check=True)
engine = open(os.path.join(here, 'dist', 'engine.js')).read()
game = open(os.path.join(here, 'game.js')).read()
defs = json.load(open(os.path.join(unit, 'rp', 'sounds', 'sound_definitions.json')))['sound_definitions']
rp = {}
for name in ['osc'] + [f'n{b}' for b in range(8)] + [f'b{b}_{s}' for b in range(3) for s in range(4)]:
    f = os.path.join(unit, 'rp', defs['spectral.' + name]['sounds'][0]['name'] + '.ogg')
    sr = int(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', f], check=True, capture_output=True, text=True).stdout.strip())
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 's16le', '-ac', '1', '-'], check=True, capture_output=True).stdout
    rp[name] = [sr, base64.b64encode(pcm).decode()]
js = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')   # (no '</script' in the page's scripts)
out = (src.replace('/*CORE*/', core).replace('/*DEMO_SONG*/', json.dumps(song, separators=(',', ':'), ensure_ascii=False)).replace('/*DEMO_MP3*/', mp3)
       .replace('/*ADDON_B64*/', addon).replace('/*ENGINE_SRC*/', js(engine)).replace('/*GAME_SRC*/', js(game)).replace('/*RP_PCM*/', js(rp)))
for k in ('/*ADDON_B64*/', '/*CORE*/', '/*DEMO_SONG*/', '/*DEMO_MP3*/', '/*ENGINE_SRC*/', '/*GAME_SRC*/', '/*RP_PCM*/'):
    assert k not in out, k
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
open(os.path.join(here, 'dist', 'index.html'), 'w').write(out)
print('dist/index.html', len(out) // 1024, 'KB')

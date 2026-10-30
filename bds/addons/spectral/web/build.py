import base64, json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'converter.html')).read()
core = open(os.path.join(here, 'core.js')).read()
song = json.load(open(sys.argv[1]))
mp3 = base64.b64encode(open(sys.argv[2], 'rb').read()).decode()
addon = base64.b64encode(open(sys.argv[3], 'rb').read()).decode()
out = src.replace('/*CORE*/', core).replace('/*DEMO_SONG*/', json.dumps(song, separators=(',', ':'), ensure_ascii=False)).replace('/*DEMO_MP3*/', mp3).replace('/*ADDON_B64*/', addon)
assert '/*ADDON_B64*/' not in out and '/*CORE*/' not in out and '/*DEMO_SONG*/' not in out and '/*DEMO_MP3*/' not in out
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
open(os.path.join(here, 'dist', 'index.html'), 'w').write(out)
print('dist/index.html', len(out) // 1024, 'KB')

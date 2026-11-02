"""The converter page in a real browser (Chromium, Playwright): files of many formats are read and converted, and the song text of
「ゲームで貼り付け」 reads back with the add-on's own decoder.
  python3 tools/test_page.py [web/dist/index.html]        (build it first: python3 web/build.py <song.json> <demo.mp3> <addon>)
Formats: MP3 (the browser's own decoder), AIFF, WAV IMA ADPCM, AU μ-law, CAF IMA4 (web/decoders.js), MIDI (its synthesiser), and WMA,
AC3, WavPack, TTA in Matroska, MP2 in AVI (ffmpeg in WebAssembly: @ffmpeg/core, fetched here by `npm pack` into a cache and served
on localhost as the CDN serves it). Text: SPZ2 (CJK, 15 bits a character) and SPA2 (ASCII) of the demo, decoded by tools/songtext.mjs."""
import sys, os, json, subprocess, tempfile, threading, http.server, functools
from playwright.sync_api import sync_playwright

UNIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(UNIT, 'web', 'dist', 'index.html'))
CORE = '0.12.10'
CACHE = os.path.join(UNIT, 'corpus', 'cache', f'ffmpeg-core-{CORE}')
fails = []
def ok(c, m): print(('✔ ' if c else '✘ ') + m); c or fails.append(m)

# ffmpeg.wasm's core, as the page fetches it from jsdelivr (the same version)
if not os.path.exists(os.path.join(CACHE, 'package', 'dist', 'umd', 'ffmpeg-core.wasm')):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(['npm', 'pack', f'@ffmpeg/core@{CORE}', '--silent'], cwd=CACHE, check=True, capture_output=True)
    subprocess.run(['tar', 'xzf', f'ffmpeg-core-{CORE}.tgz'], cwd=CACHE, check=True)
core = os.path.join(CACHE, 'package', 'dist', 'umd')
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=core, **k)
    def end_headers(s): s.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def log_message(s, *a): pass
Q.extensions_map['.wasm'] = 'application/wasm'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()

tmp = tempfile.mkdtemp(prefix='spectral-page-')
src = os.path.join(tmp, 'src.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*330*t)*exp(-2*mod(t\\,0.5))+0.3*sin(2*PI*495*t):s=44100:d=3', '-ac', '2', src], check=True)
files = []
for ext, args, how in [('mp3', ['-c:a', 'libmp3lame'], 'browser'), ('aiff', ['-c:a', 'pcm_s16be'], 'AIFF'), ('wav', ['-c:a', 'adpcm_ima_wav'], 'WAV (IMA ADPCM)'),
                       ('au', ['-c:a', 'pcm_mulaw'], 'AU'), ('caf', ['-c:a', 'adpcm_ima_qt'], 'CAF (ima4)'), ('wma', ['-c:a', 'wmav2'], 'ffmpeg'),
                       ('ac3', ['-c:a', 'ac3'], 'ffmpeg'), ('wv', ['-c:a', 'wavpack'], 'ffmpeg'), ('mka', ['-c:a', 'tta'], 'ffmpeg')]:
    f = os.path.join(tmp, f'song_{ext}.{ext}'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, *args, f], check=True); files.append((f, how))
f = os.path.join(tmp, 'song_avi.avi')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=d=3:s=160x120', '-i', src, '-c:v', 'mpeg4', '-c:a', 'mp2', '-shortest', f], check=True); files.append((f, 'ffmpeg'))
# a MIDI file: C4, E4, G4 on a piano, a kick drum (format 0)
vlq = lambda x: [x & 127] if x < 128 else [((x >> 7) & 127) | 128, x & 127]
ev = sum([[0, 0xC0, 0], [0, 0x90, 60, 100], [*vlq(480), 0x80, 60, 0], [0, 0x90, 64, 100], [*vlq(480), 0x80, 64, 0], [0, 0x90, 67, 100],
          [*vlq(960), 0x80, 67, 0], [0, 0x99, 36, 120], [*vlq(240), 0x89, 36, 0]], [])
trk = list(b'MTrk') + [0, 0, (len(ev) + 4) >> 8, (len(ev) + 4) & 255] + ev + [0, 0xFF, 0x2F, 0]
f = os.path.join(tmp, 'song_mid.mid'); open(f, 'wb').write(bytes(list(b'MThd') + [0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xE0] + trk)); files.append((f, 'MIDI'))

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1200, 'height': 1400})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(f'window.SPECTRAL_FFMPEG_BASE = {json.dumps(f"http://127.0.0.1:{srv.server_address[1]}")};')
    pg.goto('file://' + PAGE); pg.wait_for_timeout(2500)
    for f, how in files:
        name = os.path.splitext(os.path.basename(f))[0]
        pg.set_input_files('#file', f)
        try:
            pg.wait_for_function("(n) => [...document.querySelectorAll('#tracks .track')].some((e) => e.querySelector('input').value === n && e.querySelector('.chip.ok, .chip.err'))", arg=name, timeout=600000)
        except Exception: pass
        row = pg.evaluate("(n) => { const e = [...document.querySelectorAll('#tracks .track')].find((e) => e.querySelector('input').value === n); return e ? [e.querySelector('.chip').className, (e.querySelector('.msg') || {}).textContent || ''] : null; }", name)
        good = bool(row) and 'ok' in row[0] and (how == 'browser' or how in row[1])
        ok(good, f'{os.path.basename(f)}: {row[1] if row else "no track"} ({"converted" if row and "ok" in row[0] else "not converted"}; read by {how})')
    # 「ゲームで貼り付け」: the demo (the first track) as SPZ2 and as SPA2, each read back by the add-on's decoder
    pg.locator('#tracks .track').nth(0).click(); pg.wait_for_timeout(300)
    for enc in ('cjk', 'ascii'):
        pg.select_option('#pxVoices', '24'); pg.select_option('#pxQ', 'std'); pg.select_option('#pxEnc', enc)
        pg.click('#makeText'); pg.wait_for_timeout(500)
        parts = pg.eval_on_selector_all('#textParts textarea', 'els => els.map(e => e.value)')
        t = os.path.join(tmp, f'text_{enc}.txt'); open(t, 'w').write('\n'.join(parts) + '\n')
        r = subprocess.run(['node', os.path.join(UNIT, 'tools', 'songtext.mjs'), '--decode', t], capture_output=True, text=True)
        tag = 'SPZ2' if enc == 'cjk' else 'SPA2'
        ok(r.returncode == 0 and parts and parts[0].startswith(tag + '.'), f'text {tag}: {len(parts)} part(s), {sum(map(len, parts))} characters → {(r.stderr or r.stdout).strip()[-120:]}')
    b.close()
ok(not errs, f'page errors: {errs or "none"}')
print(f'{"FAIL" if fails else "PASS"} {len(files) + 3 - len(fails)}/{len(files) + 3}')
sys.exit(1 if fails else 0)

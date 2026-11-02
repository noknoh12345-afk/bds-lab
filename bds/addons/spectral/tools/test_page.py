"""The converter page in a real browser (Chromium, Playwright): files of many formats are read and converted, a part of a file is
converted alone and a track splits in two at the playhead, a long file waits for 「変換する」, a removed track's conversion stops,
and the song text of 「ゲームで貼り付け」 reads back with the add-on's own decoder, its parts copied in order.
  python3 tools/test_page.py [web/dist/index.html]        (build it first: python3 web/build.py <song.json> <demo.mp3> <addon>)
Formats: MP3 (the browser's own decoder), AIFF, WAV IMA ADPCM, AU μ-law, CAF IMA4 (web/decoders.js), MIDI (its synthesiser), and WMA,
AC3, WavPack, TTA in Matroska, MP2 in AVI (ffmpeg in WebAssembly: @ffmpeg/core, fetched here by `npm pack` into a cache and served
on localhost as the CDN serves it). Text: SPZ2 (CJK, 15 bits a character) and SPA2 (ASCII), decoded by tools/songtext.mjs."""
import sys, os, json, subprocess, tempfile, threading, http.server, functools, wave
import numpy as np
from playwright.sync_api import sync_playwright

UNIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(UNIT, 'web', 'dist', 'index.html'))
CORE = '0.12.10'
CACHE = os.path.join(UNIT, 'corpus', 'cache', f'ffmpeg-core-{CORE}')
fails, checks = [], [0]
def ok(c, m): checks[0] += 1; print(('✔ ' if c else '✘ ') + m, flush=True); c or fails.append(m)

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

# a long file with many partials gliding and some noise (75 s): it waits for 「変換する」; a part of it converts alone
sr = 44100; tt = np.arange(75 * sr) / sr; rng = np.random.default_rng(1)
y = sum(0.05 * np.sin(2 * np.pi * np.cumsum(110 * (k + 1) * (1 + 0.02 * np.sin(2 * np.pi * (0.1 + 0.05 * k) * tt))) / sr) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * k * tt + k)) for k in range(14))
y = y + 0.02 * rng.standard_normal(len(tt)); y = (y / np.max(np.abs(y)) * 0.8 * 32767).astype('<i2')
longf = os.path.join(tmp, 'long_one.wav')
with wave.open(longf, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes())
def short(name, secs):
    f = os.path.join(tmp, name + '.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'aevalsrc=0.4*sin(2*PI*262*t)+0.3*sin(2*PI*392*t):s=44100:d={secs}', f], check=True); return f

errs = []
TRACK = "(n) => [...document.querySelectorAll('#tracks .track')].find((e) => e.querySelector('input').value === n)"
def info(pg, n):
    """a track by title: its state, the converted length, its range and key (the page's own objects)"""
    return pg.evaluate("(n) => { const t = tracks.find((u) => u.title === n); return t ? { state: t.state, seconds: t.song?.meta?.seconds ?? null, range: t.range ?? null, key: t.key, id: t.id, chip: document.querySelector('#tracks .track:nth-child(' + (tracks.indexOf(t) + 1) + ') .chip').textContent } : null; }", n)
def wait_state(pg, n, states, ms=600000):
    pg.wait_for_function("([n, s]) => { const t = tracks.find((u) => u.title === n); return t && s.includes(t.state); }", arg=[n, states], timeout=ms)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1200, 'height': 1400}); ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page()
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
        pg.select_option('#pxVoices', '24'); pg.select_option('#pxEnc', enc)
        pg.click('#makeText'); pg.wait_for_timeout(500)
        parts = pg.eval_on_selector_all('#textParts textarea', 'els => els.map(e => e.value)')
        t = os.path.join(tmp, f'text_{enc}.txt'); open(t, 'w').write('\n'.join(parts) + '\n')
        r = subprocess.run(['node', os.path.join(UNIT, 'tools', 'songtext.mjs'), '--decode', t], capture_output=True, text=True)
        tag = 'SPZ2' if enc == 'cjk' else 'SPA2'
        ok(r.returncode == 0 and parts and parts[0].startswith(tag + '.'), f'text {tag}: {len(parts)} part(s), {sum(map(len, parts))} characters → {(r.stderr or r.stdout).strip()[-120:]}')

    # a part of a file: 0.5–2.5 s of the AIFF converts alone (2 s)
    n = 'song_aiff'; k = info(pg, n)['key']
    pg.fill(f'#r0{k}', '0:00.5'); pg.dispatch_event(f'#r0{k}', 'change'); pg.fill(f'#r1{k}', '2.5'); pg.dispatch_event(f'#r1{k}', 'change')
    wait_state(pg, n, ['queued', 'busy']); wait_state(pg, n, ['ok', 'err']); r = info(pg, n)
    ok(r['state'] == 'ok' and r['range'] == [0.5, 2.5] and abs(r['seconds'] - 2.0) < 0.06, f'range 0:00.5–2.5 of {n}: {r}')
    # 「ここから」 at the playhead: tapped at half of it (1.5 s into the file) → 1.5–2.5 s; 「全体」 → the whole file again
    pg.evaluate("(n) => select(tracks.find((u) => u.title === n))", n)
    box = pg.locator('#stage').bounding_box(); pg.locator('#stage').click(position={'x': box['width'] * 0.5, 'y': box['height'] * 0.5})
    pg.click('#cutFrom'); wait_state(pg, n, ['ok', 'err']); r = info(pg, n)
    ok(r['state'] == 'ok' and abs(r['range'][0] - 1.5) < 0.02 and r['range'][1] == 2.5 and abs(r['seconds'] - 1.0) < 0.06, f'ここから at 1.5 s: {r}')
    pg.click(f'#all{k}'); wait_state(pg, n, ['ok', 'err']); r = info(pg, n)
    ok(r['state'] == 'ok' and r['range'] is None and abs(r['seconds'] - 3.0) < 0.06, f'全体: the whole file again ({r["seconds"]} s, range {r["range"]})')
    # split at the playhead: the AU (3 s) tapped at 40 % → two tracks, 1.2 s and 1.8 s, each its own ID
    n = 'song_au'; pg.evaluate("(n) => select(tracks.find((u) => u.title === n))", n)
    box = pg.locator('#stage').bounding_box(); pg.locator('#stage').click(position={'x': box['width'] * 0.4, 'y': box['height'] * 0.5})
    pg.click('#cutSplit')
    a, b2 = info(pg, n + ' (1)'), info(pg, n + ' (2)')
    ok(bool(a and b2) and a['id'] != b2['id'], f'split: {a} / {b2} ({pg.text_content("#playMsg")})')
    if a and b2: wait_state(pg, n + ' (1)', ['ok', 'err']); wait_state(pg, n + ' (2)', ['ok', 'err']); a, b2 = info(pg, n + ' (1)'), info(pg, n + ' (2)')
    ok(bool(a and b2) and a['state'] == b2['state'] == 'ok' and abs(a['seconds'] - 1.2) < 0.06 and abs(b2['seconds'] - 1.8) < 0.06 and abs(a['range'][1] - b2['range'][0]) < 1e-9,
       f'split at 40 %: {a["seconds"]} s + {b2["seconds"]} s (ranges {a["range"]} {b2["range"]})')
    # a long file waits; 0:05–1:05 of it (60 s) converts (with no refinement, to be quick)
    pg.select_option('#sweeps', '0')
    pg.set_input_files('#file', longf); n = 'long_one'
    wait_state(pg, n, ['wait', 'err'], 120000); r = info(pg, n); k = r['key']
    btn = pg.locator(f'#go{k}').text_content() if r['state'] == 'wait' else ''
    ok(r['state'] == 'wait' and r['chip'] == '未変換' and '1:15' in btn and '分' in btn, f'a 75 s file waits: chip {r["chip"]}, button "{btn}"')
    pg.fill(f'#r0{k}', '5'); pg.dispatch_event(f'#r0{k}', 'change'); r = info(pg, n)
    ok(r['state'] == 'wait' and r['range'] == [5, 75], f'5–75 s (70 s) still waits: {r["state"]}')
    pg.fill(f'#r1{k}', '1:05'); pg.dispatch_event(f'#r1{k}', 'change')
    wait_state(pg, n, ['ok', 'err']); r = info(pg, n)
    ok(r['state'] == 'ok' and abs(r['seconds'] - 60) < 0.06, f'0:05–1:05 converts at once: {r["seconds"]} s')
    # its text with all 48 voices: parts no longer than the page's limit, read back whole; 「パート i / n をコピー」 copies them in order
    pg.evaluate("(n) => select(tracks.find((u) => u.title === n))", n)
    pg.select_option('#pxVoices', '0'); pg.select_option('#pxEnc', 'cjk'); pg.click('#makeText'); pg.wait_for_timeout(500)
    parts = pg.eval_on_selector_all('#textParts textarea', 'els => els.map(e => e.value)'); limit = pg.evaluate('PART')
    t = os.path.join(tmp, 'text_long.txt'); open(t, 'w').write('\n'.join(parts) + '\n')
    rr = subprocess.run(['node', os.path.join(UNIT, 'tools', 'songtext.mjs'), '--decode', t], capture_output=True, text=True)
    ok(rr.returncode == 0 and len(parts) >= 2 and max(map(len, parts)) <= limit, f'48 voices, 60 s: {len(parts)} parts of at most {max(map(len, parts))} characters (limit {limit}) → {(rr.stderr or rr.stdout).strip()[-100:]}')
    got, labels = [], []
    for i in range(len(parts) + 1):
        labels.append(pg.text_content('#copyNext')); pg.click('#copyNext'); pg.wait_for_timeout(150)
        if i < len(parts): got.append(pg.evaluate('navigator.clipboard.readText()'))
    ok(got == parts and labels[0] == f'パート 1 / {len(parts)} をコピー' and labels[-1] == 'もう一度パート 1 から' and pg.text_content('#copyNext') == f'パート 1 / {len(parts)} をコピー',
       f'copy in order: {len(got)} parts, labels {labels[0]!r} … {labels[-1]!r}')
    # a track removed while it converts stops there: the next one's conversion starts and ends
    pg.select_option('#sweeps', '5')
    pg.set_input_files('#file', [short('slow_one', 40), short('next_one', 2)])
    wait_state(pg, 'slow_one', ['busy'], 120000); pg.wait_for_timeout(1500)
    k = info(pg, 'slow_one')['key']; pg.click(f'#rm{k}')
    try: wait_state(pg, 'next_one', ['ok', 'err'], 90000)
    except Exception: pass
    r = info(pg, 'next_one'); ok(info(pg, 'slow_one') is None and r and r['state'] == 'ok', f'removed while converting: gone, the next converted ({r and r["state"]})')
    b.close()
ok(not errs, f'page errors: {errs or "none"}')
print(f'{"FAIL" if fails else "PASS"} {checks[0] - len(fails)}/{checks[0]}')
sys.exit(1 if fails else 0)

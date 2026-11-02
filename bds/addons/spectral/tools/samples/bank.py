#!/usr/bin/env python3
"""The instrument bank: recorded instruments (CC0: VCSL and VSCO 2 Community Edition by Sam Gossner and the Versilian
Community Sample Library) in rp/sounds/spectral/i/<inst>/<k>.ogg — a note played as a MIDI file asks, no sine waves.

Every sample has LEAD seconds of silence in front of it, so that a note can be placed to the millisecond inside a tick: the
add-on starts it with playSound and, in the same tick, seekTo(LEAD - delay * pitch). A one-shot seeked in the tick it starts
plays from that point (SPEC.md, seekTo), and the commands of one tick land together (1.4 ms), so the delay between the tick
and the note is the file's own silence, not the tick's. Notes of the next few ticks can be started together the same way
(the add-on's bundle) so that the ticks' own spread (sd 7.3 ms) falls only between bundles.

The phone mixes at 24 kHz (SPEC.md: a file is read at 24 kHz, everything over 12 kHz folds), so the bank is 24 kHz: nothing
in it folds on a phone, and a PC plays the same files. 2D sounds keep the samples' stereo; the _3d events play them in the world.

Sound events: spectral.i.<inst>.<k> (2D, category ui) and spectral.i.<inst>.<k>_3d (3D, category record, 48 blocks).
src/bank.ts lists the instruments, their samples (key, velocity layer, length, level) and General MIDI's programs and drums.
sound_definitions.json keeps every other event (tools/make_rp_assets.py keeps these the same way).

  python3 tools/samples/bank.py [--only piano,drums] [--cache <dir>] [--list]
The sources are fetched once (git, only the folders used) into --cache (default ~/.cache/spectral-samples)."""
import argparse, json, os, re, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
SR = 24000
LEAD = 0.6
REPOS = {'VCSL': 'https://github.com/sgossner/VCSL', 'VSCO-2-CE': 'https://github.com/sgossner/VSCO-2-CE'}
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi_of(name):
    """'C4' -> 60, 'A#0' -> 22, 'Db4' -> 61, 'F#7' -> 102"""
    m = re.fullmatch(r'([A-Ga-g])([#b]?)(-?\d)', name)
    if not m:
        return None
    k = PC[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + k


# ------------------------------------------------------------------ the instruments
# source: repo, folder (a glob under it), pattern with the groups note and (optional) layer; layers: the layer names used and
# the velocity each stands for (the samples are normalized: the add-on makes the dynamics from the velocity); maxs: the longest
# a sample is kept (s) at key 21 and at key 108 (in between by the key); release: the fade at note-off (s); sustain: the note
# holds as long as it is held (the sample is relayed from its loop point), else it decays as recorded
INSTRUMENTS = [
    {'id': 'piano', 'name': 'Grand Piano (Steinway B, VCSL)', 'repo': 'VCSL',
     'folder': 'Chordophones/Zithers/Grand Piano, Steinway B/NoSus',
     'pattern': r'JHPiano_NoSus_Close_(?P<note>[A-G]#?\d)_(?P<layer>vl\d)_rr1\.wav',
     'layers': {'vl2': 48, 'vl3': 84, 'vl4': 118}, 'maxs': (7.0, 2.6), 'release': 0.18, 'q': '2', 'stereo': True,
     'gm': list(range(0, 8))},
    # ---- General MIDI's other families (CC0: VSCO 2 CE and VCSL), one velocity layer each (the dynamics from the velocity)
    {'id': 'strings', 'sustain': True, 'name': 'Strings (VSCO 2 CE violin and cello sections)', 'release': 0.25, 'q': '1', 'stereo': True, 'maxs': (6.0, 4.0),
     'sources': [{'repo': 'VSCO-2-CE', 'folder': 'Strings/Violin Section', 'sparse': 'VlnEns_susVib_*_v2.wav', 'pattern': r'VlnEns_susVib_(?P<note>[A-G]#?\d)_v2\.wav', 'from': 55},
                 {'repo': 'VSCO-2-CE', 'folder': 'Strings/Cello Section', 'sparse': 'susvib_*_v1_1.wav', 'pattern': r'susvib_(?P<note>[A-G]#?\d)_v1_1\.wav'}],
     'gm': [40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53, 54, 55, 110]},
    {'id': 'bass', 'name': 'Contrabass pizzicato (VSCO 2 CE)', 'release': 0.12, 'q': '1', 'maxs': (3.0, 2.0),
     'repo': 'VSCO-2-CE', 'folder': 'Strings/Solo Contrabass/Pizz', 'sparse': 'BKCtbss_Pizz_*_v1_rr1.wav', 'pattern': r'BKCtbss_Pizz_(?P<note>[A-G]#?\d)_v1_rr1\.wav',
     'gm': list(range(32, 40))},
    {'id': 'harp', 'name': 'Harp (VSCO 2 CE)', 'release': 0.6, 'q': '1', 'stereo': True, 'maxs': (5.0, 2.5),
     'repo': 'VSCO-2-CE', 'folder': 'Strings/Harp', 'sparse': 'KSHarp_*_mf.wav', 'pattern': r'KSHarp_(?P<note>[A-G]#?\d)_mf\.wav', 'gm': [45, 46, 104, 105, 106, 107]},
    {'id': 'guitar', 'name': 'Strumstick, finger-picked (VCSL)', 'release': 0.3, 'q': '1', 'maxs': (4.0, 2.5),
     'repo': 'VCSL', 'folder': 'Chordophones/Composite Chordophones/Strumstick/Finger', 'sparse': '*_vl2_rr1.wav',
     'pattern': r'Strumstick_Finger_Str\d_Main_(?P<note>[A-G]#?\d)_vl2_rr1\.wav', 'gm': [15] + list(range(24, 32))},
    {'id': 'organ', 'sustain': True, 'name': 'Pipe organ (VCSL, Rode)', 'release': 0.08, 'q': '1', 'stereo': True, 'maxs': (4.0, 3.0),
     'repo': 'VCSL', 'folder': 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud', 'pattern': r'Rode_Man3Open_(?P<note>[A-G]#?\d)\.wav', 'gm': list(range(16, 24))},
    {'id': 'trumpet', 'sustain': True, 'name': 'Trumpet (VSCO 2 CE)', 'release': 0.15, 'q': '1', 'maxs': (4.0, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Brass/Trumpet', 'sparse': 'Sum_SHTrumpet_susvib_*_v2_rr1.wav', 'pattern': r'Sum_SHTrumpet_susvib_(?P<note>[A-G]#?\d)_v2_rr1\.wav',
     'gm': [56, 59, 61, 62, 63]},
    {'id': 'horn', 'sustain': True, 'name': 'French horn (VSCO 2 CE)', 'release': 0.2, 'q': '1', 'maxs': (4.0, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Brass/F Horn', 'sparse': 'MOHorn_sus_*_v1_1.wav', 'pattern': r'MOHorn_sus_(?P<note>[A-G]#?\d)_v1_1\.wav', 'gm': [60]},
    {'id': 'trombone', 'sustain': True, 'name': 'Tenor trombone (VSCO 2 CE)', 'release': 0.15, 'q': '1', 'maxs': (4.0, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Brass/Tenor Trombone', 'sparse': 'tenortbn_sus_*_v2_1.wav', 'pattern': r'tenortbn_sus_(?P<note>[A-G]#?\d)_v2_1\.wav', 'gm': [57]},
    {'id': 'tuba', 'sustain': True, 'name': 'Tuba (VSCO 2 CE)', 'release': 0.15, 'q': '1', 'maxs': (4.0, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Brass/Tuba/sus', 'sparse': 'Tuba3_sus_*_v1_rr1_Mid.wav', 'pattern': r'Tuba3_sus_(?P<note>[A-G]#?\d)_v1_rr1_Mid\.wav', 'gm': [58]},
    {'id': 'sax', 'sustain': True, 'name': 'Tenor saxophone (VCSL)', 'release': 0.12, 'q': '1', 'maxs': (3.5, 3.0),
     'repo': 'VCSL', 'folder': 'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato', 'sparse': '*_vl2_rr1.wav',
     'pattern': r'BrettTenor_NV_Main_(?P<note>[A-G]#?\d)_vl2_rr1\.wav', 'gm': [64, 65, 66, 67]},
    {'id': 'oboe', 'sustain': True, 'name': 'Oboe (VSCO 2 CE)', 'release': 0.1, 'q': '1', 'maxs': (3.5, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Woodwinds/Oboe/Sus', 'sparse': 'Oboe_Sus_*_v3_Main.wav', 'pattern': r'Oboe_Sus_(?P<note>[A-G]#?\d)_v3_Main\.wav', 'gm': [68, 69, 109, 111]},
    {'id': 'bassoon', 'sustain': True, 'name': 'Bassoon (VSCO 2 CE)', 'release': 0.1, 'q': '1', 'maxs': (3.5, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Woodwinds/Bassoon/sus', 'sparse': 'PSBassoon_*_v2_1.wav', 'pattern': r'PSBassoon_(?P<note>[A-G]#?\d)_v2_1\.wav', 'gm': [70]},
    {'id': 'clarinet', 'sustain': True, 'name': 'Clarinet (VSCO 2 CE)', 'release': 0.1, 'q': '1', 'maxs': (3.5, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Woodwinds/Clarinet', 'sparse': 'DCClar_susLong_*_v2_rr1_sum.wav', 'pattern': r'DCClar_susLong_(?P<note>[A-G]#?\d)_v2_rr1_sum\.wav', 'gm': [71]},
    {'id': 'flute', 'sustain': True, 'name': 'Flute (VSCO 2 CE)', 'release': 0.1, 'q': '1', 'maxs': (3.5, 3.0),
     'repo': 'VSCO-2-CE', 'folder': 'Woodwinds/Flute', 'sparse': 'LDFlute_susNV_*_v1_1.wav', 'pattern': r'LDFlute_susNV_(?P<note>[A-G]#?\d)_v1_1\.wav', 'gm': list(range(72, 80))},
    {'id': 'vibes', 'name': 'Vibraphone, hard mallets (VCSL)', 'release': 0.5, 'q': '1', 'maxs': (4.0, 2.5),
     'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets', 'sparse': 'Vibes_hard_*_v2_rr1_Main.wav',
     'pattern': r'Vibes_hard_(?P<note>[A-G]#?\d)_v2_rr1_Main\.wav', 'gm': [8, 11]},
    {'id': 'marimba', 'name': 'Marimba (VCSL)', 'release': 0.3, 'q': '1', 'maxs': (2.5, 1.5),
     'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Marimba', 'sparse': 'Marimba_hit_Outrigger_*_med_01.wav',
     'pattern': r'Marimba_hit_Outrigger_(?P<note>[A-G]#?\d)_med_01\.wav', 'gm': [12, 108, 114]},
    {'id': 'xylo', 'name': 'Xylophone (VSCO 2 CE)', 'release': 0.2, 'q': '1', 'maxs': (1.5, 1.0),
     'repo': 'VSCO-2-CE', 'folder': 'Percussion/Xylo', 'pattern': r'Xylo_Medium_(?P<note>[A-G]#?\d)_ff_01_far\.wav', 'gm': [13, 115]},
    {'id': 'glock', 'name': 'Glockenspiel (VSCO 2 CE)', 'release': 0.6, 'q': '1', 'maxs': (3.0, 2.0),
     'repo': 'VSCO-2-CE', 'folder': 'Percussion/Glock', 'pattern': r'glock_medium_(?P<note>[A-G]#?\d)\.wav', 'gm': [9, 10, 112]},
    {'id': 'chimes', 'name': 'Tubular bells (VCSL)', 'release': 1.0, 'q': '1', 'maxs': (5.0, 4.0),
     'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Tubular Bells 1', 'pattern': r'chimes_(?P<note>[A-G]#?\d)_(?:f|ff|mf)_rr1\.wav', 'gm': [14]},
    {'id': 'drums', 'name': 'Drum kit (VCSL)', 'release': 0.05, 'q': '1', 'maxs': (2.5, 2.5), 'gm': [],
     'kit': [([35, 36], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Bass Drum 1'}, 'BDrumNew_hit_v3_rr1_Sum.wav'),
             ([38, 40], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Snare Drum, Modern 1'}, 'Snare2_HitNS_v4_rr1_Mid.wav'),
             ([37], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Claves'}, 'Claves1_Hit_v2_rr1_Mid.wav'),
             ([39], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Claps'}, 'Clap_rr1.wav'),
             ([42, 44], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Hi-Hat Cymbal'}, 'HiHat_HitC_v2_rr1_Mid.wav'),
             ([46], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Hi-Hat Cymbal'}, 'HiHat_HitO_rr1_Mid.wav'),
             ([41, 43, 45], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Legacy Toms'}, 'tenor_lower/tenor_f_rr1.wav'),
             ([47, 48, 50], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Legacy Toms'}, 'tenor_higher/tenorH_f_rr1.wav'),
             ([49, 52, 55, 57], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Suspended Cymbal 1'}, 'susCymb1_hit_f1.wav'),
             ([51, 53, 59], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Suspended Cymbal 1'}, 'susCymb1_hit_stick_mp1.wav'),
             ([54], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Tambourine 1'}, 'Tamb1_Hit_v2_rr1_Mid.wav'),
             ([56], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Cowbells'}, 'Cowbell1_Hit_v3_rr1_Mid.wav'),
             ([60, 62], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Bongos'}, 'BongoH_Hit1_v2_rr1_Mid.wav'),
             ([61, 63, 64], {'repo': 'VCSL', 'folder': 'Membranophones/Struck Membranophones/Conga'}, 'Conga_HitN_v2_rr1_Sum.wav'),
             ([67, 68], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Agogo Bells'}, 'Agogo_High_v2_rr1_Mid.wav'),
             ([69], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Cabasa'}, 'Cabasa1_Hit_rr1_Mid.wav'),
             ([70, 82], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Shaker, Small'}, 'Mid_ShakerDouble_Down_rr1.wav'),
             ([73, 74], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Guiro'}, 'Guiro_Hit_rr1_Mid.wav'),
             ([75], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Claves'}, 'Claves2_Hit_v2_rr1_Mid.wav'),
             ([76, 77], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Woodblock'}, 'wood_click_f_rr1.wav'),
             ([80, 81], {'repo': 'VCSL', 'folder': 'Idiophones/Struck Idiophones/Triangles'}, 'Legacy/1/triangle1_hit_mp.wav')]},
    # a click for measuring (made here, no source): 1.5 ms of noise in a Hann window over a 2 kHz ping of 4 ms — an onset
    # sharp to a sample. General MIDI's wood blocks (drum keys 76, 77) play it
    {'id': 'click', 'name': 'Click (measuring)', 'gen': 'click', 'release': 0.01, 'q': '4', 'stereo': False,
     'drums': {34: 0}},
]


def gen(kind):
    rng = np.random.default_rng(1)
    if kind == 'click':
        n = int(0.0015 * SR)
        y = np.zeros(int(0.03 * SR))
        y[:n] = rng.uniform(-1, 1, n) * np.hanning(n)
        t = np.arange(int(0.004 * SR)) / SR
        y[: len(t)] += 0.6 * np.sin(2 * np.pi * 2000 * t) * np.exp(-t / 0.0012)
        return [(60, 100, y[:, None] / np.abs(y).max() * 0.89)]
    raise ValueError(kind)


def fetch(cache, src):
    """the source's folder, its files checked out (only those `sparse` names, a glob under the folder: the rest are never fetched)"""
    repo = os.path.join(cache, src['repo'])
    if not os.path.isdir(os.path.join(repo, '.git')):
        os.makedirs(cache, exist_ok=True)
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', REPOS[src['repo']], repo], check=True)
        subprocess.run(['git', '-C', repo, 'sparse-checkout', 'init', '--no-cone'], check=True)
    if subprocess.run(['git', '-C', repo, 'config', 'core.sparseCheckout'], capture_output=True, text=True).stdout.strip() != 'true':
        subprocess.run(['git', '-C', repo, 'sparse-checkout', 'init', '--no-cone'], check=True)
    have = subprocess.run(['git', '-C', repo, 'sparse-checkout', 'list'], capture_output=True, text=True).stdout.split('\n')
    want = src['folder'].rstrip('/') + '/**/' + src['sparse'] if src.get('sparse') else src['folder'].rstrip('/') + '/*'
    if want not in have and src['folder'].rstrip('/') + '/*' not in have:
        subprocess.run(['git', '-C', repo, 'sparse-checkout', 'add', want], check=True)
        subprocess.run(['git', '-C', repo, 'checkout', '-q', 'HEAD'], check=True)
    return os.path.join(repo, src['folder'])


def sources(inst):
    """an instrument's sources: its own repo/folder/pattern, or a list (sources), each with keys only below / from a key"""
    if inst.get('sources'):
        return [{'layers': inst.get('layers'), **x} for x in inst['sources']]
    return [{k: inst[k] for k in ('repo', 'folder', 'pattern', 'layers', 'sparse') if k in inst}]


def read(path):
    import soundfile as sf
    from scipy.signal import resample_poly
    from math import gcd
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        g = gcd(SR, sr)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    return x


def trim(x, key, inst):
    """from just before the attack (the first sample over -36 dB of the peak, less 1 ms) to where the sound has fallen 54 dB
    or the longest kept for its key, faded out over the last part"""
    env = np.abs(x).max(1)
    peak = env.max()
    i0 = max(0, int(np.argmax(env > peak * 10 ** (-36 / 20))) - SR // 1000)
    a, b = inst['maxs']
    maxs = a + (b - a) * min(1, max(0, (key - 21) / 87))
    w = SR // 100
    rms = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(w) / w, 'same'))
    loud = np.where(rms > peak * 10 ** (-54 / 20))[0]
    i1 = min(len(x), int(loud[-1]) + w if len(loud) else len(x), i0 + int(maxs * SR))
    y = x[i0:i1].copy()
    nf = min(int(0.3 * SR), len(y) // 5)
    if nf > 0:
        y[-nf:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nf)))[:, None]
    return y


def encode(y, out, q, stereo):
    import soundfile as sf
    y = np.concatenate([np.zeros((int(LEAD * SR), y.shape[1])), y])
    if not stereo or y.shape[1] == 1:
        y = y.mean(1, keepdims=True)
    rng = np.random.default_rng(0)
    pcm = np.clip(np.round(y * 32767 + rng.uniform(-0.5, 0.5, y.shape) + rng.uniform(-0.5, 0.5, y.shape)), -32768, 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, pcm, SR, subtype='PCM_16')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-c:a', 'libvorbis', '-q:a', q, out], check=True)
    os.unlink(t.name)
    return os.path.getsize(out)


def build(inst, cache):
    if inst.get('gen'):
        rows, total = [], 0
        for i, (k, v, y) in enumerate(gen(inst['gen'])):
            out = os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', inst['id'], f'{i}.ogg')
            total += encode(y, out, inst.get('q', '1'), False)
            rows.append([k, v, int(round(len(y) / SR * 1000)), round(float(np.sqrt((y ** 2).mean())), 4)])
        return {'id': inst['id'], 'name': inst['name'], 'release': inst['release'], 'sustain': False, 'stereo': False,
                'samples': rows, 'gm': inst.get('gm', []), 'drums': inst.get('drums')}, total
    found = []
    if inst.get('kit'):
        # a drum kit: (General MIDI keys, source, file) — one sample each, every key of it plays it
        for keys, src, f in inst['kit']:
            folder = fetch(cache, src)
            found.append((keys[0], 100, os.path.join(folder, f)))
    for src in ([] if inst.get('kit') else sources(inst)):
        folder = fetch(cache, src)
        pat = re.compile(src['pattern'])
        have = {k for k, _, _ in found}
        for dp, _, fs in os.walk(folder):
            for f in sorted(fs):
                m = pat.fullmatch(f)
                if not m:
                    continue
                layer = m.groupdict().get('layer') or ''
                if src.get('layers') and layer not in src['layers']:
                    continue
                key = midi_of(m.group('note')) if m.groupdict().get('note') else 60
                if key is None or key in have or key >= src.get('below', 999) or key < src.get('from', -1):
                    continue
                found.append((key, src['layers'].get(layer, 100) if src.get('layers') else 100, os.path.join(dp, f)))
    if not found:
        raise SystemExit(f"{inst['id']}: no samples found")
    if not inst.get('kit'):
        found.sort()
    xs = [(k, v, trim(read(p), k, inst)) for k, v, p in found]
    top = max(np.abs(y).max() for _, _, y in xs)
    g = 0.89 / top                                       # the loudest sample of the instrument at -1 dBFS
    rows, total = [], 0
    for i, (k, v, y) in enumerate(xs):
        y = y * g
        out = os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', inst['id'], f'{i}.ogg')
        total += encode(y, out, inst.get('q', '1'), inst.get('stereo', False))
        rms = float(np.sqrt((y[: int(0.3 * SR)] ** 2).mean()))
        rows.append([k, v, int(round(len(y) / SR * 1000)), round(rms, 4)])
        print(f"  {inst['id']} {i}: key {k} vel {v} {len(y) / SR:.2f} s", file=sys.stderr)
    drums = inst.get('drums')
    if inst.get('kit'):
        drums = {k: i for i, (keys, _, _) in enumerate(inst['kit']) for k in keys}
    return {'id': inst['id'], 'name': inst['name'], 'release': inst['release'], 'sustain': bool(inst.get('sustain')),
            'stereo': bool(inst.get('stereo')), 'samples': rows, 'gm': inst.get('gm', []), 'drums': drums}, total


def write_defs(bank):
    p = os.path.join(UNIT, 'rp', 'sounds', 'sound_definitions.json')
    d = json.load(open(p))
    defs = {k: v for k, v in d['sound_definitions'].items() if not k.startswith('spectral.i.')}
    for inst in bank:
        for i in range(len(inst['samples'])):
            path = f"sounds/spectral/i/{inst['id']}/{i}"
            defs[f"spectral.i.{inst['id']}.{i}"] = {'category': 'ui', 'sounds': [{'name': path, 'is3D': False, 'volume': 1.0}]}
            defs[f"spectral.i.{inst['id']}.{i}_3d"] = {'category': 'record', 'min_distance': 3.0, 'max_distance': 48.0,
                                                       'sounds': [{'name': path, 'is3D': True, 'volume': 1.0}]}
    d['sound_definitions'] = defs
    json.dump(d, open(p, 'w'), indent=1)


def write_ts(bank):
    gm = [-1] * 128
    for i, inst in enumerate(bank):
        for prog in inst['gm']:
            gm[prog] = i
    drums = {}
    for i, inst in enumerate(bank):
        for key, s in (inst.get('drums') or {}).items():
            drums[int(key)] = [i, s]
    voices = [{'inst': i, 'id': b['id'], 'units': b['voice']['units'], 'pre': b['voice']['pre'], 'layers': b['voice']['layers'],
               'f0': b['voice']['f0'], 'source': b['voice'].get('source', '')} for i, b in enumerate(bank) if b.get('voice')]
    insts = ',\n  '.join(json.dumps({k: inst[k] for k in ('id', 'name', 'release', 'sustain', 'stereo', 'samples')}, separators=(',', ':')) for inst in bank)
    ts = f"""// generated by tools/samples/bank.py — the instrument bank in rp/sounds/spectral/i (do not edit)
/** seconds of silence in front of every sample: a note is placed inside its tick by seekTo(LEAD - delay * pitch) */
export const LEAD = {LEAD};
/** one instrument: its samples as [MIDI key, velocity the layer stands for, length (ms, after the lead), RMS of its first 0.3 s]
 *  (sound events spectral.i.<id>.<index> and _3d), the fade at note-off (s), whether a held note sustains */
export interface Inst {{ id: string; name: string; release: number; sustain: boolean; stereo: boolean; samples: [number, number, number, number][]; }}
export const BANK: Inst[] = [
  {insts}
];
/** General MIDI program (0-127) -> instrument (index in BANK), -1: none (the nearest family is used) */
export const GM: number[] = {json.dumps(gm)};
/** General MIDI drum key (channel 10) -> [instrument, sample] */
export const DRUMS: Record<number, [number, number]> = {json.dumps(drums)};
/** a voice (tools/samples/voice.py): its units (one a mora, in katakana) are the samples of BANK[inst], unit u at pitch layer l
 *  the sample u * layers.length + l; pre: ms the consonant comes before the vowel; layers: semitones off f0 (Hz) each was made at */
export interface Voice {{ inst: number; id: string; units: string[]; pre: number[]; layers: number[]; f0: number; source: string; }}
export const VOICES: Voice[] = {json.dumps(voices, ensure_ascii=False)};
"""
    open(os.path.join(UNIT, 'src', 'bank.ts'), 'w').write(ts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only'); ap.add_argument('--cache', default=os.path.expanduser('~/.cache/spectral-samples')); ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    if a.list:
        for i in INSTRUMENTS:
            print(i['id'], '-', i['name'])
        return
    keep = set(a.only.split(',')) if a.only else None
    old = os.path.join(UNIT, 'tools', 'samples', 'bank.json')
    prev = {b['id']: b for b in json.load(open(old))} if os.path.exists(old) else {}
    bank, sizes = [], {}
    for inst in INSTRUMENTS:
        if keep and inst['id'] not in keep and inst['id'] in prev:
            bank.append(prev[inst['id']]); continue
        b, size = build(inst, a.cache)
        bank.append(b); sizes[inst['id']] = size
        print(f"{inst['id']}: {len(b['samples'])} samples, {size / 1e6:.2f} MB", flush=True)
    # (the voices — tools/samples/voice.py — are kept as they were made)
    bank += [b for k, b in prev.items() if k not in {x['id'] for x in bank}]
    json.dump(bank, open(old, 'w'), indent=0, ensure_ascii=False)
    write_defs(bank)
    write_ts(bank)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i')) for f in fs)
    print(f'bank: {len(bank)} instruments, {sum(len(b["samples"]) for b in bank)} samples, {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()

"""Systems scored by tools/eval.py: song id -> 48 kHz mono float64 signal (EMULATED unless named rec_*)."""
import os, subprocess, sys, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import corpus as C


def ceiling_ogg8(song):
    """the original as an OGG Vorbis q8 sound file played back unchanged (what a song in the RP would sound like)"""
    from scipy.io import wavfile
    x = C.load(song, 48000, stereo=True)
    g = min(1.0, 0.999 / max(1e-9, np.max(np.abs(x))))
    with tempfile.TemporaryDirectory() as d:
        wavfile.write(os.path.join(d, 'a.wav'), 48000, (x * g * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(d, 'a.wav'), '-c:a', 'libvorbis', '-q:a', '8', os.path.join(d, 'a.ogg')], check=True)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(d, 'a.ogg'), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64) / g


def v1_preview(song):
    """tools/spectral.py as shipped: 48 voices, offline renderer with the add-on's tick rules (speed 1)"""
    import spectral as S
    x, meta, blob, stats = S.convert(C.excerpt_path(song), 48)
    fq, am, att, nz, ev = S.decode(blob, meta['frames'], meta['voices'], len(meta['noise']), S.song_tail(meta))
    return S.render(fq, am, att, nz, ev)


SYSTEMS = {'ceiling_ogg8': ceiling_ogg8, 'v1_preview': v1_preview}


def _v1_voices(n):
    def f(song):
        import spectral as S
        x, meta, blob, stats = S.convert(C.excerpt_path(song), n)
        fq, am, att, nz, ev = S.decode(blob, meta['frames'], meta['voices'], len(meta['noise']), S.song_tail(meta))
        return S.render(fq, am, att, nz, ev)
    f.__doc__ = f'tools/spectral.py as shipped with {n} voices (offline renderer)'
    return f


for _n in (24, 96, 128):
    SYSTEMS[f'v1_preview_v{_n}'] = _v1_voices(_n)


def _v2(n=48, min_frames=3, edges=None, gap=1, bursts=True):
    def f(song):
        import spectral as S, spectral2 as S2
        e = edges or S2.BARK_EDGES
        x = S.load_audio(C.excerpt_path(song))
        fq, am, att, nz, ev, info = S2.analyse(x, n, min_frames, e, gap, bursts)
        return S2.render(fq, am, att, nz, ev, e)
    return f


SYSTEMS['v2_L3_v48_v1noise'] = _v2(48, 3, [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000])
SYSTEMS['v2_L3_v48'] = _v2(48, 3)
SYSTEMS['v2_L4_v96'] = _v2(96, 4)
SYSTEMS['v2_L6_v96'] = _v2(96, 6)


def _v2b(n=48, bands=24, min_frames=3, bursts=False, alpha=1.0):
    def f(song):
        import spectral as S, spectral2 as S2
        x = S.load_audio(C.excerpt_path(song))
        fq, am, att, nz, ev, edges = S2.analyse_v2b(x, n, min_frames, bands, alpha, bursts)
        return S2.render(fq, am, att, nz, ev, edges)
    return f


SYSTEMS['v2b_v48_b24'] = _v2b(48, 24)
SYSTEMS['v2b_v48_b32'] = _v2b(48, 32)
SYSTEMS['v2b_v24_b24'] = _v2b(24, 24)
SYSTEMS['v2b_v48_b24_bursts'] = _v2b(48, 24, bursts=True)


def _v2c(n=48, min_frames=3, edges=None, noise_from=0.0, bursts=False, noise=True):
    def f(song):
        import spectral as S, spectral2 as S2
        x = S.load_audio(C.excerpt_path(song))
        fq, am, att, nz, ev, e = S2.analyse_v2c(x, n, min_frames, edges, noise_from, bursts, noise)
        return S2.render(fq, am, att, nz, ev, e)
    return f


SYSTEMS['v2c_partials'] = _v2c(48, noise=False)
SYSTEMS['v2c_sms8'] = _v2c(48)
SYSTEMS['v2c_sms8_hi'] = _v2c(48, noise_from=1440)
SYSTEMS['v2c_sms8_bursts'] = _v2c(48, bursts=True)


def _v2d(n=48, edges=None, r0=0.25, r1=0.6):
    def f(song):
        import spectral as S, spectral2 as S2
        x = S.load_audio(C.excerpt_path(song))
        fq, am, att, nz, ev, e = S2.analyse_v2d(x, n, 3, edges, r0, r1)
        return S2.render(fq, am, att, nz, ev, e)
    return f


SYSTEMS['v2d_gate'] = _v2d()
SYSTEMS['v2d_gate_strict'] = _v2d(r0=0.4, r1=0.8)
SYSTEMS['v2d_gate_bark'] = _v2d(edges=[100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500, 19000])


def _v2e(n=48, w=1, edges=None):
    def f(song):
        import spectral as S, spectral2 as S2
        x = S.load_audio(C.excerpt_path(song))
        fq, am, att, nz, ev, e = S2.analyse_v2e(x, n, 3, edges, w)
        return S2.render(fq, am, att, nz, ev, e)
    return f


SYSTEMS['v2e_sus1'] = _v2e(w=1)
SYSTEMS['v2e_sus2'] = _v2e(w=2)
SYSTEMS['v2e_sus4'] = _v2e(w=4)


def v2f_choose(song):
    """v2 tracking; each of the 8 noise bands kept only if it raises NSIM-lite against the original"""
    import spectral as S, spectral2 as S2, json as _j
    x = S.load_audio(C.excerpt_path(song)); x48 = C.load(song, 48000)
    fq, am, att, nz, ev, e, keep = S2.analyse_v2f(x, x48, 48, 3)
    _j.dump({'noise_bands_kept': keep}, open(os.path.join(os.path.dirname(HERE), 'corpus', 'renders', 'v2f_choose', song + '.keep.json'), 'w')) if os.path.isdir(os.path.join(os.path.dirname(HERE), 'corpus', 'renders', 'v2f_choose')) else None
    return S2.render(fq, am, att, nz, ev, e)


SYSTEMS['v2f_choose'] = v2f_choose


def v2_shipped(song):
    """tools/spectral.py as now shipped (analysis v2), decoded and played by the offline renderer (the add-on's tick rules)"""
    import spectral as S
    x, meta, blob, stats = S.convert(C.excerpt_path(song), 48)
    fq, am, att, nz, ev = S.decode(blob, meta['frames'], meta['voices'], len(meta['noise']), S.song_tail(meta))
    import json as _j
    _j.dump({'noise_bands': stats.get('noise_bands'), 'bytes': len(blob), 'kbps': round(len(blob) * 8 / meta['seconds'] / 1000, 2),
             'changes_per_tick': round(stats['changes'] / meta['frames'], 1)}, open(os.path.join(os.path.dirname(HERE), 'corpus', 'renders', 'v2_shipped', song + '.info.json'), 'w'))
    return S.render(fq, am, att, nz, ev)


SYSTEMS['v2_shipped'] = v2_shipped

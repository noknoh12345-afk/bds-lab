#!/usr/bin/env python3
"""A recording to a note song by automatic transcription: Basic Pitch (Spotify, Apache-2.0; its ONNX model runs with onnxruntime,
no TensorFlow) finds the notes, and the sampler plays them with the bank's recorded instruments (src/notes.ts) — a piano piece as
a piano, not as sine waves (IDEAS.md B7). A trial (11-03, here, 推測): Gymnopédie 20 s → 88 notes, 555 bytes, ViSQOL 3.77 against
the recording as rendered; through the phone's model (24 kHz, -32.5 dB, 16 bit) 2.60 against the sine engine's 3.61 — the phone's
16-bit output sinks a piano's quiet notes. Not wired into Spectral Connect; on a PC (48 kHz, floating point) it is the better one.

Velocity: Basic Pitch's own (127 × its note's amplitude: how sure it is, not how loud), or `level` (the default): each note's
loudness read from the recording — its partials' peak in the 80 ms after its onset, against the loudest note — turned into the
velocity the sampler plays at that level (its gain is (velocity / 127)^2: 40·log10).

  python3 tools/transcribe.py <audio> --out <x.song.json> [--id x] [--title T] [--program 0] [--onset 0.5] [--frame 0.3]
                              [--min-ms 58] [--vel level|model] [--render out.wav] [--eval]
  --eval: the render (the bank, as tools/notes.py renders) against the recording — tools/metrics (ViSQOL, 1/3 octave, onsets)"""
import argparse, json, logging, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import notes as N  # noqa: E402


def transcribe(path, onset=0.5, frame=0.3, min_ms=58.0, fmin=None, fmax=None, melodia=True):
    """[(start s, end s, MIDI pitch, amplitude)] — Basic Pitch with its ONNX model"""
    logging.getLogger().setLevel(logging.ERROR)
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    _, _, events = predict(path, ICASSP_2022_MODEL_PATH, onset_threshold=onset, frame_threshold=frame,
                           minimum_note_length=min_ms, minimum_frequency=fmin, maximum_frequency=fmax,
                           multiple_pitch_bends=False, melodia_trick=melodia)
    return [(float(s), float(e), int(p), float(a)) for s, e, p, a, *_ in events]


def load(path, sr=22050):
    import subprocess
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64), sr


def level_velocities(path, events, floor=10):
    """each note's level: the largest of its first 4 partials (±1/4 tone) in the 80 ms from its onset, in dB against the loudest
    note's; velocity = 127 × 10^(dB / 40) (the sampler's gain is (v/127)^2), at least `floor`"""
    y, sr = load(path)
    n_fft, hop = 4096, 256
    win = np.hanning(n_fft)
    pad = np.concatenate([np.zeros(n_fft // 2), y, np.zeros(n_fft)])
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    lv = []
    for s, e, p, a in events:
        f0 = 440 * 2 ** ((p - 69) / 12)
        best = 1e-12
        for k in range(int(s * sr), int(min(e, s + 0.08) * sr) + 1, hop):
            seg = pad[k: k + n_fft]
            if len(seg) < n_fft:
                break
            X = np.abs(np.fft.rfft(seg * win))
            for h in range(1, 5):
                fh = f0 * h
                if fh > sr / 2 - 100:
                    break
                band = (freqs > fh * 2 ** (-1 / 24)) & (freqs < fh * 2 ** (1 / 24))
                if band.any():
                    best = max(best, X[band].max())
        lv.append(20 * np.log10(best))
    top = np.percentile(lv, 99) if lv else 0
    return [int(max(floor, min(127, round(127 * 10 ** (min(0.0, l - top) / 40))))) for l in lv]


def to_notes(events, prog=0, vels=None):
    out = []
    for i, (s, e, p, a) in enumerate(events):
        v = vels[i] if vels else max(1, min(127, int(round(127 * a))))
        out.append((round(s * 1000, 2), max(30.0, (e - s) * 1000), p, v, prog))
    return sorted(out, key=lambda n: (n[0], n[2]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('--out'); ap.add_argument('--id'); ap.add_argument('--title'); ap.add_argument('--artist', default='')
    ap.add_argument('--program', type=int, default=0); ap.add_argument('--onset', type=float, default=0.5); ap.add_argument('--frame', type=float, default=0.3)
    ap.add_argument('--min-ms', type=float, default=58.0); ap.add_argument('--vel', choices=['level', 'model'], default='level')
    ap.add_argument('--no-melodia', action='store_true'); ap.add_argument('--render'); ap.add_argument('--eval', action='store_true')
    a = ap.parse_args()
    sid = a.id or os.path.splitext(os.path.basename(a.audio))[0]
    events = transcribe(a.audio, a.onset, a.frame, a.min_ms, melodia=not a.no_melodia)
    vels = level_velocities(a.audio, events) if a.vel == 'level' else None
    notes = to_notes(events, a.program, vels)
    song = N.encode(notes, sid, a.title or sid, a.artist)
    info = {'id': sid, 'notes': len(notes), 'seconds': song['meta']['seconds'], 'bytes': len(song['data']) * 3 // 4}
    if a.out:
        json.dump(song, open(a.out, 'w'), separators=(',', ':'), ensure_ascii=False)
    if a.render or a.eval:
        out = a.render or f'/tmp/{sid}.transcribed.wav'
        N.render(N.decode(song), out, master=1.0)
        if a.eval:
            sys.path.insert(0, os.path.join(HERE, 'metrics'))
            import metrics as MT
            info.update(MT.report(MT.load(a.audio), MT.load(out)))
    print(json.dumps(info, ensure_ascii=False))


if __name__ == '__main__':
    main()

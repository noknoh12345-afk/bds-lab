#!/usr/bin/env python3
"""Note songs: a MIDI file as notes (when, how long, which key, how hard, which instrument), played in the game by the
add-on's sampler (src/notes.ts) with the instrument bank (tools/samples/bank.py) — no sine waves. The format:

  {"meta": {"format": "spectral-notes/1", "id", "title", "artist", "seconds", "notes", "programs": [GM program 0-127 | 128 = drums]},
   "data": base64 of, note after note in the order they start: varint (start - previous start, in 1/4 ms), varint (length, ms),
           key (MIDI 0-127), velocity (1-127), program (index into meta.programs)}

The sustain pedal (CC64) is played into the lengths; CC7 and CC11 into the velocities; the tempo map into milliseconds.
--render writes what the notes sound like through the same samples placed exactly (the reference a device recording is scored
against); --tick renders them as a tick-bound player would (every start rounded to its 50 ms tick: what 1 ms placement beats).

  python3 tools/notes.py <in.mid> [--out x.song.json] [--id x] [--title "..."] [--render ref.wav] [--tick tick.wav] [--seconds N]
  python3 tools/notes.py --song x.song.json --render ref.wav"""
import argparse, base64, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(HERE)
FORMAT = 'spectral-notes/1'


def varint(n, out):
    n = int(n)
    assert n >= 0
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def read_midi(path):
    """[(start ms, length ms, key, velocity, program code)] with the pedal and the controllers played in"""
    import mido
    mid = mido.MidiFile(path)
    tempo, events = 500000, []
    for msg in mido.merge_tracks(mid.tracks):
        events.append(msg)
    t_ms, ticks_per_beat = 0.0, mid.ticks_per_beat
    prog = [0] * 16; vol = [127] * 16; expr = [127] * 16; pedal = [False] * 16
    held = {}              # (ch, key) -> [start, vel, prog] list (FIFO)
    sustained = {}         # ch -> [(start, vel, prog, key)] released while the pedal was down
    notes = []

    def end(ch, key, start, vel, pg, at):
        notes.append((start, max(1.0, at - start), key, vel, pg))

    for msg in events:
        if msg.time:
            t_ms += mido.tick2second(msg.time, ticks_per_beat, tempo) * 1000
        if msg.type == 'set_tempo':
            tempo = msg.tempo
            continue
        if not hasattr(msg, 'channel'):
            continue
        ch = msg.channel
        if msg.type == 'program_change':
            prog[ch] = msg.program
        elif msg.type == 'control_change':
            if msg.control == 7:
                vol[ch] = msg.value
            elif msg.control == 11:
                expr[ch] = msg.value
            elif msg.control == 64:
                down = msg.value >= 64
                if pedal[ch] and not down:
                    for (start, vel, pg, key) in sustained.pop(ch, []):
                        end(ch, key, start, vel, pg, t_ms)
                pedal[ch] = down
            elif msg.control in (120, 123):       # all sound / notes off
                for (c, key), lst in list(held.items()):
                    if c == ch:
                        for start, vel, pg in lst:
                            end(ch, key, start, vel, pg, t_ms)
                        del held[(c, key)]
        elif msg.type == 'note_on' and msg.velocity > 0:
            v = max(1, min(127, round(msg.velocity * (vol[ch] / 127) * (expr[ch] / 127))))
            pg = 128 if ch == 9 else prog[ch]
            # a key struck again while it still sounds under the pedal: the old one ends here
            if ch in sustained:
                keep = []
                for item in sustained[ch]:
                    if item[3] == msg.note:
                        end(ch, item[3], item[0], item[1], item[2], t_ms)
                    else:
                        keep.append(item)
                sustained[ch] = keep
            held.setdefault((ch, msg.note), []).append((t_ms, v, pg))
        elif msg.type in ('note_off', 'note_on'):
            lst = held.get((ch, msg.note))
            if not lst:
                continue
            start, vel, pg = lst.pop(0)
            if not lst:
                del held[(ch, msg.note)]
            if pedal[ch] and ch != 9:
                sustained.setdefault(ch, []).append((start, vel, pg, msg.note))
            else:
                end(ch, msg.note, start, vel, pg, t_ms)
    for (ch, key), lst in held.items():
        for start, vel, pg in lst:
            end(ch, key, start, vel, pg, t_ms)
    for ch, lst in sustained.items():
        for (start, vel, pg, key) in lst:
            end(ch, key, start, vel, pg, t_ms)
    notes.sort(key=lambda n: (n[0], n[2]))
    if notes:
        t0 = notes[0][0]
        notes = [(s - t0, d, k, v, p) for s, d, k, v, p in notes]
    return notes


def encode(notes, sid, title, artist=''):
    programs = sorted({n[4] for n in notes})
    pidx = {p: i for i, p in enumerate(programs)}
    out = bytearray([1])                       # version
    prev = 0
    for s, d, k, v, p in notes:
        q = int(round(s * 4))
        varint(q - prev, out); prev = q
        varint(int(round(min(d, 600000))), out)
        out += bytes([k & 0x7F, max(1, min(127, int(v))), pidx[p]])
    seconds = max((s + d for s, d, *_ in notes), default=0) / 1000
    meta = {'format': FORMAT, 'id': sid, 'title': title, 'artist': artist, 'seconds': round(seconds, 3), 'notes': len(notes), 'programs': programs}
    return {'meta': meta, 'data': base64.b64encode(bytes(out)).decode()}


def decode(song):
    b = base64.b64decode(song['data'])
    assert b[0] == 1, 'unknown note data version'
    i, prev, notes, programs = 1, 0, [], song['meta']['programs']

    def rv():
        nonlocal i
        n, sh = 0, 0
        while True:
            c = b[i]; i += 1
            n |= (c & 0x7F) << sh; sh += 7
            if not c & 0x80:
                return n
    while i < len(b):
        prev += rv(); d = rv()
        k, v, p = b[i], b[i + 1], b[i + 2]; i += 3
        notes.append((prev / 4, d, k, v, programs[p]))
    return notes


# ------------------------------------------------------------------ rendering with the bank (the reference)
_cache = {}


def bank():
    return json.load(open(os.path.join(UNIT, 'tools', 'samples', 'bank.json')))


def sample(inst, i):
    import soundfile as sf
    k = (inst, i)
    if k not in _cache:
        x, sr = sf.read(os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', inst, f'{i}.ogg'), always_2d=True)
        if x.shape[1] == 1:
            x = np.repeat(x, 2, 1)
        _cache[k] = (x, sr)
    return _cache[k]


def choose(B, prog, key, vel):
    """the instrument and sample the add-on chooses (src/notes.ts pick): the nearest key, then the nearest velocity layer"""
    gm = {}
    for i, inst in enumerate(B):
        for p in inst.get('gm', []):
            gm[p] = i
    ii = gm.get(prog, 0)
    inst = B[ii]
    best = min(range(len(inst['samples'])), key=lambda j: (abs(inst['samples'][j][0] - key), abs(inst['samples'][j][1] - vel)))
    return inst, best


def gain_of(vel, master=0.6):
    return master * (vel / 127) ** 2


def render(notes, out, sr=48000, quantize=False, seconds=None, master=0.6):
    import soundfile as sf
    B = bank()
    lead = 0.6
    total = (max((s + d for s, d, *_ in notes), default=0) / 1000 + 3) if seconds is None else seconds
    y = np.zeros((int(total * sr), 2))
    for s, d, key, vel, prog in notes:
        if seconds is not None and s / 1000 >= seconds:
            continue
        if quantize:
            s = np.floor(s / 50) * 50
        inst, j = choose(B, prog, key, vel)
        root, _, length, _ = inst['samples'][j]
        p = 2 ** ((key - root) / 12)
        x, xsr = sample(inst['id'], j)
        x = x[int(lead * xsr):]
        # read at speed p (linear interpolation, as the game reads a file) into the output rate
        n_out = int(min(len(x) / xsr / p, d / 1000 + inst['release'] + 0.05) * sr)
        tpos = np.arange(n_out) / sr * p * xsr
        tpos = tpos[tpos < len(x) - 1]
        i0 = tpos.astype(int); fr = (tpos - i0)[:, None]
        seg = x[i0] * (1 - fr) + x[i0 + 1] * fr
        # the note-off fade (linear, the release time) at the note's end
        off = int(d / 1000 * sr)
        if off < len(seg):
            rl = max(1, int(inst['release'] * sr))
            env = np.ones(len(seg)); env[off:off + rl] = np.linspace(1, 0, rl)[: len(env[off:off + rl])]; env[off + rl:] = 0
            seg = seg * env[:, None]
        a = int(s / 1000 * sr)
        if a >= len(y):
            continue
        seg = seg[: len(y) - a]
        y[a: a + len(seg)] += seg * gain_of(vel, master)
    sf.write(out, np.clip(y / max(1.0, np.abs(y).max() / 0.99), -1, 1), sr, subtype='PCM_16')
    return float(np.abs(y).max())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('midi', nargs='?'); ap.add_argument('--song'); ap.add_argument('--out'); ap.add_argument('--id'); ap.add_argument('--title')
    ap.add_argument('--artist', default=''); ap.add_argument('--render'); ap.add_argument('--tick'); ap.add_argument('--seconds', type=float)
    a = ap.parse_args()
    if a.song:
        song = json.load(open(a.song)); notes = decode(song)
    else:
        notes = read_midi(a.midi)
        if a.seconds:
            notes = [n for n in notes if n[0] < a.seconds * 1000]
        base = os.path.splitext(os.path.basename(a.midi))[0]
        sid = a.id or ''.join(c if c.isalnum() else '_' for c in base.lower())[:32]
        song = encode(notes, sid, a.title or base, a.artist)
        assert [(round(s * 4), round(d), k, v, p) for s, d, k, v, p in decode(song)] == [(round(s * 4), round(min(d, 600000)), k, v, p) for s, d, k, v, p in notes]
        if a.out:
            json.dump(song, open(a.out, 'w'), separators=(',', ':'))
    m = song['meta']
    info = {'id': m['id'], 'notes': m['notes'], 'seconds': m['seconds'], 'programs': m['programs'], 'bytes': len(base64.b64decode(song['data']))}
    if a.render:
        info['render_peak'] = round(render(notes, a.render, seconds=a.seconds), 3)
    if a.tick:
        info['tick_peak'] = round(render(notes, a.tick, quantize=True, seconds=a.seconds), 3)
    print(json.dumps(info))


if __name__ == '__main__':
    main()

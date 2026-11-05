#!/usr/bin/env python3
"""Forty more real-device runs (ユーザーの依頼 11-03 12:39「さらに40個ほど考えて検証ずっと走らせて欲しいただし記録待たないでいいよ」):
q22-q61, written to tools/exp/queue/qNN_<name>.json with the song packs they send (tools/exp/packs/q40/: probes made here, each
with <id>.onsets.json — the expected onsets — beside it), and their list in tools/exp/queue/README.md. tools/exp/queue_run.py runs
them after q21, one at a time, and records what each measured without stopping to judge it.

What q01-q21 and p01-p14 taught the plans:
  - one recording, one section: a failed line costs only the rest of its section (app/lib/scenario.mjs), so no recording waits
    on another's commands (q16 lost every recording to one `kill` with no target; q07 and q20 lost the rest of one section)
  - every section sets what it needs first (the sampler's six numbers, pitch 0, speed 1, volume 100): a section before it that
    stopped half way leaves nothing behind it
  - nothing that can fail on an empty world (no kill), trim only RUNNING_CRITICAL (q20: RUNNING_LOW failed), section names of
    letters, digits, _ . - only (p06)
  - a sample is warmed before it is measured (p13: a phone plays a sound not loaded 0.65-0.7 s late from its head) — except
    where warming is what is measured; the sampler's level command takes up to 400 (p10: it took 200 then)
  python3 tools/exp/queue40.py            (plans and packs; needs pyopenjtalk for the speech songs)"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
Q = os.path.join(HERE, 'queue')
PACK_REL = 'tools/exp/packs/q40'
PACK = os.path.join(UNIT, PACK_REL)
sys.path.insert(0, os.path.join(UNIT, 'tools'))
import notes as N  # noqa: E402

TP = 'tp @s 0 -60 0 0 0'
SIX = ['speech_ja_soseki', 'vocal_name_of_love', 'orchestra_five_armies', 'rock_big', 'piano_gymnopedie', 'edm_detection']
SONGS13 = ['piano_gymnopedie', 'piano_chopin_op66', 'vocal_stars', 'vocal_name_of_love', 'choir_how_long', 'drums_round', 'rock_big',
           'edm_detection', 'orchestra_five_armies', 'funk_funkorama', 'speech_ja_soseki', 'speech_en_wordsworth', 'demo_selfmade']
HEAD = ["# Spectral Player の測定リグ（本物のクライアントが鳴らした音を録る）: node lab.mjs app run -a spectral --device redroid",
        "#   GitHub では Actions → redroid → Run workflow（addon: spectral, mode: run）。録音そのものは `audio export` が Opus にして実行の成果物の",
        "#   public/spectral/rec/ に公開する（notify.yml が Discord に送る・tools/rig/fetch_rec.py <run> で取る）。1 録音 = 1 区切り（失敗はその録音だけ）"]
E = {'pack': 'tools/exp/packs/run10', 'suffix': '_e', 'conv': {'pack': 'run10'}, 'export': 160}
DEF = (2, 250, 28, 300, 600)          # the sampler's defaults: bundle, 3D ahead ms, notes at once, level %, warm ms
PIANO_DEMO_MS, FUR_ELISE_MS, BAND_MS, PIANO_FILE_MS = 21200, 15200, 10700, 24500
SONGS_OF = {}                         # plan name -> songs it sends from the q40 pack
NOTES_PACK = {'fur_elise', 'speech_hello', 'speech_weather', 'speech_cave', 'speech_piano', 'clicks_pairs', 'clicks_pulse'}
SECONDS = {}                          # song id -> seconds (the probes made here)


def do(c):
    return f'do execute as @a run {c}'


def sampler(b=DEF[0], ahead=DEF[1], voices=DEF[2], vol=DEF[3], warm=DEF[4], log=False):
    return do(f'spectral:sampler {b} {ahead} {voices} {vol} {"true" if log else "false"} {warm}')


RESET = [do('spectral:pitch 0'), do('spectral:speed 1'), do('spectral:volume 100')]


def sec(title, lines, reset=True, cfg=None):
    """a section: the resets, the sampler set (cfg: its numbers, or None for the defaults), its lines"""
    pre = (RESET if reset else []) + [sampler(*(cfg or DEF))]
    return {'title': title, 'lines': pre + lines}


def rec(name, play, wait_ms, mid=(), after=(), kbps=160, analyze=None):
    """audio start, the song started, `mid` [(ms, line)] at those times after the start (waits filled in), stop, export"""
    out, t = [f'audio start {name}', do(play)], 0
    for at, line in sorted(mid, key=lambda x: x[0]):
        if at > t:
            out.append(f'wait {at - t}'); t = at
        out.append(line)
    if wait_ms > t:
        out.append(f'wait {wait_ms - t}')
    out += [do('spectral:stop'), *after, 'audio stop']
    if analyze:
        out.append(f'audio analyze {name} song:{analyze}')
    return out + [f'audio export {name} {kbps}']


def song(sid, title, notes, artist='Spectral Player (measuring)'):
    s = N.encode(sorted(notes, key=lambda n: (n[0], n[2])), sid, title, artist)
    os.makedirs(PACK, exist_ok=True)
    json.dump(s, open(os.path.join(PACK, f'{sid}.song.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    json.dump([round(n[0], 3) for n in N.decode(s)], open(os.path.join(PACK, f'{sid}.onsets.json'), 'w'))
    SECONDS[sid] = s['meta']['seconds']
    return sid


def ms_of(sid, tail=1200):
    return int(SECONDS[sid] * 1000) + tail


RUNS = []


def run(name, title, why, minutes, sections=(), q40=(), notes=(), prep=(), setup=(TP,), **spec):
    """a plan: its sections, the q40 / notes-pack songs it sends, other prep lines"""
    pr = list(prep)
    if q40:
        pr.append(f"audio song {','.join(q40)} pack={PACK_REL}")
    if notes:
        pr.append(f"audio song {','.join(notes)} pack=tools/exp/packs/notes")
    RUNS.append({'name': name, 'title': title, 'why': why, 'minutes': minutes,
                 'spec': {'setup': list(setup), 'prep': pr, 'arms': [], 'sections': list(sections), **spec}})


def e6():
    return f"audio song {','.join(SIX)} suffix=_e pack=tools/exp/packs/run10"


# ================================================================== probes (each sample a probe sounds is its own: cold in its run)
PIANO_KEYS = list(range(22, 105, 2))        # 42 keys, three layers each (48 / 84 / 118)
GAPS = [900, 1150, 1000, 1300, 950, 1200, 1050, 1250, 900, 1100, 1350]


def probe(keys, vel, dur=300, t0=200.0):
    t, out = t0, []
    for i, k in enumerate(keys):
        out.append((t, dur, k, vel, 0))
        t += GAPS[i % len(GAPS)]
    return out


# ------------------------------------------------------------------ q22 warm_min: below 150 ms (p13: 150 ms ahead was enough, 0 was not)
WARM_MIN = [('m0', 0, range(40, 64, 2), 118), ('m20', 20, range(40, 64, 2), 84), ('m50', 50, range(40, 64, 2), 48),
            ('m80', 80, range(64, 88, 2), 118), ('m110', 110, range(64, 88, 2), 84), ('m150', 150, range(64, 88, 2), 48)]


def q22():
    ids = [song(f'probe_{t}', f'Probe: warmed {ms} ms', probe(k, v)) for t, ms, k, v in WARM_MIN]
    secs = [sec(f'warm_{t}', rec(f'wm_{t}', f'spectral:play probe_{t}', ms_of(f'probe_{t}') + ms), cfg=(2, 250, 28, 300, ms))
            for t, ms, _, _ in WARM_MIN]
    secs.append(sec('warm_again', rec('wm_again', 'spectral:play probe_m0', ms_of('probe_m0')), cfg=(2, 250, 28, 300, 0)))
    run('warm_min', '温めの最短（0・20・50・80・110・150 ms）', 'p13 は 150 ms 前で 12/12・0 で 0/12。その間のどこから鳴るか（短いほど曲の頭を待たせない）。'
        '最後に 0 ms の組をもう一度（読み込み済みなら全部鳴る: 物差し）', 25, secs, q40=ids)


# ------------------------------------------------------------------ q23 forget: how long a loaded sample stays (p13: gone after 1.5-2.5 min)
FORGET_GAPS = [10, 20, 30, 45, 60, 75, 90, 120]


def q23():
    notes, keys = [], iter([(k, v) for v in (118, 84, 48) for k in range(40, 104, 2)])
    for i, g in enumerate(FORGET_GAPS):
        for j in range(3):
            k, v = next(keys)
            t = 1000.0 + i * 1500 + j * 450
            notes += [(t, 1200, k, v, 0), (t + g * 1000.0, 1200, k, v, 0)]
    sid = song('probe_forget', 'Probe: each sample again after 10-120 s', notes)
    secs = [sec('forget_w0', rec('fg_w0', f'spectral:play {sid}', ms_of(sid), kbps=96), cfg=(2, 250, 28, 300, 0))]
    run('forget', '読み込んだ素が捨てられるまで（10〜120 秒あけて同じ素）', '温め 0 で、24 の素を 1 回鳴らしてから 10・20・30・45・60・75・90・120 秒後にもう一度。'
        '2 回目が時間どおりなら残っていた、0.65 秒遅れ・無音なら捨てられていた（p13 は 1.5〜2.5 分で 0/12）。温め直しの 15 秒を決める', 15, secs, q40=[sid])


# ------------------------------------------------------------------ q24 load_many: how many cold samples can be warmed at once
def q24():
    notes, pool = [], [(k, v) for v in (118, 84, 48) for k in PIANO_KEYS]
    i, t = 0, 1500.0
    for n in (4, 8, 16, 24, 32):
        for j in range(n):
            k, v = pool[i]; i += 1
            notes.append((t + j * 3.0, 400, k, v, 0))
        t += 3500
    sid = song('probe_many', 'Probe: 4-32 cold samples at once', notes)
    secs = [sec('many_v60', rec('mn_v60', f'spectral:play {sid}', ms_of(sid)), cfg=(2, 250, 60, 300, 600)),
            sec('many_again', rec('mn_again', f'spectral:play {sid}', ms_of(sid)), cfg=(2, 250, 60, 300, 600))]
    run('load_many', '一度に温められる素の数（4・8・16・24・32 個を同時に）', 'まだ鳴らしていない素を 4〜32 個まとめて温めて鳴らす（同時 60 音）。'
        '電話の 32 音のうち温めがいくつまで効くか。2 回目は読み込み済み（物差し）', 15, secs, q40=[sid])


# ------------------------------------------------------------------ q25 voices: the sampler's notes at once (28: never measured against others)
def q25():
    secs = []
    for v in (8, 16, 28, 40, 60):
        secs.append(sec(f'voices_{v}_pd', rec(f'vc{v}_piano_demo', 'spectral:play piano_demo', PIANO_DEMO_MS), cfg=(2, 250, v, 300, 600)))
        secs.append(sec(f'voices_{v}_bd', rec(f'vc{v}_band_demo', 'spectral:play band_demo', BAND_MS), cfg=(2, 250, v, 300, 600)))
    run('sampler_voices', 'サンプラーの同時音数 8・16・28・40・60', '既定の 28 は電話の 32 音から決めただけ。ピアノのエチュードとバンドで、少ないと切れる・多いと電話が落とすの間のどこが一番か', 25, secs)


# ------------------------------------------------------------------ q26 chords: K notes at once, one seek / K seeks
def q26():
    progs = [0, 48, 19, 73, 66, 11, 46, 24, 56, 71]
    ks = [4, 8, 12, 16, 20, 24]
    same, spread = [], []
    for g, K in enumerate(ks):
        for j in range(K):
            key, prog = 48 + (j * 5) % 36, progs[j % len(progs)]
            same.append((2000.0 * g + 300, 800, key, 96, prog))
            spread.append((2000.0 * g + 300 + j * 1.7, 800, key, 96, prog))
    a = song('chord_mix', 'Chords of 4-24 notes, mixed instruments, one moment', same)
    b = song('chord_spread', 'Chords of 4-24 notes, mixed instruments, 1.7 ms apart', spread)
    secs = [sec('chord_same', rec('ch_same', f'spectral:play {a}', ms_of(a)), cfg=(2, 250, 60, 300, 600)),
            sec('chord_spread', rec('ch_spread', f'spectral:play {b}', ms_of(b)), cfg=(2, 250, 60, 300, 600)),
            sec('chord_same3d', rec('ch3_same', f'spectral:play {a} speaker', ms_of(a) + 250), cfg=(2, 250, 60, 300, 600)),
            sec('chord_v28', rec('ch28_same', f'spectral:play {a}', ms_of(a)), cfg=(2, 250, 28, 300, 600))]
    run('chords_wide', '和音 4〜24 音（楽器を混ぜて）を 1 つの時刻・1.7 ms ずつ', 'p11 は同じ素の和音 12 音まで。楽器を混ぜ、同じ seek と別々の seek で 24 音まで: 電話が 1 tick に始められる数の天井', 15, secs, q40=[a, b])


# ------------------------------------------------------------------ q27 transpose: the sampler at pitch -12 .. +12
def q27():
    secs = []
    for st in (-12, -7, -3, 0, 3, 7, 12):
        tag = f'm{-st}' if st < 0 else f'p{st}'
        for play, n, ms in (('piano_demo', 'pd', PIANO_DEMO_MS), ('fur_elise', 'fe', FUR_ELISE_MS)):
            secs.append(sec(f'pitch_{tag}_{n}', [do(f'spectral:pitch {st}')] + rec(f'tp{tag}_{n}', f'spectral:play {play}', ms) + [do('spectral:pitch 0')]))
    run('sampler_transpose', 'サンプラーの移調 −12〜+12（pitch 0.5〜2）', '素の高さを setPitch で 0.5〜2 倍に: 電話がどこまで正しい高さで鳴らすか（模型は全部正しい）、高く・低くしたときの音質', 30,
        secs, notes=['fur_elise'])


# ------------------------------------------------------------------ q28 velocity: the loudness curve
def q28():
    vels = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127]
    notes = []
    for i, v in enumerate(vels):
        notes.append((500.0 + i * 900, 600, 60, v, 0))
        notes.append((500.0 + (len(vels) + 1) * 900 + i * 900, 600, 60, v, 48))
    sid = song('velocity_ramp', 'Velocity 8-127 (piano, strings)', notes)
    secs = [sec('vel_phones', rec('vl_phones', f'spectral:play {sid}', ms_of(sid))),
            sec('vel_speaker', rec('vl_speaker', f'spectral:play {sid} speaker', ms_of(sid) + 250)),
            sec('vel_l200', rec('vl_l200', f'spectral:play {sid}', ms_of(sid)), cfg=(2, 250, 28, 200, 600))]
    run('velocity_curve', '強さの曲線（8〜127 の 16 段、ピアノと弦）', '強さ → 大きさが実機でどうなるか（三段の素の継ぎ目・16 bit の床に沈む弱さ）。大きさ 300 % と 200 %', 15, secs, q40=[sid])


# ------------------------------------------------------------------ q29 3D distance for the sampler
def q29():
    secs = []
    for d in (0, 4, 8, 16, 24, 32):
        for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('speech_hello', 'sh', 7600)):
            secs.append(sec(f'dist_{d}_{n}', [do(TP)] + rec(f'sd{d}_{n}', f'spectral:play {play} speaker', ms + 250, mid=[(700, f'do tp @a {d} -60 0')], after=[do(TP)])))
    run('sampler_distance', 'サンプラーの 3D: 距離 0〜32 ブロック', 'q04 は正弦波の道で 8 ブロックまで同じ。サンプラー（ピアノ・読み上げ）は 3D の遠さでどう落ちるか', 25, secs,
        notes=['fur_elise', 'speech_hello'])


# ------------------------------------------------------------------ q30 3D direction for the sampler
def q30():
    secs = []
    # (the speaker stays where it started, the player moves to the other side: a speaker 6 blocks east of the player = the player 6
    #  blocks west of it; the player faces south (yaw 0) all the time. No up / down: the player would fall or stand in the ground)
    for tag, x, z in (('e', 6, 0), ('w', -6, 0), ('s', 0, 6), ('n', 0, -6), ('se', 4, 4), ('nw', -4, -4)):
        for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('speech_cave', 'sc', 7600)):
            secs.append(sec(f'dir_{tag}_{n}', [do(TP)] + rec(f'dr{tag}_{n}', f'spectral:play {play} speaker', ms + 250,
                                                              mid=[(700, f'do tp @a {-x} -60 {-z} 0 0')], after=[do(TP)])))
    run('sampler_direction', 'サンプラーの 3D: 向き 6 方向（東西南北と斜め 2 つ）', '6 ブロック先の東西南北と南東・北西（聞き手は南を向く）。左右の分かれ方と音質が向きでどう変わるか（q05 は正弦波の道）', 20, secs,
        notes=['fur_elise', 'speech_cave'])


# ------------------------------------------------------------------ q31 bundles 1-4 with warming on
def q31():
    secs = []
    for b in (1, 2, 3, 4):
        for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('clicks_pulse', 'pu', 3800)):
            secs.append(sec(f'bundle_{b}_{n}', rec(f'bw{b}_{n}', f'spectral:play {play}', ms), cfg=(b, 250, 28, 300, 600)))
    run('bundle_warm', '束ね 1・2・3・4（温めあり）', 'p01・p04 は温めなしで束ね 2 を選んだ: 温めありでも 2 が一番か（落ちていた音は温めで戻る）', 25, secs,
        notes=['fur_elise', 'clicks_pulse'])


# ------------------------------------------------------------------ q32 3D ahead
def q32():
    secs = []
    for a in (0, 100, 250, 400):
        for play, n, ms in (('clicks_pairs', 'pp', 7500), ('clicks_pulse', 'pu', 3800), ('fur_elise', 'fe', FUR_ELISE_MS)):
            secs.append(sec(f'ahead_{a}_{n}', rec(f'ah{a}_{n}', f'spectral:play {play} speaker', ms + a), cfg=(2, a, 28, 300, 600)))
    run('ahead_3d', '3D の先回り 0・100・250・400 ms', '3D は作ってから 100〜200 ms 遅れて鳴る（推測）。先回りの量でクリックの間隔・エリーゼの揃い方がどう変わるか（既定 250 は実機で選んでいない）', 25,
        secs, notes=['clicks_pairs', 'clicks_pulse', 'fur_elise'])


# ------------------------------------------------------------------ q33 band instrument by instrument
def band_parts():
    d = json.loads(open(os.path.join(UNIT, 'src', 'songs', 'band_demo.ts')).read().split('export default ', 1)[1].rstrip().rstrip(';'))
    notes = N.decode(d)
    out = []
    for prog in sorted({n[4] for n in notes}):
        sid = song(f'band_p{prog}', f'Band (sampler demo): program {prog} alone', [n for n in notes if n[4] == prog], 'Spectral Player')
        out.append((prog, sid))
    return out


def q33():
    parts = band_parts()
    secs = [sec('band_full', rec('bp_full', 'spectral:play band_demo', BAND_MS))]
    for prog, sid in parts:
        secs.append(sec(f'band_p{prog}', rec(f'bp_p{prog}', f'spectral:play {sid}', BAND_MS)))
    secs.append(sec('band_full_again', rec('bp_full2', 'spectral:play band_demo', BAND_MS)))
    run('band_parts', 'バンドを楽器ごとに', 'バンドの実機 2.50 は電話の模型 3.54 より低く、6.4 kHz から上が 12〜21 dB 多い（理由は未解明）。1 楽器ずつ鳴らして、どの楽器が高い音を足しているか', 15,
        secs, q40=[s for _, s in parts])


# ------------------------------------------------------------------ q34 every drum
def q34():
    bank = {b['id']: b for b in N.bank()}
    keys = sorted(int(k) for k in bank['drums']['drums'])
    notes = [(500.0 + i * 700, 300, k, 110, 128) for i, k in enumerate(keys)]
    notes += [(500.0 + (len(keys) + 1) * 700 + i * 700, 300, k, 60, 128) for i, k in enumerate(keys)]
    sid = song('drums_each', f'Every drum key ({len(keys)}), loud then soft', notes)
    secs = [sec('drums_phones', rec('dk_phones', f'spectral:play {sid}', ms_of(sid))),
            sec('drums_speaker', rec('dk_speaker', f'spectral:play {sid} speaker', ms_of(sid) + 250))]
    run('drums_each', '打楽器を 1 つずつ（GM の鍵 全部、強・弱）', '打楽器の素は短い（30〜2500 ms）: 温めと 1 ms の置き方がそれぞれに効くか、どれが落ちる・割れるか', 15, secs, q40=[sid])


# ------------------------------------------------------------------ q35 every instrument's own samples
GM = {'piano': 0, 'strings': 48, 'bass': 32, 'harp': 46, 'guitar': 24, 'organ': 19, 'trumpet': 56, 'horn': 60, 'trombone': 57, 'tuba': 58,
      'sax': 66, 'oboe': 68, 'bassoon': 70, 'clarinet': 71, 'flute': 73, 'vibes': 11, 'marimba': 12, 'xylo': 13, 'glock': 9, 'chimes': 14}


def q35():
    bank = {b['id']: b for b in N.bank()}
    groups = [list(GM)[:7], list(GM)[7:14], list(GM)[14:]]
    ids = []
    for gi, g in enumerate(groups):
        notes, t = [], 500.0
        for inst in g:
            roots = sorted({s[0] for s in bank[inst]['samples']})
            for k in roots[::2] if len(roots) > 12 else roots:
                notes.append((t, 350, k, 100, GM[inst])); t += 450
            t += 900
        ids.append(song(f'inst_roots_{gi + 1}', f'Each instrument on its own sample roots ({", ".join(g)})', notes))
    secs = [sec(f'inst_{i + 1}', rec(f'ir_{i + 1}', f'spectral:play {sid}', ms_of(sid))) for i, sid in enumerate(ids)]
    run('instrument_roots', '楽器 20 種を素の高さそのままで（高さの確かめ）', '11-03 に 16 楽器の高さを 1 オクターブ直した（手元で測っただけ）。実機で全部の素がその高さで鳴るか（pitch 1.0 の音だけ: 高さを見る物差し）', 15,
        secs, q40=ids)


# ------------------------------------------------------------------ q36 speed for note songs
def q36():
    secs = []
    for x in (0.5, 0.75, 1.25, 1.5, 2):
        tag = str(x).replace('.', '')
        for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('band_demo', 'bd', BAND_MS)):
            secs.append(sec(f'speed_{tag}_{n}', [do(f'spectral:speed {x}')] + rec(f'sp{tag}_{n}', f'spectral:play {play}', int(ms / x) + 600) + [do('spectral:speed 1')]))
    run('sampler_speed', 'サンプラーの速さ 0.5〜2 倍', 'MIDI の曲は速さを変えても音は伸びない（時刻だけ変わる）: 速いと 1 tick に始める数が増える。どこまで崩れないか', 25,
        secs, notes=['fur_elise'])


# ------------------------------------------------------------------ q37 pause / seek for note songs and file songs
def q37():
    secs = []
    for play, n, ms in (('piano_demo', 'pd', PIANO_DEMO_MS), ('fur_elise', 'fe', FUR_ELISE_MS), ('band_demo', 'bd', BAND_MS), ('piano_file', 'pf', PIANO_FILE_MS)):
        mid = [(4000, do('spectral:pause')), (6000, do('spectral:pause')), (9000, do('spectral:seek 2')), (13000, do('spectral:seek 8'))]
        secs.append(sec(f'pause_{n}', rec(f'pz_{n}', f'spectral:play {play}', 22000, mid=mid)))
    run('sampler_pause_seek', '一時停止・シーク（サンプラーとファイルの曲）', 'q19 は正弦波の道だけ。サンプラーとファイルの曲で、止めた音が残る・戻った音の頭が遅れる（読み込み直し）が無いか', 15,
        secs, notes=['fur_elise'])


# ------------------------------------------------------------------ q38 a note song looped for 5 minutes
def q38():
    lines = rec('lp_fur_elise', 'spectral:play fur_elise', 300000, kbps=96)
    lines = [do('spectral:stop')] + [x if not x.startswith('audio start') else x for x in lines]
    # (loop is a toggle: on before, off after — inside the same section)
    i = lines.index('audio start lp_fur_elise')
    lines[i:i] = [do('spectral:loop')]
    lines.insert(lines.index('audio stop'), do('spectral:loop'))
    run('sampler_loop_5min', 'サンプラーのループ 5 分（エリーゼ 20 周）', 'ループの継ぎ目と、時間が経っても音が落ちない・ずれないか（15 秒使わない素は温め直す: その仕組みが長く回る）', 15,
        [sec('loop', lines)], notes=['fur_elise'])


# ------------------------------------------------------------------ q39 screen off / background with the sampler
def q39():
    secs = []
    for play, n, ms in (('piano_demo', 'pd', PIANO_DEMO_MS), ('fur_elise', 'fe', FUR_ELISE_MS), ('speech_weather', 'sw', 7600), ('piano_file', 'pf', PIANO_FILE_MS)):
        secs.append(sec(f'scr_on_{n}', rec(f'sn_{n}', f'spectral:play {play}', ms)))
        secs.append(sec(f'scr_off_{n}', rec(f'so_{n}', f'spectral:play {play}', max(ms, 12000), mid=[(2000, 'screen off'), (9000, 'screen on')])))
        secs.append(sec(f'scr_bg_{n}', rec(f'sb_{n}', f'spectral:play {play}', max(ms, 12000), mid=[(2000, 'background'), (8000, 'foreground')])))
    run('sampler_screen_off', '画面を消す・裏へ（サンプラー・読み上げ・ファイルの曲）', 'q07 は正弦波の道で 1 区切り目が止まった。サンプラーは素を温めて捨てられる: 画面を消した間に捨てられないか', 25,
        secs, notes=['fur_elise', 'speech_weather'])


# ------------------------------------------------------------------ q40 memory pressure with the sampler
def q40():
    secs = []
    for play, n, ms in (('piano_demo', 'pd', PIANO_DEMO_MS), ('fur_elise', 'fe', FUR_ELISE_MS), ('band_demo', 'bd', BAND_MS), ('piano_file', 'pf', PIANO_FILE_MS)):
        secs.append(sec(f'mem_n_{n}', rec(f'mn_{n}', f'spectral:play {play}', ms)))
        secs.append(sec(f'mem_t_{n}', rec(f'mt_{n}', f'spectral:play {play}', ms, mid=[(3000, 'trim RUNNING_CRITICAL')])))
    run('sampler_memory', 'メモリが足りないとき（サンプラー、trim RUNNING_CRITICAL）', 'q20 は RUNNING_LOW の行で止まった（RUNNING_CRITICAL は通った）。読み込んだ素を電話が捨てるか', 15,
        secs, notes=['fur_elise'])


# ------------------------------------------------------------------ q41 a long mixed session (20 minutes)
def q41():
    plays = [('spectral:play piano_demo', PIANO_DEMO_MS), ('spectral:play fur_elise', FUR_ELISE_MS), ('spectral:play band_demo', BAND_MS),
             ('spectral:play speech_hello', 7600), ('spectral:play piano_file', PIANO_FILE_MS), ('spectral:play rock_big_e', 23000),
             ('spectral:play speech_cave', 7600), ('spectral:play vocal_name_of_love_e', 23000)]
    lines, t = ['audio start mx_20min'], 0
    while t < 1200000:
        for p, ms in plays:
            lines += [do(p), f'wait {ms}']
            t += ms + 700
    lines += [do('spectral:stop'), 'audio stop', 'audio export mx_20min 64']
    run('long_mix_20min', '混ぜて 20 分（サンプラー・読み上げ・ファイル・正弦波を順に）', '曲を切り替えながら 20 分: 素の温め・捨て・正弦波の道との行き来が長く続いても崩れないか（後で曲ごとに区切って最初の周と比べる）', 30,
        [sec('mix', lines)], notes=['fur_elise', 'speech_hello', 'speech_cave'],
        prep=["audio song rock_big,vocal_name_of_love suffix=_e pack=tools/exp/packs/run10"])


# ------------------------------------------------------------------ q42 leave and come back
def q42():
    secs = [sec('before', rec('rj_before', 'spectral:play fur_elise', FUR_ELISE_MS)),
            {'title': 'rejoin', 'lines': ['stop', 'launch', 'until title 600000', 'join', 'until joined 300000', 'wait 5000', f'do {TP.replace("@s", "@a")}']},
            sec('after1', rec('rj_after1', 'spectral:play fur_elise', FUR_ELISE_MS)),
            sec('after2', rec('rj_after2', 'spectral:play fur_elise', FUR_ELISE_MS)),
            sec('after_nowarm', rec('rj_nowarm', 'spectral:play piano_demo', PIANO_DEMO_MS), cfg=(2, 250, 28, 300, 0))]
    run('rejoin', '入り直し（ゲームを閉じてもう一度）', '入り直すと電話は素を全部捨てる（はず）: 温めが入り直しの後も効くか、温めなしの初回はどうか', 20, secs, notes=['fur_elise'])


# ================================================================== speech (the voice's units)
SENT = {'s_kaze': 'きょうは かぜが つよいですね。', 's_mori': 'もりの おくに ちいさな いえが あります。',
        's_tomo': 'ともだちと いっしょに ぼうけんに でかけよう。', 's_yoru': 'よるに なると ゾンビが でて きます。',
        's_umi': 'うみの むこうに しまが みえます。', 's_hon': 'としょかんで ほんを かりて きました。',
        's_sora': 'そらが あかく そまって きれいです。', 's_kagi': 'たからばこの かぎを なくして しまいました。',
        's_ame': 'あめが ふりそうなので かさを もって いこう。', 's_neko': 'ねこが まどの そとを みて います。',
        's_ie': 'いえに かえって ごはんを たべます。', 's_tetsu': 'てつの つるはしで いしを ほります。'}
FOUR = ['speech_hello', 'speech_weather', 'speech_cave', 'speech_piano']
FOUR_TEXT = {'speech_hello': 'こんにちは、私はマインクラフトの中で話しています。', 'speech_weather': '今日はいい天気ですね。一緒に遊びましょう！',
             'speech_cave': '東の森に、ダイヤモンドの洞窟があるらしいよ。', 'speech_piano': 'このピアノの音は、本物の楽器を録音したものです。'}


def speech_song(sid, text, **kw):
    import speech as SP
    vs = N.voices(N.bank())
    return song(sid, text, SP.plan(SP.morae(text), vs[0], prog=200, **kw), 'Spectral Player (speech)')


def q43():
    ids, secs = [], []
    for ms in (140, 160, 200, 220):
        for sid in ('speech_hello', 'speech_cave'):
            x = speech_song(f'{sid}_m{ms}', FOUR_TEXT[sid], mora_ms=float(ms))
            ids.append(x)
            secs.append(sec(f'mora_{ms}_{sid[7:]}', rec(f'mo{ms}_{sid}', f'spectral:play {x}', ms_of(x, 900))))
    for sid in ('speech_hello', 'speech_cave'):
        secs.append(sec(f'mora_180_{sid[7:]}', rec(f'mo180_{sid}', f'spectral:play {sid}', 7600)))
    run('speech_mora', '読み上げの速さ（1 モーラ 140・160・180・200・220 ms）', '手元の Whisper は 180 ms が一番だった（推測）。実機で、速いと素の頭が重なって潰れるか・遅いと間延びか', 15, secs,
        q40=ids, notes=['speech_hello', 'speech_cave'])


def q44():
    ids = [speech_song(sid, text) for sid, text in SENT.items()]
    secs = [sec(f'sent_{sid}', rec(f'st_{sid}', f'spectral:play {sid}', ms_of(sid, 900))) for sid in ids]
    secs += [sec(f'sent3_{sid}', rec(f'st3_{sid}', f'spectral:play {sid} speaker', ms_of(sid, 1150))) for sid in ids[:4]]
    run('speech_sentences', '読み上げの文を増やす（かなの 12 文）', '今まで 4 文だけで Whisper 0.19〜0.48（文で大きく違う）。12 文で物差しを太く（かなだけ: 読みの誤りなし）、4 文は 3D でも', 20, secs, q40=ids)


def q45():
    ids, secs = [], []
    for rng in (0, 2, 6, 8):
        for sid in ('speech_weather', 'speech_piano'):
            x = speech_song(f'{sid}_r{rng}', FOUR_TEXT[sid], rng=float(rng))
            ids.append(x)
            secs.append(sec(f'rng_{rng}_{sid[7:]}', rec(f'ra{rng}_{sid}', f'spectral:play {x}', ms_of(x, 900))))
    run('speech_intonation', '読み上げの抑揚の幅 0・2・(4)・6・8 半音', '素を高さ 3 段（−4・0・+4）から pitch で動かす: 抑揚を広げると聞き取りやすいか、素の高さから遠くて崩れるか（4 は q44・p13 の既定）', 15,
        secs, q40=ids)


def q46():
    secs = []
    for d in (2, 4, 8, 16):
        for sid in ('speech_hello', 'speech_weather'):
            secs.append(sec(f'sdist_{d}_{sid[7:]}', [do(TP)] + rec(f'sd{d}_{sid}', f'spectral:play {sid} speaker', 7850, mid=[(500, f'do tp @a {d} -60 0')], after=[do(TP)])))
    run('speech_distance', '読み上げの 3D: 2・4・8・16 ブロック', '近接ボイスチャットのように: 話し手から離れると聞き取りはどこまで保つか', 15, secs, notes=['speech_hello', 'speech_weather'])


def q47():
    secs = []
    for sid in FOUR:
        secs.append(sec(f'ovr_none_{sid[7:]}', rec(f'ov0_{sid}', f'spectral:play {sid}', 7600)))
        secs.append(sec(f'ovr_music_{sid[7:]}', rec(f'ovm_{sid}', 'spectral:live_demo rock_big_e near @s 24 "near:4,-58.5,0,overworld"', 8600,
                                                    mid=[(1000, do(f'spectral:play {sid}'))], after=[do('spectral:live demo_rock_big_e stop')])))
    run('speech_over_music', '曲が鳴っている中で読み上げ', '4 ブロック先で曲（正弦波の道）を流しながら読み上げ: 32 音の取り合いで素が落ちるか、聞き取りはどれだけ下がるか', 15, secs,
        notes=FOUR, prep=["audio song rock_big suffix=_e pack=tools/exp/packs/run10"])


def q48():
    secs = []
    for vol in (150, 200, 300, 400):
        for sid in ('speech_hello', 'speech_cave'):
            secs.append(sec(f'slv_{vol}_{sid[7:]}', rec(f'sl{vol}_{sid}', f'spectral:play {sid}', 7600), cfg=(2, 250, 28, vol, 600)))
    run('speech_level', '読み上げの大きさ 150・200・300・400 %', '読み上げは素が 1 つずつ: 曲より上げても割れないはず。どこで聞き取りが一番か（Whisper は大きさをそろえて聞く）', 15, secs,
        notes=['speech_hello', 'speech_cave'])


def q49():
    secs = []
    for i, (txt, out, sp) in enumerate((('こんにちは', 'phones', 1), ('きょうは いい てんきですね', 'phones', 1), ('きょうは いい てんきですね', 'phones', 0.8),
                                        ('きょうは いい てんきですね', 'phones', 1.25), ('ダイヤモンドを みつけた', 'speaker', 1))):
        secs.append(sec(f'say_{i + 1}', rec(f'sy{i + 1}', f'spectral:say "{txt}" {out} {sp}', int(len(txt.replace(" ", "")) * 180 / sp) + 2500)))
    run('say_command', 'ゲームの中の /spectral:say（かなをその場で）', 'tools/speech.py を通さず、ゲームの中で文字から読み上げ（抑揚なし・漢字なし）: 曲にした読み上げ（q44）と聞き取りを比べる。速さ 0.8・1・1.25', 10, secs)


def q50():
    ids, secs = [], []
    for tag, kw in (('o10', {'overlap': 10.0}), ('o40', {'overlap': 40.0}), ('c0', {'cut': 0.0}), ('c20', {'cut': 20.0})):
        for sid in ('speech_hello', 'speech_cave'):
            x = speech_song(f'{sid}_{tag}', FOUR_TEXT[sid], **kw)
            ids.append(x)
            secs.append(sec(f'join_{tag}_{sid[7:]}', rec(f'jn{tag}_{sid}', f'spectral:play {x}', ms_of(x, 900))))
    run('speech_joins', '読み上げのつなぎ方（重ね 10・40 ms、母音を止める 0・20 ms）', '素と素のつなぎ（既定: 重ね 25・止め 10）を変えて: 途切れ（プツッ）と潰れのどちらが聞き取りを下げるか', 15, secs, q40=ids)


# ================================================================== file songs and the sine engine
def q51():
    secs = []
    for w in (0, 300, 600, 1000):
        secs.append(sec(f'file_w{w}', rec(f'fw{w}_phones', 'spectral:play piano_file', PIANO_FILE_MS), cfg=(2, 250, 28, 300, w)))
        secs.append(sec(f'file3_w{w}', rec(f'fw{w}_speaker', 'spectral:play piano_file speaker', PIANO_FILE_MS + 250), cfg=(2, 250, 28, 300, w)))
    run('file_warm', 'ファイルの曲の温め 0・300・600・1000 ms（ヘッドホン・3D）', 'ファイルの曲も部分ごとに温める: 部分の継ぎ目の遅れ・抜けが温めの長さでどう変わるか（p03 は温めの前）', 15, secs)


def q52():
    secs = []
    for i, (a, b) in enumerate(((2, 10), (12, 4), (0, 20))):
        mid = [(4000, do(f'spectral:seek {a}')), (9000, do(f'spectral:seek {b}')), (14000, do('spectral:pause')), (16000, do('spectral:pause'))]
        secs.append(sec(f'fseek_{i + 1}', rec(f'fs{i + 1}', 'spectral:play piano_file', 21000, mid=mid)))
    secs.append(sec('fseek_ref', rec('fs_ref', 'spectral:play piano_file', PIANO_FILE_MS)))
    run('file_seek', 'ファイルの曲のシーク（部分をまたいで）', 'シークで別の部分に飛ぶと、その部分の素はまだ温まっていない: 飛んだ先の頭が遅れるか', 10, secs)


def arms_run(name, title, why, minutes, arms, inter, songs=None, batch=13, **k):
    for a in arms:
        if songs:
            a['songs'] = songs
    RUNS.append({'name': name, 'title': title, 'why': why, 'minutes': minutes,
                 'spec': {'setup': [TP], 'batch': batch, 'interleave': inter, 'arms': arms, **k}})


def arm(pre, cmds=(), **k):
    a = {'pre': pre, **E, 'cmds': [TP, *cmds]}
    a.update(k)
    return a


def q53():
    arms_run('limiter_l12', '音割れ止め +12 dB（正弦波の道）', 'p05 は +10 dB で音割れ止めが少し下げた。+12 dB（q12 で割れ始めた大きさ）なら効くか: +10、+12、+12 と止め', 40,
             [arm('e', ['spectral:level 10 volume', 'spectral:limit false']),
              arm('l12', ['spectral:level 12 volume', 'spectral:limit false'], pack='tools/exp/packs/lv12', suffix='_l12', conv={'refine_level': 12}),
              arm('l12lm', ['spectral:level 12 volume', 'spectral:limit true'], pack='tools/exp/packs/lv12', suffix='_l12', conv={'refine_level': 12})],
             ['e', 'l12', 'l12lm'])


def q54():
    arms_run('voices_28_32', '電話の声 24・28・32（同じ 48 声のデータ）', 'q13 は 16・20・24 で 24 が上。データは 48 声あるので 28・32 も鳴らせる: 電話の 32 音を使い切ると上がるか落ちるか', 40,
             [arm('v24', ['spectral:voices 24']), arm('v28', ['spectral:voices 28']), arm('v32', ['spectral:voices 32'])], ['v24', 'v28', 'v32'])


def q55():
    secs = []
    for i in (1, 2, 3):
        for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('band_demo', 'bd', BAND_MS), ('speech_hello', 'sh', 7600)):
            secs.append(sec(f'twice_{i}_{n}', rec(f'tw{i}_{n}', f'spectral:play {play}', ms)))
    run('sampler_same_thrice', 'サンプラーの同じ曲を 3 回（ゆらぎの物差し）', 'q01 は正弦波の道で 0.15 ゆれた。サンプラー（エリーゼ・エチュード・バンド・読み上げ）を同じ run で 3 回: どの差が差か', 25, secs,
        notes=['fur_elise', 'speech_hello'])


def q56():
    secs = []
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('band_demo', 'bd', BAND_MS), ('speech_weather', 'sw', 7600), ('piano_file', 'pf', PIANO_FILE_MS)):
        secs.append(sec(f'hp_{n}', rec(f'hp_{n}', f'spectral:play {play} phones', ms)))
        secs.append(sec(f'hs_{n}', rec(f'hs_{n}', f'spectral:play {play} speaker', ms + 250)))
    run('sampler_phones_speaker', 'サンプラーのヘッドホンと 3D（同じ場所）', 'q03 は正弦波の道でほぼ同じだった。サンプラーは 3D に 250 ms 先回り・大きさの割り当てが違う: 距離 0 で同じに聞こえるか', 20, secs,
        notes=['fur_elise', 'speech_weather'])


def q57():
    secs = []
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('band_demo', 'bd', BAND_MS)):
        secs.append(sec(f'two_alone_{n}', rec(f'ta_{n}', f'spectral:play {play}', ms)))
        secs.append(sec(f'two_with_{n}', rec(f'tw_{n}', 'spectral:live_demo rock_big_e near @s 24 "near:4,-58.5,0,overworld"', ms + 1000,
                                             mid=[(1000, do(f'spectral:play {play}'))], after=[do('spectral:live demo_rock_big_e stop')])))
    run('sampler_two_streams', 'サンプラーと別の曲（正弦波の道）が同時に', 'q06 は正弦波の道 2 本で 1.0 落ちた。サンプラーの横で 24 声の曲が鳴ると、電話の 32 音の取り合いでピアノがどれだけ落ちるか', 15, secs,
        notes=['fur_elise'], prep=["audio song rock_big suffix=_e pack=tools/exp/packs/run10"])


def q58():
    secs = []
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('speech_cave', 'sc', 7600)):
        secs.append(sec(f'clear_{n}', [do('weather clear')] + rec(f'wc_{n}', f'spectral:play {play}', ms)))
    secs.append({'title': 'make_rain', 'lines': ['do weather rain', 'do summon cow 3 -60 3', 'do summon cow -3 -60 3', 'do summon chicken 2 -60 -2',
                                                 'do summon chicken -2 -60 -2', 'do summon sheep 0 -60 4', 'wait 3000']})
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('speech_cave', 'sc', 7600)):
        secs.append(sec(f'rain_{n}', rec(f'wr_{n}', f'spectral:play {play}', ms)))
    secs.append({'title': 'end_rain', 'lines': ['do weather clear']})
    run('sampler_rain_mobs', '雨と動物の中でサンプラー', 'q16・q21（正弦波の道）のサンプラー版。kill は使わない（q16: 対象がいないと失敗）: 晴れで先に録り、そのあと雨と動物を足す', 15, secs,
        notes=['fur_elise', 'speech_cave'])


def q59():
    secs = []
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('band_demo', 'bd', BAND_MS), ('speech_hello', 'sh', 7600),
                        ('piano_file', 'pf', PIANO_FILE_MS)):
        secs.append(sec(f'bgm_{n}', rec(f'bg_{n}', f'spectral:play {play}', ms)))
    for s in SIX:
        secs.append(sec(f'bgm_e_{s}', rec(f'bge_{s}', f'spectral:play {s}_e', 23000, analyze=s)))
    run('bgm_sampler', 'ゲームの BGM を鳴らしたまま（音楽 0.5）: サンプラー・読み上げ・ファイル・正弦波', 'q17 は正弦波の道で BGM があっても同じくらいだった。サンプラーと読み上げも BGM と一緒に', 20, secs,
        notes=['fur_elise', 'speech_hello'], prep=[e6()], bgm=0.5)


def q60():
    secs = []
    walk = [(1000 + 600 * i, f'do tp @a {x} -60 3') for i, x in enumerate([2, 4, 6, 8, 6, 4, 2, 0, -2, -4, -6, -8, -6, -4, -2, 0] * 2)]
    for play, n, ms in (('fur_elise', 'fe', FUR_ELISE_MS), ('piano_demo', 'pd', PIANO_DEMO_MS), ('speech_cave', 'sc', 7600)):
        secs.append(sec(f'still_{n}', [do(TP)] + rec(f'ls_{n}', f'spectral:play {play} speaker', ms + 250, mid=[(500, 'do tp @a 0 -60 3')], after=[do(TP)])))
        secs.append(sec(f'walk_{n}', [do(TP)] + rec(f'lw_{n}', f'spectral:play {play} speaker', ms + 250, mid=[w for w in walk if w[0] < ms], after=[do(TP)])))
    run('sampler_walking_listener', '聞き手が歩く（サンプラーの 3D）', 'q08 は話し手が歩いた（正弦波の道）。サンプラーの 3D の横を聞き手が 8 ブロック行き来すると、音の左右・大きさの変わり目で音が崩れるか', 15, secs,
        notes=['fur_elise', 'speech_cave'])


def q61():
    # (warm-only probes: notes at velocity 1 on cold samples — what is heard is the warming itself, 600 ms before each)
    song('probe_warmonly', 'Probe: velocity-1 notes on 12 cold samples (the warming heard)', probe(range(22, 46, 2), 1, dur=200))
    song('probe_warmonly2', 'Probe: velocity-1 notes on 12 more cold samples', probe(range(46, 70, 2), 1, dur=200))
    quiet = song('probe_quiet', 'Probe: very soft notes (velocity 4), 12 cold samples', probe(range(70, 94, 2), 4, dur=500))
    secs = [{'title': 'idle', 'lines': ['audio start qi_idle', 'wait 20000', 'audio stop', 'audio export qi_idle 160']},
            sec('quiet_w0', rec('qi_w0', f'spectral:play {quiet}', ms_of(quiet)), cfg=(2, 250, 28, 300, 0)),
            sec('quiet_again', rec('qi_again', f'spectral:play {quiet}', ms_of(quiet)), cfg=(2, 250, 28, 300, 0)),
            sec('warm_only', [do('scriptevent spectral:warmcfg 0.01 4')] + rec('qi_warm01', 'spectral:play probe_warmonly', ms_of('probe_warmonly') + 600) +
                [do('scriptevent spectral:warmcfg 0.001 4')]),
            sec('warm_only_def', rec('qi_warm001', 'spectral:play probe_warmonly2', ms_of('probe_warmonly2') + 600))]
    run('noise_floor_warm', '何も鳴らさない床と、温めそのものが聞こえるか', '温めは音量 0.001 で 4 tick 鳴らす（p13 で 1 は聞こえると推測）。何も鳴らさない 20 秒（電話の床）、とても弱い音（強さ 4）、強さ 1 の音（温めだけが聞こえる）を温め 0.01 と 0.001 で', 10,
        secs, q40=[quiet, 'probe_warmonly', 'probe_warmonly2'])


def main():
    for f in (q22, q23, q24, q25, q26, q27, q28, q29, q30, q31, q32, q33, q34, q35, q36, q37, q38, q39, q40, q41, q42,
              q43, q44, q45, q46, q47, q48, q49, q50, q51, q52, q53, q54, q55, q56, q57, q58, q59, q60, q61):
        f()
    assert len(RUNS) == 40, len(RUNS)
    rows = ['', '## q22〜q61（tools/exp/queue40.py: 11-03 12:39 の依頼「さらに40個ほど考えて検証ずっと走らせて欲しい」）', '',
            '1 録音 = 1 区切り（1 行の失敗はその録音だけ）、各区切りの頭で設定を戻す、kill を使わない、trim は RUNNING_CRITICAL だけ。'
            '測るための曲は tools/exp/packs/q40/（予定の音の時刻 <id>.onsets.json つき）。', '',
            '| # | 名前 | 何を測るか | なぜ実機で | 分 |', '|---|---|---|---|---|']
    for i, r in enumerate(RUNS, 22):
        spec = {'header': HEAD + [f'# キュー {i:02d}（tools/exp/queue/q{i:02d}_{r["name"]}.json、tools/exp/queue40.py）: {r["title"]}。{r["why"]}'], **r['spec']}
        for s in spec.get('sections', []):
            assert all(c.isalnum() or c in '_.-' for c in s['title']), s['title']
        json.dump(spec, open(os.path.join(Q, f'q{i:02d}_{r["name"]}.json'), 'w'), ensure_ascii=False, indent=1)
        rows.append(f'| {i} | {r["name"]} | {r["title"]} | {r["why"]} | {r["minutes"]} |')
    readme = os.path.join(Q, 'README.md')
    text = open(readme).read().split('\n## q22〜q61')[0].rstrip('\n') + '\n'
    open(readme, 'w').write(text + '\n'.join(rows) + '\n')
    print(len(RUNS), 'plans: q22-q61;', len(SECONDS), 'songs in', PACK_REL)


if __name__ == '__main__':
    main()

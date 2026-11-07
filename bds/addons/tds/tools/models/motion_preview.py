#!/usr/bin/env python3
"""See the looks move (preview only, nothing here is shipped):

    python3 -I tools/models/motion_preview.py enemy|unit|tower "Name,Name" --clip walk|die|fall|leave|cast|dizzy|idle|<a tower's shot>
                                              [--times 0,0.1,0.2] [--views front34+left] [--size 260x280] [--pace 2.7] [--out path]

The lab's renderer reads q.life_time and takes every variable as 0, so the clips a look plays (its gait, the body's ride on it,
a steadied hand, the always-on parts, the clip asked for) are merged into one temporary clip whose variables are written out
in q.life_time (motion.py: v.walk for the given pace in studs/s, v.move 1, v.dying from 0 ...), put in the pack for the
render and taken out again. Bone names are matched as the game does (in any case); a muzzle flash simply shows.
Writes bds/.lab/render/motion_preview.png (one row per look, one frame per time and view).
"""
import json
import os
import re
import sys

MODELS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, MODELS)
import motion as MO  # noqa: E402
import roster  # noqa: E402
import sheet  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

argv = sys.argv[1:]
opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d  # noqa: E731
kind, names = argv[0], [n.strip() for n in argv[1].split(',')]
clip = opt('--clip', 'walk')
times = [float(x) for x in opt('--times', '0,0.08,0.16,0.24').split(',')]
views, size = opt('--views', 'front34'), opt('--size', '260x280')
pace = float(opt('--pace', '2.7'))
out = opt('--out', os.path.join(sheet.OUT, 'motion_preview.png'))
RP = os.path.join(sheet.ADDON, 'rp')
TMPA = os.path.join(RP, 'animations', 'zz_preview.animation.json')
look_anims = json.load(open(os.path.join(RP, 'animations', 'tds_look.animation.json')))['animations']
tower_anims = json.load(open(os.path.join(RP, 'animations', 'tds_tower.animation.json')))['animations']


def subst(e, lk, st):
    if not isinstance(e, str):
        return e
    t = 'q.life_time'
    walking = clip in ('walk', 'move')
    rate = pace * MO.K * MO.CADENCE.get(lk.anim, 1.0) / max(0.3, lk.size)
    rep = {'v.walk': f'({t} * {rate:.1f})' if walking else '0', 'v.move': '1' if walking else '0', 'v.clock': t,
           'v.dying': t, 'v.fall': f'math.min(1, math.pow({t} / 0.42, 2))', 'v.drop': f'math.min(1, math.pow({t} / 0.55, 2))',
           'v.sz': f'{max(0.3, lk.size)}', 'v.st': str(st), 'v.yaw': '0'}
    for k, v in rep.items():
        e = re.sub(re.escape(k) + r'\b', v, e)
    return e


def merge(dst, src, lk, st):
    for bone, ch in src.get('bones', {}).items():
        d = dst.setdefault(bone, {})
        for k, v in ch.items():
            if isinstance(v, dict):                      # keyframes: kept as they are (one clip only)
                d[k] = v
                continue
            v = [subst(x, lk, st) for x in v] if isinstance(v, list) else subst(v, lk, st)
            if k in d and not isinstance(d[k], dict):
                a, b = d[k], v
                d[k] = [f'({x}) + ({y})' for x, y in zip(a, b)] if k != 'scale' else [f'({x}) * ({y})' for x, y in zip(a, b)]
            else:
                d[k] = v


def clips_for(lk):
    """(the clips the look plays in this preview, tds:st)"""
    if kind == 'tower':
        return [tower_anims[f'animation.tds_tower.{clip}']] if clip != 'idle' else [tower_anims['animation.tds_tower.idle']], 0
    roots, py = MO.roots_of(lk.gear or lk.body)
    key = f"{roots[0].lower()}_{str(py).replace('.', 'p').replace('-', 'm')}" if len(roots) == 1 else f'{roots[0].lower()}_x{len(roots)}'
    gait = look_anims[f'animation.tds_look.{lk.anim}']
    body = look_anims.get(f'animation.tds_look.body_{lk.anim}')
    names = {b['name'].lower() for b in (lk.gear or lk.body).bones}
    extra = [body] if body and 'waist' not in names and roots == ['body'] else []
    fx = [look_anims['animation.tds_look.fx' if kind == 'enemy' else 'animation.tds_look.fx_unit']]
    extra += list(MO.steady_anims([lk])[0].values())
    if clip in ('walk', 'move', 'idle'):
        return [gait] + extra + fx, 0
    if clip in ('die', 'fall', 'leave'):
        st = {'die': 3, 'fall': 5, 'leave': 4}[clip]
        return [gait] + extra + [look_anims[f'animation.tds_look.{clip}_{key}']], st
    if clip == 'dizzy':
        return [gait] + extra + [look_anims['animation.tds_look.dizzy']], 1
    return [gait] + extra + [look_anims[f'animation.tds_look.{clip}']], 0


looks = {lk.name: lk for lk in roster.looks(kind)}
anims, jobs = {}, []
for n in names:
    lk = looks[n]
    if kind == 'tower':
        data = roster.load('towers')
        lk.extra['top'] = max(0, len(data[n].get('levels') or []) - 1)
    tag, gp, tp, base = sheet.prepare(lk, '0' if kind == 'tower' else None, clip not in ('idle', 'walk', 'move', 'die', 'fall', 'leave', 'dizzy', 'cast'), 0)
    bones = {}
    cl, st = clips_for(lk)
    for c in cl:
        merge(bones, c, lk, st)
    # the game matches bone names in any case, the renderer exactly: name them as the geometry does; a muzzle flash just shows
    real = {b['name'].lower(): b['name'] for b in json.load(open(gp))['minecraft:geometry'][0]['bones']}
    bones = {real.get(k.lower(), k): v for k, v in bones.items() if 'flash' not in k}
    aid = f'animation.tds_preview.{tag}'
    anims[aid] = {'loop': True, 'bones': bones}
    jobs.append((n, tag, gp, tp, aid))
json.dump({'format_version': '1.8.0', 'animations': anims}, open(TMPA, 'w'))
shots = []
try:
    for n, tag, gp, tp, aid in jobs:
        for t in times:
            for v in views.split('+'):
                p = sheet.render(f'prev_{tag}_{clip}_{t}_{v}'.replace(',', '_'), gp, tp, aid, v, size, t)
                if p:
                    shots.append((f'{n} {clip} t={t}', p))
finally:
    os.remove(TMPA)
ims = [(l, Image.open(p).convert('RGB')) for l, p in shots]
w, h = ims[0][1].size
cols = len(times) * len(views.split('+'))
rows = (len(ims) + cols - 1) // cols
sh = Image.new('RGB', (w * cols, h * rows), (16, 22, 22))
d = ImageDraw.Draw(sh)
for i, (l, im) in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * h
    sh.paste(im, (x, y))
    d.text((x + 5, y + 4), l, fill=(255, 230, 90))
sh.save(out)
print(out, sh.size)

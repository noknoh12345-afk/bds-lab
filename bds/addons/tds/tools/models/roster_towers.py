"""One look per tower of the data (data/towers.json). The people are Steve or Alex (the player's body, referenced) in
clothes of ours (tailor.py) on our pedestal; the rest are buildings and machines of ours (hq.py, buildings.py). Original
designs, made from what the data says a tower is (its name, role, damage type and levels), never from another game's art.

Each person is designed whole: a palette (a: the main garment, b: the trousers, c: the accent, d: the boots, k: leather and
straps, v: a vest, m: metal), an outfit at level 0, a weapon (towerkit: 'g:' at the chest, 'h:' in each hand, 'm:' in the
hand, 'c:' a staff or tool, 't:' to throw; a pair: replaced at `swap`), and what each level adds (`ups`: level 1, 2, 3 and
the top level), each on a layer of its own so the earlier clothes stay in view.

    looks() -> [Look ...] in skin order (people, then buildings); the index is tds:skin.
"""
from __future__ import annotations

import hq
import tailor as T
from buildings import BUILDINGS
from hq_parts import octa
from kitbash import aura, level, nb, orbit, weapon
from rigs import RIGS
from roster import Look, load, slug
from towerkit import POSE, ROLE, SHOT, armament, crate_on, finish, own_px, pot_on

BUILDING_SIZE = 0.7 / 0.36          # buildings are drawn at 0.7 of a person's pedestal scale (0.36 x tds:size)
ORDER = ['root_hold', 'root_bow', 'root_type', 'root_dual', 'root_ready', 'root_ready2', 'root_cast', 'root_throw', 'root_idle', 'building']
TOWER = {}
DEF = dict(a='#5a6a7a', b='#3a4250', c='#c83838', d='#2a2420', k='#3a3226', v='#5a5e48', m='#9aa0aa', e='#3a3e44')
GOLD = dict(a='#d8a838', b='#a87a20', c='#fff0a0', d='#7a5a14', k='#8a6418', v='#c8962c', m='#f0d060', e='#c8962c', gun='#e0b040', gun2='#8a6418', furn='#a87a20',
            disc='#ffd650', glow='#fff0a0')


def P(name, body, pal, outfit, arm=None, ups=(), size=1.0, emblem='chevron', swap=None, amats=None, pose=None, fire=None, role=None):
    """a person: `outfit(m)` at level 0, `ups` [level 1, level 2, level 3, top] (fn(m) or None)"""
    TOWER[name] = dict(kind='person', body=body, pal=pal, outfit=outfit, arm=arm, ups=list(ups), size=size, emblem=emblem, swap=swap,
                       amats=amats or {}, pose=pose, fire=fire, role=role)


def B(name, make, fire='fire', size=BUILDING_SIZE):
    TOWER[name] = dict(kind='building', make=make, fire=fire, size=size)


def OLD(name, make, fire='fire', smoke=False):
    """a building made before the roster (hq.py)"""
    TOWER[name] = dict(kind='old', make=make, fire=fire, smoke=smoke)


def golden(name, base, **over):
    rec = dict(TOWER[base])
    rec['pal'] = {**rec['pal'], **GOLD, **over.pop('pal', {})}
    rec['amats'] = {**rec['amats'], **({'mat': 'gold', 'mat2': 'k'} if 'mat' in rec['amats'] else {})}
    rec.update(over)
    TOWER[name] = rec


# ------------------------------------------------------------------------------------------------ what levels add
def gl(col='k', kind='glove'):
    return lambda m: T.gloves(m, col, kind)


def bl(col='k', buckle='metal', pouches='pouch'):
    return lambda m: T.belt(m, col, buckle, pouches)


def vs(col='v', kind='tactical', trim=None):
    return lambda m: T.vest(m, col, kind, trim)


def kn(col='k'):
    return lambda m: T.kneepads(m, col)


def pa(col='m', kind='metal', trim=None):
    return lambda m: T.pauldrons(m, col, trim, kind)


def bp(col='k', kind='pack'):
    return lambda m: T.backpack(m, col, kind)


def cp(col='c', trim=None, lining=None, length=16):
    return lambda m: T.cape(m, col, lining, trim, length)


def sc(col='c', stripe=None, tail=True):
    return lambda m: T.scarf(m, col, stripe, tail)


def au(col='glow'):
    return lambda m: aura(m, col, 9.5, y=4.7, bone='tds_base')


def ob(col='glow', n=3, kind='orb', size=0.8):
    return lambda m: orbit(m, col, n, 8.5, size=size, kind=kind)


def hs():
    return lambda m: T.headset(m)


def both(*fs):
    return lambda m: [f(m) for f in fs]


# a few outfits many share
def fatigues(m, helm='combat', jacket_open=False, sleeves='long'):
    T.jacket(m, 'a', open=jacket_open, shirt_col='e' if jacket_open else None, zip_col='e', sleeves=sleeves, cuff='b', pockets=True)
    T.trousers(m, 'b', 'cargo')
    T.boots(m, 'd', 'combat', lace='k')
    if helm:
        T.helmet(m, 'a', helm, band='k')


def suit(m, shirt_col='#e8e4dc', tie_col=None, shoes='#141418'):
    T.jacket(m, 'a', open=True, shirt_col=shirt_col, sleeves='long', lining='e', pockets=True)
    if tie_col:
        tie(m, tie_col)
    T.trousers(m, 'b', 'suit')
    T.boots(m, shoes, 'shoes', sole='#0e0e10')


def tie(m, col):
    cc = T.C(m, col)
    b = m.rig.parts['body'][0]
    z = -2 - T.LAYER['shirt']
    T.piece(m, b, 'tie_knot', -0.6, 0.6, 22.6, 23.8, z - 0.35, z, lambda p: T.grain(p, T.mul(cc, 0.9)))
    T.piece(m, b, 'tie', -0.7, 0.7, 15.6, 22.6, z - 0.2, z - 0.05, lambda p: T.grain(p, cc) if p.j < p.h - 1 else T.mul(cc, 0.85))


def plane(m, r=13.0, y=41.0, s=1.0, mat='red', mat2='white', ang=0):
    """a little plane flying round the tower (bone `orbit`: the idle animation turns it)"""
    import math
    O = nb(m, 'orbit')
    if O not in m.bmap:
        m.bone(O, 'tds_base', (0, y, 0))
    a = math.radians(ang)
    cx, cz = r * math.cos(a), r * math.sin(a)
    Pn = nb(m, f'plane{ang}')
    m.bone(Pn, O, (cx, y, cz), rot=(0, -ang, 0) if ang else None)
    S = lambda v: v * s  # noqa: E731
    m.box(Pn, f'{Pn}_body', cx - S(0.8), cx + S(0.8), y - S(0.8), y + S(0.8), cz - S(3.4), cz + S(3.0), mat, decal='metal')
    m.box(Pn, f'{Pn}_wing', cx - S(4.6), cx + S(4.6), y - S(0.2), y + S(0.2), cz - S(1.6), cz - S(0.2), mat2)
    m.box(Pn, f'{Pn}_tail', cx - S(1.8), cx + S(1.8), y + S(0.05), y + S(0.35), cz + S(2.2), cz + S(2.9), mat2)
    m.box(Pn, f'{Pn}_fin', cx - S(0.12), cx + S(0.12), y + S(0.7), y + S(2.2), cz + S(2.0), cz + S(2.8), mat)
    m.box(Pn, f'{Pn}_prop', cx - S(1.6), cx + S(1.6), y - S(0.2), y + S(0.2), cz - S(3.75), cz - S(3.55), 'black')
    m.box(Pn, f'{Pn}_glass', cx - S(0.6), cx + S(0.6), y + S(0.7), y + S(1.2), cz - S(1.8), cz - S(0.4), 'glass')


def bombs_on_plane(m, r=13.0, y=41.0, s=1.0):
    O = nb(m, 'orbit')
    m.bone(O, 'tds_base', (0, y, 0))
    for sx in (1, -1):
        octa(m, O, f'{O}_bomb{sx}', 'z', (r + sx * 2.4 * s, y - 0.9 * s), -1.6 * s, 0.6 * s, 0.45 * s, 'black')


# ------------------------------------------------------------------------------------------------ the towers, the data's order
P('Scout', 'alex', dict(a='#6b7044', b='#8a7a56', d='#5a3c24', e='#c8b88a', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='rolled', lining='#8a8e5a'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
             T.cap(m, 'a', visor='#4e5232'), T.patch(m, 'disc')),
  arm=('g:smg', 'g:ar'), swap=3, ups=[gl('k', 'fingerless'), bl(), vs('#5e6438'), both(bp('#5e6438'), hs())])
P('Sniper', 'steve', dict(a='#4a5a3a', b='#3e4a30', d='#2a2420', e='#6a7a4a', v='#5a6a40', disc=ROLE['Defense']),
  lambda m: (T.coat(m, 'a', lining='#2e3a24', bottom=5.0, trim='#3a4a2e'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
             T.hood(m, 'e', lining='#2a3420'), T.patch(m, 'disc')),
  arm=('g:sr', 'g:amr'), amats=dict(furn='#8a7a56'), emblem='sight', ups=[gl(), bl(), lambda m: T.goggles(m, 'k', '#9ae0ff', 'helmet'), cp('a', length=14)])
P('Paintballer', 'alex', dict(a='#3c8ad8', b='#2a2a34', c='#e8642c', d='#eef0f2', disc=ROLE['Offense']),
  lambda m: (T.splats(m, ('#e8642c', '#4ca83c', '#e8c838', '#c83a8a'), 8), T.shirt(m, 'a', 'long', stripe='c'), T.trousers(m, 'b', 'plain'),
             T.boots(m, 'd', 'shoes', sole='#3a3a44'), T.goggles(m, '#2a2a34', '#ff9a3c', 'eyes'), T.cap(m, 'c', back=True)),
  arm='g:paintball', ups=[gl('#2a2a34'), kn('#2a2a34'), vs('#2a2a34', 'puffer'), bp('#e8642c')])
P('Demoman', 'steve', dict(a='#2a2a30', b='#4a4a50', c='#c8382c', d='#1e1e24', e='#8a2a24', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', trim='c'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
             T.goggles(m, '#3a3226', '#ffb040', 'forehead'), T.bandolier(m, 'k', 'c')),
  arm=('g:launcher', 'g:rocket'), amats=dict(furn='#6a7048', head='c'), emblem='bomb', ups=[gl(), bl('k', 'metal', 'c'), vs('e', 'plate', trim='c'), bp('c', 'tank')])
P('Boomerang', 'alex', dict(a='#c8b088', b='#8a6e48', c='#c83838', d='#5a3a22', disc=ROLE['Defense']),
  lambda m: (T.shirt(m, 'a', 'short', collar='#b09870', buttons='#6a5232'), T.trousers(m, 'b', 'shorts'), T.boots(m, 'd', 'work', top=5.0),
             T.hat(m, '#6a4a2a', band='c', kind='bush', brim=2.6), T.scarf(m, 'c', tail=False)),
  arm='t:boomerang', amats=dict(furn='#e0b070', band='c', size=1.5), emblem='sight', ups=[gl('k', 'fingerless'), bl('k', 'gold'), kn('k'), bp('#8a6e48')])
P('Slime Trooper', 'steve', dict(a='#6aa83a', b='#4e8a2a', c='#2a2a30', d='#1e1e24', glow='#a8ff3c', disc=ROLE['Support']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'),
             T.gloves(m, 'c'), T.helmet(m, 'a', 'combat', band='c', visor='#78ffb0'), T.backpack(m, 'c', 'tank')),
  arm='g:slime', emblem='cross', ups=[bl('c', 'metal'), kn('c'), pa('c', 'pad'), au('glow')])
P('Soldier', 'steve', dict(a='#5e6a3e', b='#4e5634', d='#2a2420', e='#3a3e2a', v='#6e7448', disc=ROLE['Offense']),
  lambda m: (fatigues(m), T.patch(m, 'disc')),
  arm=('g:ar', 'g:lmg'), ups=[gl(), bl(), vs(), both(bp('#5a6038', 'radio'), hs())])
P('Freezer', 'alex', dict(a='#dfeef8', b='#3a5a8a', c='#5aa8d8', d='#eef0f2', glow='#d8ffff', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', trim='c'), T.trousers(m, 'b', 'plain'),
             T.boots(m, 'd', 'combat', sole='#8aa8c8'), T.beanie(m, 'c', fold='a', pom='a'), T.goggles(m, '#3a4a5a', '#9ae0ff', 'helmet')),
  arm=('g:freezer', 'g:frostcannon'), swap=3, emblem='flake', ups=[gl('c'), bp('#9ac8e8', 'tank'), sc('c', 'a'), au('ice')])
P('Assassin', 'steve', dict(a='#1e1c24', b='#26242c', c='#8a1a2a', d='#141418', disc=ROLE['Offense']),
  lambda m: (T.coat(m, 'a', lining='c', bottom=6.0, trim='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'),
             T.mask(m, '#16141c', 'bandana'), T.hood(m, 'a', lining='c')),
  arm=('m2:knife', 'm2:sword'), swap=3, amats=dict(mat='metal', size=1.35), ups=[gl('#16141c'), bl('#16141c', 'metal', '#26242c'), lambda m: T.bandolier(m, '#16141c', 'metal'), cp('c', lining='a')])
P('Militant', 'steve', dict(a='#5a6a3a', b='#4e5a30', c='#c8302a', d='#2a2420', e='#1e1e22', v='#5e6a3e', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='rolled'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
             T.beret(m, 'c', 'gold'), T.bandolier(m, 'k', 'gold')),
  arm=('g:ar', 'g:lmg'), amats=dict(furn='wood', wood=True), ups=[gl('k', 'fingerless'), bl(), vs(), bp('#4e5a30')])
P('Shotgunner', 'steve', dict(a='#1e1e22', b='#2e4a7a', c='#c83838', d='#3a2416', e='#c83838', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='long', lining='#3a3a40', pockets=False), T.trousers(m, 'b', 'jeans'),
             T.boots(m, 'd', 'work', top=5.0), T.cap(m, 'c', back=True)),
  arm=('g:shotgun', 'g:combat'), amats=dict(furn='wood', wood=True), ups=[gl('#2a2a30', 'fingerless'), bl('#2a2a30', 'metal'), lambda m: T.bandolier(m, '#2a2a30', 'c'), cp('#1e1e22', lining='c')])
P('Hunter', 'alex', dict(a='#8a2a24', b='#4e5a32', c='#1e1e22', d='#5a3a22', disc=ROLE['Offense']),
  lambda m: (plaid_jacket(m, 'a', 'c'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'work', top=5.0), T.hat(m, '#5a4a32', band='#3a2a1a', kind='bush')),
  arm=('g:crossbow', 'g:sr'), amats=dict(furn='wood', wood=True), emblem='sight', ups=[lambda m: T.quiver(m), gl(), bl('k', 'gold'), cp('#6a5a3a', lining='#4a3a26')])
P('Pyromancer', 'steve', dict(a='#5a5a60', b='#4a4a50', c='#e8842c', d='#1e1e24', e='#3a3a40', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', trim='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'),
             T.gloves(m, 'e', 'gauntlet'), T.mask(m, 'e', 'gas', filt='c'), T.goggles(m, 'e', '#ffb040', 'forehead'), T.backpack(m, 'c', 'tank')),
  arm='g:flamer', emblem='bomb', ups=[bl('e', 'metal'), kn('e'), pa('e', 'metal', trim='c'), au('flash')])
P('Ace Pilot', 'alex', dict(a='#6a4426', b='#8a7a5a', c='#eef0f2', d='#2a2420', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#3a2416', sleeves='long', lining='c', cuff='c'), T.trousers(m, 'b', 'cargo'),
             T.boots(m, 'd', 'combat'), T.helmet(m, '#5a3a22', 'pilot', band='#3a2416', goggles_col='#9ae0ff'), T.scarf(m, 'c'), plane(m)),
  emblem='sight', ups=[gl('#3a2416'), bombs_on_plane, lambda m: T.medals(m), lambda m: plane(m, ang=180, mat='blue')])
P('Medic', 'alex', dict(a='#eef0f2', b='#2e3a52', c='#c83838', d='#3a3a44', glow='#7cff8c', disc=ROLE['Support']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', pockets=True, trim='c'), T.trousers(m, 'b', 'cargo'),
             T.boots(m, 'd', 'combat'), T.cap(m, 'a', visor='c', logo='c'), T.patch(m, 'c')),
  arm='g:medigun', fire='', emblem='cross', ups=[gl('#5a8ad8'), bl('#3a3a44', 'metal', 'c'), bp('a', 'pack'), au('glow')])
OLD('Farm', hq.farm, fire='', smoke=True)
P('Electroshocker', 'steve', dict(a='#2e3a5a', b='#2e3a5a', c='#e8c838', d='#1e1e24', glow='#a8e8ff', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c'), T.trousers(m, 'b', 'plain', knee='c'), T.boots(m, 'd', 'combat'),
             T.gloves(m, '#26262c', 'glove', cuff='c'), T.helmet(m, 'c', 'hard'), T.goggles(m, '#2a2a30', '#9ae0ff', 'helmet')),
  arm='g:tesla', emblem='star', ups=[bl('#1e1e24', 'c'), bp('#3a3e44', 'tank'), pa('#3a3e44', 'pad'), ob('glow', 2, size=0.9)])
P('Rocketeer', 'steve', dict(a='#5a6a7a', b='#3a4250', c='#e8842c', d='#1e1e24', v='#4a5260', disc=ROLE['Defense']),
  lambda m: (fatigues(m, helm=None), T.helmet(m, 'a', 'combat', band='k', visor='#ffb040', raised=True), T.patch(m, 'c')),
  arm=('g:rocket', 'g:rocket@1.2'), amats=dict(furn='#5e6648', head='c'), emblem='bomb', ups=[gl(), bl(), bp('#4a5260', 'tank'), vs('v', 'plate', trim='c')])
P('Trapper', 'steve', dict(a='#2e5a32', b='#5a4a32', c='#1e1e22', d='#3a2416', mine='#4a4e56', disc=ROLE['Defense']),
  lambda m: (plaid_jacket(m, 'a', 'c', rolled=True), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'work', top=5.0), T.beanie(m, '#6a4a2a', fold='#5a3a22'),
             crate_on(m, 6.6, 6.6, 2.8, 'wood'), crate_on(m, -6.8, 6.0, 2.2, 'wood2', 'crate2')),
  arm='t:mine', amats=dict(mat='mine'), emblem='bomb', ups=[gl(), bl('k', 'metal', 'pouch'), bp('#5a4a32'), lambda m: T.bandolier(m, 'k', 'metal')])
P('Pulse Trooper', 'steve', dict(a='#2a3a5a', b='#2a3a5a', c='#78dcff', d='#1e1e24', v='#d8dce4', m='#d8dce4', glow='#78dcff', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long'), T.trousers(m, 'b', 'plain'), T.boots(m, 'v', 'combat', sole='#3a3e48'),
             T.vest(m, 'v', 'plate', trim='c'), T.helmet(m, 'v', 'combat', band='#3a3e48', visor='c'), T.gloves(m, 'v')),
  arm=('g:pulse', 'g:rail'), emblem='star', ups=[kn('v'), bl('#3a3e48', 'c'), pa('m', 'metal', trim='c'), ob('glow', 2, size=0.9)])
OLD('Military Base', hq.barracks, fire='')
P('Crook Boss', 'steve', dict(a='#26262e', b='#1e1e24', c='#c83838', e='#3a3a46', disc=ROLE['Offense']),
  lambda m: (suit(m, tie_col='c'), T.hat(m, '#1e1e24', band='c', kind='fedora')),
  arm='g:tommy', amats=dict(furn='wood', wood=True), emblem='coin', ups=[gl('#141418'), bl('#141418', 'gold'), lambda m: T.holster(m, '#141418', 'rleg'), cp('a', lining='c', length=15)])
P('Commander', 'steve', dict(a='#4a5a3a', b='#3a4630', c='#d8a838', d='#16141c', disc=ROLE['Support']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col=None, sleeves='long', cuff='c', pockets=True, trim='c'), T.trousers(m, 'b', 'suit'),
             T.boots(m, 'd', 'combat', top=6.0), T.peaked(m, 'a', 'd', 'c'), T.patch(m, 'c')),
  arm='c:wand', amats=dict(mat='gold', mat2='black', glow='gold'), emblem='star',
  ups=[gl('#eef0f2'), lambda m: T.medals(m), pa('c', 'metal'), cp('#c83838', lining='#8a2424', trim='c', length=18)])
P('Warden', 'steve', dict(a='#4a5a7a', b='#2a3040', c='#d8a838', d='#16141c', v='#2a3040', disc=ROLE['Offense']),
  lambda m: (T.shirt(m, 'a', 'long', collar='#3a4a6a', buttons='#2a3040'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'),
             T.peaked(m, 'b', '#16141c', 'c'), T.belt(m, '#16141c', 'metal'), weapon(m, 'shield', 'l', mat='metal2', mat2='black')),
  arm='m:club', amats=dict(mat='black', mat2='black'), emblem='star', ups=[gl('#16141c'), vs('v', 'riot'), kn('#16141c'), pa('#2a3040', 'pad')])
P('Cowboy', 'steve', dict(a='#8a5a32', b='#3a4a6a', c='#c83838', d='#5a3a22', disc=ROLE['Offense']),
  lambda m: (T.shirt(m, '#e8e0d0', 'long', collar='#d8d0c0', buttons='#8a7a6a'), T.vest(m, 'a', 'waistcoat', trim='gold'), T.trousers(m, 'b', 'jeans'),
             T.boots(m, 'd', 'cowboy', top=5.0), T.hat(m, '#6a4426', band='#3a2416', kind='cowboy'), T.scarf(m, 'c', tail=False)),
  arm='h:revolver', amats=dict(furn='wood', wood=True), emblem='coin', ups=[lambda m: T.holster(m, 'k', 'rleg'), bl('k', 'gold'), gl('k'), cp('#7a5a3a', lining='#5a3a22', length=15)])
B('DJ Booth', BUILDINGS['DJ Booth'], fire='')
B('Tesla', BUILDINGS['Tesla'], fire='pulse')
P('Saboteur', 'alex', dict(a='#1e1e24', b='#26262c', c='#b8ff3c', d='#141418', glow='#b8ff3c', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#3a3a44', sleeves='long'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
             T.beanie(m, '#26262c'), T.mask(m, '#16141c', 'bandana'), T.gloves(m, '#16141c')),
  arm='g:toxic', emblem='bomb', ups=[bl('#16141c', 'metal', '#26262c'), bp('#3a5a2a', 'tank'), lambda m: T.bandolier(m, '#16141c', 'c'), cp('a', lining='#3a5a2a')])
P('Minigunner', 'steve', dict(a='#5a6a3a', b='#4e5634', c='#c83838', d='#2a2420', v='#5e6438', disc=ROLE['Offense']),
  lambda m: (T.shirt(m, 'a', 'short'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'), T.headband(m, 'c', tails=True), T.bandolier(m, 'k', 'gold')),
  arm=('g:minigun', 'g:minigun@1.15'), amats=dict(furn='#5e6438'), size=1.1, ups=[gl('k', 'fingerless'), bl(), vs(), bp('#4e5634')])
P('Ranger', 'alex', dict(a='#3e5a3a', b='#5a4a32', c='#ff6a4a', d='#3a2416', glow='#ff6a4a', disc=ROLE['Defense']),
  lambda m: (T.coat(m, 'a', lining='#2a3a26', bottom=5.0, trim='#2a3a26'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=5.0),
             T.hood(m, 'a', lining='#2a3a26')),
  arm=('g:rail', 'g:rail@1.2'), emblem='sight', ups=[gl(), bl('k', 'metal', 'pouch'), pa('#5a4a32', 'pad'), cp('#3e5a3a', lining='#2a3a26')])
B('Pursuit', BUILDINGS['Pursuit'])
B('Gatling Gun', BUILDINGS['Gatling Gun'])
B('Turret', BUILDINGS['Turret'])
OLD('Mortar', hq.mortar)
B('Mercenary Base', BUILDINGS['Mercenary Base'], fire='')
P('Brawler', 'steve', dict(a='#c83838', b='#1e1e24', c='#eef0f2', d='#eef0f2', disc=ROLE['Offense']),
  lambda m: (T.shirt(m, 'a', 'none', neck='round'), T.trousers(m, 'b', 'shorts'), T.boots(m, 'd', 'shoes', sole='#c83838'),
             T.gloves(m, 'a', 'boxing'), T.headband(m, 'c')),
  pose='ready2', fire='swing', ups=[kn('b'), bl('#d8a838', 'gem', None), lambda m: T.scarf(m, 'c', tail=False), cp('a', lining='b', trim='#d8a838', length=17)])
P('Necromancer', 'steve', dict(a='#2a2030', c='#7cff8c', glow='#7cff8c', disc=ROLE['Defense']),
  lambda m: (T.robe(m, 'a', trim='#8a6ab0', sleeves='bell', sash='#4a2a5a'), T.hood(m, '#3a2a48', lining='#1a1420'), T.boots(m, '#1e1a24', 'shoes')),
  arm='c:staff', amats=dict(mat='bone', mat2='wood2', glow='glow', size=1.3), emblem='star',
  ups=[pa('bone', 'metal'), ob('bone', 3, kind='skull'), bl('#3a2a48', 'bone'), au('glow')])
P('Accelerator', 'steve', dict(a='#26262e', b='#26262e', c='#c070ff', d='#16141c', glow='#c070ff', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', trim='c'), T.trousers(m, 'b', 'plain', knee='#3a3a46'),
             T.boots(m, 'd', 'combat'), T.helmet(m, '#2e2e38', 'combat', band='c', visor='c'), T.gloves(m, '#3a3a46')),
  arm=('g:laser', 'g:laser@1.25'), emblem='star', ups=[bl('#16141c', 'c'), bp('#3a3a46', 'tank'), pa('#3a3a46', 'metal', trim='c'), ob('glow', 2, size=0.9)])
P('Engineer', 'steve', dict(a='#e8742c', b='#3a4a6a', c='#e8c838', d='#5a3a22', e='#6a6e78', v='#e8742c', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='rolled'), T.trousers(m, 'b', 'jeans'), T.boots(m, 'd', 'work', top=5.0),
             T.helmet(m, 'c', 'hard')),
  arm='c:wrench', amats=dict(mat='metal'), ups=[gl(), bl('k', 'metal', 'pouch'), vs('#e8742c', 'hivis'), bp('#6a6e78')])
P('Hacker', 'alex', dict(a='#3a2a5a', b='#2e3a52', c='#7cff8c', d='#eef0f2', glow='#7cff8c', disc=ROLE['Support']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#26262e', sleeves='long', pockets=True), T.trousers(m, 'b', 'jeans'),
             T.boots(m, 'd', 'shoes', sole='#3a3a44'), T.headset(m, '#26262e', mic=False), T.hood(m, 'a', lining='#1e1630')),
  arm='k:laptop', amats=dict(mat='#2a2a34', glow='glow'), ups=[gl('#26262e', 'fingerless'), bp('#26262e'), lambda m: T.goggles(m, '#26262e', '#7cff8c', 'helmet'), ob('glow', 3, size=0.7)])
P('Operator', 'steve', dict(a='#2e3036', b='#26282c', d='#16141c', e='#3a3e44', k='#26282c', v='#4a5040', disc=ROLE['Offense']),
  lambda m: (fatigues(m, helm=None), T.helmet(m, 'a', 'combat', band='k', nvg=True), T.vest(m, 'v', 'tactical')),
  arm=('g:ar', 'g:lmg'), amats=dict(furn='#9a8a68'), ups=[gl('#16141c'), kn('#16141c'), both(bp('#26282c', 'radio'), hs()), pa('#3a3e44', 'pad')])
P('Enforcer', 'steve', dict(a='#2a3a5a', b='#1e2430', c='#d8dce4', d='#16141c', v='#1e2430', disc=ROLE['Offense']),
  lambda m: (fatigues(m, helm=None), T.vest(m, 'v', 'riot', trim='#3a4a6a'), T.helmet(m, '#1e2430', 'combat', band='#3a4a6a', visor='#9ab8d8', raised=True)),
  arm=('g:shotgun', 'g:combat'), emblem='star', ups=[gl('#16141c'), kn('#16141c'), pa('#1e2430', 'pad'), bl('#16141c', 'metal', '#1e2430')])
P('Kingpin', 'steve', dict(a='#e8e0c8', b='#e8e0c8', c='#d8a838', e='#c8c0a8', gun='#c8962c', gun2='#8a6418', disc=ROLE['Offense']),
  lambda m: (suit(m, shirt_col='#26262e', tie_col='c', shoes='#eef0f2'), T.hat(m, '#eef0f2', band='#1e1e24', kind='fedora')),
  arm='g:tommy', amats=dict(furn='wood', wood=True), size=1.1, emblem='coin', ups=[gl('#1e1e24'), bl('#1e1e24', 'gold'), lambda m: T.bandolier(m, 'c', 'gold'), cp('#eef0f2', lining='#c83838', trim='c')])
P('Juggernaut', 'steve', dict(a='#3a3e46', b='#2e3036', c='#ff4a3c', d='#16141c', v='#5a5e68', m='#6a6e78', glow='#ff4a3c', disc=ROLE['Offense']),
  lambda m: (fatigues(m, helm=None), T.vest(m, 'v', 'plate', trim='#2e3036'), T.helmet(m, 'v', 'knight', band='#2e3036', visor='c'),
             T.gloves(m, 'v', 'gauntlet'), T.kneepads(m, 'v'), T.pauldrons(m, 'm', '#2e3036', 'metal')),
  arm=('g:minigun@1.15', 'g:minigun@1.3'), amats=dict(furn='#2e3036'), size=1.2,
  ups=[bl('#16141c', 'metal'), lambda m: T.bandolier(m, '#16141c', 'gold'), bp('#2e3036'), cp('#3a3e46', lining='c')])
golden('Golden Minigunner', 'Minigunner')
golden('Golden Pyromancer', 'Pyromancer')
golden('Golden Crook Boss', 'Crook Boss')
golden('Golden Scout', 'Scout')
golden('Golden Cowboy', 'Cowboy')
P('Golden Soldier', 'steve', {**GOLD}, lambda m: (fatigues(m), T.patch(m, 'disc')), arm=('g:ar', 'g:lmg'), swap=3, ups=[gl(), bl(), vs(), both(bp('k', 'radio'), hs())])
golden('Golden Demoman', 'Demoman')
P('Gladiator', 'steve', dict(a='#c84a3a', b='#7a4a2a', c='#d8a838', d='#5a3a22', m='#c8ccd4', disc=ROLE['Offense']),
  lambda m: (T.shirt(m, 'a', 'short'), skirt_only(m, 'b', 'c'),
             T.boots(m, 'd', 'shoes'), T.helmet(m, 'm', 'knight', band='c', crest='a'), T.belt(m, 'k', 'gold'),
             weapon(m, 'shield', 'l', mat='a', mat2='c')),
  arm='m:sword', ups=[gl('k', 'gauntlet'), pa('m', 'metal', trim='c'), kn('m'), cp('a', lining='#8a2424', trim='c')])
P('Commando', 'steve', dict(a='#4e5a32', b='#3e4a28', c='#c8302a', d='#2a2420', e='#1e1e22', v='#4e5a32', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='none'), T.trousers(m, 'b', 'cargo'),
             T.boots(m, 'd', 'combat'), T.headband(m, 'c', tails=True), T.bandolier(m, 'k', 'gold')),
  arm=('g:smg', 'g:launcher'), swap=3, ups=[gl('k', 'fingerless'), bl(), vs(), bp('#3e4a28')])
P('Slasher', 'steve', dict(a='#3a3a44', b='#2a3a5a', c='#eef0f2', d='#1e1e24', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#26262e', sleeves='long', pockets=True), T.trousers(m, 'b', 'jeans'), T.boots(m, 'd', 'work', top=5.0),
             T.mask(m, 'c', 'bandana'), T.hood(m, 'a', lining='#1e1e24')),
  arm='m:cleaver', amats=dict(mat='metal', size=1.2), ups=[gl('#1e1e24'), bl('#1e1e24', 'metal'), pa('#26262e', 'pad'), cp('#26262e', lining='#5a1a1a')])
P('Frost Blaster', 'alex', dict(a='#eef6fc', b='#5aa8d8', c='#9ad8f8', d='#eef0f2', v='#c8e4f4', glow='#d8ffff', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='b', sleeves='long', cuff='b', trim='b'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat', sole='#8aa8c8'),
             T.helmet(m, 'a', 'combat', band='b', visor='c', raised=True)),
  arm=('g:frostcannon', 'g:frostcannon@1.2'), emblem='flake', ups=[gl('b'), bp('#9ac8e8', 'tank'), pa('v', 'metal', trim='b'), au('ice')])
P('Archer', 'alex', dict(a='#3e6a32', b='#6a4a2a', c='#d8a838', d='#5a3a22', disc=ROLE['Defense']),
  lambda m: (T.shirt(m, 'a', 'long', neck='v'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=5.5), T.belt(m, 'k', 'gold'),
             T.hood(m, 'a', lining='#2a4a22'), T.quiver(m)),
  arm='b:bow', amats=dict(furn='wood', fletch='c'), emblem='sight', ups=[gl('k', 'gauntlet'), pa('#6a4a2a', 'pad'), cp('a', lining='#2a4a22', trim='c'), au('glow')])
P('Swarmer', 'alex', dict(a='#eef0f2', b='#eef0f2', c='#e8c838', d='#eef0f2', glow='#ffd650', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#c8ccd4', sleeves='long', pockets=True), T.trousers(m, 'b', 'plain'),
             T.boots(m, 'd', 'work', sole='#8a8e98'), T.gloves(m, 'c'), T.hat(m, '#eef0f2', band='c', kind='bush', brim=2.8),
             orbit(m, 'yellow', 4, 8.0, size=0.5)),
  arm='g:hive', emblem='bomb', ups=[bl('#8a6a3a', 'metal'), bp('#d8b048'), kn('#c8ccd4'), au('glow')])
P('Toxic Gunner', 'steve', dict(a='#d8c030', b='#c8b028', c='#1e1e24', d='#1e1e24', glow='#b8ff3c', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'),
             T.gloves(m, 'c'), T.mask(m, 'c', 'gas', filt='#5a8a2a'), T.hood(m, 'a', lining='#8a7a1a', drape=False)),
  arm=('g:toxic', 'g:toxic@1.25'), emblem='bomb', ups=[bl('c', 'metal'), bp('#5a8a2a', 'tank'), pa('c', 'pad'), au('glow')])
P('Sledger', 'steve', dict(a='#3a6ab8', b='#2a3a5a', c='#eef0f2', d='#3a2416', disc=ROLE['Offense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', pockets=True), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=5.0),
             T.beanie(m, 'c', fold='a', pom='a'), T.gloves(m, 'c')),
  arm='m:hammer', amats=dict(mat='ice', mat2='wood2', size=1.3), size=1.1, emblem='flake',
  ups=[bl('k', 'metal'), sc('c', 'a'), pa('#d8e0e8', 'fur'), au('ice')])
P('Executioner', 'steve', dict(a='#1a1a20', b='#1e1e24', c='#8a1a1a', d='#141418', m='#5a5e68', disc=ROLE['Offense']),
  lambda m: (T.coat(m, 'a', lining='c', bottom=6.0, trim='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'), T.mask(m, '#141418', 'bandana'),
             T.hood(m, 'a', lining='c')),
  arm='m:battleaxe', amats=dict(mat='metal', mat2='wood2', size=1.2), ups=[gl('m', 'gauntlet'), bl('#141418', 'metal'), pa('m', 'metal', trim='c'), cp('c', lining='a')])
B('Elf Camp', BUILDINGS['Elf Camp'], fire='')
P('Jester', 'alex', dict(a='#c83838', b='#7a3aa8', c='#d8a838', d='#7a3aa8', disc=ROLE['Defense']),
  lambda m: (harlequin(m, 'a', 'b'), T.boots(m, 'c', 'shoes', sole='b'), T.jester(m, 'a', 'b', 'c')),
  arm='t:bomb', emblem='bomb', ups=[gl('c'), lambda m: T.belt(m, 'c', 'gold'), ob('glow', 3, size=0.8), cp('b', lining='a', trim='c', length=15)])
P('Cryomancer', 'alex', dict(a='#cfeeff', b='#5aa8d8', c='#9ad8ff', glow='#d8ffff', disc=ROLE['Defense']),
  lambda m: (T.robe(m, 'a', trim='b', sleeves='bell', sash='b'), T.boots(m, 'b', 'shoes'), T.hat(m, 'b', band='a', kind='wizard', brim=2.0)),
  arm='c:staff', amats=dict(mat='ice', mat2='ice2', glow='ice', size=1.3), emblem='flake',
  ups=[bl('b', 'ice'), pa('#e8f6ff', 'metal', trim='b'), ob('ice', 3, size=0.8), au('ice')])
P('Hallow Punk', 'steve', dict(a='#1e1e22', b='#3a4a6a', c='#7a3aa8', d='#16141c', furn='#e8842c', glow='#ffb040', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=True, shirt_col='c', sleeves='long', lining='#3a3a40'), T.trousers(m, 'b', 'jeans'), T.boots(m, 'd', 'combat', top=5.0),
             T.pumpkin_head(m, 'orange', 'glow')),
  arm='g:launcher', emblem='bomb', ups=[gl('#16141c', 'fingerless'), bl('#16141c', 'metal'), pa('#26262e', 'metal', trim='c'), cp('a', lining='c')])
P('Harvester', 'steve', dict(a='#5a4a32', b='#3a3020', c='#9aff9a', d='#2a2018', glow='#9aff9a', disc=ROLE['Defense']),
  lambda m: (T.coat(m, 'a', lining='#3a2e1e', bottom=4.0, trim='#3a2e1e'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=5.0),
             T.hood(m, 'a', lining='#2a2018')),
  arm='m:scythe', amats=dict(mat='metal', mat2='wood2'), ups=[gl('#2a2018'), bl('#2a2018', 'metal'), pa('#3a3020', 'pad'), au('glow')])
P('Snowballer', 'alex', dict(a='#c83838', b='#3a4a6a', c='#eef0f2', d='#4a2e1a', disc=ROLE['Defense']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='c', pockets=True), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work'),
             T.beanie(m, 'c', fold='a', pom='a'), T.scarf(m, 'c', 'a'), crate_on(m, 6.6, 6.4, 2.6, 'white', 'snowpile')),
  arm='t:snowball', emblem='flake', ups=[gl('a', 'mitten'), bp('#3a4a6a'), kn('b'), au('ice')])
P('Elementalist', 'alex', dict(a='#c84a3a', b='#3a6ab8', c='#d8a838', glow='#ffb040', disc=ROLE['Defense']),
  lambda m: (split_robe(m, 'a', 'b', 'c'), T.boots(m, '#2a2018', 'shoes'), T.hat(m, 'b', band='c', kind='wizard', brim=2.0),
             weapon(m, 'orb', 'l', glow='ice')),
  arm='c:orb', amats=dict(glow='glow'), emblem='star', ups=[bl('#2a2018', 'c'), pa('c', 'metal'), ob('glow', 3, size=0.8), au('glow')])
P('Firework Technician', 'steve', dict(a='#3a5ab4', b='#3a5ab4', c='#c83838', d='#2a2018', disc=ROLE['Support']),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='#26306a', sleeves='rolled', pockets=True), T.trousers(m, 'b', 'plain', knee='#2a3a7a'),
             T.boots(m, 'd', 'work'), T.cap(m, 'c', visor='#8a2424'), T.goggles(m, '#2a2a30', '#9ae0ff', 'helmet')),
  arm='g:firework', emblem='star', ups=[gl(), bl('k', 'metal', 'pouch'), bp('c'), vs('#e8742c', 'hivis')])
P('Biologist', 'alex', dict(a='#eef0f2', b='#2e3a52', c='#3cc864', d='#3a3a44', glow='#7cff8c', disc=ROLE['Support']),
  lambda m: (T.coat(m, 'a', lining='#c8ccd4', bottom=5.0, shirt_col='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'shoes'),
             T.goggles(m, '#3a3a44', '#7cff8c', 'forehead'), pot_on(m, 7.0, 6.0, 'green', 'gold'), pot_on(m, -7.0, 6.0, 'green', 'purple', 'pot2')),
  arm='c:flask', amats=dict(glow='glow'), emblem='cross', ups=[gl('#5a8ad8'), bl('#3a3a44', 'metal'), bp('#3a5a2a', 'tank'), au('glow')])
P('Warlock', 'steve', dict(a='#3a1a4a', b='#1a1a20', c='#c070ff', glow='#c070ff', disc=ROLE['Offense']),
  lambda m: (T.robe(m, 'a', trim='c', sleeves='bell', sash='#1a1a20'), T.boots(m, '#16141c', 'shoes'), T.hood(m, 'a', lining='#16141c'),
             T.horns_on(m, 'dark', 0.9)),
  arm='c:staff', amats=dict(mat='dark', mat2='wood2', glow='glow', size=1.3), emblem='star',
  ups=[pa('#2a1a3a', 'metal', trim='c'), ob('glow', 3, size=0.8), bl('#1a1a20', 'c'), both(cp('a', lining='#16141c', trim='c', length=18), au('glow'))])
B('Spotlight Tech', BUILDINGS['Spotlight Tech'], fire='')
B('War Machine', BUILDINGS['War Machine'])
B('Mecha Base', BUILDINGS['Mecha Base'], fire='')
B('Sentry', BUILDINGS['Sentry'])
P('Twitgunner', 'alex', dict(a='#4ab4e8', b='#eef0f2', c='#e8c838', d='#eef0f2', v='#3a8ac8', disc='#8a8e98'),
  lambda m: (T.jacket(m, 'a', open=False, zip_col='c', sleeves='long', cuff='b'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'shoes', sole='#3a8ac8'),
             T.cap(m, 'b', visor='c', logo='a')),
  arm='g:smg', ups=[gl('#3a8ac8'), bl('#3a8ac8', 'c'), vs('v'), bp('a')])
B('Void Miner', BUILDINGS['Void Miner'], fire='')
P('Combatant', 'steve', dict(a='#7a6a4a', b='#5a4a32', d='#2a2018', e='#3a3226', v='#6a5a3a', disc='#8a8e98'),
  lambda m: (fatigues(m, jacket_open=True, sleeves='rolled'), T.patch(m, '#8a8e98')),
  arm=('g:ar', 'g:combat'), ups=[gl(), bl(), vs(), bp('#5a4a32')])
OLD('Crystallizer', hq.frost)
golden('Golden Snowballer', 'Snowballer')


# ------------------------------------------------------------------------------------------------ outfits of one tower
def plaid_jacket(m, a, b, rolled=False):
    """a check shirt worn open as a jacket (the hunter's, the trapper's)"""
    ac, bc = T.C(m, a), T.C(m, b)

    def plaid(p, base=ac):
        if p.face in ('up', 'down'):
            return T.grain(p, base)
        if (p.i % 4 == 1) or (p.j % 4 == 1):
            return T.mul(bc, 1.0) if (p.i % 4 == 1) and (p.j % 4 == 1) else T.mix(base, bc, 0.5)
        return T.grain(p, base)
    T.shirt(m, '#2a2a30', 'none')
    jacket_with(m, plaid, rolled)


def jacket_with(m, pp, rolled=False):
    """a jacket of any pattern: the torso open over the dark shirt, sleeves long or rolled"""
    T.wear(m, 'body', 'jacket', T.LAYER['jacket'], lambda p: None if (p.face == 'north' and p.i in (3, 4) and p.j < p.h - 1) else pp(p), y0=10.5)
    for part in ('rarm', 'larm'):
        a0 = T.arm_y(m, part)
        T.wear(m, part, f'jacket_{part}', T.LAYER['jsleeve'] - (0.02 if part == 'larm' else 0.0),
               lambda p: (T.mul(pp(p), 1.15) if rolled and p.face in T.SIDES and p.j >= p.h - 2 else pp(p)), y0=a0 + (7 if rolled else 3))


def harlequin(m, a, b):
    """a jester's suit, two colours in diamonds"""
    ac, bc = T.C(m, a), T.C(m, b)

    def pp(p):
        q = p.inbone()
        k = (int((q[0] + q[1] + 40) / 2.0) + int((q[0] - q[1] + 40) / 2.0)) % 2
        return T.grain(p, ac if k else bc)
    T.wear(m, 'body', 'jester_suit', T.LAYER['jacket'], pp)
    for part in ('rarm', 'larm'):
        T.wear(m, part, f'jester_{part}', T.LAYER['jsleeve'] - (0.02 if part == 'larm' else 0.0), pp, y0=T.arm_y(m, part) + 3)
    for part in ('rleg', 'lleg'):
        T.wear(m, part, f'jester_{part}', T.LAYER['trousers'] + (0.04 if part == 'lleg' else 0.0), pp, y0=2.0)
    T.wear(m, 'body', 'ruff', T.LAYER['strap'], lambda p: None if p.face == 'down' else (T.C(m, 'white') if p.i % 2 else T.mul(T.C(m, 'white'), 0.85)),
           y0=22.6, y1=24.0)


def split_robe(m, a, b, trim):
    """a robe half one element, half the other (the elementalist's)"""
    T.robe(m, a, trim=trim, sleeves='bell')
    bc = T.C(m, b)
    for c in m.cubes:
        if c.get('decal') == 'tailor' and c['name'].startswith(('robe', 'bell_larm')):
            old = c['pp']
            c['pp'] = (lambda old, c: (lambda p: (T.grain(p, bc) if (p.inbone()[0] > 0.0 and old(p) is not None and old(p) != T.C(m, trim)) else old(p))))(old, c)


def skirt_only(m, col, trim):
    """a gladiator's skirt of strips from the belt"""
    cc, tc = T.C(m, col), T.C(m, trim)
    T.wear(m, None, 'skirt', T.LAYER['jacket'] + 0.05, lambda p: None if p.face == 'up' or (p.face in T.SIDES and p.i % 2 == 1 and p.j > 1)
           else (tc if p.j == p.h - 1 else T.grain(p, cc)), bone=m.rig.parts['body'][0], box=(-4, 4, 6.5, 12.5, -2, 2))


# ------------------------------------------------------------------------------------------------ building the looks
def build(name, rec, data):
    sl = slug(name)
    top = max(0, len(data.get('levels') or []) - 1)
    if rec['kind'] in ('building', 'old'):
        m = rec['make']()
        return Look('tower', name, sl, None, m, None, 'building', rec.get('size', BUILDING_SIZE), False,
                    extra=dict(root='building', pose='', fire=rec['fire'], smoke=rec.get('smoke')))
    rig = RIGS[rec['body']]
    pal = {**DEF, **rec['pal']}
    m = T.person(f't_{sl}', rec['body'], pal, pal.get('disc'), rec['emblem'] or 'chevron')
    m.own = lambda p, m=m: own_px(m, p)
    rec['outfit'](m)
    spec = rec['arm']
    swap = rec['swap'] or (min(4, top) if isinstance(spec, tuple) else None)
    armament(m, spec, swap, rec['amats'])
    ups = list(rec['ups']) + [None] * 4
    at = {1: ups[0], 2: ups[1], 3: ups[2]}
    mx = min(top, 5) if top >= 4 else 3
    steps = {}
    for lv, fn in at.items():
        if fn and lv <= top:
            steps.setdefault(lv, []).append(fn)
    if ups[3]:
        steps.setdefault(mx, []).append(ups[3])
    if top >= 6:
        steps.setdefault(6, []).append(lambda m: aura(m, 'gold', 11.0, y=4.75, n=10, bone='tds_base'))
    for lv in sorted(steps):
        with level(m, f'lv{lv}'):
            for fn in steps[lv]:
                fn(m)
    finish(m)
    first = spec[0] if isinstance(spec, tuple) else spec
    how = first.split(':')[0] if first else None
    pose = rec['pose'] or POSE[how]
    fire = SHOT[how] if rec['fire'] is None else rec['fire']
    return Look('tower', name, sl, rig, None, m, f'root_{pose}', rec['size'], False, extra=dict(root='root', pose=pose, fire=fire))


def looks():
    data = load('towers')
    order = list(data)
    out = [build(n, TOWER[n], data[n]) for n in order if n in TOWER]
    out.sort(key=lambda lk: (ORDER.index(lk.anim), order.index(lk.name)))
    for i, lk in enumerate(out):
        lk.index = i
    return out


def missing():
    return [n for n in load('towers') if n not in TOWER]

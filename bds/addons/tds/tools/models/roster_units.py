"""One look per unit of the data (data/units.json): the soldiers, crooks, elves and townsfolk are Steve or Alex in clothes of
ours (tailor.py) with the weapons of arms.py; the Necromancer's dead are the vanilla skeleton in our armour; the vehicles,
sentries, mechs, plants and ducks are bodies of our own (vehicles.py, critters.py). Original designs, made from what the
data says a unit is (its tower, type, damage and range), never from another game's art.

    looks() -> [Look ...] in skin order (looks of one animation together); the index is the unit's tds:skin and
    src/looks.ts UNIT_LOOK gives the script name -> [skin, size].
"""
from __future__ import annotations

import arms
import tailor as T
from kitbash import weapon
from rigs import RIGS
from roster import Look, load, slug

ANIM_ORDER = ['patrol', 'pistol', 'carry', 'brawl', 'march', 'run', 'stomp', 'ride', 'drive', 'fly', 'stride', 'sentry', 'sway', 'waddle',
              'scuttle', 'golem']
UNIT = {}
DEF = dict(a='#5a6a3a', b='#4e5634', c='#c83838', d='#2a2420', k='#3a3226', v='#6e7448', m='#9aa0aa', e='#3a3e2a')
GOLD = dict(a='#d8a838', b='#a87a20', c='#fff0a0', d='#7a5a14', k='#8a6418', v='#c8962c', e='#3a2a10', gun='#e0b040', gun2='#8a6418', furn='#a87a20')


def PU(name, body, pal, outfit, arm=None, anim='patrol', size=1.0, amats=None):
    """a person: `outfit(m)` the clothes, `arm` what is held ('g:<gun>' at the chest, 'p:<kind>' a pistol in the right
    fist, 'c:<kind>' carried in the right fist (and 'c2:' in both), 'w:<kind>' a melee weapon, 'l:<kind>' carried in the left)"""
    UNIT[name] = dict(kind='person', body=body, pal=pal, outfit=outfit, arm=arm, anim=anim, size=size, amats=amats or {})


def OWN(name, make, anim, size=1.0):
    UNIT[name] = dict(kind='own', make=make, anim=anim, size=size)


def armed(m, spec, mt):
    from kit import hexc
    for k, v in mt.items():                                   # a colour given as '#rrggbb' is a material of its own
        if isinstance(v, str) and v.startswith('#') and v not in m.mats:
            m.mats[v] = hexc(v)
    for one in (spec if isinstance(spec, (tuple, list)) else (spec,)):
        if not one:
            continue
        how, kind = one.split(':')
        if how == 'g':
            arms.gun(m, kind, s=mt.get('s', 1.05), **{k: v for k, v in mt.items() if k in ('mat', 'mat2', 'glow', 'furn', 'wood', 'head')})
        elif how == 'p':
            arms.pistol(m, 'r', kind, s=mt.get('ps', 1.0), **{k: v for k, v in mt.items() if k in ('mat', 'mat2', 'furn', 'wood')})
        elif how in ('c', 'l', 'c2'):
            for side in ({'c': ('r',), 'l': ('l',), 'c2': ('r', 'l')}[how]):
                arms.carry(m, side, kind, s=mt.get('cs', 1.0), **{k: v for k, v in mt.items() if k in ('mat', 'mark')})
        elif how == 'w':
            weapon(m, kind, 'r', mt.get('wmat', 'metal'), mt.get('wmat2', 'wood'), mt.get('size', 1.0), mt.get('glow'), tilt=mt.get('tilt', 0))
        elif how == 'wl':
            weapon(m, kind, 'l', mt.get('wmat', 'metal'), mt.get('wmat2', 'wood'), mt.get('size', 1.0), mt.get('glow'), tilt=mt.get('tilt', 0))
        else:
            raise KeyError(how)


# ------------------------------------------------------------------------------------------------ outfits many share
def merc(m, helm=None, cap=None):
    """a mercenary: a coyote shirt, olive trousers, a plate carrier, boots"""
    T.jacket(m, 'a', open=False, zip_col='e', sleeves='rolled', cuff='b', pockets=True)
    T.trousers(m, 'b', 'cargo')
    T.boots(m, 'd', 'combat', lace='k')
    T.vest(m, 'v', 'tactical')
    if helm:
        T.helmet(m, 'a' if helm is True else helm, 'combat', band='k')
    if cap:
        T.cap(m, cap, visor='k')


def suit(m, shirt='#e8e4dc', tie=None, shoes='#141418', lining=None):
    T.jacket(m, 'a', open=True, shirt_col=shirt, sleeves='long', lining=lining or 'e', pockets=True)
    if tie:
        tie_on(m, tie)
    T.trousers(m, 'b', 'suit')
    T.boots(m, shoes, 'shoes', sole='#0e0e10')


def tie_on(m, col):
    cc = T.C(m, col)
    b = m.rig.parts['body'][0]
    z = -2 - T.LAYER['shirt']
    T.piece(m, b, 'tie_knot', -0.6, 0.6, 22.6, 23.8, z - 0.35, z, lambda p: T.grain(p, T.mul(cc, 0.9)))
    T.piece(m, b, 'tie', -0.7, 0.7, 15.6, 22.6, z - 0.2, z - 0.05, lambda p: T.grain(p, cc) if p.j < p.h - 1 else T.mul(cc, 0.85))


def pinstripe(m, col, stripe):
    """a pinstripe suit: the jacket's and trousers' painters lined every third texel"""
    sc = T.C(m, stripe)
    for c in m.cubes:
        if c.get('decal') == 'tailor' and c['name'].split('_')[0] in ('jacket', 'trousers'):
            old = c['pp']
            c['pp'] = (lambda old: lambda p: (sc if (p.face in T.SIDES and p.i % 3 == 1 and old(p) is not None) else old(p)))(old)


def elf(m, tunic, hat=None, legs='#eef0f2', stripe='#c83838', shoes='#2e6a2e', belt='#2a2018'):
    """an elf: a tunic with a white fur hem, striped stockings, curled shoes, pointed ears, a long hat with a bell"""
    tc = T.C(m, tunic)
    T.wear(m, 'body', 'tunic', T.LAYER['jacket'], lambda p: None if p.face == 'up' else (T.C(m, 'white') if p.face in T.SIDES and p.j >= p.h - 1 else T.grain(p, tc)), y0=9.6)
    for part in ('rarm', 'larm'):
        T.wear(m, part, f'tunic_{part}', T.LAYER['jsleeve'] - (0.02 if part == 'larm' else 0.0),
               lambda p: T.C(m, 'white') if p.face in T.SIDES and p.j == p.h - 1 else T.grain(p, tc), y0=T.arm_y(m, part) + 3)
    sc, lc = T.C(m, stripe), T.C(m, legs)
    for part in ('rleg', 'lleg'):
        T.wear(m, part, f'stocking_{part}', T.LAYER['trousers'] + (0.04 if part == 'lleg' else 0.0),
               lambda p: None if p.face == 'up' else (sc if (p.j // 2) % 2 == 0 else lc), y0=2.0, y1=10.0)
    T.boots(m, shoes, 'shoes', sole='#1e3a1e')
    for part in ('rleg', 'lleg'):
        x0, x1, _, _, z0, z1 = m.rig.parts[part][1]
        cx = (x0 + x1) / 2
        T.piece(m, m.rig.parts[part][0], f'curl_{part}', cx - 0.6, cx + 0.6, 1.0, 2.4, z0 - 3.9, z0 - 2.9, lambda p: T.grain(p, T.C(m, shoes)))
    T.belt(m, belt, 'gold')
    T.elf_ears(m)
    T.elf_hat(m, hat or tunic, 'white', 'gold')


def skull_cloth(m, col, belt_col='#3a3226'):
    """a dead soldier's rags: a torn tabard and a rope belt over the bones"""
    cc = T.C(m, col)

    def rag(p):
        if p.face == 'up':
            return None
        if p.face in T.SIDES and p.j >= p.h - 2 and (p.i * 7 + p.j) % 3 == 0:
            return None                                                        # a torn hem
        return T.grain(p, cc, 0.08)
    T.wear(m, 'body', 'tabard', 0.6, rag, y0=8.5, y1=23.0)
    T.belt(m, belt_col, '#8a7a5a')


# ------------------------------------------------------------------------------------------------ the units, the data's order
# Military Base
OWN('Motorcycle', lambda: __import__('vehicles').motorcycle(), 'ride')
OWN('Truck1', lambda: __import__('vehicles').truck(1), 'drive')
OWN('Truck2', lambda: __import__('vehicles').truck(2), 'drive')
OWN('Truck3', lambda: __import__('vehicles').truck(3), 'drive')
# Engineer
OWN('Sentry (Unit)', lambda: __import__('vehicles').sentry(0), 'sentry')
OWN('Rifle Sentry', lambda: __import__('vehicles').sentry(1), 'sentry')
OWN('Minigun Sentry', lambda: __import__('vehicles').sentry(2), 'sentry')
OWN('War Machine Sentry', lambda: __import__('vehicles').sentry(3), 'sentry')
# Crook Boss
CROOK = dict(a='#4a3a2e', b='#3a3430', c='#c83838', d='#2a2018', e='#d8d0c0', k='#2a2018')
PU('Golden Crook', 'steve', {**CROOK, 'a': '#c8962c', 'b': '#8a6418', 'c': '#fff0a0', 'gun': '#e0b040', 'gun2': '#8a6418'},
   lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='long', pockets=True), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=4.0),
              T.flat_cap(m, 'b', check='a'), T.scarf(m, 'c', tail=False)),
   arm='p:revolver', anim='pistol', amats=dict(furn='wood', wood=True))
PU('Golden Mafia', 'steve', {**GOLD, 'e': '#1e1e24'},
   lambda m: (suit(m, shirt='#1e1e24', tie='c'), pinstripe(m, 'a', '#f0d060'), T.hat(m, '#1e1e24', band='a', kind='fedora')),
   arm='g:tommy', amats=dict(furn='wood', wood=True))
PU('Crook', 'steve', CROOK,
   lambda m: (T.jacket(m, 'a', open=True, shirt_col='e', sleeves='long', pockets=True), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'work', top=4.0),
              T.flat_cap(m, '#5a5048', check='#3a3430'), T.scarf(m, 'c', tail=False)),
   arm='p:revolver', anim='pistol', amats=dict(furn='wood', wood=True))
PU('Mafia', 'steve', dict(a='#2a2a32', b='#2a2a32', c='#c83838', e='#3a3a46'),
   lambda m: (suit(m, shirt='#e8e4dc', tie='c'), pinstripe(m, 'a', '#5a5a66'), T.hat(m, '#2a2a32', band='c', kind='fedora')),
   arm='g:tommy', amats=dict(furn='wood', wood=True))
GUARD = dict(a='#1e1e24', b='#1e1e24', c='#16161c', e='#2a2a32')
PU('Body Guard', 'steve', GUARD, lambda m: (suit(m, shirt='#eef0f2', tie='c'), T.shades(m), T.earpiece(m)), arm='p:pistol', anim='pistol')
PU('Body Guards 1', 'alex', GUARD, lambda m: (suit(m, shirt='#eef0f2', tie='#3a3a46'), T.shades(m), T.earpiece(m)), arm='g:smg')
PU('Body Guards 2', 'steve', {**GUARD, 'v': '#26262e'},
   lambda m: (suit(m, shirt='#eef0f2', tie='c'), T.vest(m, 'v', 'plate'), T.shades(m), T.earpiece(m)), arm='g:combat')
# Golden Crook Boss
GGUARD = dict(a='#c8962c', b='#1e1e24', c='#e0b040', e='#1e1e24', gun='#e0b040', gun2='#8a6418', furn='#1e1e24')
PU('Golden Body Guard', 'steve', GGUARD, lambda m: (suit(m, shirt='#1e1e24', tie='c'), T.shades(m, glint='#fff0a0'), T.earpiece(m)), arm='p:pistol', anim='pistol')
PU('Golden Body Guards 1', 'alex', GGUARD, lambda m: (suit(m, shirt='#1e1e24', tie='c'), T.shades(m, glint='#fff0a0'), T.earpiece(m)), arm='g:smg')
PU('Golden Body Guards 2', 'steve', {**GGUARD, 'v': '#8a6418'},
   lambda m: (suit(m, shirt='#1e1e24', tie='c'), T.vest(m, 'v', 'plate', trim='c'), T.shades(m, glint='#fff0a0'), T.earpiece(m)), arm='g:combat')
# Commander
OWN('Gunner APC', lambda: __import__('vehicles').apc('gun'), 'drive')
OWN('Missile APC', lambda: __import__('vehicles').apc('missile'), 'drive')
# Mercenary Base
MERC = dict(a='#a08a64', b='#5a6040', d='#3a2a1a', e='#7a6a4a', k='#3a3226', v='#5a6040')
PU('Rifleman', 'steve', MERC, lambda m: (merc(m, cap='#6a6a48'), T.gloves(m, 'k', 'fingerless')), arm='g:ar', amats=dict(furn='#3a3226'))
PU('Grenadier', 'steve', {**MERC, 'v': '#4a5038'}, lambda m: (merc(m, helm='#6a6a48'), T.bandolier(m, 'k', '#c8a83a')), arm='g:launcher',
   amats=dict(furn='#6a7048'))
PU('Field Medic', 'alex', {**MERC, 'a': '#eef0f2', 'e': '#c8ccd4', 'v': '#c83838'},
   lambda m: (T.jacket(m, 'a', open=False, zip_col='e', sleeves='long', cuff='#c83838', pockets=True), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
              T.cap(m, 'a', visor='#c83838', logo='#c83838'), T.patch(m, '#c83838'), T.backpack(m, '#eef0f2', 'pack')),
   arm='c:medkit', anim='carry')
PU('Riot Guard', 'steve', dict(a='#2a3a5a', b='#1e2430', d='#16141c', e='#2a3a5a', k='#16141c', v='#1e2430'),
   lambda m: (T.jacket(m, 'a', open=False, zip_col='e', sleeves='long'), T.trousers(m, 'b', 'cargo'), T.boots(m, 'd', 'combat'),
              T.vest(m, 'v', 'riot', trim='#3a4a6a'), T.helmet(m, '#1e2430', 'riot', band='#3a4a6a', visor='#9ab8d8', raised=True),
              T.kneepads(m, '#16141c'), T.gloves(m, '#16141c')),
   arm=('c:baton', 'l:riotshield'), anim='brawl')
# Enforcer
OWN('Swat Van', lambda: __import__('vehicles').van('swat'), 'drive')
OWN('Swat Van Gunner', lambda: __import__('vehicles').van('gunner'), 'drive')
# Kingpin
PU('Lackey', 'alex', dict(a='#5a5a66', b='#2e3a52', c='#c83838', d='#eef0f2', e='#3a3a46'),
   lambda m: (T.jacket(m, 'a', open=False, zip_col='e', sleeves='long', pockets=True), T.hood_down(m, 'a'), T.trousers(m, 'b', 'jeans'),
              T.boots(m, 'd', 'shoes', sole='#3a3a44'), T.beanie(m, '#2a2a32')),
   arm='p:pistol', anim='pistol')
PU('Money Runner', 'steve', dict(a='#3a8a3a', b='#2e3a52', d='#eef0f2', e='#2a2a32', bag='#c8b07a'),
   lambda m: (T.shirt(m, 'a', 'short', collar='#2a6a2a'), T.trousers(m, 'b', 'jeans'), T.boots(m, 'd', 'shoes', sole='#c83838'),
              T.cap(m, '#2a2a32', visor='#3a8a3a', back=True)),
   arm='c2:moneybag', anim='run')
PU('Bouncer', 'steve', dict(a='#16161c', b='#1e1e24', d='#16141c', e='#16161c'),
   lambda m: (T.shirt(m, 'a', 'short', stripe=None), security(m), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'), T.shades(m), T.earpiece(m),
              T.gloves(m, '#16141c', 'fingerless')),
   arm=None, anim='brawl', size=1.25)
PU('Contractor', 'alex', dict(a='#2a2a32', b='#1e1e24', c='#8a1a1a', d='#16141c', e='#3a3a46'),
   lambda m: (T.coat(m, 'a', lining='c', bottom=5.0, shirt_col='e'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'combat'), T.beret(m, '#1e1e24', 'c'),
              T.gloves(m, '#16141c')),
   arm='g:sr', amats=dict(furn='#3a3a46'))
# Elf Camp
ELF = dict(d='#2e6a2e', k='#2a2018')
PU('Elf', 'alex', ELF, lambda m: elf(m, '#2e8a3e', '#c83838'), arm='c:gift', anim='carry', size=0.8)
PU('Snowball Elf', 'alex', ELF, lambda m: (elf(m, '#2e8a3e', '#2e8a3e'), T.scarf(m, '#c83838', '#eef0f2', tail=False)), arm='c:snowball', anim='carry', size=0.8)
PU('Cannoneer Elf', 'steve', ELF, lambda m: elf(m, '#c83838', '#2e8a3e', stripe='#2e8a3e'), arm='g:launcher', size=0.8, amats=dict(furn='#c83838'))
PU('Bomber Elf (Unit)', 'alex', ELF, lambda m: (elf(m, '#3a5ab4', '#3a5ab4'), T.goggles(m, '#3a3226', '#ffb040', 'forehead')), arm='c:gift', anim='carry',
   size=0.8, amats=dict(mat='black', mark='red'))
PU('Guardian Elf', 'steve', ELF, lambda m: (elf(m, '#2e8a3e', '#c83838'), T.pauldrons(m, '#c8ccd4', 'gold')), arm=('c:cane', 'l:riotshield'), anim='brawl',
   size=0.85, amats=dict(mat='#c83838'))
PU('Gunner Elf', 'alex', ELF, lambda m: (elf(m, '#c83838', '#c83838', stripe='#2e8a3e'), T.goggles(m, '#3a3226', '#9ae0ff', 'forehead')), arm='g:smg', size=0.8,
   amats=dict(furn='#2e8a3e'))
OWN('Gift Bomber', lambda: __import__('vehicles').gift_bomber(), 'fly')
PU('Ripped Elf (Unit)', 'steve', ELF, lambda m: (ripped(m), T.elf_ears(m), T.elf_hat(m, '#c83838', 'white', 'gold'), T.belt(m, '#2a2018', 'gold')),
   arm='g:rocket', size=1.3, amats=dict(furn='#c83838', head='#2e8a3e'))
# Necromancer: the vanilla skeleton in our armour
PU('Skeleton (Unit)', 'skeleton', dict(a='#5a4a3a'), lambda m: skull_cloth(m, '#5a4a3a'), arm='w:sword', anim='march', amats=dict(wmat='#8a8e96'))
PU('Sword Skeleton', 'skeleton', dict(a='#4a3a5a'), lambda m: (skull_cloth(m, '#4a3a5a'), T.helmet(m, '#7a7e88', 'combat', band='#4a4e56')),
   arm=('w:sword', 'wl:shield'), anim='march', amats=dict(wmat='metal', wmat2='#5a3a22'))
PU('Giant Skeleton (Unit)', 'skeleton', dict(a='#3a3a42'), lambda m: (skull_cloth(m, '#3a3a42'), T.horns_on(m, 'bone', 1.1)), arm='w:club', anim='stomp',
   size=2.0, amats=dict(wmat2='#5a4a3a', size=1.4))
PU('Skeleton Knight', 'skeleton', dict(a='#5a5e68', m='#8a8e98'),
   lambda m: (skull_cloth(m, '#2a2a46'), T.helmet(m, 'm', 'knight', band='#5a5e68', crest='#7a2a8a'), T.pauldrons(m, 'm', '#5a5e68', 'metal')),
   arm=('w:sword', 'wl:shield'), anim='march', size=1.1, amats=dict(wmat='metal', wmat2='#2a2a46'))
PU('Hallow Guard (Unit)', 'skeleton', dict(a='#2a2030'), lambda m: (skull_cloth(m, '#2a2030', '#e8842c'), T.pumpkin_head(m, 'orange', 'glow'), T.cape(m, '#2a2030', '#e8842c', '#e8842c', 14)),
   arm='w:spear', anim='march', size=1.2, amats=dict(wmat='#e8842c', wmat2='#2a2030'))
PU('Executioner Skeleton', 'wither', dict(a='#1a1a20', c='#8a1a1a'),
   lambda m: (skull_cloth(m, '#1a1a20', '#8a1a1a'), T.hood(m, '#1a1a20', lining='#8a1a1a', drape=True)),
   arm='w:battleaxe', anim='stomp', size=1.3, amats=dict(wmat='#9aa0aa', wmat2='#3a2416', size=1.2))
# Elementalist, Biologist, Consumables
OWN('Ice Turret', lambda: __import__('vehicles').ice_turret(), 'sentry')
OWN('Sunflower', lambda: __import__('critters').sunflower(), 'sway')
OWN('Ivy', lambda: __import__('critters').ivy(), 'sway')
OWN('Nightshade (Unit)', lambda: __import__('critters').nightshade(), 'sway')
OWN('Molten Monster', lambda: __import__('critters').molten_monster(), 'golem', size=1.4)
for _k in ('Fire', 'Confusion', 'Ice', 'Poison', 'Shock'):
    OWN(f'{_k} Ducky', (lambda k: lambda: __import__('critters').ducky(k))(_k), 'waddle')
OWN('Crab', lambda: __import__('critters').crab(), 'scuttle')
# Mecha Base
OWN('XR600', lambda: __import__('vehicles').mech('xr600'), 'stride')
OWN('Armored XR600', lambda: __import__('vehicles').mech('xr600a'), 'stride')
OWN('XR700', lambda: __import__('vehicles').mech('xr700'), 'stride')
OWN('XR900', lambda: __import__('vehicles').mech('xr900'), 'stride', size=1.15)
OWN('XR901', lambda: __import__('vehicles').mech('xr901'), 'stride', size=1.3)
# Shotgunner
OWN('SWAT Van', lambda: __import__('vehicles').van('police'), 'drive')
# Trick or Threat Town
PU('Citizen 1', 'steve', dict(a='#c8b088', b='#3a5a8a', c='#8a3a2a', d='#4a3020', e='#c8b088'),
   lambda m: (T.shirt(m, '#a83a2a', 'long', buttons='#2a2018'), plaid_shirt(m, '#a83a2a', '#2a2018'), T.overalls(m, '#3a5a8a'), T.boots(m, 'd', 'work', top=4.0),
              T.straw_hat(m)),
   arm='c:pitchfork', anim='brawl')
PU('Citizen 2', 'alex', dict(a='#5a3a6a', b='#3a3a46', c='#e8842c', d='#2a2018'),
   lambda m: (T.coat(m, 'a', lining='#3a2a46', bottom=4.0, trim='c'), T.trousers(m, 'b', 'plain'), T.boots(m, 'd', 'shoes'), T.hat(m, '#2a2a32', band='c', kind='wizard', brim=2.2)),
   arm='c:torch', anim='brawl')
OWN('Jeep', lambda: __import__('vehicles').jeep(), 'drive')


def security(m):
    """SECURITY across the back of a black shirt: a white band where the word goes"""
    b = m.rig.parts['body'][0]
    L = T.LAYER['shirt']
    T.piece(m, b, 'security', -3.4, 3.4, 19.4, 21.0, 2 + L, 2 + L + 0.1,
            lambda p: T.C(m, 'white') if p.face == 'south' and p.j == 1 and p.i % 2 == 0 else T.C(m, '#16161c'))


def ripped(m):
    """a strong elf: a sleeveless green vest over bare arms, a white fur trim, red trousers"""
    T.shirt(m, '#2e8a3e', 'short', collar='#eef0f2')                      # short sleeves over Steve's own (his shirt's)
    T.trousers(m, '#c83838', 'plain')
    T.boots(m, '#2e6a2e', 'combat', sole='#1e3a1e')
    T.gloves(m, '#eef0f2', 'fingerless')


def plaid_shirt(m, a, b):
    ac, bc = T.C(m, a), T.C(m, b)
    for c in m.cubes:
        if c.get('decal') == 'tailor' and c['name'].startswith('shirt'):
            old = c['pp']
            c['pp'] = (lambda old: lambda p: (T.mix(ac, bc, 0.5) if p.face in T.SIDES and (p.i % 4 == 1 or p.j % 4 == 1) and old(p) is not None else old(p)))(old)


# ------------------------------------------------------------------------------------------------ building the looks
SLUG = {'SWAT Van': 'swat_van_police'}                  # 'Swat Van' (the Enforcer's) and 'SWAT Van' (the Shotgunner's) differ in case only


def build(name, rec):
    sl = SLUG.get(name) or slug(name)
    if rec['kind'] == 'own':
        m = rec['make']()
        m.name = f'u_{sl}'
        return Look('unit', name, sl, None, m, None, rec['anim'], rec['size'], False)
    rig = RIGS[rec['body']]
    pal = {**DEF, **rec['pal']}
    m = T.person(f'u_{sl}', rec['body'], pal, None, 'chevron', stand=False)
    from towerkit import own_px
    m.own = lambda p, m=m: own_px(m, p)                      # the shared decals (a torch's flame)
    rec['outfit'](m)
    armed(m, rec['arm'], rec['amats'])
    from towerkit import finish
    finish(m)
    return Look('unit', name, sl, rig, None, m, rec['anim'], rec['size'], False)


def looks():
    data = load('units')
    order = list(data)
    out = [build(n, UNIT[n]) for n in order if n in UNIT]
    out.sort(key=lambda lk: (ANIM_ORDER.index(lk.anim), order.index(lk.name)))
    for i, lk in enumerate(out):
        lk.index = i
    return out


def missing():
    return [n for n in load('units') if n not in UNIT]

"""The vanilla bodies the roster dresses, referenced by geometry id and texture path (nothing of them is copied here).

A rig is what our gear needs to sit on a vanilla body and move with it: the bones it repeats (name, parent, pivot[, bind
rotation]), the boxes its shells fit over (measured from bds/.lab/samples/resource_pack/models; `skin` is the vanilla
cube's own inflate plus its overlay layer, so a shell clears it by 0.2+), where each hand holds a thing, and the size it is
drawn at (`scale`, relative to a zombie). Bone names match case-insensitively in the game (vanilla animations name the
enderman's `leftArm` as `leftarm`), so one animation can move every humanoid here.
"""
from __future__ import annotations


class Rig:
    __slots__ = ('key', 'geo', 'tex', 'bones', 'parts', 'hands', 'scale', 'family', 'hide')

    def __init__(self, key, geo, tex, bones, parts, hands=None, scale=1.0, family='humanoid', hide=()):
        self.key, self.geo, self.tex, self.bones, self.parts = key, geo, tex, bones, parts
        self.hands, self.scale, self.family, self.hide = hands or {}, scale, family, tuple(hide)

    def bone(self, part):
        return self.parts[part][0]

    def box(self, part, grow=0.0):
        """the vanilla box of a part (x0, x1, y0, y1, z0, z1), grown by `grow` past its own skin on every side"""
        bone, b, skin = self.parts[part]
        g = grow + skin
        return (b[0] - g, b[1] + g, b[2] - g, b[3] + g, b[4] - g, b[5] + g)


def _humanoid(key, geo, tex, *, waist=True, arm=4, leg_x=1.9, head=(8, 8, 8), body_d=4, arms=('rightArm', 'leftArm'),
              legs=('rightLeg', 'leftLeg'), skin=0.0, head_skin=0.0, robe=False, body_pivot_y=24, **kw):
    """a two-armed, two-legged vanilla body: zombie, skeleton, illager, piglin ..."""
    hw, hh, hd = head
    root = 'waist' if waist else 'body'
    bones = ([('waist', None, (0, 12, 0)), ('body', 'waist', (0, body_pivot_y, 0))] if waist else [('body', None, (0, 24, 0))])
    bones += [('head', 'body', (0, 24, 0)), (arms[0], 'body', (-5, 22, 0)), (arms[1], 'body', (5, 22, 0)),
              (legs[0], 'body', (-leg_x, 12, 0)), (legs[1], 'body', (leg_x, 12, 0))]
    ax = 4 if arm == 4 else 2                                   # a thin arm (skeleton) hangs from x = 4..6
    lx = 1.9 if leg_x == 1.9 else 2.0
    leg = (-lx - 2, -lx + 2) if arm == 4 else (-3, -1)
    parts = {
        'head': ('head', (-hw / 2, hw / 2, 24, 24 + hh, -hd / 2, hd / 2), head_skin),
        'body': ('body', (-4, 4, 12, 24, -body_d / 2, body_d / 2), skin),
        'rarm': (arms[0], (-4 - ax, -4, 12, 24, -arm / 2, arm / 2) if arm == 4 else (-6, -4, 12, 24, -1, 1), skin),
        'larm': (arms[1], (4, 4 + ax, 12, 24, -arm / 2, arm / 2) if arm == 4 else (4, 6, 12, 24, -1, 1), skin),
        'rleg': (legs[0], (leg[0], leg[1], 0, 12, -arm / 2, arm / 2) if arm == 4 else (-3, -1, 0, 12, -1, 1), skin),
        'lleg': (legs[1], (-leg[1], -leg[0], 0, 12, -arm / 2, arm / 2) if arm == 4 else (1, 3, 0, 12, -1, 1), skin),
    }
    if robe:                                                    # the illagers' long coat (an inflate 0.5 box from y 6)
        parts['robe'] = ('body', (-4, 4, 6, 24, -body_d / 2, body_d / 2), 0.5)
    hands = {'r': (arms[0], (-4 - ax / 2 if arm == 4 else -5, 12, 0)), 'l': (arms[1], (4 + ax / 2 if arm == 4 else 5, 12, 0))}
    return Rig(key, geo, tex, bones, parts, hands, family='humanoid', **kw)


T = 'textures/entity/'
RIGS = {r.key: r for r in [
    _humanoid('zombie', 'geometry.zombie.v1.8', T + 'zombie/zombie'),
    _humanoid('husk', 'geometry.zombie.husk.v1.8', T + 'zombie/husk'),
    _humanoid('drowned', 'geometry.zombie.drowned.v1.16', T + 'zombie/drowned', waist=False, skin=0.25, head_skin=0.25),
    _humanoid('zvillager', 'geometry.zombie.villager.v1.8', T + 'zombie_villager/zombie_villager', leg_x=2.0, head=(8, 10, 8),
              body_d=6, head_skin=0.25, robe=True),
    _humanoid('pigzombie', 'geometry.pigzombie.v1.8', T + 'pig/pigzombie', head_skin=0.5),
    _humanoid('skeleton', 'geometry.skeleton.v1.8', T + 'skeleton/skeleton', arm=2, leg_x=2.0),
    _humanoid('stray', 'geometry.skeleton.stray.v1.8', T + 'skeleton/stray', arm=2, leg_x=2.0),
    _humanoid('wither', 'geometry.skeleton.wither.v1.8', T + 'skeleton/wither_skeleton', arm=2, leg_x=2.0),
    _humanoid('piglin', 'geometry.piglin', T + 'piglin/piglin', waist=False, head=(10, 8, 8), arms=('rightarm', 'leftarm'),
              legs=('rightleg', 'leftleg'), skin=0.25),
    _humanoid('zpiglin', 'geometry.piglin', T + 'piglin/zombie_piglin', waist=False, head=(10, 8, 8), arms=('rightarm', 'leftarm'),
              legs=('rightleg', 'leftleg'), skin=0.25),
    _humanoid('brute', 'geometry.piglin', T + 'piglin/piglin_brute', waist=False, head=(10, 8, 8), arms=('rightarm', 'leftarm'),
              legs=('rightleg', 'leftleg'), skin=0.25),
    _humanoid('vindicator', 'geometry.vindicator.v1.8', T + 'vindicator', waist=False, leg_x=2.0, head=(8, 10, 8), body_d=6,
              legs=('leg0', 'leg1'), robe=True, hide=('arms',)),
    _humanoid('evoker', 'geometry.evoker.v1.8', T + 'illager/evoker', waist=False, leg_x=2.0, head=(8, 10, 8), body_d=6, robe=True,
              hide=('arms',)),
    _humanoid('pillager', 'geometry.pillager', T + 'pillager', leg_x=2.0, head=(8, 10, 8), body_d=6, arms=('rightarm', 'leftarm'),
              robe=True, body_pivot_y=0),
    Rig('witch', 'geometry.villager.witch.v1.8', T + 'witch',
        [('body', None, (0, 0, 0)), ('head', 'body', (0, 24, 0)), ('arms', 'body', (0, 22, 0)), ('leg0', 'body', (-2, 12, 0)),
         ('leg1', 'body', (2, 12, 0))],
        {'head': ('head', (-4, 4, 24, 34, -4, 4), 0.0), 'body': ('body', (-4, 4, 12, 24, -3, 3), 0.0), 'robe': ('body', (-4, 4, 6, 24, -3, 3), 0.5),
         'arms': ('arms', (-8, 8, 16, 24, -2, 2), 0.0), 'rleg': ('leg0', (-4, 0, 0, 12, -2, 2), 0.0), 'lleg': ('leg1', (0, 4, 0, 12, -2, 2), 0.0)},
        {'r': ('arms', (-6, 16, -2)), 'l': ('arms', (6, 16, -2))}, family='witch'),
    Rig('vex', 'geometry.vex.v1.8', T + 'vex/vex',
        [('body', None, (0, 2, 0)), ('head', 'body', (0, 6, 0)), ('rightArm', 'body', (-1.75, 5.75, 0)), ('leftArm', 'body', (1.75, 5.75, 0)),
         ('leftWing', 'body', (0.5, 5, 1)), ('rightWing', 'body', (-0.5, 5, 1))],
        {'head': ('head', (-2.5, 2.5, 6, 11, -2.5, 2.5), 0.0), 'body': ('body', (-1.5, 1.5, 0, 6, -1, 1), 0.0),
         'rarm': ('rightArm', (-3, -1, 2.25, 6.25, -1, 1), 0.0), 'larm': ('leftArm', (1, 3, 2.25, 6.25, -1, 1), 0.0)},
        {'r': ('rightArm', (-2, 2.4, 0)), 'l': ('leftArm', (2, 2.4, 0))}, scale=2.3, family='vex'),
    Rig('phantom', 'geometry.phantom', T + 'phantom',
        [('body', None, (0, 24, 0)), ('wing0', 'body', (2, 26, -8), (0, 0, 5.7)), ('wingtip0', 'wing0', (8, 26, -8), (0, 0, 5.7)),
         ('wing1', 'body', (-3, 26, -8), (0, 0, -5.7)), ('wingtip1', 'wing1', (-9, 24, -8), (0, 0, -5.7)),
         ('head', 'body', (0, 23, -7), (11.5, 0, 0)), ('tail', 'body', (0, 26, 1)), ('tailtip', 'tail', (0, 25.5, 7))],
        {'head': ('head', (-4, 3, 22, 25, -12, -7), 0.0), 'body': ('body', (-3, 2, 23, 26, -8, 1), 0.0)}, scale=1.15, family='phantom'),
    Rig('golem', 'geometry.irongolem', T + 'iron_golem/iron_golem',
        [('body', None, (0, 31, 0)), ('head', 'body', (0, 31, -2)), ('arm0', 'body', (0, 31, 0)), ('arm1', 'body', (0, 31, 0)),
         ('leg0', 'body', (-4, 13, 0)), ('leg1', 'body', (5, 13, 0))],
        {'head': ('head', (-4, 4, 33, 43, -7.5, 0.5), 0.0), 'body': ('body', (-9, 9, 21, 33, -6, 5), 0.0),
         'waist': ('body', (-4.5, 4.5, 16, 21, -3, 3), 0.5), 'rarm': ('arm0', (-13, -9, 3.5, 33.5, -3, 3), 0.0),
         'larm': ('arm1', (9, 13, 3.5, 33.5, -3, 3), 0.0), 'rleg': ('leg0', (-7.5, -1.5, 0, 16, -3, 2), 0.0),
         'lleg': ('leg1', (1.5, 7.5, 0, 16, -3, 2), 0.0)},
        {'r': ('arm0', (-11, 3.5, 0)), 'l': ('arm1', (11, 3.5, 0))}, scale=0.62, family='golem'),
    Rig('ravager', 'geometry.ravager', T + 'illager/ravager',
        [('body', None, (0, 19, 2), (90, 0, 0)), ('neck', None, (0, 20, -20)), ('head', 'neck', (0, 28, -10)),
         ('mouth', 'head', (0, 15, -10)), ('horns', 'head', (-5, 27, -19), (60, 0, 0)), ('leg0', None, (-12, 30, 22)),
         ('leg1', None, (4, 30, 22)), ('leg2', None, (-4, 26, -4)), ('leg3', None, (-4, 26, -4))],
        {'head': ('head', (-8, 8, 14, 34, -24, -8), 0.0), 'neck': ('neck', (-5, 5, 21, 31, -10, 8), 0.0),
         'body': ('body', (-7, 7, 10, 26, -2, 18), 0.0)}, scale=0.62, family='beast'),
    Rig('mite', 'geometry.endermite', T + 'endermite',
        [('section_2', None, (0, 0, 2.5)), ('section_0', 'section_2', (0, 0, 0)), ('section_1', 'section_2', (0, 0, 0)),
         ('section_3', 'section_2', (0, 0, 0))],
        {'head': ('section_0', (-2, 2, 0, 3, -4.4, -2.4), 0.0), 'body': ('section_1', (-3, 3, 0, 4, -2.4, 2.6), 0.0),
         'tail': ('section_2', (-1.5, 1.5, 0, 3, 2.5, 3.5), 0.0)}, scale=2.6, family='mite'),
    Rig('magma', 'geometry.lavaslime', T + 'slime/magmacube',
        [('insideCube', None, (0, 0, 0))] + [(f'bodyCube_{i}', 'insideCube', (0, 24, 0)) for i in range(8)],
        {'body': ('insideCube', (-4, 4, 0, 8, -4, 4), 0.0)}, scale=2.2, family='blob'),
    Rig('stand', 'geometry.armor_stand', T + 'armor_stand',
        [('baseplate', None, (0, 0, 0)), ('waist', 'baseplate', (0, 12, 0)), ('body', 'waist', (0, 24, 0)), ('head', 'body', (0, 24, 0)),
         ('hat', 'head', (0, 24, 0)), ('leftarm', 'body', (5, 22, 0)), ('rightarm', 'body', (-5, 22, 0)), ('leftleg', 'body', (1.9, 12, 0)),
         ('rightleg', 'body', (-1.9, 12, 0))],
        {'head': ('hat', (-4, 4, 24, 32, -4, 4), 0.0), 'body': ('body', (-4, 4, 12, 24, -1.5, 1.5), 0.0),      # (armour hangs on its frame as on a torso)
         'rarm': ('rightarm', (-7, -5, 12, 24, -1, 1), 0.0), 'larm': ('leftarm', (5, 7, 12, 24, -1, 1), 0.0),
         'rleg': ('rightleg', (-2.9, -0.9, 1, 12, -1, 1), 0.0), 'lleg': ('leftleg', (0.9, 2.9, 1, 12, -1, 1), 0.0)},
        {'r': ('rightarm', (-6, 12, 0)), 'l': ('leftarm', (6, 12, 0))}, family='stand'),
    Rig('blaze', 'geometry.blaze', T + 'blaze',
        [('head', None, (0, 24, 0))] + [(f'upperBodyParts{i}', None, (0, 24, 0)) for i in range(12)],
        {'head': ('head', (-4, 4, 20, 28, -4, 4), 0.0)}, scale=1.15, family='blaze'),
]}
RIGS['skeleton'].hands = RIGS['stray'].hands = RIGS['wither'].hands = {'r': ('rightArm', (-5, 12, 0)), 'l': ('leftArm', (5, 12, 0))}


def ours(key, bones, parts, hands=None, scale=1.0, family='custom'):
    """a body we build ourselves (bodies.py): no vanilla geometry under it"""
    return Rig(key, None, None, bones, parts, hands, scale=scale, family=family)

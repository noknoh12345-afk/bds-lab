"""One look per entity of the game data (data/enemies.json, towers.json, units.json): which body it wears, its theme and
gear, its size and how it moves. Original designs throughout, made from what the data says an entity is (boss, hidden,
flying, lead, fast, its family's name: Molten, Fallen, Void, Frost ...), never from another game's art.

    looks('enemy') -> [Look ...] in skin order: the index is the entity's tds:skin; looks of one animation are contiguous,
    so the client entity picks the animation by a range (entities.py) and src/looks.ts gives the script name -> skin.
"""
from __future__ import annotations

import json
import os

import bodies as B
from kitbash import (aura, bandages, bandana, belt, cap, cape, chains, circlet, crown, crystals, dress, eyes_glow, flames, gasmask,
                     gauntlets, goggles, greaves, halo, helm, hood, horns, jester_hat, orbit, pack, pauldrons, plate, robe, scarf,
                     shell, spikes_on, tail, tophat, weapon, wings, wizard_hat)
from rigs import RIGS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, '..', '..', 'data'))
ANIM_ORDER = ['walk', 'march', 'run', 'stomp', 'hover', 'vex', 'phantom', 'golem', 'beast', 'mite', 'blob', 'stand', 'blaze', 'hop', 'float']
WALKERS = {'zombie', 'husk', 'drowned', 'zvillager', 'pigzombie'}
FAMILY_ANIM = {'vex': 'vex', 'phantom': 'phantom', 'golem': 'golem', 'beast': 'beast', 'mite': 'mite', 'blob': 'blob', 'stand': 'stand', 'blaze': 'blaze'}


class Look:
    __slots__ = ('kind', 'name', 'slug', 'rig', 'body', 'gear', 'anim', 'size', 'hidden', 'index', 'extra')

    def __init__(self, kind, name, slug, rig, body, gear, anim, size, hidden, extra=None):
        self.kind, self.name, self.slug, self.rig, self.body, self.gear = kind, name, slug, rig, body, gear
        self.anim, self.size, self.hidden, self.index, self.extra = anim, size, hidden, None, extra or {}

    @property
    def body_geo(self):
        return self.rig.geo if self.body is None else f'geometry.tds.{self.body.name}'

    @property
    def body_tex(self):
        return self.rig.tex if self.body is None else f'textures/entity/tds/{self.body.name}'


def slug(name):
    s = ''.join(ch.lower() if ch.isalnum() else '_' for ch in name)
    while '__' in s:
        s = s.replace('__', '_')
    return s.strip('_')


def load(kind):
    return json.load(open(os.path.join(DATA, f'{kind}.json'), encoding='utf-8'))


# ------------------------------------------------------------------------------------------------ enemies
ENEMY = {}


def E(name, rig, theme='plain', fn=None, size=None, anim=None, mats=None, hidden=None):
    ENEMY[name] = dict(rig=rig, theme=theme, fn=fn, size=size, anim=anim, mats=mats, hidden=hidden)


def C(name, builder, size=1.0, **kw):
    """an enemy on a body of ours (bodies.py)"""
    ENEMY[name] = dict(custom=builder, size=size, kw=kw)


def all_(*fs):
    return lambda m: [f(m) for f in fs]


LEADM = dict(metal='#6e727c', metal2='#4a4e56', trim='#8a8e98')
GOLDT = dict(trim='#ffd650', gold='#ffd650')
# the base waves
E('Normal', 'zombie', fn=lambda m: (cap(m, 'cloth'), belt(m)))
E('Speedy', 'drowned', fn=lambda m: (bandana(m, 'red'), scarf(m, 'red', 'cloth2')))
E('Slow', 'husk', fn=lambda m: (robe(m, 'leather', 'wood2', low=4.0), belt(m, 'wood2'), cap(m, 'wood2')), anim='stomp')
E('Quick', 'drowned', fn=lambda m: (cap(m, 'blue', back=True), scarf(m, 'blue', tail=False), goggles(m)), mats=dict(blue='#3c8ad8'))
E('Swift', 'drowned', fn=lambda m: (goggles(m, lens='glass'), scarf(m, 'orange', 'red')), size=0.9)
E('Hefty', 'husk', fn=lambda m: (plate(m, 'leather', 'wood2', back=False), gauntlets(m, 'leather'), cap(m, 'wood2')), size=1.3, anim='stomp')
E('Normal Boss', 'zombie', 'royal', lambda m: (crown(m), cape(m, 't1', hem='gold'), plate(m, 'gold', 't1'), weapon(m, 'mace', mat='gold')), size=1.7)
E('Slow Boss', 'husk', 'royal', lambda m: (crown(m, tines=7, tall=3.0), robe(m, 't1', 't2', low=3.0, sash='gold'), weapon(m, 'club', mat2='wood2', size=1.4)), size=1.8)
E('Speedy Boss', 'drowned', 'royal', lambda m: (circlet(m), cape(m, 't1', length=12), scarf(m, 'gold', tail=True), spikes_on(m, 'head', 'gold', 3, 2.0)), size=1.6, anim='run')
E('Giant Boss', 'golem', 'royal', lambda m: (crown(m, tall=3.2), cape(m, 't1', length=24, grow=0.8), weapon(m, 'club', mat2='wood2', size=1.6)), size=1.5)
E('Hidden', 'vex', 'shadow', lambda m: (hood(m, 't1', 't2'), weapon(m, 'lantern', glow='glow')))
E('Hidden Boss', 'evoker', 'shadow', lambda m: (shell(m), hood(m), cape(m, 't1', length=20), weapon(m, 'scythe', glow='glow')), size=1.6, anim='hover')
E('Breaker', 'vindicator', fn=lambda m: (goggles(m), belt(m), weapon(m, 'hammer', mat='metal', mat2='wood')), anim='run')
E('Breaker2', 'vindicator', fn=lambda m: (helm(m, 'metal', kind='sallet'), belt(m), weapon(m, 'hammer', size=1.2)), mats=dict(metal='#8a7a5a'))
E('Breaker3', 'vindicator', fn=lambda m: (helm(m, 'metal2', kind='sallet'), plate(m, 'metal2'), weapon(m, 'pickaxe', size=1.2)))
E('Breaker4', 'vindicator', fn=lambda m: (helm(m, 'metal', crest='gold'), plate(m), pauldrons(m, spiked='metal2'), weapon(m, 'battleaxe', size=1.1)), size=1.2)
E('Armored', 'husk', fn=lambda m: (helm(m, plume='red'), plate(m), pauldrons(m), greaves(m), weapon(m, 'sword'), weapon(m, 'shield', 'l', mat='blue', mat2='gold')), anim='march')
E('Lead', 'husk', fn=lambda m: (helm(m, 'metal', slits=True), plate(m, 'metal', 'metal2'), pauldrons(m, 'metal'), greaves(m, 'metal'), gauntlets(m, 'metal2')), mats=LEADM, anim='march')
E('Elite Lead', 'husk', fn=lambda m: (helm(m, 'metal', crest='gold'), plate(m, 'metal', 'gold'), pauldrons(m, 'metal', 'gold', spiked='gold'), greaves(m, 'metal'), weapon(m, 'mace', mat='metal')),
  mats={**LEADM, **GOLDT}, size=1.2, anim='march')
E('Heavy', 'zpiglin', fn=lambda m: (helm(m, 'green', 'dark', kind='sallet'), plate(m, 'green', 'metal2'), gauntlets(m, 'metal2'), weapon(m, 'towershield', 'l', mat='metal2', mat2='orange'),
                                     weapon(m, 'club', mat2='dark')), mats=dict(green='#76804e'), anim='stomp')
E('Necromancer (Modern Enemy)', 'evoker', 'shadow', lambda m: (shell(m), hood(m), robe(m, 't1', 't2', sash='glow'), weapon(m, 'staff', glow='necro'), orbit(m, 'bone', 3, 8.0, kind='skull')),
  mats=dict(glow='#7cff8c', necro='#7cff8c'), size=1.5)
E('Skeleton', 'skeleton', fn=lambda m: (weapon(m, 'sword', mat='metal2', size=0.8), weapon(m, 'shield', 'l', mat='wood', mat2='metal2', size=0.7)))
E('Enraged', 'zombie', 'rage', lambda m: (shell(m), spikes_on(m, 'head', 'red', 4, 2.4), weapon(m, 'claws', mat='bone'), weapon(m, 'claws', 'l', mat='bone')), anim='run')
E('Brute', 'brute', fn=lambda m: (gauntlets(m, 'metal2'), belt(m, 'leather', 'gold'), pauldrons(m, 'metal2', spiked='bone'), weapon(m, 'battleaxe', size=1.2)), size=1.5)
E('Grave Digger', 'zvillager', 'grave', lambda m: (shell(m), tophat(m, 'black', 'wood2'), weapon(m, 'shovel'), weapon(m, 'lantern', 'l', glow='glow'), pack(m, 'wood2', 'coffin')), size=1.5)
E('Hazmat', 'zombie', 'hazmat', lambda m: (shell(m), gasmask(m), pack(m, 't2', 'tank')))
E('Elite Hazmat', 'zombie', 'hazmat', lambda m: (shell(m), gasmask(m, lens='red'), pack(m, 'red', 'tank'), gauntlets(m, 't3')), mats=dict(t1='#e8642c', t2='#b84a20'))
E('Bolt', 'drowned', 'storm', lambda m: (shell(m, ('body', 'rarm', 'larm', 'rleg', 'lleg')), goggles(m, lens='glow'), spikes_on(m, 'head', 'glow', 3, 2.6), scarf(m, 'trim', tail=True)), anim='run')
E('Abnormal', 'zombie', 'toxic', lambda m: (shell(m, ('body', 'rarm', 'rleg')), crystals(m, 'body', 'glow', 3), eyes_glow(m, 'glow')))
E('Elite Abnormal', 'zombie', 'toxic', lambda m: (shell(m), crystals(m, 'body', 'glow', 5, size=1.3), crystals(m, 'head', 'glow', 3, where='top'), pauldrons(m, 't2', 'gold', spiked='glow')),
  size=1.5, mats=GOLDT)
E('Reaver', 'wither', 'shadow', lambda m: (hood(m), robe(m, 't1', 't2', low=6.0), weapon(m, 'scythe', mat='metal', glow='glow')))
E('Ghoul', 'zvillager', 'grave', lambda m: (shell(m), weapon(m, 'claws', mat='bone', size=1.3), weapon(m, 'claws', 'l', mat='bone', size=1.3), spikes_on(m, 'body', 'bone', 4, 2.5, where='back')), size=1.5, anim='stomp')
E('Patient Zero', 'zombie', 'lab', lambda m: (shell(m), weapon(m, 'syringe', glow='glow'), chains(m, 'metal2', ('body',)), eyes_glow(m, 'glow')), size=1.6)
E('Boomer', 'zombie', fn=lambda m: (pack(m, 'red', 'barrel'), weapon(m, 'bomb'), goggles(m)), size=1.2)
E('Elite Boomer', 'zombie', 'rage', lambda m: (shell(m, ('body', 'rarm', 'larm')), pack(m, 'red', 'barrel'), weapon(m, 'bomb'), weapon(m, 'bomb', 'l'), goggles(m, lens='glow')), size=1.2, anim='run')
E('Living Experiment', 'husk', 'lab', lambda m: (shell(m), pack(m, 'glass', 'tank'), crystals(m, 'body', 'glow', 3), gasmask(m, 't3')), size=1.5)
E('Failed Experiment', 'golem', 'lab', lambda m: (shell(m), crystals(m, 'body', 'glow', 5, size=1.6), chains(m, 'metal2', ('body', 'rarm')), eyes_glow(m, 'glow')), size=1.1)
E('Corpse (Enemy)', 'zombie', 'grave', lambda m: (shell(m), bandages(m), chains(m, 'metal2', ('body',)), weapon(m, 'towershield', 'l', mat='wood2', mat2='metal2')))
E('Tanker', 'husk', fn=lambda m: (helm(m, 'metal2', kind='sallet'), plate(m, 'metal2'), pack(m, 'metal2', 'tank'), gauntlets(m, 'metal')), size=1.4, anim='stomp')
E('Bulwark', 'husk', fn=lambda m: (helm(m, 'metal', slits=True), plate(m), greaves(m), weapon(m, 'towershield', 'l', mat='metal', mat2='gold'), weapon(m, 'mace')), size=1.5)
E('Odd', 'zombie', 'crystal', lambda m: (shell(m, ('larm', 'head')), cap(m, 'purple', back=True), goggles(m, lens='glow'), crystals(m, 'larm', 'glow', 2, where='top')))
E('Vindicator', 'vindicator', fn=lambda m: (plate(m, 'metal2', 'gold'), weapon(m, 'axe', size=1.3), pauldrons(m, 'metal2')), size=1.4)
E('Unknown Small', 'zombie', 'shadow', lambda m: (shell(m), eyes_glow(m, 'white')), size=0.8, anim='run')
E('Unknown Boss', 'golem', 'shadow', lambda m: (shell(m), eyes_glow(m, 'white', size=1.2), aura(m, 'glow', 14, bone='body')), size=1.6)
E('Slow King', 'husk', 'royal', lambda m: (crown(m, tall=2.8), cape(m, 't1', length=20, hem='gold'), robe(m, 't1', 't2', low=3.0, sash='gold'), weapon(m, 'scepter', mat='gold', glow='gem')), size=1.6, anim='stomp')
E('Speedy King', 'drowned', 'royal', lambda m: (crown(m, tines=3), cape(m, 't1', length=12, hem='gold'), scarf(m, 'gold', tail=False)), size=1.4, anim='run')
E('Blighted', 'zombie', 'toxic', lambda m: (shell(m), crystals(m, 'body', 'glow', 4, size=1.4), crystals(m, 'head', 'glow', 2, where='top'), weapon(m, 'claws', mat='t3'), weapon(m, 'claws', 'l', mat='t3')), size=1.5)
E('Crystalian', 'golem', 'crystal', lambda m: (shell(m), crystals(m, 'body', 'glow', 5, size=1.8), crystals(m, 'head', 'glow', 3, where='top', size=1.4), crystals(m, 'rarm', 'glow', 2), crystals(m, 'larm', 'glow', 2)), size=1.4)
E('Soul Stealer', 'evoker', 'shadow', lambda m: (shell(m), hood(m), cape(m, 't1', length=20), weapon(m, 'scythe', glow='glow'), orbit(m, 'cyan', 4, 9.0)), size=1.6, mats=dict(cyan='#7ae8ff'))
# molten
E('Molten', 'zombie', 'molten', lambda m: (shell(m), flames(m, 'head', 'flash', 3, 3.0)))
E('Elite Molten', 'zombie', 'molten', lambda m: (shell(m), flames(m, 'head', 'flash', 4, 3.6), pauldrons(m, 't2', 'gold', spiked='glow'), weapon(m, 'claws', mat='glow')), mats=GOLDT)
E('Molten Demon', 'blaze', 'molten', lambda m: (shell(m, ('head',)), horns(m, 'dark', 1.1), flames(m, 'head', 'flash', 3, 4.0)))
E('Molten Necromancer', 'evoker', 'molten', lambda m: (shell(m), hood(m, 't1', 't2'), robe(m, 't1', 't2'), weapon(m, 'staff', glow='glow'), orbit(m, 'glow', 3, 8.0, kind='skull')))
E('Molten Golem', 'golem', 'molten', lambda m: (shell(m), flames(m, 'head', 'flash', 3, 4.0), spikes_on(m, 'body', 'dark', 4, 3.0, where='back')), size=1.4)
E('Molten Warlord', 'vindicator', 'molten', lambda m: (shell(m), helm(m, 'dark', 'glow', crest='glow'), horns(m, 'dark', 1.0, 'straight'), plate(m, 't2', 'glow'), cape(m, 't1', length=18, hem='glow'),
                                                     weapon(m, 'greatsword', mat='t3', glow='glow')), size=1.6)
E('Molten Summoner', 'evoker', 'molten', lambda m: (shell(m), wizard_hat(m, 't2', 'glow'), robe(m, 't1', 't2', sash='glow'), weapon(m, 'staff', glow='glow'), orbit(m, 'flash', 4, 9.0)), size=1.5)
E('Molten Executioner', 'vindicator', 'molten', lambda m: (shell(m), hood(m, 'black', 'dark', face_open=False), eyes_glow(m, 'glow', grow=0.6), weapon(m, 'battleaxe', mat='t3', glow='glow', size=1.4)), size=1.6)
E('Molten Mech', 'golem', 'molten', lambda m: (plate(m, 'metal', 'glow'), shell(m), helm(m, 'metal2', 'glow'), pack(m, 'metal2', 'tank')), mats=dict(metal='#6a6e78'), anim='golem')
E('Molten Titan', 'golem', 'molten', lambda m: (shell(m), crown(m, 'dark', 'glow', tines=5, tall=4.0), flames(m, 'head', 'flash', 4, 5.0), spikes_on(m, 'body', 'glow', 5, 3.6, where='back')), size=1.8)
C('Molten Hound', lambda n: B.hound(n, 'molten'))
# fallen
E('Fallen', 'stray', 'fallen', lambda m: (shell(m), weapon(m, 'spear', mat='trim')), anim='run')
E('Fallen Skeleton', 'skeleton', 'fallen', lambda m: (shell(m, ('body', 'head')), weapon(m, 'sword', mat='trim'), weapon(m, 'shield', 'l', mat='t2', mat2='trim', size=0.7)))
E('Fallen Necromancer', 'evoker', 'fallen', lambda m: (shell(m), hood(m, 't2', 'trim'), robe(m, 't2', 'trim'), weapon(m, 'staff', glow='glow'), orbit(m, 'bone', 3, 8.0, kind='skull')))
E('Fallen Dreg', 'zvillager', 'fallen', lambda m: (shell(m), robe(m, 't2', 'trim', low=4.4), weapon(m, 'club', mat2='wood2')))
E('Fallen Squire', 'skeleton', 'fallen', lambda m: (shell(m), helm(m, 'trim', kind='sallet'), weapon(m, 'sword', mat='t3'), weapon(m, 'shield', 'l', mat='trim', mat2='t3')), size=1.25)
E('Fallen Soul', 'vex', 'fallen', lambda m: (hood(m, 't3', 't2'), eyes_glow(m, 'glow', grow=0.6)))
E('Fallen Giant', 'golem', 'fallen', lambda m: (shell(m), helm(m, 'trim', slits=True), weapon(m, 'club', mat2='t2', size=1.6)), size=1.5)
E('Fallen King', 'wither', 'fallen', lambda m: (shell(m), crown(m, 'trim', 'glow', tines=5, tall=3.0), cape(m, 'trim', 't2', length=22, hem='glow'), plate(m, 't2', 'glow'), weapon(m, 'greatsword', mat='t3', glow='glow')), size=1.8)
E('Awakened Fallen King', 'wither', 'fallen', lambda m: (shell(m), crown(m, 'gold', 'glow', tines=7, tall=4.0), wings(m, 't2', 'tatter', 12, 12, mat2='glow'), cape(m, 'gold', 't2', length=22, hem='glow'),
                                                          weapon(m, 'battleaxe', mat='t3', glow='glow', size=1.5), aura(m, 'glow', 9.0)), size=2.0, mats=GOLDT)
E('Fallen Hazmat', 'zombie', 'hazmat', lambda m: (shell(m), gasmask(m, 'trim', 'glow'), pack(m, 't2', 'tank')), mats=dict(t1='#9aa4b4', t2='#6a7486', glow='#7ae8ff'))
E('Possessed Armor', 'stand', 'fallen', lambda m: (helm(m, 'trim', slits=True), eyes_glow(m, 'glow', grow=0.5), plate(m, 'trim', 'glow'), pauldrons(m, 'trim', 'glow'), greaves(m, 'trim'),
                                                   weapon(m, 'sword', mat='t3', glow='glow'), weapon(m, 'shield', 'l', mat='t2', mat2='trim')))
E('Fallen Summoner', 'evoker', 'fallen', lambda m: (shell(m), wizard_hat(m, 't2', 'glow'), robe(m, 't2', 'trim'), orbit(m, 'bone', 4, 9.0, kind='skull'), weapon(m, 'book', 'l', mat2='trim')))
E('Corrupted Fallen', 'stray', 'void', lambda m: (shell(m), spikes_on(m, 'head', 'glow', 3, 2.6), weapon(m, 'claws', mat='glow')), mats=dict(t1='#8a8ea8', t2='#4a3a6a'), anim='run')
E('Fallen Seraph', 'stray', 'fallen', lambda m: (shell(m), wings(m, 't3', 'feather', 11, 10, mat2='glow'), halo(m, 'glow'), weapon(m, 'spear', mat='t3', glow='glow')), anim='hover')
E('Fallen Jester', 'vindicator', 'fallen', lambda m: (shell(m, ('body', 'rarm', 'larm', 'rleg', 'lleg')), jester_hat(m, 't2', 'trim', 'glow'), weapon(m, 'knife', mat='t3'), weapon(m, 'flail', 'l', mat='trim')), size=1.4)
E('Necrotic Skeleton', 'skeleton', 'toxic', lambda m: (shell(m, ('body', 'head')), weapon(m, 'claws', mat='glow'), eyes_glow(m, 'glow')), anim='run')
E('Fallen Rusher', 'stray', 'fallen', lambda m: (shell(m), helm(m, 'trim', kind='sallet'), weapon(m, 'spear', mat='t3')), anim='run')
E('Fallen Hero', 'wither', 'fallen', lambda m: (shell(m), helm(m, 'trim', plume='glow'), cape(m, 't2', length=18, hem='glow'), weapon(m, 'sword', mat='t3', glow='glow'), weapon(m, 'shield', 'l', mat='trim', mat2='glow')), size=1.3)
E('Fallen Shield', 'skeleton', 'fallen', lambda m: (shell(m), helm(m, 'trim', slits=True), weapon(m, 'towershield', 'l', mat='trim', mat2='t3', glow='glow')), size=1.3)
E('Fallen Angel', 'stray', 'fallen', lambda m: (shell(m), wings(m, 't3', 'feather', 14, 13, mat2='glow'), halo(m, 'glow', lift=3.0), robe(m, 't3', 't2', low=4.0), weapon(m, 'spear', mat='t3', glow='glow')), size=1.5, anim='hover')
E('Fallen Honor Guard', 'wither', 'fallen', lambda m: (shell(m), helm(m, 'trim', crest='glow'), cape(m, 'trim', length=20), plate(m, 'trim', 'glow'), weapon(m, 'pike', mat='t3', glow='glow')), size=1.5)
E('Fallen Tank', 'golem', 'fallen', lambda m: (shell(m), plate(m, 'trim', 'glow'), weapon(m, 'towershield', 'l', mat='trim', mat2='glow')), size=1.3)
E('Fallen Guardian', 'wither', 'fallen', lambda m: (shell(m), helm(m, 't2', 'glow'), plate(m, 'trim', 'glow'), weapon(m, 'hammer', mat='trim', size=1.3)), size=1.5, anim='stomp')
E('Warden (Modern Enemy)', 'golem', 'shadow', lambda m: (shell(m), horns(m, 'bone', 1.2, 'ram'), chains(m, 'metal2', ('body', 'rarm', 'larm')), eyes_glow(m, 'glow', size=1.2)), size=1.5)
E('Cursed Skeleton', 'skeleton', 'void', lambda m: (shell(m, ('body', 'head')), chains(m, 'glow', ('body',)), eyes_glow(m, 'glow')), anim='run')
# void
E('Void Keeper', 'evoker', 'void', lambda m: (shell(m), hood(m, 't2', 't3'), robe(m, 't1', 't2', sash='glow'), weapon(m, 'staff', glow='glow'), orbit(m, 'glow', 3, 8.0)), size=1.5)
E('Void Reaper', 'wither', 'void', lambda m: (shell(m), hood(m, 't1', 't2'), weapon(m, 'scythe', mat='t3', glow='glow')))
E('Void Rusher', 'stray', 'void', lambda m: (shell(m), spikes_on(m, 'head', 'glow', 3, 2.4), spikes_on(m, 'body', 't3', 3, 2.0, where='back')), anim='run')
E('Elite Void Rusher', 'stray', 'void', lambda m: (shell(m), spikes_on(m, 'head', 'gold', 4, 2.8), spikes_on(m, 'body', 'glow', 4, 2.6, where='back'), pauldrons(m, 't3', 'gold')), mats=GOLDT, anim='run')
E('Void Pike', 'vindicator', 'void', lambda m: (shell(m), helm(m, 't2', 'glow', kind='sallet'), plate(m, 't2', 'glow'), weapon(m, 'pike', mat='t3', glow='glow')))
E('Void Titan', 'golem', 'void', lambda m: (shell(m), horns(m, 't3', 1.4), crystals(m, 'body', 'glow', 5, size=1.6)), size=1.8)
E('Void Brute', 'ravager', 'void', lambda m: (shell(m, ('head', 'neck', 'body')), crystals(m, 'body', 'glow', 4, size=1.5)), size=1.2)
E('Void Reaver', 'wither', 'void', lambda m: (shell(m), horns(m, 't3', 1.3, 'curl', 'glow'), wings(m, 't2', 'bat', 13, 12), weapon(m, 'scythe', mat='t3', glow='glow', size=1.3), aura(m, 'glow', 9.0)), size=1.9)
E('Void Cultist', 'evoker', 'void', lambda m: (shell(m), hood(m, 't1', 't2'), robe(m, 't1', 't2', sash='trim'), weapon(m, 'wand', glow='glow'), weapon(m, 'book', 'l', mat2='t3')))
E('Void Trickster', 'vindicator', 'void', lambda m: (shell(m, ('body', 'rarm', 'larm', 'rleg', 'lleg')), jester_hat(m, 't2', 'glow', 'glow'), weapon(m, 'knife', mat='t3', glow='glow')))
E('Void Knight', 'vindicator', 'void', lambda m: (shell(m), helm(m, 't2', slits=True, plume='glow'), plate(m, 't2', 'glow'), weapon(m, 'sword', mat='t3', glow='glow'), weapon(m, 'shield', 'l', mat='t2', mat2='glow')))
E('Void Swordmaster', 'wither', 'void', lambda m: (shell(m), hood(m, 't2', 't3', face_open=False), eyes_glow(m, 'glow', grow=0.6), weapon(m, 'sword', mat='t3', glow='glow'), weapon(m, 'sword', 'l', mat='t3', glow='glow')), size=1.5)
E('Void Guardian', 'golem', 'void', lambda m: (shell(m), helm(m, 't2', 'glow'), weapon(m, 'towershield', 'l', mat='t2', mat2='glow', glow='glow')), size=1.3)
E('Void Caster', 'evoker', 'void', lambda m: (shell(m), wizard_hat(m, 't2', 'glow'), robe(m, 't1', 't2', sash='glow'), weapon(m, 'staff', glow='glow'), orbit(m, 'glow', 4, 9.0)), size=1.6)
E('Voidling', 'mite', 'void', lambda m: shell(m, ('head', 'body', 'tail')))
E('Heavy Voidling', 'mite', 'void', lambda m: (shell(m, ('head', 'body', 'tail')), spikes_on(m, 'body', 'glow', 3, 2.0)), size=1.6)
C('Void Portal', lambda n: B.portal(n, 'void'), size=1.3)
C('Void Floater', lambda n: B.floater(n, 'void'))
C('Void Eye', lambda n: B.eye(n, 'void'))
# the soul and phantom kin, plants, oddities
E('Phantom', 'phantom', 'shadow', lambda m: shell(m, ('head', 'body')))
E('Elite Phantom', 'phantom', 'shadow', lambda m: (shell(m, ('head', 'body')), spikes_on(m, 'body', 'gold', 3, 2.0)), mats=GOLDT)
E('Soul', 'vex', 'fallen', lambda m: (hood(m, 't3', 't2'), halo(m, 'glow', lift=1.2)))
E('Elite Soul', 'vex', 'gold', lambda m: (hood(m, 't1', 't2'), halo(m, 'glow', lift=1.2), eyes_glow(m, 'glow', grow=0.6)))
E('Shivergeist', 'vex', 'frost', lambda m: (hood(m, 't1', 't2'), eyes_glow(m, 'glow', grow=0.6), spikes_on(m, 'head', 't3', 3, 1.4)))
E('Frost Spirit', 'vex', 'frost', lambda m: (hood(m, 't1', 't2'), halo(m, 'glow', lift=1.4), weapon(m, 'wand', glow='glow')), size=1.5)
C('Mandrake', lambda n: B.plant(n, 'plant', size=0.9))
C('Mandragora', lambda n: B.plant(n, 'plant', size=1.5, flower='#e8d040'))
C('Nightshade', lambda n: B.plant(n, 'plant', {'t1': '#3a5a2a', 'wood': '#4a2a4a', 'wood2': '#3a2040'}, flower='#7a3aa8'))
C('Slime', lambda n: B.slime(n))
C('Mystery', lambda n: B.crate(n))
C('Elite Mystery', lambda n: B.crate(n, mats={'t1': '#d8a838', 't2': '#a87a20', 'glow': '#fff0a0'}), size=1.2)
C('Frost Mystery', lambda n: B.crate(n, 'frost', {'t1': '#9ad8f8', 't2': '#5ab4e8', 'trim': '#e8f8ff', 'glow': '#ffffff'}))
C('Mega Frost Mystery', lambda n: B.crate(n, 'frost', {'t1': '#7ac8f0', 't2': '#3a94c8', 'trim': '#e8f8ff', 'glow': '#ffffff'}, size=1.3), size=1.4)
C('Balloon', lambda n: B.balloon(n))
C('Healing Beacon', lambda n: B.beacon(n, 'plain', {'t1': '#e8eef0', 't2': '#9aa4ac', 'glow': '#7cff8c'}, kind='heal'))
C('Ice Beacon', lambda n: B.beacon(n, 'frost', kind='ice'))
E('Crying Angel', 'stand', 'plain', lambda m: (wings(m, 'stone', 'feather', 11, 11, mat2='stone2'), halo(m, 'stone2', lift=2.0, spin=False), robe(m, 'stone', 'stone2', low=2.0)),
  mats=dict(stone='#9aa0a8', stone2='#7a8088', trim='#6a7078'), anim='hover')
# frost
E('Frozen', 'stray', 'frost', lambda m: (shell(m), spikes_on(m, 'head', 't3', 3, 3.2), weapon(m, 'mace', mat='ice', mat2='metal2')))
E('Snowy', 'zombie', 'frost', lambda m: (shell(m, ('body', 'rarm', 'larm')), cap(m, 'red'), scarf(m, 'white', 'red')), anim='run')
C('Snowman', lambda n: B.snowman(n, hat='top'))
C('Snow Minion', lambda n: B.snowman(n, size=0.7), size=0.8)
E('Snow Golem', 'golem', 'frost', lambda m: (shell(m), spikes_on(m, 'head', 't3', 3, 2.6), crystals(m, 'body', 'glow', 3)), mats=dict(t1='#f4f8ff', t2='#d8e4f0'), size=1.1)
E('Frostmite', 'mite', 'frost', lambda m: (shell(m, ('head', 'body', 'tail')), spikes_on(m, 'body', 't3', 3, 1.6)))
E('Frostbane', 'wither', 'frost', lambda m: (shell(m), hood(m, 't2', 't3'), weapon(m, 'scythe', mat='ice', glow='glow')))
C('Cold Mist', lambda n: B.cloud(n))
E('Blizzard Wizard', 'evoker', 'frost', lambda m: (shell(m), wizard_hat(m, 't2', 'glow'), robe(m, 't2', 't1', sash='trim'), weapon(m, 'staff', glow='glow'), orbit(m, 't3', 4, 8.0)))
E('Yeti', 'golem', 'frost', lambda m: (shell(m, cover=0.95), horns(m, 'bone', 0.9, 'ram'), weapon(m, 'claws', mat='bone', size=1.6), weapon(m, 'claws', 'l', mat='bone', size=1.6)),
  mats=dict(t1='#e8eef4', t2='#c8d4e0', t3='#ffffff'), size=1.3)
C('Packed Ice', lambda n: B.iceblock(n, size=1.2), size=1.2)
C('Unstable Ice', lambda n: B.iceblock(n, cracked=True))
E('Frost Invader', 'husk', 'frost', lambda m: (shell(m), helm(m, 't2', 'glow'), plate(m, 't2', 'glow'), greaves(m, 't2'), weapon(m, 'mace', mat='ice')), mats=LEADM)
E('Frost Undead', 'stray', 'frost', lambda m: (shell(m), weapon(m, 'claws', mat='ice'), weapon(m, 'claws', 'l', mat='ice')), anim='run')
E('Frost Necromancer', 'evoker', 'frost', lambda m: (shell(m), hood(m, 't2', 't1'), robe(m, 't2', 't1'), weapon(m, 'staff', glow='glow'), orbit(m, 't3', 3, 8.0, kind='skull')))
E('Frost Hunter', 'stray', 'frost', lambda m: (shell(m), hood(m, 'white', 't2'), cape(m, 'white', length=14), weapon(m, 'spear', mat='ice', glow='glow')), size=1.4, anim='run')
E('Frost Ravager', 'ravager', 'frost', lambda m: (shell(m, ('head', 'neck', 'body')), crystals(m, 'body', 'glow', 4, size=1.4)), size=1.2)
E('Deep Freeze', 'golem', 'frost', lambda m: (shell(m), crystals(m, 'body', 'glow', 6, size=1.8), crystals(m, 'head', 't3', 3, where='top', size=1.5)), size=1.5)
E('Frost Mage', 'evoker', 'frost', lambda m: (shell(m), wizard_hat(m, 't1', 'trim'), robe(m, 't1', 't2'), weapon(m, 'wand', glow='glow'), orbit(m, 'glow', 3, 7.0)), anim='hover')
E('Frost Champion', 'vindicator', 'frost', lambda m: (shell(m), helm(m, 't2', 'glow', crest='t3'), plate(m, 't2', 'glow'), cape(m, 'trim', length=18), weapon(m, 'greatsword', mat='ice', glow='glow')), size=1.6)
E('Jack Frost', 'evoker', 'frost', lambda m: (shell(m), spikes_on(m, 'head', 't3', 5, 3.4), cape(m, 't2', 't1', length=22, hem='t3'), weapon(m, 'scepter', mat='ice', glow='glow'), aura(m, 'glow', 9.0)),
  size=1.8, anim='hover')
E('Frost Hero', 'wither', 'frost', lambda m: (shell(m), helm(m, 't2', plume='t3'), weapon(m, 'sword', mat='ice', glow='glow'), weapon(m, 'shield', 'l', mat='t2', mat2='t3')), size=1.5)


def enemy_anim(rec, rig, data):
    if rec.get('anim'):
        return rec['anim']
    fam = RIGS[rig].family
    if fam in FAMILY_ANIM:
        return FAMILY_ANIM[fam]
    if data.get('flying'):
        return 'hover'
    speed = max((v.get('speed') or 0) for v in data.get('per', {}).values()) if data.get('per') else 0
    if speed >= 5:
        return 'run'
    if data.get('boss'):
        return 'stomp'
    return 'walk' if rig in WALKERS else 'march'


def build_enemy(name, rec, data):
    sl = slug(name)
    hidden = bool(data.get('hidden')) if rec.get('hidden') is None else rec['hidden']
    size = rec.get('size') or (1.45 if data.get('boss') else 1.0)
    if 'custom' in rec:
        model, rig, anim = rec['custom'](f'eb_{sl}')
        return Look('enemy', name, sl, rig, model, None, anim, rec.get('size', 1.0), hidden)
    rig = RIGS[rec['rig']]
    m = dress(f'e_{sl}', rig, rec['theme'], rec.get('mats'), hidden=hidden)
    if rec.get('fn'):
        rec['fn'](m)
    return Look('enemy', name, sl, rig, None, m, enemy_anim(rec, rec['rig'], data), size * rig.scale, hidden)


def looks(kind):
    """every look of one kind in skin order (looks of an animation together, the data's order within it)"""
    if kind == 'tower':
        import roster_towers                                      # (it builds on this module's Look)
        return roster_towers.looks()
    if kind == 'unit':
        import roster_units
        return roster_units.looks()
    if kind == 'enemy':
        data = load('enemies')
        out = [build_enemy(n, ENEMY[n], d) for n, d in data.items() if n in ENEMY]
    else:
        raise KeyError(kind)
    out.sort(key=lambda lk: ANIM_ORDER.index(lk.anim))
    for i, lk in enumerate(out):
        lk.index = i
    return out


def missing(kind):
    if kind == 'tower':
        import roster_towers
        return roster_towers.missing()
    if kind == 'unit':
        import roster_units
        return roster_units.missing()
    data = load({'enemy': 'enemies'}[kind])
    return [n for n in data if n not in {'enemy': ENEMY}[kind]]

#!/usr/bin/env python3
"""Builds every TDS model, texture, client entity, render controller and animation.

    python3 tools/art/art.py              # first: the pixel art the models sample (faces, emblems)
    python3 tools/models/build.py         # write rp/ files that changed
    python3 tools/models/build.py --check # exit 1 when any output is stale (writes nothing)
    python3 tools/models/build.py --only enemy_walker,tower_gunner

Then look: node lab.mjs render geometry.tds.<name> --tex rp/textures/entity/tds/<name>.png -a tds
and lint: node lab.mjs check -a tds
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RP = os.path.join(ROOT, 'rp')

from kit import write  # noqa: E402
import roster  # noqa: E402

# bodies: vanilla mobs and the player's body (referenced, not built); ours for buildings, machines, plants and duckies.
# Enemies, towers and units: one look each from the roster (roster.py, roster_towers.py, roster_units.py), its gear or its body.
ROSTER = ('enemy', 'tower', 'unit')
GROUPS = {}
KEEP = ('ghost_ok.png', 'ghost_bad.png')          # written by tools/gen_assets.py


def models(looks):
    seen, out = set(), []
    for group in GROUPS.values():
        for make in group:
            m = make()
            if m.name not in seen:
                seen.add(m.name)
                out.append(m)
    for kind in ROSTER:
        for lk in looks[kind]:
            m = lk.gear or lk.body
            assert m.name not in seen, m.name
            seen.add(m.name)
            out.append(m)
    return out


def main(argv):
    check = '--check' in argv
    only = None
    if '--only' in argv:
        only = set(argv[argv.index('--only') + 1].split(','))
    outputs = {}
    built = []
    looks = {kind: roster.looks(kind) for kind in ROSTER}
    for m in models(looks):
        if only and m.name not in only:
            continue
        outputs.update(m.outputs(RP))
        built.append(m)
    if not only:
        try:
            import entities  # noqa: E402
            outputs.update(entities.outputs(RP, {m.name: m for m in built}, looks))
        except ImportError:
            pass
        import roster_entities as RE
        outputs[os.path.join(ROOT, 'src', 'looks.ts')] = RE.looks_ts([('ENEMY_LOOK', looks['enemy']),
                                                                       ('TOWER_LOOK', looks['tower'], ('string', lambda lk: lk.extra['fire'])),
                                                                       ('UNIT_LOOK', looks['unit'])]).encode()
    stale = write(outputs, check)
    if not only:                                    # files of looks that are no longer built
        for d in (os.path.join(RP, 'models', 'entity', 'tds'), os.path.join(RP, 'textures', 'entity', 'tds')):
            for f in sorted(os.listdir(d)):
                p = os.path.join(d, f)
                if p not in outputs and f not in KEEP:
                    stale.append(p)
                    if not check:
                        os.remove(p)
    for m in built:
        if not m.name.startswith(('e_', 'eb_', 't_', 'tb_', 'u_', 'ub_', 'tower_', 'gear_')):
            print(f'  {m.name:18s} bones {len(m.bones):2d}  cubes {len(m.cubes):3d}  variants {len(m.variants)}')
    for kind in ROSTER:
        n = [len((lk.gear or lk.body).cubes) for lk in looks[kind]]
        print(f'  {kind} looks {len(n)}: cubes {min(n)}..{max(n)}, {sum(n)} in all')
    if check:
        for p in stale:
            print('   stale:', os.path.relpath(p, ROOT))
        return 1 if stale else 0
    print(f'models: wrote {len(stale)} file(s), {len(outputs) - len(stale)} already current')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

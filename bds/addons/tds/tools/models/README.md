# TDS looks: how they are made

Required skills (AGENTS.md): `mcbe-model-*` + `bds-models` for geometry, `pxl-pixel-art` + `pixel-art-animator` + `bds-pixel-art`
for pixel art and its animation, `mcbe-geo-ui` for the HUD. This build is the lab's own code following them.

```
python3 tools/art/art.py           # pixel art: faces and emblems the models sample, slot icons, particles, pack icon
python3 tools/art/hud_anim.py      # the GeoUI HUD's animated icons: an 8-frame strip (only GeoUI animates)
python3 tools/models/build.py      # gear, buildings, machines, client entities, render controllers, animations (--check: stale?)
python3 tools/gen_assets.py        # ghost tints, particles, slot items, behaviour entities (tds:yaw), lang
node tools/hud.mjs                 # the GeoUI HUD + its anim layer (uv_anim flipbook)
python3 tools/models/test_models.py   # the contract: geometries, textures, gear-vs-vanilla rigs, animated bones, pips, tds:yaw
```

Look before saying it looks right: `python3 tools/models/look.py <name>...` (our geometries), `python3 tools/models/compose.py all`
(a vanilla body with its gear, merged for the lab's renderer; vanilla textures come from the samples checkout's git objects),
then read `bds/.lab/render/sheet_*.png`. `node lab.mjs check -a tds` lints every geometry.

- Bodies: enemies, the figure towers (gunner/hologram, medic, sniper) and the soldier / skeleton units are vanilla mobs referenced
  by geometry id and texture path (`vanilla.py`); our gear repeats each vanilla rig (names, parents, pivots, bind rotations)
  so the same animation moves both layers. Buildings and machines (farm, mortar, barracks, frost spire, jeep, sentry, ice
  turret) are ours alone (`towers.py`, `units.py`). `enemies.py` and the other unbuilt functions are the all-custom alternative.
- Conventions (kit.py): rotation `[rx, ry, rz]` is applied as right-handed `(-rx, ry, -rz)`; the game mirrors models in x
  (`east` UV on the low-x side); paint by position; plates (wings, flags, capes, scarves) are one zero-thickness cube with two
  faces cut by alpha; keep gear 0.2+ off every vanilla face.

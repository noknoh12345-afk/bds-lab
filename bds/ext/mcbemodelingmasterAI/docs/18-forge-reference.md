# 18 — Forge reference (`tools/forge`)

A builder is a Python script: create a `Model`, add bones and boxes, describe the paint, call `run`. See `examples/`.

```python
from forge.shapes import Model
from forge.output import run, DYES, FACE_LIGHT, mix, mul, noise

m = Model("drake")
m.bone("root", None, (0, 0, 0))
m.bone("body", "root", (0, 10, 0))
...
sys.exit(run(sys.argv[1:], m, SPEC))      # `--check` compares with the files on disk and writes nothing
```

## shapes.py — `Model` (alias `Kart`)

| call | makes |
| --- | --- |
| `bone(name, parent, pivot, rotation=[...], locators={...})` | a bone; `rotation` is its bind pose |
| `box(bone, name, x0, x1, y0, y1, z0, z1, mat, rot=None, pivot=None, decal=None, seamless=False, dens=None, only=None)` | a cube. `dens`: texels per unit, a number or `{face: n}`. `only`: a plate (one face, or two opposite ones) with zero thickness |
| `pair(bone_l, bone_r, name, ...)` | a cube on +x and its mirror, named `name_l`, `name_r` |
| `mirror(name, new_name, bone=None)` | the mirror image of an existing cube |
| `remove(name)`, `cube(name)` | drop / fetch a cube (`cube(name).update(...)` to restyle a shared part) |
| `slope(bone, name, x0, x1, front=(z, y), rear=(z, y), thick, mat, extend=(a, b))` | a link whose TOP face runs from `front` to `rear` in the side profile |
| `chain(bone, name, x0, x1, points, thick, mat)` / `chain_pair(...)` | centred / mirrored runs of links along `points` (front to rear); valleys extended, alternate links 0.03 narrower |
| `roll_chain_pair(bone, name, x_edge, points, roll, width, thick, mat)` | strips hinged on a chain's outer top edge and rolled down-and-out: a rounded shoulder, a bevel |
| `plank(bone, name, anchor, toward, normal, x_off, width, thick, mat, lift=0, extend=(a, b))` | a link in any plane: runs from `anchor` to `toward`, top face normal `normal`, spans `x_off .. x_off + width` across |
| `taper_walls(bone, name, rear=(x, z), front=(x, z), top_rear, top_front, thick_x, links)` | mirrored walls running straight between two points in plan: splays, chamfered corners |
| `octagon(bone, name, cx, cy, z0, z1, radius, mat)` | an eight-sided cylinder along z |
| `wheel(bone, side, spec)` | a 16-sided tyre, a rim disc, a cap, a brake |

Helpers: `rot_json`, `about` (the game's rotation), `euler_json` (angles for three axes), `unit`, `cross`, `sub`.

## checks.py — `validate(model, spec)`

Required spec keys: `cap`, `groups`. Optional: `symmetric` (True), `ground_clearance`, `wheel_bones`, `wheels`, `hip`, `poses`, `pose_tolerance`, `shaft_buried`. Returns the problems and the bounding box. `coplanar_faces(model, pose=None)` is the z-fight finder on its own.

## output.py

- `run(argv, model, spec)`: validate → visibility → UV layout → paint every variant (in parallel) → write `models/entity/<name>.json`, `animations/<name>.animation.json`, `textures/entity/<name>/<name>_<variant>.png` under `spec["rp"]`.
- Spec keys: `rp`, `atlas` (n or (w, h)), `density`, `grain`, `variants`, `fixed` (material colours), `palette(variant)` (overrides), `decal(p)`, `clips`, `base_animations`, `visibility` (pose names), `spinning` (freely moving bones), `seen_from_below` (True for anything that flies, is held or is a prop: adds the view directions from underneath).
- `clips`: `{name: (length, {left_bone: right_bone}, {time: {left_bone: {"rotation": v, "position": v}}}[, loop])}` — mirrored onto the right bones; with `None` for the pairs the frames are `{bone: {channel: {time: v}}}` as given.
- `face_point(cube, face, u, v)`, `DISPLAY_NORMALS`: the game-true face mapping (`docs/02`). `buried_faces(model)`.
- A cube dict may carry `"flip": ("west",)`: that face is written mirrored (negative `uv_size`), the way Blockbench does.
- The `Pixel` a decal receives: `cube, face, u, v, i, j, w, h, col, palette, fixed`, `local()`.

## visibility.py / visibility.mjs

`unseen_faces(model, poses, face_point, px_per_unit=32, spinning=..., from_below=False)`. A two-faced plate (`only` with two faces) is never blanked: its faces are drawn over each other and must stay identical. Python prepares the quads, Node rasterises them (it is a hundred times faster).

## preview/render_model.py, inspect_model.py

Described in their own docstrings and in `docs/10`.

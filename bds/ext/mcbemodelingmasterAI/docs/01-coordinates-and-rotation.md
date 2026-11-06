# 01 — Coordinates, units and rotation (Bedrock entity geometry)

## Conventions used throughout

- Geometry `format_version` **1.16.0**, per-face UVs, one texture atlas per model.
- 16 model units = 1 block. Ground is y = 0. The entity faces **−z** (so "front" is −z, "rear" is +z).
- In the JSON, +x is the model's **left** (the game draws the model mirrored in x: see `02`). Wheel bones in the examples: A (front left, +x), B (rear left), C (front right), D (rear right).
- A cube is `origin` (its minimum corner) + `size`. `pivot` + `rotation` turn it in place. A bone's `pivot` + `rotation` are its **bind pose**.

## Rotation — the rule that makes everything else work

The game reads a JSON rotation `[rx, ry, rz]` (degrees) as the **right-handed** rotation by `(-rx, ry, -rz)`, applied **X first, then Y, then Z**, about the pivot:

```python
def rot_json(v, rot):
    rx, ry, rz = radians(-rot[0]), radians(rot[1]), radians(-rot[2])
    x, y, z = v
    y, z = y*cos(rx) - z*sin(rx), y*sin(rx) + z*cos(rx)
    x, z = x*cos(ry) + z*sin(ry), -x*sin(ry) + z*cos(ry)
    x, y = x*cos(rz) - y*sin(rz), x*sin(rz) + y*cos(rz)
    return x, y, z
```

Evidence: vanilla riding-leg poses only splay outward under this reading; a closed strap loop built from ±90° X segments only closes under it; every kart in the case studies was built and verified with it.

- A positive `rx` on a box lying along z tilts its **rear end up** (a slope rising toward +z has `rx = +atan2(dy, dz)`).
- Nested bones: apply the cube's rotation, then each bone's rotation from the cube's bone up to the root, each about that bone's own (rest) pivot.
- **Animations add.** An animation's `rotation` is added, component by component, to the bone's bind rotation (`position` is an offset). So "fold it with the bind pose, open it by adding" works and needs no special case. A bind of `[-98, 0, 0]` plus a clip value of `[108, 0, 18]` leaves the bone at `[10, 0, 18]`.
- Mirroring a part to the other side: `origin.x -> -(origin.x + size.x)`, `pivot.x -> -pivot.x`, rotation `[rx, -ry, -rz]`. Animation values mirror the same way; write `-x if x else x` so files never contain `-0.0`.
- To turn a box's axes onto three unit vectors, solve the Euler angles in this convention (`euler_json` in `tools/forge/shapes.py`); mind the gimbal lock when the box's own x axis lies along z.

## Numbers worth keeping

- Five decimals in the JSON are enough and survive a Blockbench round trip.
- Blockbench saves tabs, compact arrays and negative `uv_size` for mirrored faces. Patch such files with text edits if you must change them, so the author's formatting survives.

# 02 — The x mirror and the face UV rule

**This is the most expensive fact in the repository.** We built four karts before finding it, and two of them still carry single-texel faces on the outside of their wheels because of it.

## The fact

Minecraft Bedrock (and Blockbench's Bedrock view, which matches the game) draws an entity model **mirrored in x relative to the numbers in the geometry JSON**.

Consequences for a cube with per-face UVs:

| JSON face label | where the game shows it | across (u: 0 → 1) | down (v: 0 → 1) |
| --- | --- | --- | --- |
| `east` | the cube's **low-x** side | from high z to low z | top to bottom |
| `west` | the cube's **high-x** side | from low z to high z | top to bottom |
| `north` | low-z side (the front, if front is −z) | from low x to high x | top to bottom |
| `south` | high-z side | from high x to low x | top to bottom |
| `up` | top | from low x to high x | from high z to low z (first row = rear) |
| `down` | bottom | from low x to high x | from low z to high z |

(x, y, z above are the JSON's. The machine-readable version is `data/face-mapping.json`; the code is `face_point` in `tools/forge/output.py` and in `tools/preview/render_model.py`.)

## How it bit us

The forge cuts faces nobody can see down to one texel. It took `east` for the high-x side, decided that a wheel hub's *inner* face was buried, and shrank it. In the game that label is the **outer** face: every hub showed one flat grey texel, and the star we had painted was inside the wheel. The maintainer sent a screenshot; a render of the JSON "as written" looked perfect.

## How we pinned it down

Two independent observations, and only one reading satisfies both:

1. the hub's one-texel `west` face appeared on the wheel's high-x side → labels are mirrored in x;
2. the maker's emblem (a logo with text, on an `up` face) reads left to right in the game → across a face, u runs as in the table (a pure geometric mirror alone would have reversed the text).

## What to do about it

- Decide what a face shows with `face_point`, never by intuition. In a decal, use `p.local()` (exact point of the texel in the cube's frame).
- Keep decals left/right symmetric unless you computed the position.
- For a wheel on the +x side, the **outer** face label is `west`; on the −x side it is `east`. Put the picture (and the texel density) there.
- Preview only with a renderer that applies the mirror (`tools/preview/render_model.py`). If you must use another renderer: mirror every position in x, negate the y and z angles of every rotation, and reverse u on every face.
- Write a test that would fail under the wrong reading (ours: "each hub's outer face carries the jewel in its middle"), and check that it does fail when you flip the rule.
- Blockbench writes a mirrored face as a **negative `uv_size`** with `uv` at the far edge. Treat `min(uv, uv + size)` .. `max(...)` as the rectangle.

## Related: rotation

A JSON rotation `[rx, ry, rz]` (degrees) is applied as the right-handed rotation `(-rx, ry, -rz)`, X first, then Y, then Z, about the pivot. See `docs/01-coordinates-and-rotation.md`.

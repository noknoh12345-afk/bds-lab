---
name: mcbe-model-zfight-and-seams
description: Find and fix z-fighting (flicker), cracks, seams, gaps and collapsed cubes in a Bedrock model. Use when the user reports flicker, cracks, lines between cubes, or after any hand edit in Blockbench.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# Z-fighting and seams

Full text: `docs/04-zfighting-and-seams.md`.

1. Run `python tools/inspect_model.py <model.geo.json>`. It reports coplanar overlapping faces (rotated cubes included), collapsed cubes (negative / zero size), UVs off the atlas, unequal faces of a two-faced plate, duplicates, one-sided edits.
2. For each z-fight pair: move ONE part 0.02–0.05 along the normal, or shrink it by that much. Prefer the part whose other faces are hidden.
3. Build the habit in: alternate chain links 0.03 narrower, each tyre slab its own width, rails 0.04 above lids, panels 0.05 inside the shoulder above them.
4. **Then paint the step faces** so they continue their neighbour: rings by radius on wheel slabs, the side colour *and brightness* on link ends (`colour * light[side] / light[face]`), lines placed by position in model space.
5. Re-run with every animated pose listed in the spec — moving parts create new coplanar pairs.
6. A two-faced plate's faces are coplanar by design: they must be identical point for point (paint by `p.local()`).

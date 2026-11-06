---
name: mcbe-model-shape-language
description: Shape rules for Bedrock cube models: no stair steps, tilted links joined corner to corner, splays where widths step, filled valleys, one design language. Use when shaping any body, curve, slope, limb, blade or panel, or when feedback says 'stairs', 'gap', 'plays apart', 'looks like a lizard'.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# Shape language

Full text: `docs/03-shape-rules.md`.

1. **Curves and diagonals are tilted boxes joined corner to corner** — `slope`, `chain`, `chain_pair`, `plank`. Never boxes of shrinking size.
2. **Width steps get a splay**: a box with the narrow link's tilt, yawed out to the wide link's corner (`taper_walls`). Wedge gaps are fine only where nobody can see them.
3. **Valleys are filled** by running both links past the corner (the chain tools do it).
4. **A tilted part's end runs INTO its neighbour.**
5. Pieces that read as one share **one pivot**; things on a raked surface take its rake; covers are narrower and steeper than what they cover.
6. **One design language** from end to end. Do not bolt a motif on; do not reuse another model's front or sides.
7. **Closed and balanced**: no face shows its own sides, nothing floats, no inside is visible from the player's viewpoints; judge the whole side view.
8. **Fix what was pointed at**, the way it was described. Do not redesign the part.
9. Thin things (membranes, fins, leaves, cloth) are cut-out plates: see `mcbe-model-creatures-and-props`.

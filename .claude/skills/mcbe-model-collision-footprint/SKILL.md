---
name: mcbe-model-collision-footprint
description: Fit a physics / collision footprint to a Bedrock model by measurement: rest-pose corners of structural bones, convex envelope in slices, shape supports 0–0.03 outside the measured extremes.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# Collision footprint

Full text: `docs/13-collision-footprint.md`.

1. Structural bones only (no wheels, steering, transforming parts, trim).
2. Rest-pose corners → ground-plane convex hull → half-width in 101 slices.
3. Fit the shape: supports (side, front, rear) **0 to 0.03 blocks outside** the measured extremes; then minimise envelope-outside-shape, then shape-outside-envelope.
4. Re-measure after every body change.
5. Test: recompute the extremes from the geometry inside the test; shrink a radius and watch it fail.

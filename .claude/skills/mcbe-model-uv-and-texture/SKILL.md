---
name: mcbe-model-uv-and-texture
description: Lay out UVs and paint textures by function for a Bedrock model: per-face rectangles, per-face density, liveries, pictures placed by position, cut-out plates, emissive alpha. Use when making or fixing a model's texture.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# UV and texture

Full text: `docs/05-uv-atlas-and-painting.md`, `docs/02-x-mirror-and-face-uv.md`.

1. Every face owns a rectangle; density is texels per unit, overridden per face where a picture must read (`dens={"west": 8}`). On a +x part the OUTER face is `west`.
2. Write `decal(p)`: use `p.face`, `p.u/p.v`, `p.i/p.j`, and **`p.local()`** (the exact point, as the game draws it). Return `None` to cut a texel out (alpha-tested material).
3. Place anything that crosses cubes **by position**; make round things **radial**; shade a body **by height**, not per cube.
4. Asymmetric art (text, numbers, a dial) only on faces whose orientation you verified in the game.
5. Liveries: `palette(variant)` may override any material; every variant must differ.
6. `grain=0` on big atlases; crop the atlas height to what is used (`atlas=(512, 384)`).
7. Check the atlas itself on a magenta background when you use transparency.

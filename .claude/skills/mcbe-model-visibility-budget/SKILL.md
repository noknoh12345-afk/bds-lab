---
name: mcbe-model-visibility-budget
description: Reduce a Bedrock model's texture size and VRAM: blank faces nobody can see, per-face density, cropped atlas, no grain. Use for mobile performance or when told 'this texture is hidden / wasted'.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# Visibility and the texture budget

Full text: `docs/09-visibility-and-texture-budget.md`.

1. `spec["visibility"] = ("open", ...)`: pose names to test besides rest. The forge blanks (one texel) faces buried inside their own bone and faces no view ever shows.
2. `spec["spinning"]`: bones an animation moves freely (wheels, neck, tail, legs) — judged only by burial in their own bone.
3. `spec["seen_from_below"] = True` for anything that flies, is held, or is a prop. Ground vehicles are not viewed from far below.
4. A two-faced plate never loses one face.
5. Spend density where pictures are; 2–3 texels per unit on plain big surfaces; outer wheel faces 6–8, inner 3.
6. `grain=0`; crop the atlas (`atlas=(512, 384)`).
7. Audit: list one-texel faces that some *other* set of view directions does show; what remains must be single-colour or one texel wide anyway.
8. Keep the rasteriser in Node (`visibility.mjs`), not Python.

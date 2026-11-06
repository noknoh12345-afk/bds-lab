---
name: mcbe-model-hand-edits
description: Work with a person who edits the model in Blockbench: their file wins, lint it, fix only defects with minimal text patches, bring the builder to their geometry, keep their original.
---

> Vendored from iMasterProX/mcbemodelingmasterAI (MIT). Every path below (`docs/`, `tools/`, `examples/`, `data/`) is relative to `bds/ext/mcbemodelingmasterAI/`. In this lab also: `node lab.mjs render <id> --anim <clip>@0|@end` and `node lab.mjs check` (skill `bds-models`).

# A human's hand edits

Full text: `docs/11-working-with-a-human-modeller.md`.

1. Their saved file is the source of truth. Never regenerate over it. "Deploy as is" means as is.
2. Copy their original aside. Run `tools/inspect_model.py` on it.
3. Fix only real defects (collapsed cube, z-fight between their wedges), with the smallest change, **as a text patch that keeps their formatting**. Tell them exactly what and why. Report asymmetries; do not correct them unasked.
4. Bring the builder to THEIR geometry: `HAND_FINISH` (changed cubes, exact values), `HAND_ADDED`, `HAND_REMOVED`, until builder and file match cube for cube. Their UVs (negative sizes, shared texels) need not be reproduced unless asked; tests must accept them.
5. Turn their corrections into rules and checks.

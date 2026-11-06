---
name: mcbe-model-fundamentals
description: Build a Minecraft Bedrock Edition entity model in code. Use for any new Bedrock model (vehicle, creature, weapon, cosmetic, prop), or when a model's orientation, rotation, mirroring or units look wrong.
---

# Bedrock model fundamentals

1. Read `docs/01-coordinates-and-rotation.md` and `docs/02-x-mirror-and-face-uv.md`. Two facts decide everything:
   - a JSON rotation `[rx, ry, rz]` is applied as right-handed `(-rx, ry, -rz)`, X then Y then Z; animation rotations are ADDED to the bind pose;
   - the game draws the model **mirrored in x**: `east` UV shows on the low-x side, `west` on the high-x side; across a face the texture runs as `data/face-mapping.json` says.
2. Conventions: 16 units = 1 block, ground y = 0, front is −z, +x is the model's left in the JSON.
3. Skeleton: one bone per thing that moves, pivot at the real joint. Fixed structure on one bone.
4. Write a builder script (copy `examples/build_demo_kart.py` or `examples/build_demo_drake.py`): bones → boxes and tilted parts → `FIXED` colours, `palette`, `decal` → `SPEC` → `run`.
5. Loop: `--check` until clean → write → render (`tools/preview/render_model.py`) → LOOK → lint (`tools/inspect_model.py`).
6. If vanilla already has the thing (a wing, a fin, a banner), open the vanilla resource pack's model and texture first.

Never reason about which side a face shows from the JSON alone. Never report a look you did not render.

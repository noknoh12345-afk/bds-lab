---
name: mcbe-model-creatures-and-props
description: Model Bedrock creatures (monsters, dragons, animals), aircraft, weapons, cosmetics and props in code: bone per joint, curved bodies as chains, wings and fins as alpha-cut plates the way the vanilla Ender Dragon does, looping Molang motion.
---

# Creatures, weapons, props

Full text: `docs/07-creatures-weapons-props.md`. Example: `examples/build_demo_drake.py`.

1. **Look at vanilla first.** If the vanilla pack has the thing (a dragon wing, a fin, a banner), open its model and texture before designing yours.
2. One bone per joint: `body → neck → head → jaw`, `tail → tail_tip`, `wing → wingtip`, legs.
3. **Curved bodies are chains** of tilted links in the side profile; each chain's end runs INTO what it joins.
4. **Wings, fins, frills, leaves, cloth: a leading-edge bone plus ONE zero-thickness plate** (`only=("up", "down")`). The curved, scalloped outline and the finger bones are PAINTED; outside the outline the decal returns `None`; the client entity uses `entity_alphatest`.
   - Both plates of a wing lie in ONE wing plane; each plate's inner edge lies exactly on its hinge line, and it turns about that axis only — then no pose can swing it into the body.
   - **Paint by position** (`p.local()`): both faces are drawn over each other and must agree at every point. Never let one face be reduced (the forge and the linter guard this).
   - Set `seen_from_below=True` for anything that flies or is held.
5. Model wings spread; hold them at rest with the bind pose; clips and Molang loops ADD to the bind; the hand lags the arm by a phase. List `rest`, `spread`, `up`, `down` as poses.
6. Feet ON the ground: leave `ground_clearance` out. Free-moving bones (neck, tail, legs) go in `spinning`.
7. Weapons and held items: `mcbe-model-attachables`; blades are tilted, not stepped; `symmetric=False` for one-sided items.

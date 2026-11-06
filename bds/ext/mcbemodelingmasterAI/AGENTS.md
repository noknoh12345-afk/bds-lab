# AGENTS.md — AI entry point

Read this first. It applies to any coding agent (Claude Code, Codex, Cursor, Copilot, Aider, ...) that opens this repository or is pointed at it for **Minecraft Bedrock Edition entity modelling done in code** — anything made of cubes: vehicles, monsters, dragons, aircraft, weapons, wearables and cosmetics, props.

Everything marked *field-proven* was learned by shipping models to a live Bedrock server and having a human art director reject them, repeatedly, until they stopped being rejected. The rules are the rejections. They were learned on karts, but almost none of them are about karts: they are about cubes, planes, textures, moving parts and the way Bedrock draws them.

## 1. Two layers

| Layer | Where | Use it for |
| --- | --- | --- |
| Knowledge | `skills/`, `docs/`, `data/` | what to build, what never to do, why |
| Tools | `tools/forge/`, `tools/preview/render_model.py`, `tools/inspect_model.py`, `examples/` | build a model from a Python script, check it, LOOK at it, lint a human's Blockbench save |

Two worked examples, both original: `examples/build_demo_kart.py` (a vehicle with a rider, wheels and a transforming part) and `examples/build_demo_drake.py` (a creature with a curved spine, a jaw, and wings that fold).

## 2. Routing

| The user wants | Read | Then |
| --- | --- | --- |
| any new model from scratch | `skills/mcbe-model-fundamentals`, `skills/mcbe-model-shape-language` | write a builder like the examples; iterate with `--check` and renders |
| a vehicle (kart, car, boat, aircraft, mount with a seat) | + `skills/mcbe-model-vehicles`, `docs/06-vehicles.md` | fit the rider, close the body, check the steering sweep |
| a creature, a weapon, a prop, a cosmetic | + `skills/mcbe-model-creatures-and-props`, `docs/07-creatures-weapons-props.md` | one bone per thing that moves; curved bodies are chains |
| a wearable / held item (attachable) | + `skills/mcbe-model-attachables`, `docs/12-attachables-and-wearables.md` | verify orientation in game; never place asymmetric art by derivation alone |
| "it flickers / z-fights", "there are cracks", "gaps" | `skills/mcbe-model-zfight-and-seams` | `python tools/inspect_model.py <geo.json>`; fix the pair it names |
| "the texture is wrong / mirrored / on the wrong side" | `docs/02-x-mirror-and-face-uv.md` (the single most expensive fact here) | render with `tools/preview/render_model.py`; never reason from the JSON alone |
| an opening / folding / transforming / pop-up part | `skills/mcbe-model-transforming-parts` | model it OPEN, fold with the bind pose, check every pose |
| smaller textures, mobile performance | `skills/mcbe-model-visibility-budget` | `visibility=(...)` in the spec, per-face density |
| "I edited it in Blockbench, check it" | `skills/mcbe-model-hand-edits` | lint their file, fix ONLY defects, bring the builder to THEIR geometry |
| a physics footprint for the model | `skills/mcbe-model-collision-footprint` | measure, never eyeball |
| a review before delivery | `skills/mcbe-model-verification`, `docs/15-review-checklist.md` | every line, with evidence |

## 3. Hard rules (each one is a past failure; `data/rules.json` is the machine-readable list)

**How Bedrock draws**
1. **The game draws a Bedrock model mirrored in x.** A cube's `"east"` UV is shown on its LOW-x side, `"west"` on its high-x side, and across every face the texture runs the other way from the naive reading. `data/face-mapping.json` is the table. A renderer that ignores this lies to you.
2. **A JSON rotation `[rx, ry, rz]` is applied as right-handed `(-rx, ry, -rz)`, X then Y then Z.** Animation rotations are **added** to the bone's bind rotation.

**Shape**
3. **No stair steps.** Slopes and curves are tilted boxes joined corner to corner. Where a width steps, splay a box out to the wider corner. Fill valley joints by running both links past the corner. A tilted part's end runs INTO what it meets.
4. **No two faces on one plane.** Move one part 0.02–0.05. Then **paint the thin step that appears so it continues its neighbour** — unpainted steps look like cracks.
5. **The design flows as one piece.** A motif stuck on the front "looks like a lizard". Do not reuse another model's front or sides.
6. **A body is closed.** Its face must not show its own sides; nothing floats; no inside is visible from where the player looks (a wheel from the seat, a hollow neck from below).
7. **One silhouette, one balance.** If one end is raised, raise the rest: balance is judged on the whole side view.

**Moving parts**
8. **Nothing fixed may stand in a moving part's path**, in any pose. Model the part open; fold it with the bind pose; check folded, half, open and overshoot.
9. **One bone per thing that moves**, pivot at the real joint; pieces that read as one share ONE pivot.

**Thin things**
9b. **A membrane, fin, leaf, cloth or grille is ONE zero-thickness plate whose outline is cut by transparent texels** (material `entity_alphatest`) — the way the vanilla Ender Dragon makes its wings — not a board and not a fan of boxes. Its two faces lie in one plane and are both drawn: paint them **by position** so they agree at every point. When vanilla has the thing you are making, **open the vanilla pack and look first**.

**Texture**
10. **Texture nobody can see must go (one texel); texture meant to be seen must be visible.** Check visibility from every direction, in every pose. Bones that an animation moves freely are exempt.
11. **Pictures that cross cubes are placed by position**, not by texel index, so lines run on from one cube to the next.

**Working**
12. **Fit what the model touches**: the seated rider, the hand that holds it, the head that wears it. Test against the pose the game really shows.
13. **When a human hand-edits the model, their file wins.** Deploy it as is; fix only real defects (say which); bring the builder to THEIR geometry. Fix what they point at — a redesign of the whole part gets rejected.
14. **Look at it.** Render after every change, from the camera the player will have, in every pose, in a light and a dark livery. "The checks pass" is not "it looks right". Never report a look you have not rendered.
15. **Heavy loops do not belong in Python.** Rasterising visibility in Node took a build from 150 s to 24 s.
16. **Physics footprints are measured**, from the rest-pose corners of the structural bones — never eyeballed.

## 4. The loop

```
write / edit the builder  ->  python <builder> --check      (geometry checks; nothing is written)
                          ->  python <builder>              (model, animations, textures)
                          ->  python tools/preview/render_model.py ...   and LOOK (rest + every pose + two liveries)
                          ->  python tools/inspect_model.py <geo.json>   (also for human saves)
                          ->  your project's tests; prove each new test fails on the broken model
```

## 5. Model compatibility — read before trusting the output

This repository was written with and tuned for **Claude (Claude Code)**. It is plain Markdown, JSON and Python, so any agent can use it. In the one head-to-head we ran (the *Vega* kart, `docs/16-case-studies.md`), **OpenAI Codex — on its strongest setting — followed these rules, passed every check and painted good textures, yet the body needed a rebuild**: the fascia showed its sides, a box floated over the front wheels, stays crossed the transforming panels, the rear wheels showed from the seat. Expect somewhat less design detail from Codex and review its renders harder. It is one data point; see `docs/17-model-compatibility-notes.md`.

## 6. Scope and honesty

- Bedrock Edition only (entity geometry `format_version` 1.16.0 with per-face UVs). Nothing here is about Java Edition models.
- *Field-proven* means shipped and accepted by the art director: karts (four), a wrist watch and a hand charm. Creature, aircraft and weapon guidance is the same method applied further, checked with the tools and the drake example, **not yet battle-tested in a shipped product** — each doc says which is which.
- No game assets of the originating project are included; both example models are original.
- Numbers such as a seat height or wheel sizes are one project's. Keep the method, change the numbers.
- If you have not rendered it or run it, say so.

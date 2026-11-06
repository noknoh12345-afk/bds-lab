# 00 — Overview

This repository teaches an AI (and the person working with it) to build **Minecraft Bedrock Edition entity models in code**: a Python script is the source, the geometry JSON, the animations and every texture are its output, and a set of checks and a game-true renderer stand between the script and the game.

## Why code, not only Blockbench

- A model is a few hundred numbers that must agree with each other (corners that meet, planes that must not, UVs that must not overlap, poses that must not collide). A script can state the *relation*; an editor stores only the result.
- Every rule in `AGENTS.md` can be checked by a program. A program that checks them never gets tired on cube 173.
- Textures painted by function survive any change of geometry, recolour into any number of liveries, and place pictures by position.
- A human art director still has the last word, in Blockbench. `docs/11` is how the two ways of working live together.

## The documents

| # | Document | Status |
| --- | --- | --- |
| 01 | Coordinates, units and rotation | field-proven |
| 02 | The x mirror and the face UV rule | field-proven (the most expensive fact here) |
| 03 | Shape rules: no stairs, splays, valleys, one piece | field-proven, the art director's own rules |
| 04 | Z-fighting and seams | field-proven |
| 05 | UV atlas and painting by function | field-proven |
| 06 | Vehicles | field-proven (four karts) |
| 07 | Creatures, aircraft, weapons, props | the same method applied further; tool-checked, not yet shipped |
| 08 | Transforming parts and animation | field-proven |
| 09 | Visibility and the texture budget | field-proven |
| 10 | The verification loop | field-proven |
| 11 | Working with a human modeller | field-proven |
| 12 | Attachables and wearables | partly field-proven (a wrist watch, a hand charm) |
| 13 | Measuring a collision footprint | field-proven |
| 14 | Failure modes | every entry happened |
| 15 | Review checklist | — |
| 16 | Case studies | what each model taught |
| 17 | Model compatibility notes | Claude-tuned; the Codex data point |
| 18 | Forge reference | API of `tools/forge` |

## The tools

- `tools/forge/` — `shapes.py` (bones, boxes, tilted parts), `checks.py` (the checks), `output.py` (UV layout, painting, files), `visibility.py` + `visibility.mjs` (which faces can ever be seen).
- `tools/preview/render_model.py` — draws a model the way the game does. Look at everything you make.
- `tools/inspect_model.py` — lints any geometry file, including a person's Blockbench save.
- `examples/` — a kart and a drake, both original, both passing every check.

Requirements: Python 3.10+, Pillow, numpy (renderer only), Node 18+ (visibility pass only).

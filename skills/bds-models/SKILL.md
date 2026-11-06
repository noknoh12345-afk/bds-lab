---
name: bds-models
description: Build or fix Bedrock entity and attachable models (geo.json, animations, textures) so they look right in the game. Use for custom mob shapes, held or worn items, z-fighting, mirrored or wrong textures, a person's Blockbench file.
---

# Models

Not for item or block textures alone (`bds-content`, `png`) or what a mob does (`bds-content`, `bds-script-api`).

1. After each change: `check` (collapsed / duplicate cubes, z-fight, UV off, unequal plates), then `render <ns:id|geometry.id>` as `model-look` says.
2. A moving part: one bone per thing that moves, pivot at the real joint; model it open, fold it with the bind pose, render every pose.
3. Report: what `check` passed, which renders you read, what still needs a look in the game (a render is not a game capture).

<!-- rules:begin (node lab.mjs skill build writes these from skills/knowledge.json) -->
- Never judge a side or a look from the JSON: the game mirrors models in x (east UV on the low-x side). `render <id> --anim <clip>@0/@end` draws it as the game does; read the PNG before calling it right. (when missed: text on the wrong side, a look reported but never seen) `model-look`
- A rotation [rx,ry,rz] is applied as right-handed (-rx, ry, -rz), X then Y then Z, about the pivot; animation rotations ADD to the bind pose. (when missed: a part tilted the wrong way) `model-rotation`
- No two faces on one plane: move one part 0.02-0.05, then paint the thin step like its neighbour (`check` names each z-fight pair). (when missed: flicker, then a crack where the step is) `model-zfight`
- texture_width/height must be the PNG's size and every UV inside it; a box UV [u,v] takes 2*(d+w) x (d+h) texels from there. (when missed: a face drawn with garbage) `model-uv`
- A wing, fin, leaf or cloth is ONE zero-thickness plate cut by transparent texels (entity_alphatest), both faces one size, painted by position; not a board or a fan of boxes. (when missed: wings that look like boards; one face paints over the cut-out) `model-plate`
- A person's Blockbench save wins: `check` it, fix only the defects named and say which; never redesign a part nobody pointed at. (when missed: a rewrite the person rejects) `model-hand-edit`
- Vanilla has the thing (a wing, a held item, a mount)? Look first: `render minecraft:<mob>`, `sample rp/models/entity/<name>`. (when missed: a guessed construction rejected 3 times) `model-vanilla-first` [source]
- No stair steps: slopes and curves are tilted boxes joined corner to corner; splay a box out where a width steps; run both links past a valley joint; a tilted part's end runs INTO what it meets. `src-79236f46` [source]
- Paint pictures that cross cubes by position, not texel index, so lines run on from cube to cube. `src-237884b3` [source]
- `entity_emissive_alpha_one_sided`: alpha 255 = world light, low alpha = self-lit, 0 = cut. `src-dfb4fb71` [source]
- Model wings spread, fold them to rest with the bind pose (clips and Molang loops ADD to it); the hand lags the arm by a phase; poses `rest`, `spread`, `up`, `down`. `src-a154c0bc` [source]
<!-- rules:end -->

[source]: a reference project's, not re-run here; the rest: tests/rp-offline.mjs.

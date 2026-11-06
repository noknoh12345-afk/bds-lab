# 11 — Working with a human modeller

*Field-proven. The art director edits in Blockbench; the AI builds in code. These are the terms under which that worked.*

## Their file wins

When a person saves the model from Blockbench, **that file is the source of truth**. Never regenerate over it.

- "Send it to the server as it is" means exactly that: parse it, count the cubes, check the UV bounds, deploy. No "improvements".
- Bring the **builder to their geometry**, not the other way round: carry their changed cubes as a `HAND_FINISH` table (exact origin / size / pivot / rotation), their new cubes as `HAND_ADDED`, the ones they deleted as `HAND_REMOVED`, until the builder's cubes match the file's one for one. Their UV layout need not be reproduced if they say so.
- Their UVs may mirror faces (a **negative `uv_size`**), share texels, or leave plates empty. Tests must accept that.

## Check their save — and fix only defects

Run `tools/inspect_model.py` on it. Typical finds, all real:

- a **collapsed cube** with a negative size, on one side only (a duplicated link squashed by accident);
- two hand-placed wedges whose tops lie on **one plane** (z-fight);
- edits made on the left but not the right.

Fix the first two with the smallest possible change (delete; shrink one part 0.02), **keep their formatting** (patch the text, do not re-serialise), keep a copy of their original, and tell them exactly what you changed and why. Report asymmetries; do not "correct" them unasked.

## Feedback is narrow

- Repair **what was pointed at, the way it was described**. A rejected example: asked to replace stair steps on a nose with joined tilted boxes, the AI redesigned the nose as a faceted fan. Verdict: "restore it and do it again".
- When several things are marked, answer each by number, with a render.
- Their corrections are lessons: a moved cowl became a check (`shaft_buried`), a closed gap became a rule (links run on into what they meet), mirrored wheel faces became a forge option.
- Show before and after from the same camera.

## What to hand over

Renders (rest, every pose, two liveries, the player's camera), the list of what you verified and what only the game can show, and the things you decided on your own (names, prices, numbers) marked as changeable.

## Names and taste are theirs

Familiar names. Their palette. Their call on whether a motif works. Offer, do not insist.

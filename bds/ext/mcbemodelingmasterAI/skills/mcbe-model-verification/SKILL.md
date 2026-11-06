---
name: mcbe-model-verification
description: Verify a Bedrock model before delivery: forge checks, game-true renders from the player's camera in every pose and two liveries, the linter, tests proven to fail on the broken model, an honest report.
---

# Verification

Full text: `docs/10-verification-loop.md`, checklist `docs/15-review-checklist.md`.

1. `python <builder> --check` → clean.
2. Render: default views + the player's camera + every pose + rider (if ridden) + a light and a dark livery + close-ups of what changed. **Read the images** and describe what you see before declaring success.
3. `python tools/inspect_model.py <geo.json>` → no errors; explain the notes.
4. Tests in the consuming project for what fails silently. **Break the model and watch each new test fail.**
5. Report: what was rendered; what only the game can show; what you decided unasked; pre-existing failures named separately. "Fixed" means the diff shows it.

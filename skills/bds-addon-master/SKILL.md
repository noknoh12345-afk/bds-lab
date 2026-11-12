---
name: bds-addon-master
description: Route any Minecraft Bedrock addon work in bds-lab to a playbook and the few skills it needs. Use first: a new addon from a request, a person's addon to fix or finish, only its look, a failure you cannot explain.
---

# bds-lab playbooks

Pick the ONE playbook that fits; read only the skills it names, when its step comes (each skill costs tokens on every later turn). A `rule:` line under a failure is a skill rule: follow it.

**A. New addon from a request.** 1 `bds-recipes`: copy the closest proven addon's shape (none close: `bds-script-api` + `bds-tests`). 2 `node lab.mjs bds new <n> "Title" "<request>"`; TASK.md: one acceptance line per thing asked, guesses under "Guessed" (do not stop to ask what a sensible default settles). 3 `bds-tests`: a section per acceptance line (`bds-tests-world` if players move, fish or fight). 4 `bds-script-api` with kit (`bds-forms` for menus and input); `sim` between edits, `go` until DONE. 5 `bds-quality`, then `bds-deliver`.

**B. A person's addon (fix, update, finish, add to it).** 1 `bds-fix-addon`: `import`, the brief lists what breaks and the bugs found before any server; fix them all in one round. 2 tests: draft + a section per request + one per unasked fix; `go`. 3 `bds-quality`, then `bds-deliver` (in their language).

**C. Only the look.** Forms/HUD: `bds-json-ui`. Mob/item shape: `bds-models`. Items/blocks/mobs/recipes data: `bds-content`.

**D. Beyond BDS scripts** (HTTP, per-player UI, packets, SQL, files): not in this branch (Endstone and LeviLamina are on `dev`); say so instead of faking it with scripts.

**E. Stuck.** go fails and its output does not say why: `bds-debug`. Minecraft updated: `node lab.mjs upkeep`.

**F. Unsure which skill:** `node lab.mjs skill route "<request>"`.

Done when go says DONE and the person has the report. Report only what a real-server test proved; a guess or a look nobody saw is unverified (say so).

Rules are re-checked on the real server (`skill verify`); when a rule and the server disagree, the server wins.

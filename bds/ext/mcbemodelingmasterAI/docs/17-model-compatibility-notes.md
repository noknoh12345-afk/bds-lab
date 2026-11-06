# 17 — Model compatibility notes

**This repository was written with, and tuned for, Claude (Claude Code).** The prose, the amount of "why" given with each rule, the routing in `AGENTS.md` and the tools' output are shaped by what made Claude produce accepted models.

It is plain Markdown, JSON, Python and a little Node, so any agent that reads `AGENTS.md` can use it. But set expectations honestly.

## The one head-to-head we have

| | Claude (Claude Code) | OpenAI Codex (strongest available setting — the maintainer used the one called *Astra*) |
| --- | --- | --- |
| Task | Falcon, Cobra, Sirius; the Vega rebuild | Vega, from a written handoff of everything in this repository |
| Rules, registration, tests, deployment | done | done, thoroughly; ten injected faults caught |
| Textures | accepted after feedback | grille, instruments and wheels accepted as delivered |
| Body design | accepted after the feedback rounds in `docs/16` | **rejected**: fascia showing its sides, a box floating over the front wheels, stays crossing the transforming panels, wheels visible from the seat, an unbalanced profile, "lacking refinement" |
| Performance sheet | — | audited independently: safe |

So: **with Codex, even on its strongest setting, expect the engineering to be sound and the design detail to fall somewhat short.** The defects were all of the kind that only *looking at a render critically* reveals. That is one data point from one project in September 2026, not a benchmark; models change quickly.

## If you use Codex (or any other agent)

- Make it render, and make it **describe what it sees** in each render before it declares the work done.
- Give it `docs/15-review-checklist.md` and demand evidence per line.
- Ask specifically: does any face show its own sides? does anything float? is anything in a moving part's path? what is visible from the player's seat or camera? is the profile balanced? has vanilla already solved this (then look at vanilla)?
- Review its renders harder than its logs. Its logs will be excellent.

## If you use Claude

The same checklist applies. Claude's failures in `docs/16` are just as real: stair steps, a redesign nobody asked for, a lizard, a mirrored atlas assumption that survived four karts, a dragon's wings rejected three times in a row (a board, a fan of boxes, then plates that cut through the body) until it opened the vanilla pack and looked.

## What no agent can do from here

See the model in the game. Orientation of asymmetric art, particle positions, how a colour reads under the game's lighting, how a transformation *feels* — a person must look. Say so in every report.

# mcbemodelingmasterAI

**Field-proven knowledge, skills and tools that teach an AI coding agent to build Minecraft: Bedrock Edition entity models in code** — vehicles, monsters, dragons, aircraft, weapons, wearables and cosmetics, props. Anything made of cubes.

**English** | [한국어](README.ko.md)

| | |
| --- | --- |
| ![Comet, the demo kart, at rest](docs/images/comet_rest.png) | ![Comet with its booster open](docs/images/comet_boost.png) |
| ![Drake, the demo creature, at rest](docs/images/drake_rest.png) | ![Drake with its wings spread](docs/images/drake_spread.png) |

*Both models are original, generated entirely by the scripts in `examples/`, and drawn by this repository's own game-true renderer. No Blockbench, no game.*

## What this is

An AI can write a Bedrock `geo.json`. What it cannot do, unaided, is make one a human art director accepts: it builds curves out of stair steps, leaves gaps beside every width change, paints pictures on faces nobody will ever see, puts text on the wrong side because **Bedrock draws models mirrored in x**, draws a dragon's wing as a wooden board — and then reports that everything passed.

This repository is the record of getting past that. Four racing karts, a wrist watch and a hand charm were shipped to a live Bedrock server; a human art director rejected them, round after round, until they stopped being rejected. Every rejection became a rule, every rule that could be checked became a check, and everything a check cannot see became a render the AI must look at.

The rules were learned on karts, but almost none of them are *about* karts. They are about cubes, planes, textures, moving parts, and the way Bedrock draws them. The demo drake in `examples/` exists to prove that: its wings were rejected three times, too, until the AI opened the vanilla resource pack and looked at how the Ender Dragon does it.

## How to use it

**Point your agent at [`AGENTS.md`](AGENTS.md).** That file routes it to the right skill and document for the job.

```bash
git clone https://github.com/iMasterProX/mcbemodelingmasterAI
```

```bash
pip install numpy pillow
```

Node.js (18 or newer) is needed for the visibility pass. Then, for example:

> *Read AGENTS.md in mcbemodelingmasterAI. Build me a wyvern mount for Bedrock Edition, at most 200 cubes, with wings that fold when it lands. Show me renders of every pose before you call it done.*

With **Claude Code**, you can also copy the folders under `skills/` into your project's `.claude/skills/` (or `~/.claude/skills/`): each `SKILL.md` has the front matter Claude Code expects, and points back into `docs/`.

Try the tools yourself:

```bash
python examples/build_demo_drake.py --check
```

```bash
python examples/build_demo_drake.py
```

```bash
python tools/preview/render_model.py examples/out/models/entity/drake.json examples/out/textures/entity/drake/drake_red.png drake.png --views front34,side,top --anim examples/out/animations/drake.animation.json --clip animation.drake.spread
```

```bash
python tools/inspect_model.py examples/out/models/entity/drake.json
```

## The facts that cost the most to learn

1. **Bedrock draws an entity model mirrored in x.** A cube's `east` UV shows on its *low*-x side, `west` on its high-x side, and the texture runs the other way across each face. A renderer that draws the JSON as written lies to you. → [`docs/02`](docs/02-x-mirror-and-face-uv.md), [`data/face-mapping.json`](data/face-mapping.json)
2. **A JSON rotation `[rx, ry, rz]` means right-handed `(-rx, ry, -rz)`, X then Y then Z**; animation rotations are *added* to the bind pose. → [`docs/01`](docs/01-coordinates-and-rotation.md)
3. **No stair steps.** Curves are tilted boxes joined corner to corner; width steps get a splay; valleys are filled. → [`docs/03`](docs/03-shape-rules.md)
4. **After you fix z-fighting, paint the step you created**, or it looks like a crack. → [`docs/04`](docs/04-zfighting-and-seams.md)
5. **Thin things are ONE zero-thickness plate with an alpha-cut outline** (`entity_alphatest`), both faces painted *by position* — the way the vanilla Ender Dragon makes its wings. → [`docs/07`](docs/07-creatures-weapons-props.md)
6. **Model a transforming part open; fold it with the bind pose; check every pose.** → [`docs/08`](docs/08-transforming-parts-and-animation.md)
7. **Texture nobody can see must go; texture meant to be seen must be visible.** → [`docs/09`](docs/09-visibility-and-texture-budget.md)
8. **When a human hand-edits the model, their file wins.** Fix only defects; fix only what was pointed at. → [`docs/11`](docs/11-working-with-a-human-modeller.md)
9. **Look at it.** "The checks pass" is not "it looks right". → [`docs/10`](docs/10-verification-loop.md)

All twenty-eight recorded failures, with the words the art director used: [`docs/14-failure-modes.md`](docs/14-failure-modes.md).

## What is inside

| Path | What |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | the AI entry point: routing table, hard rules, the loop |
| [`skills/`](skills) | twelve short procedures (`SKILL.md`): fundamentals, shape language, z-fighting and seams, UV and texture, vehicles, creatures and props, transforming parts, visibility budget, verification, hand edits, attachables, collision footprint |
| [`docs/`](docs) | nineteen documents with the reasons, the numbers and the case studies |
| [`data/`](data) | the same rules, face mapping, failure modes and review checklist as JSON (generated by `tools/build_data.py`) |
| [`tools/forge/`](tools/forge) | a builder library: tilted links, chains, splays, octagons, wheels, plates; geometry checks in every pose; UV layout; painting by function; liveries; animations; the visibility pass |
| [`tools/preview/render_model.py`](tools/preview/render_model.py) | a software renderer that draws a model **the way the game does**, in any pose, with an optional seated rider |
| [`tools/inspect_model.py`](tools/inspect_model.py) | a linter for any `geo.json`, including a person's Blockbench save: collapsed cubes, z-fighting between rotated cubes, UVs off the atlas, one-sided edits, unequal faces on a two-faced plate |
| [`examples/`](examples) | two complete builders — *Comet* (a kart: rider, wheels, transforming booster, liveries) and *Drake* (a creature: chained spine, jaw, jointed alpha-cut wings, looping Molang) — and their output |
| [`evals/`](evals) | ten tasks and a rubric for comparing agents |

## Model compatibility — please read

**This repository was written with, and tuned for, Claude (Claude Code).** It is plain Markdown, JSON, Python and a little Node, so any agent can read it.

In the one head-to-head we have, **OpenAI Codex — even on its strongest setting (the maintainer used the one called *Astra*) — followed the rules, passed every check, registered everything and painted good textures, and the body still had to be rebuilt**: a fascia showing its own sides, a box floating over the front wheels, stays crossing the transforming panels, wheels visible from the driver's seat. Expect sound engineering and **somewhat less design detail** from Codex, and review its renders harder than its logs. That is one data point from one project in September 2026, not a benchmark. Claude's own failures are recorded just as plainly. → [`docs/17`](docs/17-model-compatibility-notes.md)

Whatever the agent: no AI can see your model *in the game*. Orientation of asymmetric art, particle positions and how a colour reads under the game's lighting need a person's eyes.

## Scope and honesty

- **Bedrock Edition only** (entity geometry `format_version` 1.16.0, per-face UVs). Nothing here is about Java Edition.
- *Field-proven* means shipped and accepted: four karts, a wrist watch, a hand charm. The creature, aircraft and weapon guidance is the same method applied further and checked with these tools and the drake — **not yet battle-tested in a shipped product**. Each document says which is which.
- Numbers such as a seat height or a wheel size belong to one project. Keep the method, change the numbers.
- No assets of the originating game are included. See [`NOTICE.md`](NOTICE.md).

## Contributing

Corrections from the game beat everything written here. If a rule is wrong on your version, or you have a rejection of your own with the words the person used and the fix that was accepted, open an issue or a pull request. Run `python tools/build_data.py` after editing `AGENTS.md`, `docs/14` or `docs/15`.

## Credits

- Art direction, every rejection and the hand-edited examples the rules come from: **iMasterProX**.
- Modelling, tools and text: **Claude** (Anthropic), in Claude Code.
- The idea of a public AI-learning repository for Bedrock: [boredape874/mcbejsonuimasterAI](https://github.com/boredape874/mcbejsonuimasterAI) (JSON UI).

## License

[MIT](LICENSE). Not affiliated with Mojang or Microsoft — see [`NOTICE.md`](NOTICE.md).

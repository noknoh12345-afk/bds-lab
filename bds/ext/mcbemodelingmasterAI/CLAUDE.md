# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first: it is the entry point for every agent, Claude included. This file only adds what is specific to Claude Code.

- The folders under `skills/` are Claude Code skills (`SKILL.md` with `name` / `description` front matter). Inside this repository they are plain documents; to have them load by themselves in another project, copy them to that project's `.claude/skills/`.
- After editing `AGENTS.md` section 3, `docs/14-failure-modes.md` or `docs/15-review-checklist.md`, run `python tools/build_data.py` — CI fails if `data/*.json` is stale.
- After editing `tools/forge/` or an example, run both builders with `--check`, rebuild, run `tools/inspect_model.py` on both outputs, and re-render `docs/images/` if the look changed. Read the renders before you say anything about the look.
- Write builder files with the editor tools, not through shell heredocs: a shell eats one level of backslashes.
- Everything in this repository is in English, except `README.ko.md`.

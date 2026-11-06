# Third-party agent toolkits (vendored, unmodified unless noted)

| folder | source | commit | licence | what it is |
| --- | --- | --- | --- | --- |
| `mcbemodelingmasterAI/` | https://github.com/iMasterProX/mcbemodelingmasterAI | 486c7f8 (2026-09-19) | MIT | Bedrock entity modelling in code: the forge (`tools/forge`), a game-true renderer (`tools/preview/render_model.py`), a linter (`tools/inspect_model.py`), docs and 12 Claude Code skills. `docs/images` and `examples/out` left out. |
| `claude-pxl/` | https://github.com/crsolver/claude-pxl | 21fee41 (2026-10-14) | MIT | Pixel art as code (`.px.js` DSL → PNG, sprite sheets, GIF). Run `node bds/ext/claude-pxl/bin/pxl.js build <file>`; Node >= 22.18 runs `src/*.ts` directly. `docs/`, `test/` and most examples left out. |

The Claude Code copies of their skills live in `.claude/skills/` (`mcbe-model-*`, `pxl-pixel-art`); each starts with a line saying where its paths point.
The forge needs `pip install numpy pillow`.

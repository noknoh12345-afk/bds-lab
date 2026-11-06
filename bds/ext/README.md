# Imported agent skills (required in this lab)

Every skill the TDS model and pixel-art work drew on, kept here with its licence and installed for Claude Code in
`.claude/skills/` (each copy starts with a note saying where its paths point and what in this lab replaces tools it
cannot run). AGENTS.md makes them required: models → `mcbe-model-*` with `bds-models`; pixel art and pixel animation →
`pxl-pixel-art`, `pixel-art-animator` (+ creator / professional / exporter) with `bds-pixel-art`; rigs and clips →
`blockbench-animation`, `mcbe-model-transforming-parts`; GeoUI and render controllers → `mcbe-geo-ui`,
`mcbe-resource-pack-rendering`. Their hard rules were taken into the lab's knowledge with `node lab.mjs skill learn --from`
(candidates; four modelling rules promoted with source evidence into `bds-models`).

| folder | source | commit | licence | what is here |
| --- | --- | --- | --- | --- |
| `mcbemodelingmasterAI/` | https://github.com/iMasterProX/mcbemodelingmasterAI | 486c7f8 (2026-09-19) | MIT | Bedrock entity modelling in code: forge (`tools/forge`), game-true renderer, linter, docs, data, 12 skills `mcbe-model-*`. `docs/images`, `examples/out` left out. |
| `claude-pxl/` | https://github.com/crsolver/claude-pxl | 21fee41 (2026-10-14) | MIT | Pixel art as code (`.px.js` → PNG, strips, sheets, GIF; `anim(...)` frames). `node bds/ext/claude-pxl/bin/pxl.js build <file>`; Node >= 22.18 runs `src/*.ts` directly. Skill `pxl-pixel-art`. |
| `pixel-plugin/` | https://github.com/willibrandon/pixel-plugin | dee3506 (2025-10-18) | MIT | The pixel-art skills, among them the dedicated animation skill `pixel-art-animator` (frames, durations, tags, ping-pong, linked cels). Its Aseprite MCP binaries are not taken. |
| `blockbench-mcp-project/` | https://github.com/jasonjgardner/blockbench-mcp-project | e9c29a9 (2026-09-25) | Apache-2.0 | `blockbench-animation` (rigid bones, joints, poses, loop seams, interpolation) and the two skills it links to; they drive the Blockbench desktop app through its MCP plugin. |
| `mcbejsonuimasterAI/` | https://github.com/boredape874/mcbejsonuimasterAI | 527276c (2026-10-04) | MIT (NOTICE.md) | `mcbe-geo-ui` (geometry UI through `live_player_renderer`) and `mcbe-resource-pack-rendering` (render controllers, materials, `uv_anim` flipbooks with `USE_UV_ANIM`). |

The forge needs `pip install numpy pillow`. Third-party code here is kept as published; the TDS build
(`bds/addons/tds/tools/art`, `tools/models`) is the lab's own code following these skills and does not execute it.

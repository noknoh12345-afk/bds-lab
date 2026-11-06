# Native GeouiStudio project inspection

Use for saved `.geoui.json` files, missing layers after reopening, export name collisions, atlas inconsistencies or RP-only state dependencies. The inspector was independently written against [GeouiStudio index.html at 7fe110f](https://github.com/Au12jp/GeouiStudio/blob/7fe110f22385b1a44ea8ba01c2a6817b888b6893/index.html), Apache-2.0. This is a pinned exporter contract, not a claim about all GeoUI tools or the latest upstream release.

## Run the smallest check

```sh
node tools/geoui-inspect.mjs --input PROJECT.geoui.json --max-chars 6000 --json
node tools/geoui-inspect.mjs --input PROJECT.geoui.json --report NEW_REPORT.json --json
```

- Input: saved project **v6**, JSON, at most 64 MiB. A symbolic link resolves to its explicitly selected target and receives the same size/file checks. No source code, recipes, media URLs, commands or Molang are executed or fetched.
- Output schema: `mcbe-geoui-project-inspection@1`. `ok` means no detected structural errors. `complete` means no errors or explicitly unresolved cases among these supported checks. Neither certifies decoding, export success or Bedrock behavior; `runtimeVerified` is always false.
- stdout defaults to 6000 characters including its newline. `--max-chars` accepts 1000..64000; a budget too small for provenance fails. `omitted` counts retain the fact that detail was trimmed, and summary error counts remain intact.
- Full reports use exclusive creation (`wx`); an existing file, input alias, symbolic link or hardlink is never overwritten. The budget is checked before report creation. Create the intended report directory first.
- Exit 0: no structural errors, but warnings/incomplete work may remain. Exit 1: structural errors. Exit 2: arguments, input, write or budget failure. stderr is bounded to 1000 characters.
- `examples/geoui/original-v6.geoui.json` is an original shape recipe. Its expected result is `ok:true`, `complete:false`: no raster generation was performed.

## Saved data and exporter data are different

The serializer writes v6 and removes in-memory `src`, `audio`, `model` (11228–11239). Full saving embeds `_src.pages` as PNG data URLs plus the atlas plan, frame counts/dimensions, fps and aspect (11240–11244), and `_audio` bytes (11247). Settings-only saving drops imported image/video/audio bytes. Text/shape/score/bar and supported recipes can rebuild in the editor; the inspector reports that work as unresolved. It does not synthesize replacement art or fonts.

Non-generated model `_model.geoRaw`, animations and texture bytes are saved **even without the media option** (11248–11250). Do not tell users that every settings-only model is lost. Missing media without a recipe is an error. Older-than-v6 imports have a conditional coordinate migration by 20.25 (11268–11271); preserve the original and inspect a separately saved v6 copy instead of applying that scale universally.

`buildAddon` produces separate runtime `atlas` and `model` structures (11633–11671). Feeding that intermediate object to a saved-project inspector does not prove round-trip compatibility. Selected `.mcpack`/`.mcworld` export can also override saved `build.rpOnly` (11621–11622,11682); the report's mode is explicitly based on saved settings.

## Checks with practical consequences

| Case | Inspector behavior | Why |
| --- | --- | --- |
| `HUD A` and `hud-a` | Export ID collision error | Both normalize to `hud_a`; geometry/controller/texture map keys collide (1644,1928–1973). |
| Duplicate native IDs | Error | Selection and exported names use the ID. |
| Layer `parent` / `parentId` | Warning | Layer order sets depth; the pinned generator does not export a layer hierarchy. Model bone parents are separate. |
| Missing page, wrong dimensions or inconsistent grid | Error | A frame's page/UV is derived from saved cols/rows/perPage; restore skips failed pages without rebuilding that plan (1844–1849,11292–11300). |
| Score atlas | Require all eleven digit/blank frames on page 0 | The score exporter takes only page 0 and selects blank frame 10 (2032,2047). |
| Model with several geometries or missing bone parent | Error | Export keeps only the first geometry and silently reparents orphan bones (3530–3569). Split/select or repair intentionally. |
| Imported bone uses `geoui_mroot_<normalized ID>` | Error | Export inserts that root; a nonzero `rotX` also inserts its `_r` rotation root. Input names must not collide (3540–3566). |
| Same animation ID with different definitions | Error | Extra model animations use last-writer assignment (11652). |
| RP-only scene/score property | External BP declaration warning, incomplete | Suppressing BP does not remove those property reads (1870,1962,2027,2053). |
| Custom score property | External declaration/producer review | Generated player declarations are the fixed namespace keys `gen`, `seek`, `playing`, `scene`, `aspect`, `scale`, `cx`, `cy`, `ox`, `oy`, `alpha`, `v0..v3` (2412–2424). |
| Several objectives write one property | Error when script is generated | Sync includes image and disabled visual layers with `scoreObjective`; it does not filter by visible score/bar type (2504,3263). |
| Partial layer opacity with cutout | Report effective blend | The exporter switches the layer to blend (1957–1959); actual source-pixel alpha is not scanned. |
| Indexed PNG export | Alpha loss warning | One transparent palette entry cannot preserve arbitrary partial alpha (1144–1179). |
| Disabled audio layer | Warning | Audio collection does not filter `enabled` (11674–11678). |

Numbers are checked without coercion. Unknown versions, types and malformed saved structures fail; unexecuted recipes, expressions and external state remain explicitly incomplete. Limits of 2048 layers, 4096 pages per layer, 10000 keys per channel and 10000 bones per model bound inspection, not Minecraft capabilities. PNG checks cover base64, signature, IHDR and dimensions only; a successful check does not mean CRC, pixels, alpha, sound or model appearance were decoded.

## Continue with the actual exported artifact

After a separate authorized export, run the pack graph inspector and compare the destination HUD/player ownership. GeouiStudio replaces `hud_content` controls and both player definitions; preserve other pack features through a reviewed merge. Official pinned inventory UIs also use `live_player_renderer`, so `q.is_in_ui` alone is not a unique GeoUI screen identifier. Use the state/lifecycle reference only when state, multiplayer or cleanup is in scope.

Evidence to collect in Bedrock: inventory/paper-doll leakage, first/third person, aspect/GUI scale, touch and other actual input owners, close/reopen, natural animation finish, camera restoration, disconnect/reconnect and a fresh Content Log. The original generator's `play()` changes the camera; `stop()` clears it, while `finish()` does not call that cleanup (3174–3218). A static project pass cannot close that lifecycle gap.

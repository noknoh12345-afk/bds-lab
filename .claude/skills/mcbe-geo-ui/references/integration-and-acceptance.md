# Integration and acceptance

## Before changing a pack

Record the target client/API versions, intended render surface, profile/GUI scale, input devices, manifest identities and ordered RP/BP stack. Identify every owner of `entity/player.entity.json`, `entities/player.json`, `ui/hud_screen.json`, material names and client-synchronized property names. Merge against version-matched player files; do not replace them with the generator's embedded snapshot.

Preserve persona/skin, armor, cape, elytra, emotes, vanilla perspective controllers and other attachables. Prefix imported model bones/animations consistently when multiple models share a player animation context. Report collisions instead of relying on render order.

Use a project-owned HUD insertion where possible and preserve existing HUD controls/fallback. `q.is_in_ui` identifies a UI render context; it is not by itself a dedicated Geo UI screen identity. Inspect other paper-doll/player render surfaces for unintended display.

## State and input contract

For each dynamic value, name producer, recipient, property definition/range/client_sync, Molang consumer, refresh event, reset and reconnect behavior. Separate server ticks from visual `q.life_time`. Scene changes, seek/pause and audio require explicit timing expectations under lag.

Record which controls actually receive input: custom command, item use, a separate JSON UI/server form or another supported mechanism. A geometry plane cannot inherit a touch click from its appearance. Preserve the user's chosen transport instead of silently substituting a form.

## Verification

1. Run the static resource graph checker and review external/dynamic edges; `ok:true` can coexist with `complete:false`.
2. Verify manifest links, property definitions and script imports separately; the graph checker does not prove BP behavior.
3. Compare output atlas alpha/dimensions and bounds against authored assets. Distinguish text outlines, model geometry and material effects.
4. Test first/third person, spectator if needed, HUD hidden/visible, inventory/paper doll, pause/reopen and the final RP order.
5. Calibrate on the requested mobile/desktop/controller profiles and GUI scales; do not turn176 units or a center correction into a device-independent constant.
6. Verify display and input independently, with current Content Log and actual screenshots. Keep pack parsing, reference resolution, editor preview and Bedrock evidence separate.

For read-only design work, steps requiring a client remain the acceptance plan. The design can be complete while its runtime verification is pending.

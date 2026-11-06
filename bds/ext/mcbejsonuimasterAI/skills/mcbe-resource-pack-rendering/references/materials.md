# Material decisions

Trace `description.materials` aliases into the render controller's bone material entries. In a `.material` file, `child:parent` denotes inheritance, not a namespaced identifier. Detect duplicate child names and cycles before adding variants.

For a cutout, inspect the alpha-test path; for partial translucency, inspect alpha blending and layer order. Preserve culling and depth behavior deliberately. Texture alpha may carry an effect-specific meaning, so do not assume every material interprets it as opacity.

Prefer a verified existing material when it provides the needed behavior. Custom defines/states and obsolete shader/stencil keys require a version-specific test. Missing parent definitions require actual vanilla/dependency evidence, not a guessed allowlist.

Source: [Microsoft material documentation](https://learn.microsoft.com/en-us/minecraft/creator/documents/material-files?view=minecraft-bedrock-stable), pinned in `config/design-research-lock.json` under `microsoftdocs-minecraft-creator`. The documentation lists deprecated keys; the local audit reports them but cannot establish whether a target renderer ignores them.

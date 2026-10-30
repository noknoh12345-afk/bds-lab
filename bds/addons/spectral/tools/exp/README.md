# tools/exp — experiments through the validated client model

A variant (converter options + how the add-on plays it) → song pack (tools/spectral.py) → the add-on bundle in the mock
(tools/sim/run_song.mjs) → tools/emu render with spec.json → the measured client path (`path24`: the game's 24 kHz mix,
−32.5 dB, 16 bit, ×2 linear) → ViSQOL v3 against the original. This chain predicts the real recordings (measured/
emu-validation-2026-10-31.json: correlation 0.87–0.97 over 13 songs × 4 ways). Numbers from here are **emulated**, not measured.

    node tools/exp/build_exp.mjs src/main.ts corpus/renders/exp/bundles/real.js     # the add-on as it is now
    cd tools/exp && ONLY=rock_big,vocal_stars python3 run_exp.py out.jsonl \
      '{"name":"x","conv":{"residual":"voiced"},"play":{"mode":"quality","voices":24,"bundle":"real","cmds":["spectral:drums off"]},"spec":{"oneshot_latency_ms":-45}}'
    python3 summ.py out.jsonl                         # medians, differences and wins against the first variant, per song

- variant keys: conv (tools/spectral.py convert options), play (mode, voices, bundle name in corpus/renders/exp/bundles,
  cmds: add-on commands before playing), spec (tools/emu spec overrides), rp (another resource pack folder: make_rp_variant.py,
  make_layout.py), aux (third-octave and onset metrics too)
- work dir corpus/renders/exp (SPECTRAL_EXP, gitignored); real recordings for common.aligned() in corpus/renders/rec (SPECTRAL_REC)
- ~25 s per song and variant (ViSQOL ~16 s), 2 in parallel; a song pack ~14 s the first time (cached by the converter's code)
- results/: what the 2026-10-31 session ran (b1 = the add-on's ways, b2 = converter options, val1 = emulator vs real,
  ceiling_* = the client path alone against the real ceilings)
- make_app.py writes an app.txt for a same-run A/B on the real client (arms: prefix, song suffix, converter options, commands)

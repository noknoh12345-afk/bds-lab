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
- make_app.py writes an app.txt for a same-run A/B on the real client (arms: prefix, song suffix, converter options, commands;
  calib: calibration programs first; ceiling: the originals as plain sounds at a volume, last). app5.json / app6.json /
  app7.json: the 2026-10-31 runs 5, 6 and 7
- path keys: gain_db (the client path's level), clip (the mix hard-clipped at that many file units first: the measured clip is
  about 2.0 — run 41147544874's calib loud — and the 16-sine mixer calib fits 1.6-1.8), pre_db (the mix that much louder first:
  the original at setVolume 2 is pre_db 6.02)
- results/next.jsonl: what the 2026-10-31 (second) session ran on the 10 songs it could fetch (cdn.freesound.org is not reachable
  from its workspace: vocal_stars, vocal_name_of_love and choir_how_long are missing): converter and playback variants, noise
  layouts, the 48-voice oracle, the +12 dB level (path gain_db -20.5) and the fitted fades (nzfade, vnfade). results/targets.jsonl:
  the original low-passed / pre-emphasised through the path (targets_run.py)
- oracle_vocoder.py / oracle_vocoder2.py: a 32-band noise vocoder with the original's own band envelopes through the path — at
  50 ms ramps, at 10 ms, and with one fade(d, v) per tick chosen to follow the 5 ms envelope (rock 3.14 / 3.66 / 3.49): the
  control rate and the fades' free length are what limit a dense song, not the number of sounds
- the level over the files (f2_*: the final converter, bundle f2, `spectral:level N` before playing, the clip at 1.7 or 2.0):
  median 2.594 (0 dB) → 2.864 (+4) → 2.940 (+6) → 2.978 (+8) → 3.000 (+10) → 2.996 (+12, clip 1.7); the quiet songs gain most
  (piano_gymnopedie 1.71 → 3.44 at +6, drums_round 1.74 → 1.95 → 2.36 → 2.83 at +6/+8/+10). The clip's distortion (on the
  renders, a hard clip at 2.0): under -44 dB on every song at +6, -29 dB (speech_ja) at +8, -21 dB at +10 — +6 is the default
- a limiter under the level (f3_*: per frame the share of the level that keeps 3.2x the frame's RMS from the song data under
  1.8, rising 1.5 dB and falling 3 dB a tick at most) scored lower than the plain clip: at +10 dB (clip 2.0) median 2.939
  against 3.001, 9 of 10 songs lower (drums 1.95 against 2.86, piano_gymnopedie 3.04 against 3.47). ViSQOL minds the gain riding
  more than a few clipped peaks. Not kept
- a level per song (the most the song's own data allows under the clip) needs its mix's peak from the data: the best estimate
  tried (the frames' RMS, sines and noise, weighted by how many components a frame has) missed the renders' 99.99th
  percentile by -0.2 to +3.6 dB (sd 1.0 dB) — not close enough to beat a fixed +6 dB on every song. Not kept
- the 10-band noise layout lo10f ([60,180,360,720,1440,2880,4000,5600,8000,12000,17000], 22 voices so that 32 sounds stay) at
  +6 dB: median +0.022, mean +0.030, 7 songs up and 2 down against the 8 bands (demo +0.16, speech_en +0.07). It needs a second
  set of noise loops in the RP (songs made with 8 bands must keep playing) and the converter's default edges in py and js: the
  next candidate, not done

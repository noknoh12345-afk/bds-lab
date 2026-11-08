// The match HUD's layout, in GeoUI model units (x right, y up; the screen's middle at (0, 140), 176 high: top 228, bottom 52),
// shared by the art (tools/art/hud_art.mjs: every picture drawn at exactly its plane's size) and the HUD (tools/hud.mjs).
// Laid out like the original's screen: the wave, the base's health and the timer in one strip at the top, the boss bar and the
// skip vote under it, the tower bar at the bottom with the cash above it, the selected tower's panel on the left, the mode and
// the enemies at the top left, the banners in the middle; the lobby's level and EXP at the top left, coins and gems at the top right.
export const D = 6;   // texture pixels per model unit (a 1080-pixel screen shows about 6.1 per unit)

/** the digit glyphs (tools/art/hud_art.mjs digits.png: one column per style, rows 0-9; uv_anim picks the row) */
export const DIGIT = { cellW: 40, cellH: 64, styles: ['w', 'g', 'y', 'b', 'p', 'k'], aspect: 40 / 64, step: 0.82 };   // neighbours overlap a little: tools/hud.mjs puts every other digit a step nearer (no two faces on one plane)

/** every picture: [width, height] in units */
export const SPRITES = {
  // the top strip
  top_panel: [144, 22], word_wave_s: [14, 5], slash_w: [3, 7], slash_k: [2.6, 6], colon_w: [2.2, 7],
  heart: [10, 10], clock: [8, 8], hp_track: [60, 8], hp_fill: [60, 8],
  // boss and skip
  boss_panel: [112, 10], skull: [8, 8], word_boss: [13, 5], boss_track: [80, 6], boss_fill: [80, 6],
  skip_panel: [70, 10], word_skip: [34, 5], check: [6.5, 6.5],
  // top left
  mode_0: [34, 9], mode_1: [34, 9], mode_2: [34, 9], mode_3: [34, 9], mode_4: [34, 9], mode_5: [34, 9], mode_6: [34, 9], mode_7: [34, 9], mode_8: [34, 9],
  enemy_pill: [34, 9],
  // the tower bar and the cash
  slot: [28, 32], slot_sel: [30, 34], slot_empty: [24, 22], key_1: [7, 7], key_2: [7, 7], key_3: [7, 7], key_4: [7, 7], key_5: [7, 7],
  dollar_gs: [3, 5], dollar_g: [4.6, 8], cash_pill: [52, 11],
  // the selected tower's panel
  tower_panel: [72, 80], pip_on: [4, 4], pip_off: [4, 4], word_lv: [7.5, 5.5], btn_up: [64, 12], btn_max: [64, 12], btn_sell: [64, 11],
  dollar_w: [3.6, 6.2],
  tg_0: [64, 10], tg_1: [64, 10], tg_2: [64, 10], tg_3: [64, 10], tg_4: [64, 10], tg_5: [64, 10], tg_6: [64, 10],
  // banners and rewards
  banner: [156, 30], word_wave_b: [36, 14], word_triumph: [104, 17], word_defeat: [84, 17], word_hidden: [116, 17],
  coin: [8, 8], gem: [8, 8], star: [8, 8],
  // the lobby
  lobby_panel: [96, 20], lv_badge: [14, 10], exp_track: [56, 6], exp_fill: [56, 6], coin_pill: [62, 11], gem_pill: [62, 11],
};
export const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore', 'Frost', 'Voidcore', 'Sandbox'];
export const TARGETS = ['FIRST', 'LAST', 'STRONGEST', 'WEAKEST', 'CLOSEST', 'FARTHEST', 'RANDOM'];

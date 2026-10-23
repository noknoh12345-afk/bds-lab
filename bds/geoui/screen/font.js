// GeoUI Screen — a 3 x 5 pixel font (A–Z, 0–9 and a few signs) the lab draws its own labels with: probes and hints need a few
// words on the screen and no font file (pure: a word → its pixels, each glyph 3 wide plus 1 apart).
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  // rows top to bottom, 3 bits each (left = 4)
  const G = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3],
    H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5],
    O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7],
    V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7],
    7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
    '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '.': [0, 0, 0, 0, 2], ':': [0, 2, 0, 2, 0], '/': [1, 1, 2, 4, 4], '%': [5, 1, 2, 4, 5],
    '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4], '^': [2, 5, 0, 0, 0], '=': [0, 7, 0, 7, 0], '?': [6, 1, 2, 0, 2], '!': [2, 2, 2, 0, 2],
    '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '#': [5, 7, 5, 7, 5], ' ': [0, 0, 0, 0, 0],
  };
  /** the width of a word in pixels (3 per glyph, 1 between) */
  const widthOf = (text) => Math.max(0, String(text).length * 4 - 1);
  /** a word → [[x, y], …] of its lit pixels (y down) */
  function pixels(text) {
    const out = [];
    [...String(text).toUpperCase()].forEach((ch, i) => {
      const rows = G[ch] || G['?'];
      rows.forEach((bits, y) => { for (let x = 0; x < 3; x++) if (bits & (4 >> x)) out.push([i * 4 + x, y]); });
    });
    return out;
  }
  S.font = { G, widthOf, pixels, HEIGHT: 5 };
  if (typeof module === 'object' && module && module.exports) module.exports = S.font;
})(typeof globalThis !== 'undefined' ? globalThis : this);

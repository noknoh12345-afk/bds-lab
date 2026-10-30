// GeoUI Screen — the title channel at run time: one player's F1 (the game's whole HUD, arm and held item gone), which of the
// scene's layouts shows, and its URL images (pure: the game comes in through io, so the same code runs in the pack's script and
// in tests).
//
// The server can set one string per player that the HUD's JSON UI reads: the title (#hud_title_text_string). layout.js writes
// the JSON UI side; this writes the title: PREFIX + '1' or '0' (F1) + a layout letter ('a' … 'z'; 'a' when none is chosen) +
// one field of `width` characters per URL slot (the URL, then spaces). The HUD's own title is hidden while it starts with
// PREFIX. The text stays after its title's time and after `title clear` (RULES R10.7: the game keeps the last title's text), so
// nothing on is the empty channel (PREFIX + '0a'), sent once; another pack's title replaces it all the same, so while anything is
// on the text is sent again every refreshTicks (0: never).
// The channel's own title is sent with no time at all (io.title: fade in 0, stay 0, fade out 0): the game's title control for it
// ends at once, so a plain title after it is a new control the game shows (a channel title still on screen, hidden, kept the
// next plain title hidden too: RULES R10.14). The game keeps the last durations for titles that set none (`/title @a title …`),
// so timesTicks (2) ticks later io.times puts the game's own ones back (10, 70, 20 ticks).
//
//   const ch = GeoUIScreen.channel.create({ ns: 'gweb', slots: 2, width: 230 }, io)
//   ch.f1(player, true)              F1 on: the HUD hidden (the HUD elements by the API, the rest by the channel), the arm and the
//                                    held item gone (the pack's <ns>:f1 property: layout/pack.js) — the game mode is not changed.
//                                    ch.f1(player, true, { keep: ['TouchControls'], flag: false }) leaves those HUD elements (a
//                                    phone's pad) and the rest of the HUD (flag: false — the pad is drawn in root_panel: RULES R10.12)
//   ch.layout(player, 'b')           the scene's groups of layout 'b' show (and only those of all the layouts)
//   ch.url(player, 0, 'http://…')    slot 0 shows that image ('' hides it); a new URL is a new image (the game fetches it again)
//   ch.tick(tick)                    every tick (or every few): sends again what is due
//   ch.drop(player)                  a player who left
// io = { title(p, text) (no time: see above), times(p) (the game's own title durations back: `title @s times 10 70 20`; optional),
//        prop(p, name, value), hideHud(p, keep) → what was hidden before, restoreHud(p, before),
//        camera(p, id | null) (optional, with cfg.camera — the pack's '<ns>:eye' preset: F1 sets it, off clears it — ch.f1(p, true,
//        { camera: false }) leaves it out. The first-person held item is not moved by any bone (RULES R10.13): a third-person camera
//        at the eyes draws no first-person hand at all — measured, R10.17) }
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const PREFIX = '~gu~', LAYOUTS = 'abcdefghijklmnopqrstuvwxyz', EMPTY = PREFIX + '0a';

  /** the title text for { f1, layout, urls } on a channel { width, slots } (the same as layout.js channelText) */
  function text(cfg, st) {
    const width = cfg.width || 230, slots = cfg.slots || 0;
    const lay = st && st.layout ? String(st.layout) : 'a';
    if (!(lay.length === 1 && LAYOUTS.includes(lay))) throw new Error(`layout「${lay}」は a〜z の 1 文字`);
    let s = PREFIX + (st && st.f1 ? '1' : '0') + lay;
    const urls = (st && st.urls) || [];
    for (let k = 0; k < slots; k++) {
      const u = String(urls[k] || '');
      if (u.length > width) throw new Error(`URL が枠（${width} 文字）より長い: ${u.length} 文字`);
      if (/[\s"\\]/.test(u)) throw new Error('URL に空白・" ・\\ は入れられません（%20 などに）');
      s += u + ' '.repeat(width - u.length);
    }
    return s;
  }
  /** what JSON UI reads back from a title (the same sums as layout.js slotExpr, for tests): { channel, f1, layout, urls } */
  function read(cfg, title) {
    const width = cfg.width || 230, slots = cfg.slots || 0, t = String(title || '');
    if (t.slice(0, PREFIX.length) !== PREFIX) return { channel: false, f1: false, layout: null, urls: [] };
    const urls = [];
    for (let k = 0; k < slots; k++) {
      const P = PREFIX.length + 2 + k * width, head = t.slice(0, P), rest = t.split(head).join('');
      urls.push(rest.slice(0, width).split(' ').join(''));
    }
    return { channel: true, f1: t.slice(0, PREFIX.length + 1) === PREFIX + '1', layout: t.slice(PREFIX.length + 1, PREFIX.length + 2), urls };
  }

  function create(cfg0, io) {
    const cfg = Object.assign({ slots: 0, width: 230, refreshTicks: 200, timesTicks: 2 }, cfg0 || {});
    const st = new Map();
    let now = 0;
    // (the player object kept: tick() sends to it again; a player who left is invalid and dropped)
    const of = (p) => { let s = st.get(p.id); if (!s) { s = { f1: false, flag: true, layout: '', urls: [], sent: null, at: -1e9, timesAt: null, hudBefore: null, player: p }; st.set(p.id, s); } s.player = p; return s; };
    // (a title sent: the game's own durations back a little later — after the channel's title has ended — for plain titles)
    // (F1's camera: cfg.camera the preset, io.camera what sets and clears it — both optional)
    const cam = (p, on) => { if (cfg.camera && typeof io.camera === 'function') { try { io.camera(p, on ? cfg.camera : null); } catch (e) { /* (a player leaving, a pack without it) */ } } };
    const sentOne = (s) => { if (typeof io.times === 'function') s.timesAt = now + Math.max(1, cfg.timesTicks | 0); };
    // (what the title says: F1's flag only when F1 hides root_panel too)
    const said = (s) => ({ f1: s.f1 && s.flag, layout: s.layout, urls: s.urls });
    const active = (s) => s.f1 || !!s.layout || s.urls.some((u) => u);
    function send(p, s, force) {
      if (!active(s)) {
        // (the empty channel, once: `title clear` would leave the last text — and its pictures, its F1 — in the HUD)
        if (s.sent !== null && s.sent !== EMPTY) { try { io.title(p, EMPTY); s.sent = EMPTY; s.at = now; sentOne(s); } catch (e) { /* (a player leaving) */ } }
        return;
      }
      const t = text(cfg, said(s));
      if (!force && t === s.sent && (!(cfg.refreshTicks > 0) || now - s.at < cfg.refreshTicks)) return;
      try { io.title(p, t); s.sent = t; s.at = now; sentOne(s); } catch (e) { /* (the next tick) */ }
    }
    return {
      cfg,
      state(p) { const s = of(p); return { f1: s.f1, layout: s.layout || 'a', urls: s.urls.slice() }; },
      text(p) { return text(cfg, said(of(p))); },
      /** F1 on or off for one player: the HUD's elements (the API; opts.keep: ones left), the rest of the HUD (the channel), the
       *  arm and the item (prop) */
      f1(p, on, opts) {
        const s = of(p);
        on = !!on;
        if (s.f1 === on) return;
        s.f1 = on;
        s.flag = !(on && opts && opts.flag === false);
        if (on) { try { s.hudBefore = io.hideHud(p, (opts && opts.keep) || []) || []; } catch (e) { s.hudBefore = []; } }
        else { try { io.restoreHud(p, s.hudBefore || []); } catch (e) { /* (gone) */ } s.hudBefore = null; }
        if (cfg.ns) { try { io.prop(p, `${cfg.ns}:f1`, on ? 1 : 0); } catch (e) { /* (a pack without the property) */ } }
        // (opts.camera false: this F1 without the camera — a browser whose pad clicks the camera stops: RULES R10.18)
        if (!on || !(opts && opts.camera === false)) cam(p, on);
        send(p, s, true);
      },
      /** which layout's groups show ('' or null: none — the letter 'a') */
      layout(p, L) {
        const s = of(p), v = L ? String(L) : '';
        if (v && !(v.length === 1 && LAYOUTS.includes(v))) throw new Error(`layout「${v}」は a〜z の 1 文字`);
        if (s.layout === v) return;
        s.layout = v;
        send(p, s, true);
      },
      /** slot k's image ('' or null: none) */
      url(p, k, u) {
        if (!(k >= 0 && k < cfg.slots)) throw new Error(`URL の枠 ${k} はありません（0〜${cfg.slots - 1}）`);
        const s = of(p), v = u ? String(u) : '';
        text(cfg, { f1: s.f1, layout: s.layout, urls: Object.assign([], s.urls, { [k]: v }) });   // (throws on a URL it cannot carry, before anything changes)
        if ((s.urls[k] || '') === v) return;
        s.urls[k] = v;
        send(p, s, true);
      },
      /** several slots at once (one title for all: a page and its toolbar change together) */
      urls(p, list) {
        const s = of(p), next = s.urls.slice();
        for (const [k, u] of Object.entries(list || {})) { if (!(+k >= 0 && +k < cfg.slots)) throw new Error(`URL の枠 ${k} はありません（0〜${cfg.slots - 1}）`); next[+k] = u ? String(u) : ''; }
        text(cfg, { f1: s.f1, layout: s.layout, urls: next });
        if (next.length === s.urls.length && next.every((u, k) => (u || '') === (s.urls[k] || ''))) return;
        s.urls = next;
        send(p, s, true);
      },
      /** everything off at once (F1 off, no layout, no URL): the title cleared */
      reset(p) {
        const s = of(p);
        if (s.f1) { try { io.restoreHud(p, s.hudBefore || []); } catch (e) { /* (gone) */ } s.hudBefore = null; if (cfg.ns) { try { io.prop(p, `${cfg.ns}:f1`, 0); } catch (e) { /* (none) */ } } cam(p, false); }
        s.f1 = false; s.flag = true; s.layout = ''; s.urls = [];
        send(p, s, true);
      },
      /** every tick (or less often): what is due is sent again */
      tick(t) {
        now = typeof t === 'number' ? t : now + 1;
        for (const [id, s] of st) {
          if (s.player && s.player.isValid === false) { st.delete(id); continue; }
          if (!s.player) continue;
          send(s.player, s, false);
          if (s.timesAt !== null && now >= s.timesAt) { s.timesAt = null; try { io.times(s.player); } catch (e) { /* (a player leaving) */ } }
        }
      },
      drop(p) { st.delete(p.id); },
    };
  }

  S.channel = { PREFIX, LAYOUTS, EMPTY, text, read, create };
  if (typeof module === 'object' && module && module.exports) module.exports = S.channel;
})(typeof globalThis !== 'undefined' ? globalThis : this);

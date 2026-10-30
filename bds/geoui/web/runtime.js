// GeoUI Web — the behaviour pack's side of the in-game web: each player's browser (a session of the service, bds/geoui/web/
// server.mjs), shown full-screen in F1 (the HUD, the arm and the held item gone, the game mode unchanged) through the title channel
// (screen/channel.js: the page and the toolbar as URL images), worked with no form: the head's turns a mouse pointer, a swing (left
// click, a tap) a click, jump the mouse button held (drag), sneak back (held 1.5 s: close), W / S (a stick, the touch pad) the
// wheel, the hotbar's slot the wheel too, /web:t <words> typing. The engine below is one self-contained function (its source goes
// into the pack's script as it is, and the tests run the same code with a fake world and a fake service); GS is GeoUIScreen
// ({ nav, input, channel }: screen/*.js, carried by the pack beside it).
//
// CFG (make.mjs): { ns, layouts: { <letter>: { aspect, Bw, Bh } } (each layout a GeoUI group: a box Bw x Bh units), barFrac,
//   slots: { page, bar, pageUnder, barUnder }, buffer (the last picture kept under the next one while it loads), bufferTicks,
//   frameTicks (a picture stays on top at least so long), sens, wheelPx, scrollPx, scrollEvery, holdClose, moveEvery, res (the
//   frame's height in px), maxRes, service, public }
(function (root) {
  'use strict';
  const W = root.GeoUIWeb = root.GeoUIWeb || {};

  /** the frame for a layout and a height: { w, h, barH } (w even, the layout's aspect — or, for the exact layout, the screen's: asp) */
  function frameOf(CFG, lay, res, asp) {
    const L = CFG.layouts[lay], h = Math.max(360, Math.min(CFG.maxRes || 1440, Math.round(Number(res) || CFG.res || 720)));
    const a = L.fill ? (Number(asp) > 0 ? Number(asp) : 16 / 9) : L.aspect;
    const w = Math.min(3840, Math.round(h * a / 2) * 2);
    return { w, h, barH: Math.round(h * CFG.barFrac) };
  }
  /** a shape as a number: a screen's width / height, or 'W:H' / 'WxH' text (null when it is none) */
  function aspectOf(a) {
    let r = Number(a);
    const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(String(a || '').trim());
    if (m) r = Number(m[1]) / Number(m[2]);
    return r > 0 && r < 100 ? r : null;
  }
  /** the screen's shape from the aspect probe's fetches (CFG.aspects: the k-th probe is inside a screen at least aspects[k] wide):
   *  fetched — the k's of one set the game fetched. The shape lies between the widest fetched and the next; null unless the
   *  fetches are just the ones from 0 up to some k (the game fetched only what it drew) and that k is not the last */
  function aspectFromProbes(aspects, fetched, commons) {
    const ks = [...new Set((fetched || []).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < aspects.length))].sort((a, b) => a - b);
    if (!ks.length) return null;
    const top = ks[ks.length - 1];
    if (top >= aspects.length - 1 || ks.length !== top + 1) return null;
    // (a common shape inside that step — 16:9, 20:9, 4:3, 3440x1440 … — is the screen's, exactly; else the step's middle: ±0.62 %)
    const lo = aspects[top], hi = aspects[top + 1], c = (commons || []).filter((a) => a >= lo - 1e-9 && a < hi);
    return c.length === 1 ? c[0] : Math.sqrt(lo * hi);
  }
  /** the layout whose aspect is nearest (a screen's width / height, or 'W:H' / 'WxH' text) */
  function layoutFor(CFG, a) {
    let r = Number(a);
    const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(String(a || '').trim());
    if (m) r = Number(m[1]) / Number(m[2]);
    if (!(r > 0)) return null;
    let best = null, bd = Infinity;
    for (const [k, L] of Object.entries(CFG.layouts)) { if (L.fill) continue; const d = Math.abs(Math.log(L.aspect / r)); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  /** the engine. io: { players(), sample(p) → { rot, move, jump, sneak, slot, mode, swings, uses } | null, setProp(p, name, v),
   *  freeze(p, on), setRotation(p, rot), say(p, text), log(line), http(method, path, body, p) → Promise<{ status, json }> (p: the
   *  player it is for — the WebSocket build sends it through that player's link),
   *  touch(p) → true for a player on a touch screen, platform(p), load(p, key), save(p, key, v), wait(ticks) → Promise } and ch:
   *  the title channel (GS.channel.create) */
  function createBrowsers(CFG, io, GS, ch) {
    const ns = CFG.ns, cmd = CFG.cmd || CFG.ns, players = new Map(), clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const PX = 4095;
    function st(p) {
      let s = players.get(p.id);
      if (!s) {
        s = { open: false, gen: 0, sid: null, frame: 0, bar: 0, urls: { page: '', bar: '' }, under: { page: '', bar: '' }, pend: { page: null, bar: null }, latest: { page: null, bar: null }, topAt: { page: -1e9, bar: -1e9 }, layout: null, res: null, w: 0, h: 0, barH: 0, url: '', title: '', focus: 'page',
          tabs: 0, tab: 0, ctl: null, q: [], busy: false, errors: 0, tick: 0, moveT: -99, moveDue: false, scrollT: 0, sneakT: -1, flash: 0, last: {}, starting: false,
          asp: null, fitting: false, detect: null, base: '' };
        players.set(p.id, s);
      }
      return s;
    }
    const set = (p, s, name, v) => { if (s.last[name] === v) return; s.last[name] = v; io.setProp(p, `${ns}:${name}`, v); };
    const isFill = (s) => !!(CFG.layouts[s.layout] && CFG.layouts[s.layout].fill);
    /** the pointer's box in its group's units: a fixed box, or (exact) the screen — its height Bh, its width the shape's; while the
     *  edges are being marked, as wide as the widest shape (fitW) so the pointer can reach any screen's edge */
    const widthOf = (s) => (s.fitting ? CFG.fitW || 4.5 : s.asp || 16 / 9);
    const box = (s) => { const L = CFG.layouts[s.layout]; const bw = L.fill ? L.Bh * widthOf(s) : L.Bw; return { x0: -bw / 2, y0: -L.Bh / 2, x1: bw / 2, y1: L.Bh / 2 }; };
    /** the pointer as a share of the frame (0…1 each way) */
    function share(s) { const b = box(s), [x, y] = s.ctl.state.pointer; return [clamp((x - b.x0) / (b.x1 - b.x0), 0, 1), clamp((y - b.y0) / (b.y1 - b.y0), 0, 1)]; }
    const at = (s) => { const [nx, ny] = share(s); return { x: Math.round(nx * (s.w - 1)), y: Math.round(ny * (s.h - 1)) }; };
    function syncPointer(p, s) {
      const [nx, ny] = share(s);
      set(p, s, 'ptr', Math.round(nx * PX) + Math.round(ny * PX) * 4096);
      set(p, s, 'flg', s.open ? 1 | (s.flash > 0 ? 2 : 0) | (s.ctl.state.held.jump ? 4 : 0) | (s.debug ? 8 : 0) : 0);
      if (isFill(s)) set(p, s, 'asp', Math.round(widthOf(s) * 1000));
    }
    /** the layout a player's browser opens in: what they chose, else by their device (a phone: 20:9, else 16:9) */
    function aspOf(p, s) {
      if (s.asp) return s.asp;
      let kept = null;
      try { kept = Number(io.load(p, `${ns}:asp`)); } catch (e) { /* (none) */ }
      return kept > 0.2 && kept < 10 ? kept : null;
    }
    function layoutOf(p, s) {
      // (the screen's shape known: exact; else what they chose, else by their device)
      if (CFG.fill && aspOf(p, s) && !s.boxed) return CFG.fill;
      if (s.layout && CFG.layouts[s.layout] && !CFG.layouts[s.layout].fill) return s.layout;
      let kept = null;
      try { kept = io.load(p, `${ns}:layout`); } catch (e) { /* (none) */ }
      if (kept && CFG.layouts[kept] && !CFG.layouts[kept].fill) return kept;
      return io.platform(p) === 'Mobile' ? (CFG.mobileLayout || 'g') : (CFG.defaultLayout || 'b');
    }
    /** the screen's shape is now asp (measured, typed, or marked): kept, and the browser exact at once if it is open */
    function setAspect(p, s, asp, why) {
      s.asp = asp; s.boxed = false;
      try { io.save(p, `${ns}:asp`, asp); } catch (e) { /* (this time only) */ }
      io.log(`aspect ${JSON.stringify({ player: p.name, asp: Math.round(asp * 10000) / 10000, why })}`);
      if (s.open && CFG.fill) relayout(p, s, CFG.fill);
    }
    /** the browser in another layout (or the same with a new shape): the frame resized, the pointer kept where it was on the page */
    function relayout(p, s, lay) {
      const old = s.ctl ? share(s) : [0.5, 0.5];
      s.layout = lay;
      const f = frameOf(CFG, s.layout, s.res, s.asp);
      s.w = f.w; s.h = f.h; s.barH = f.barH;
      if (s.ctl) { s.ctl.cfg.bounds = box(s); const b = box(s); s.ctl.pointerTo(b.x0 + old[0] * (b.x1 - b.x0), b.y0 + old[1] * (b.y1 - b.y0)); }
      ch.layout(p, s.layout);
      if (s.sid) queue(p, s, { op: 'resize', w: f.w, h: f.h });
      syncPointer(p, s);
    }
    /** the edges marked: the pointer's tip is on one — the shape is twice its distance from the middle over the height */
    function finishFit(p, s) {
      const L = CFG.layouts[s.layout], x = Math.abs(s.ctl.state.pointer[0]), asp = (2 * x) / L.Bh;
      s.fitting = false;
      try { ch.urls(p, { [CFG.slots.asp]: '' }); } catch (e) { /* (closed) */ }
      if (asp > 0.3 && asp < (CFG.fitW || 4.5)) setAspect(p, s, Math.round(asp * 10000) / 10000, 'fit'); else { io.say(p, '§7端に合わせられませんでした'); relayout(p, s, s.layout); }
    }
    /** the aspect probe: the tiny URL images shown (their base in the shape's slot), detectTicks later the service asked which the
     *  game fetched → the shape (aspectFromProbes), or none (the game fetched them all, or none: the boxes stay) */
    function startDetect(p, s) {
      if (!CFG.slots || CFG.slots.asp === undefined || !s.base || s.detect || s.fitting) return;
      const nonce = Math.floor(Math.random() * 0x7fffffff).toString(36) + (s.tick % 1000).toString(36);
      s.detect = { nonce, at: s.tick + (CFG.detectTicks || 50), asked: false };
      try { ch.urls(p, { [CFG.slots.asp]: `${s.base}/asp/${nonce}` }); } catch (e) { io.log(`asp ${e}`); s.detect = null; }
    }
    async function finishDetect(p, s) {
      const d = s.detect, gen = s.gen;
      d.asked = true;
      try {
        const r = await io.http('GET', `/asp/${d.nonce}`, undefined, p);
        if (s.gen !== gen || s.detect !== d) return;
        const j = r.json || {}, a = aspectFromProbes(CFG.aspects, j.c, CFG.commonAspects), b = aspectFromProbes(CFG.aspects, j.u, CFG.commonAspects);
        const mx = (l) => (l && l.length ? Math.max(...l) : -1);
        io.log(`probe ${JSON.stringify({ player: p.name, c: (j.c || []).length, u: (j.u || []).length, cMax: mx(j.c), uMax: mx(j.u), cTop: a, uTop: b })}`);
        const asp = a || b;
        if (asp) setAspect(p, s, asp, a ? 'probe-clip' : 'probe-screen');
        else io.say(p, `§7画面の形を測れませんでした（/${cmd}:fit で端に合わせるか /${cmd}:size <幅>x<高さ>）`);
      } catch (e) { io.log(`probe ${e}`); }
      if (s.detect === d) { s.detect = null; try { ch.urls(p, { [CFG.slots.asp]: '' }); } catch (e) { /* (closed) */ } }
    }
    function resOf(p, s) {
      if (s.res) return s.res;
      let kept = null;
      try { kept = Number(io.load(p, `${ns}:res`)); } catch (e) { /* (none) */ }
      return kept > 0 ? kept : CFG.res;
    }
    // ---- the service: one request at a time a player (the long poll aside); moves keep only the newest, wheels add up
    function queue(p, s, a) {
      if (!s.open) return;
      if (a.op === 'move') s.q = s.q.filter((x) => x.op !== 'move');
      if (a.op === 'wheel') { const w = s.q.find((x) => x.op === 'wheel'); if (w) { w.dx += a.dx || 0; w.dy += a.dy || 0; w.x = a.x; w.y = a.y; return; } }
      s.q.push(Object.assign({ dx: 0, dy: 0 }, a));
      pump(p, s);
    }
    async function pump(p, s) {
      if (s.busy || !s.open || !s.sid || !s.q.length) return;
      const a = s.q.shift(), gen = s.gen;
      s.busy = true;
      try {
        const r = await io.http('POST', `/s/${s.sid}`, a, p);
        if (s.gen !== gen) return;
        if (r.status === 404) { await reconnect(p, s, gen); return; }
        if (r.status === 200) { apply(p, s, r.json); s.errors = 0; } else io.log(`act ${a.op} ${r.status}`);
      } catch (e) { io.log(`act ${a.op} ${e}`); } finally { s.busy = false; if (s.gen === gen && s.q.length) pump(p, s); }
    }
    /** a state from the service: the pictures (a newer frame or toolbar: one title for both), what is shown, a dialog, quit */
    function apply(p, s, j) {
      if (!j || !j.sid || j.sid !== s.sid) return;
      // (the newest picture of each kind is kept; tick() puts it on — two layers, paced: see show())
      for (const kind of ['page', 'bar']) {
        const n = kind === 'page' ? j.frame : j.bar, url = kind === 'page' ? j.frameUrl : j.barUrl;
        if (!(n > (kind === 'page' ? s.frame : s.bar)) || !url) continue;
        if (kind === 'page') s.frame = n; else s.bar = n;
        s.latest[kind] = url;
      }
      if (j.frameUrl && !s.base) { const m = /^(https?:\/\/[^/]+)\//.exec(j.frameUrl); if (m) s.base = m[1]; }
      if (j.url !== s.url || j.title !== s.title) io.log(`page ${JSON.stringify({ player: p.name, url: j.url, title: j.title, tabs: j.tabs, frame: j.frame })}`);
      s.url = j.url; s.title = j.title || ''; s.focus = j.focus; s.tabs = j.tabs; s.tab = j.tab; s.w = j.w || s.w; s.h = j.h || s.h; s.barH = j.barH || s.barH;
      if (j.dialog) io.say(p, `§e${j.dialog.type === 'blocked' ? '⛔' : j.dialog.type === 'error' ? '⚠' : '💬'} ${String(j.dialog.message).slice(0, 120)}`);
      if (j.quit) close(p);
    }
    /** the newest pictures onto the screen. A new URL's picture is clear until it arrives (RULES R10.4), so each is two layers: the
     *  picture on top is copied under (it has arrived: it shows at once), bufferTicks later the new one goes on top, the old one
     *  showing through while it loads (R10.5). And paced: a picture stays on top frameTicks before the next replaces it — the game
     *  starts a fetch about 0.4 s after the title changes, so pictures replaced faster than that would never arrive (a page that
     *  changes by itself, run 41001422618) */
    function show(p, s) {
      const out = {};
      for (const kind of ['page', 'bar']) {
        const top = CFG.slots[kind], under = CFG.slots[`${kind}Under`], q = s.pend[kind];
        if (q && s.tick >= q.at) { out[top] = q.url; s.urls[kind] = q.url; s.pend[kind] = null; s.topAt[kind] = s.tick; }
        const next = s.latest[kind];
        if (!next || s.pend[kind] || next === s.urls[kind]) { if (next === s.urls[kind]) s.latest[kind] = null; continue; }
        if (!CFG.buffer || !s.urls[kind]) { out[top] = next; s.urls[kind] = next; s.topAt[kind] = s.tick; s.latest[kind] = null; continue; }
        if (s.tick - s.topAt[kind] < CFG.frameTicks) continue;
        if (s.under[kind] !== s.urls[kind]) { out[under] = s.urls[kind]; s.under[kind] = s.urls[kind]; }
        s.pend[kind] = { url: next, at: s.tick + CFG.bufferTicks };
        s.latest[kind] = null;
      }
      if (Object.keys(out).length) { try { ch.urls(p, out); } catch (e) { io.log(`url ${e}`); } }
    }
    /** the session again (the service started again, or closed it as idle): the same page */
    async function reconnect(p, s, gen) {
      const r = await io.http('POST', '/s', { owner: p.id, url: s.url || undefined, w: s.w, h: s.h }, p);
      if (s.gen !== gen) return;
      if (r.status !== 200 || !r.json.sid) throw new Error(`service ${r.status}`);
      s.sid = r.json.sid; s.frame = 0; s.bar = 0;
      apply(p, s, r.json);
    }
    /** the long poll: the next frame or toolbar as soon as the service has it (a page that changes by itself too) */
    async function poll(p, s, gen) {
      while (s.open && s.gen === gen) {
        try {
          const r = await io.http('GET', `/s/${s.sid}/next?f=${s.frame}&b=${s.bar}&t=8000`, undefined, p);
          if (s.gen !== gen) return;
          if (r.status === 404) { await reconnect(p, s, gen); continue; }
          if (r.status !== 200) throw new Error(`service ${r.status}`);
          apply(p, s, r.json);
          s.errors = 0;
        } catch (e) {
          if (s.gen !== gen) return;
          if (++s.errors === 3) io.say(p, `§cGeoUI Web のサービスに届きません（${String(e).slice(0, 80)}）`);
          io.log(`poll ${e}`);
          await io.wait(Math.min(200, 10 * s.errors));
        }
      }
    }
    // ---- open and close
    async function open(p, url) {
      const s = st(p);
      if (s.open) { if (url) queue(p, s, { op: 'go', url }); return ''; }
      s.open = true; s.starting = true; const gen = ++s.gen;
      s.asp = aspOf(p, s); s.layout = layoutOf(p, s); s.res = resOf(p, s); s.fitting = false; s.detect = null; s.base = '';
      const f = frameOf(CFG, s.layout, s.res, s.asp);
      s.w = f.w; s.h = f.h; s.barH = f.barH; s.sid = null; s.frame = 0; s.bar = 0; s.urls = { page: '', bar: '' }; s.under = { page: '', bar: '' }; s.pend = { page: null, bar: null }; s.latest = { page: null, bar: null }; s.topAt = { page: -1e9, bar: -1e9 }; s.q = []; s.errors = 0;
      let sens = CFG.sens;
      try { const k = Number(io.load(p, `${ns}:sens`)); if (k > 0) sens = k; } catch (e) { /* (default) */ }
      s.ctl = GS.input.createController({ bounds: box(s), sens, targets: [], recentre: true });
      const smp = io.sample(p) || {};
      s.ctl.reset(smp.rot, smp.slot); s.ctl.pointerTo(0, 0);
      io.freeze(p, true);
      // (a touch screen keeps its pad — drawn in root_panel: the channel's F1 flag stays off for it, the API hides the rest)
      // (the browser's F1 without the camera by default (CFG.f1Camera): with it the pad's RT click did not reach the page — R10.18)
      ch.f1(p, true, Object.assign({ camera: CFG.f1Camera !== false }, io.touch(p) ? { keep: ['TouchControls'], flag: false } : {}));
      ch.layout(p, s.layout);
      syncPointer(p, s);
      io.log(`open ${JSON.stringify({ player: p.name, layout: s.layout, w: s.w, h: s.h })}`);
      try {
        const r = await io.http('POST', '/s', { owner: p.id, url: url || undefined, w: s.w, h: s.h }, p);
        if (s.gen !== gen) return '';
        if (r.status !== 200 || !r.json || !r.json.sid) throw new Error(r.json && r.json.error ? r.json.error : `HTTP ${r.status}`);
        s.sid = r.json.sid;
        apply(p, s, r.json);
        s.starting = false;
        poll(p, s, gen);
        pump(p, s);
        // (no shape known yet: the game measures it now — the browser exact a moment later, else the box stays)
        if (CFG.autoAspect && CFG.fill && !s.asp) startDetect(p, s);
        return '';
      } catch (e) {
        if (s.gen !== gen) return '';
        io.say(p, `§cGeoUI Web のサービスに届きません: ${String(e.message || e).slice(0, 100)}`);
        io.log(`open failed ${e}`);
        close(p);
        return String(e.message || e);
      }
    }
    function close(p) {
      const s = st(p);
      if (!s.open) return;
      s.open = false; s.starting = false; s.gen++; s.q = []; s.fitting = false; s.detect = null;
      try { ch.reset(p); } catch (e) { /* (gone) */ }
      io.freeze(p, false);
      s.flash = 0; set(p, s, 'flg', 0);
      io.log(`close ${JSON.stringify({ player: p.name })}`);
    }
    // ---- each tick: the inputs → the browser's
    function tick() {
      for (const p of io.players()) {
        const s = st(p);
        s.tick++;
        if (!s.open || !s.ctl) continue;
        const smp = io.sample(p);
        if (!smp) continue;
        const out = s.ctl.step({ tick: s.tick, rot: smp.rot, move: null, jump: smp.jump, sneak: smp.sneak, slot: smp.slot, swings: smp.swings || 0, uses: smp.uses || 0, mode: smp.mode });
        for (const a of out.actions) if (a.type === 'setRotation') io.setRotation(p, a.rotation);
        if (s.detect && !s.detect.asked && s.tick >= s.detect.at) finishDetect(p, s);
        // (marking the edges: a click puts the screen's edge where the pointer's tip is — the shape is twice its distance from the
        //  middle over the height; a sneak gives up)
        if (s.fitting) {
          for (const e of out.events) {
            if ((e.type === 'click' && e.source === 'swing') || (e.type === 'down' && e.button === 'primary')) { finishFit(p, s); break; }
            if (e.type === 'down' && e.button === 'secondary') { s.fitting = false; try { ch.urls(p, { [CFG.slots.asp]: '' }); } catch (x2) { /* (closed) */ } relayout(p, s, s.layout); break; }
          }
          s.sneakT = -1;
          show(p, s); syncPointer(p, s);
          continue;
        }
        let moved = false;
        for (const e of out.events) {
          if (e.type === 'pointer') moved = true;
          else if (e.type === 'down' && e.button === 'primary') { queue(p, s, Object.assign({ op: 'down' }, at(s))); s.flash = 6; }
          else if (e.type === 'up' && e.button === 'primary') queue(p, s, Object.assign({ op: 'up' }, at(s)));
          else if (e.type === 'click' && e.source === 'swing') { queue(p, s, Object.assign({ op: 'click' }, at(s))); s.flash = 6; }
          else if (e.type === 'click' && e.source === 'use') queue(p, s, Object.assign({ op: 'click', button: 'right' }, at(s)));
          else if (e.type === 'down' && e.button === 'secondary') s.sneakT = s.tick;
          else if (e.type === 'up' && e.button === 'secondary') { if (s.sneakT >= 0 && s.tick - s.sneakT < CFG.holdClose) queue(p, s, { op: 'back' }); s.sneakT = -1; }
          else if (e.type === 'wheel') queue(p, s, Object.assign({ op: 'wheel', dx: 0, dy: e.delta * CFG.wheelPx }, at(s)));
        }
        if (!s.open) continue;
        // (sneak held: the browser closes — the game is back)
        if (s.sneakT >= 0 && s.ctl.state.held.sneak && s.tick - s.sneakT >= CFG.holdClose) { s.sneakT = -1; close(p); continue; }
        // (W / S, A / D held: the page scrolls, a step every scrollEvery ticks — the move input's x is +1 to the left)
        const mv = smp.move;
        if (mv && (Math.abs(mv.x) > 0.35 || Math.abs(mv.y) > 0.35) && s.tick >= s.scrollT) {
          queue(p, s, Object.assign({ op: 'wheel', dx: Math.round(-mv.x * CFG.scrollPx), dy: Math.round(-mv.y * CFG.scrollPx) }, at(s)));
          s.scrollT = s.tick + CFG.scrollEvery;
        }
        if (moved) s.moveDue = true;
        // (the pointer to the page — its hover — at most every moveEvery ticks)
        if (s.moveDue && s.tick - s.moveT >= CFG.moveEvery) { queue(p, s, Object.assign({ op: 'move' }, at(s))); s.moveT = s.tick; s.moveDue = false; }
        if (s.flash > 0) s.flash--;
        show(p, s);
        syncPointer(p, s);
      }
    }
    // ---- what a player asks (commands): '' or why not
    function command(p, verb, args) {
      const s = st(p), text = args.join(' ').trim();
      const need = () => (s.open ? '' : `ブラウザが開いていません（/${cmd}:open）`);
      switch (verb) {
        case 'open': open(p, text || undefined); return '';
        case 'close': close(p); return '';
        case 'go': if (!text) return `/${cmd}:go <URL か検索する言葉>`; if (!s.open) { open(p, text); return ''; } queue(p, s, { op: 'go', url: text }); return '';
        case 't': case 'type': { const n = need(); if (n) return n; if (!text) return `/${cmd}:t <文字>`; queue(p, s, { op: 'type', text, enter: 'auto' }); return ''; }
        case 'enter': { const n = need(); if (n) return n; queue(p, s, { op: 'key', key: 'Enter' }); return ''; }
        case 'key': { const n = need(); if (n) return n; if (!/^[\w+\-=[\]\\;',./`]{1,40}$/.test(text)) return `/${cmd}:key <Enter|Tab|Backspace|Escape|ArrowDown|Control+A …>`; queue(p, s, { op: 'key', key: text }); return ''; }
        case 'back': case 'forward': case 'reload': case 'home': case 'stop': { const n = need(); if (n) return n; queue(p, s, { op: verb }); return ''; }
        case 'click': { const n = need(); if (n) return n; if (s.fitting) { finishFit(p, s); return ''; } queue(p, s, Object.assign({ op: 'click', button: args[0] === 'right' ? 'right' : 'left' }, at(s))); s.flash = 6; return ''; }
        case 'tab': { const n = need(); if (n) return n; const k = Number(args[0]); if (!(k >= 1)) return `/${cmd}:tab <番号（1〜）>`; queue(p, s, { op: 'tab', n: k - 1 }); return ''; }
        case 'newtab': { const n = need(); if (n) return n; queue(p, s, { op: 'newtab', url: text || undefined }); return ''; }
        case 'closetab': { const n = need(); if (n) return n; queue(p, s, Object.assign({ op: 'closetab' }, args[0] ? { n: Number(args[0]) - 1 } : {})); return ''; }
        case 'zoom': { const n = need(); if (n) return n; const z = Number(args[0]); if (!(z >= 25 && z <= 500)) return `/${cmd}:zoom <25〜500（%）>`; queue(p, s, { op: 'zoom', pct: z }); return ''; }
        case 'address': { const n = need(); if (n) return n; queue(p, s, { op: 'address', text }); return ''; }
        case 'size': case 'res': {
          // /size <W>x<H> | <W>:<H> | 16:9 …: the screen's own shape — the browser exact (fills it); /size auto: measured again;
          // /size fit: the edges marked by hand; /size box <shape>: a box of that shape in the middle (the rest black). And the
          // picture's height: the screen's own px for a sharp page (/res <px>)
          let res = s.res;
          if (verb === 'size') {
            const a0 = String(args[0] || '').toLowerCase();
            if (a0 === 'auto') { s.asp = null; try { io.save(p, `${ns}:asp`, undefined); } catch (e) { /* (none) */ } s.boxed = false; if (s.open) { s.detect = null; startDetect(p, s); } return ''; }
            if (a0 === 'fit') return command(p, 'fit', []);
            if (a0 === 'box') {
              const lay = layoutFor(CFG, args[1]);
              if (!lay) return `/${cmd}:size box <16:9|4:3|…|幅x高さ>`;
              s.boxed = true;
              try { io.save(p, `${ns}:layout`, lay); } catch (e) { /* (this time only) */ }
              if (s.open) relayout(p, s, lay); else s.layout = lay;
              io.say(p, `§7画面 ${CFG.layouts[lay].name}（箱）`);
              return '';
            }
            const asp = aspectOf(args[0]);
            if (!asp) return `/${cmd}:size <幅>x<高さ>|<幅>:<高さ>|auto|fit|box <形> [絵の高さ px]`;
            const m = /^(\d{3,4})\s*[x×]\s*(\d{3,4})$/i.exec(args[0] || '');
            if (m) res = Math.min(CFG.maxRes, Number(m[2]));
            if (args[1]) res = Number(args[1]);
            s.res = Math.max(360, Math.min(CFG.maxRes, Number(res) || CFG.res));
            try { io.save(p, `${ns}:res`, s.res); } catch (e) { /* (this time only) */ }
            if (CFG.fill) setAspect(p, s, asp, 'size');
            else { const lay = layoutFor(CFG, args[0]); if (s.open) relayout(p, s, lay); else s.layout = lay; }
          } else {
            res = Number(args[0]); if (!(res >= 360 && res <= CFG.maxRes)) return `/${cmd}:res <360〜${CFG.maxRes}（絵の高さ px）>`;
            s.res = res;
            try { io.save(p, `${ns}:res`, s.res); } catch (e) { /* (this time only) */ }
            if (s.open) relayout(p, s, s.layout);
          }
          const f = frameOf(CFG, s.layout || CFG.defaultLayout || 'b', s.res, s.asp);
          io.say(p, `§7画面 ${s.layout && CFG.layouts[s.layout] && CFG.layouts[s.layout].fill ? `ぴったり ${Math.round((s.asp || 0) * 1000) / 1000}` : CFG.layouts[s.layout || CFG.defaultLayout || 'b'].name}・絵 ${f.w}x${f.h}`);
          return '';
        }
        case 'fit': {
          // (the screen's edges marked: the pointer's tip on the left or right mark, a click — the shape from where it is)
          const n = need(); if (n) return n;
          if (!CFG.fill) return `${ns}: この版は端に合わせられません`;
          s.detect = null; s.fitting = true;
          if (!isFill(s)) { s.layout = CFG.fill; ch.layout(p, s.layout); }
          s.ctl.cfg.bounds = box(s); s.ctl.pointerTo(0, 0);
          try { ch.urls(p, { [CFG.slots.asp]: 'fit' }); } catch (e) { io.log(`fit ${e}`); }
          syncPointer(p, s);
          return '';
        }
        case 'debug': { s.debug = args[0] !== '0'; if (s.open) syncPointer(p, s); return ''; }
        case 'sens': { const v = Number(args[0]); if (!(v > 0 && v <= 50)) return `/${cmd}:sens <0.1〜50（1 度で動く単位）>`; if (s.ctl) s.ctl.cfg.sens = v; try { io.save(p, `${ns}:sens`, v); } catch (e) { /* (now only) */ } return ''; }
        case 'pointer': { const n = need(); if (n) return n; const nx = Number(args[0]), ny = Number(args[1]); if (!(nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1)) return `${ns}: pointer <0〜1> <0〜1>`; const b = box(s); s.ctl.pointerTo(b.x0 + nx * (b.x1 - b.x0), b.y0 + ny * (b.y1 - b.y0)); s.moveDue = true; syncPointer(p, s); return ''; }
        case 'f1': {
          // (F1 alone, the browser closed: the HUD, the arm and the held item hidden — a spectator's view without its game mode)
          if (s.open) return `${ns}: ブラウザを開いている間は F1 のまま`;
          const on = args[0] === 'on' ? true : args[0] === 'off' ? false : !ch.state(p).f1;
          ch.f1(p, on, io.touch(p) ? { keep: ['TouchControls'], flag: false } : undefined);
          if (!on) ch.reset(p);
          io.say(p, on ? `§7F1（もう一度 /${cmd}:f1 で戻る）` : '');
          return '';
        }
        default: return `${ns}: 知らない命令 ${verb}`;
      }
    }
    /** a player who left: what the engine held for them is dropped (their choices stay in the world) */
    function forget(p) { const s = players.get(p.id); if (s) { s.gen++; s.open = false; } players.delete(p.id); }
    return { open, close, tick, command, forget, state: st, isOpen: (p) => st(p).open, apply, box, share };
  }

  /** the WebSocket build's link (its source goes into the script as it is; the tests run it with a fake world): the outbox of
   *  requests to the service a player at a time, answered through /web:pump — the command the service runs as that player over the
   *  game's WebSocket (mcws.mjs). env: { tick() → the current tick, log(line), run(fn) (later, where the world may change) } */
  function wsLink(env) {
    const links = new Map(), outbox = new Map(), waiting = new Map(), parts = new Map();
    let seq = 0;
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    function bytes(s) { const out = []; let acc = 0, bits = 0; for (const ch of String(s)) { const v = B64.indexOf(ch === '+' ? '-' : ch === '/' ? '_' : ch); if (v < 0) continue; acc = ((acc << 6) | v) & 0xffffff; bits += 6; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } } return out; }
    function utf8(b) {
      let s = '', i = 0;
      while (i < b.length) {
        const c = b[i++];
        if (c < 128) s += String.fromCharCode(c);
        else if (c < 224) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
        else if (c < 240) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
        else { const cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); s += String.fromCodePoint(cp); }
      }
      return s;
    }
    const fresh = (id) => { const l = links.get(id); return !!l && env.tick() - l.at < 200; };
    /** a request for player p: into p's outbox, answered by a later pump (rejected when p has no link, or no answer in time) */
    function call(method, path, body, p) {
      if (!p) return Promise.reject(new Error('no player'));
      if (!fresh(p.id)) return Promise.reject(new Error('WebSocket でつないでください: /connect <サービスのアドレス>:8787'));
      const id = ++seq, q = outbox.get(p.id) || [];
      q.push([id, method, path, body === undefined ? null : body]);
      outbox.set(p.id, q);
      return new Promise((resolve, reject) => waiting.set(id, { resolve, reject, at: env.tick(), max: path.indexOf('/next') >= 0 ? 600 : 400, who: p.id }));
    }
    /** /web:pump <data> from p (its answers to p's requests, and the link's address the first time) → the command's output: p's
     *  outbox (as much as fits; m: 1 when more waits), or '' for a part that is not the last */
    function pump(p, data) {
      let d = String(data || '');
      const m = /^(\d+):(\d+)\/(\d+):(.*)$/.exec(d);
      if (m) {
        const key = `${p.id}:${m[1]}`, arr = parts.get(key) || [];
        arr[Number(m[2]) - 1] = m[4]; parts.set(key, arr);
        if (arr.filter((x) => x !== undefined).length < Number(m[3])) return '';
        d = arr.join(''); parts.delete(key);
        if (parts.size > 20) parts.clear();
      }
      const obj = d ? JSON.parse(utf8(bytes(d))) : {};
      const was = links.get(p.id);
      links.set(p.id, { at: env.tick(), base: (obj.h && obj.h.base) || (was && was.base) || '' });
      if (obj.h) env.log(`ws linked ${JSON.stringify({ player: p.name, base: obj.h.base, again: !!was })}`);
      const answers = obj.r || [], chats = obj.c || [];
      if (answers.length || chats.length) env.run(() => {
        for (const [id, status, json] of answers) { const w = waiting.get(id); if (w) { waiting.delete(id); w.resolve({ status, json }); } }
        for (const t of chats) env.chat(p, t);
      });
      const q = outbox.get(p.id) || [], out = [];
      let len = 0;
      while (q.length && len < 1500) { const x = q.shift(); out.push(x); len += JSON.stringify(x).length; }
      return JSON.stringify(Object.assign({ n: p.name, o: out }, q.length ? { m: 1 } : {}));
    }
    /** every few ticks: requests too old are given up (their callers see an error) */
    function sweep() {
      const now = env.tick();
      for (const [id, w] of waiting) if (now - w.at > w.max) { waiting.delete(id); w.reject(new Error('no answer over the WebSocket')); }
    }
    return { call, pump, sweep, linked: fresh, base: (id) => (links.get(id) || {}).base || '', waiting, outbox };
  }

  /** the pack's script: the engine wired to @minecraft/server and @minecraft/server-net (or, transport 'ws', to the game's
   *  WebSocket: wsLink — no @minecraft/server-net, any world) */
  function scriptOf(CFG, o = {}) {
    // (a command takes 8 parameters at most: the first word and 7 more — a sentence without quotes)
    const words = Array.from({ length: 7 }, (_, i) => `w${i + 2}`), C = CFG.cmd || CFG.ns, ws = o.transport === 'ws';
    return `// GeoUI Web (bds-lab bds/geoui/web) — the web in the game: made by bds/geoui/web/make.mjs (change that, not this file).
// /${C}:open [URL] · /${C}:close · /${C}:go <URL or words> · /${C}:t <words> (typed; Enter in a search box) · /${C}:enter ·
// /${C}:key <key> · /${C}:back · /${C}:forward · /${C}:reload · /${C}:home · /${C}:tab <n> · /${C}:newtab [URL] · /${C}:closetab [n] ·
// /${C}:zoom <%> · /${C}:size <16:9|20:9|…|WxH> [height] · /${C}:res <height> · /${C}:sens <n> · /${C}:click · /${C}:f1 [on|off]
// (operators: /${C}:service <URL> · /${C}:public <lan|tunnel|URL>). /scriptevent ${CFG.ns}:<the same> for the tests. The head's turns are the
// mouse, a swing (left click, a tap) a click, jump the button held (drag), sneak back (held: close), W / S and the hotbar the wheel.
import { world, system, Player, InputButton, ButtonState, HudElement, HudVisibility, ControlScheme, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';
${ws ? '// (the WebSocket build: no @minecraft/server-net — the service is reached through each player\'s /connect: wsLink)' : "import { http, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';"}
import './screen_nav.js';
import './screen_input.js';
import './screen_channel.js';
const CFG = ${JSON.stringify(CFG)};
const frameOf = ${frameOf.toString()};
const layoutFor = ${layoutFor.toString()};
const aspectOf = ${aspectOf.toString()};
const aspectFromProbes = ${aspectFromProbes.toString()};
const createBrowsers = ${createBrowsers.toString()};
const GS = globalThis.GeoUIScreen;
const NS = CFG.ns;
const log = (s) => console.warn('GWEB ' + s);
const held = new Map(), pend = new Map();
${ws ? `const wsLink = ${wsLink.toString()};
const link = wsLink({ tick: () => system.currentTick, log, run: (fn) => system.run(fn), chat: (p, t) => { if (!p.isValid) return; if (t === '\\n') engine.command(p, 'enter', []); else engine.command(p, 't', String(t).split(' ')); } });
const call = link.call;
system.runInterval(() => link.sweep(), 20);` : `const service = () => String(world.getDynamicProperty(NS + ':service') || CFG.service);
const publicMode = () => String(world.getDynamicProperty(NS + ':public') || CFG.public || 'lan');
async function call(method, path, body) {
  const req = new HttpRequest(service() + path).setMethod(method === 'POST' ? HttpRequestMethod.Post : method === 'DELETE' ? HttpRequestMethod.Delete : HttpRequestMethod.Get).setTimeout(path.includes('/next') ? 20 : 30);
  req.addHeader('content-type', 'application/json');
  const pm = publicMode();
  if (pm !== 'lan') req.addHeader('x-geoui-public', pm);
  if (body !== undefined) req.setBody(JSON.stringify(body));
  const r = await http.request(req);
  let json = null; try { json = JSON.parse(r.body); } catch (e) { /* (not JSON) */ }
  return { status: r.status, json };
}`}
const chIo = {
  // (the channel's title has no time: its control ends at once, so the next plain title shows — RULES R10.14; the game's own
  //  durations come back a little later for titles that set none)
  title: (p, t) => p.onScreenDisplay.setTitle(t, { stayDuration: 0, fadeInDuration: 0, fadeOutDuration: 0 }),
  times: (p) => { p.runCommand('title @s times 10 70 20'); },
  prop: (p, k, v) => p.setProperty(k, v),
  hideHud: (p, keep) => { const before = p.onScreenDisplay.getHiddenHudElements(); p.onScreenDisplay.hideAllExcept(keep.map((k) => HudElement[k]).filter((v) => v !== undefined)); return before; },
  restoreHud: (p, before) => { p.onScreenDisplay.resetHudElementsVisibility(); if (before && before.length) p.onScreenDisplay.setHudVisibility(HudVisibility.Hide, before); },
  // (F1's camera: the pack's <ns>:eye — a third-person camera at the eyes draws no first-person held item (RULES R10.13); the
  //  player turns with it (LockedPlayerRelativeStrafe). Off: cleared, the game's own scheme back)
  camera: (p, id) => {
    if (id) { p.camera.setCamera(id); try { p.setControlScheme(ControlScheme.LockedPlayerRelativeStrafe); } catch (e) { /* (an older game) */ } }
    else { p.camera.clear(); try { p.setControlScheme(); } catch (e) { /* (an older game) */ } }
  },
};
// (F1's camera <ns>:eye: /web:f1 (F1 alone) uses it — the held item gone, R10.17; the browser's F1 only when CFG.f1Camera)
const ch = GS.channel.create({ ns: NS, slots: CFG.slotCount, width: CFG.width, refreshTicks: CFG.refreshTicks, camera: NS + ':eye' }, chIo);
const engine = createBrowsers(CFG, {
  players: () => world.getAllPlayers(),
  sample: (p) => {
    if (!p.isValid) return null;
    const i = p.inputInfo, q = pend.get(p.id) || { swings: 0, uses: 0 }; pend.set(p.id, { swings: 0, uses: 0 });
    const h = held.get(p.id);
    if (h && Math.hypot(p.location.x - h.loc.x, p.location.z - h.loc.z) + Math.abs(p.location.y - h.loc.y) > 0.05) { try { p.teleport(h.loc, { keepVelocity: false }); } catch (e) { /* (the next tick) */ } }
    return { rot: p.getRotation(), move: i.getMovementVector(), jump: i.getButtonState(InputButton.Jump) === ButtonState.Pressed || !!q.jump, sneak: i.getButtonState(InputButton.Sneak) === ButtonState.Pressed || !!q.sneak,
      slot: p.selectedSlotIndex, mode: String(i.lastInputModeUsed), swings: q.swings, uses: q.uses };
  },
  setProp: (p, name, v) => { if (p.isValid) p.setProperty(name, v); },
  freeze: (p, on) => {
    if (!p.isValid) return;
    if (on) {
      held.set(p.id, { loc: { x: p.location.x, y: p.location.y, z: p.location.z } });
      try { p.camera.setCamera('minecraft:free', { location: p.getHeadLocation(), rotation: p.getRotation() }); } catch (e) { log('camera ' + e); }
    } else {
      try { p.camera.clear(); } catch (e) { log('camera ' + e); }
      held.delete(p.id);
    }
  },
  setRotation: (p, rot) => { if (p.isValid) p.setRotation(rot); },
  say: (p, text) => { if (p.isValid) p.onScreenDisplay.setActionBar(text); },
  log,
  http: call,
  touch: (p) => { try { return String(p.inputInfo.lastInputModeUsed) === 'Touch'; } catch (e) { return false; } },
  platform: (p) => { try { return String(p.clientSystemInfo.platformType); } catch (e) { return 'Desktop'; } },
  load: (p, key) => (p.isValid ? p.getDynamicProperty(key) : undefined),
  save: (p, key, v) => { if (p.isValid) p.setDynamicProperty(key, v); },
  wait: (ticks) => system.waitTicks(Math.max(1, ticks)),
}, GS, ch);
globalThis.__gweb = { engine, ch };
world.afterEvents.playerButtonInput.subscribe((e) => {
  if (e.newButtonState !== ButtonState.Pressed) return;
  const q = pend.get(e.player.id) || { swings: 0, uses: 0 };
  if (e.button === InputButton.Jump) q.jump = true; else if (e.button === InputButton.Sneak) q.sneak = true;
  pend.set(e.player.id, q);
});
world.afterEvents.playerSwingStart.subscribe((e) => { const q = pend.get(e.player.id) || { swings: 0, uses: 0 }; if (String(e.swingSource) === 'Attack') q.swings++; pend.set(e.player.id, q); });
world.afterEvents.itemUse.subscribe((e) => { const q = pend.get(e.source.id) || { swings: 0, uses: 0 }; q.uses++; pend.set(e.source.id, q); });
system.runInterval(() => { engine.tick(); ch.tick(system.currentTick); }, 1);
// (/scriptevent ${CFG.ns}:<verb> <words> — the same as the commands, for every player (or the one who ran it): what the tests use)
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(NS.length + 1), args = String(e.message || '').trim().split(/\\s+/).filter(Boolean);
  if (verb === 'service' || verb === 'public') { world.setDynamicProperty(NS + ':' + verb, args[0] || undefined); log(verb + ' ' + (args[0] || '(default)')); return; }
  if (verb === 'state') { for (const p of world.getAllPlayers()) { const s = engine.state(p); log('state ' + JSON.stringify({ player: p.name, open: s.open, sid: !!s.sid, layout: s.layout, w: s.w, h: s.h, frame: s.frame, bar: s.bar, url: s.url, title: s.title, tabs: s.tabs, focus: s.focus, ptr: s.last.ptr, flg: s.last.flg, f1: ch.state(p).f1 })); } return; }
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = engine.command(p, verb, args); if (why) log(why); }
}, { namespaces: [NS] });
system.beforeEvents.startup.subscribe((e) => {
  const reg = e.customCommandRegistry, who = (o) => { const s = o.initiator ?? o.sourceEntity; return s instanceof Player ? s : undefined; };
  const str = (name) => ({ name, type: CustomCommandParamType.String });
  const WORDS = ${JSON.stringify(words)}.map(str);
  const add = (name, description, mandatory, optional, run, op) => reg.registerCommand({ name: ${JSON.stringify(C)} + ':' + name, description, permissionLevel: op ? CommandPermissionLevel.GameDirectors : CommandPermissionLevel.Any, mandatoryParameters: mandatory, optionalParameters: optional }, (o, ...vals) => {
    const p = who(o);
    if (!p && !op) return { status: CustomCommandStatus.Failure, message: 'players only' };
    const args = vals.filter((v) => v !== undefined && v !== null).map(String);
    system.run(() => { const why = run(p, args); if (why && p && p.isValid) p.sendMessage('§c' + why); });
    return { status: CustomCommandStatus.Success };
  });
  const verb = (v) => (p, args) => engine.command(p, v, args);
  add('open', 'GeoUI Web: open the browser (a URL, or the home page)', [], [str('url')], verb('open'));
  add('close', 'GeoUI Web: close the browser', [], [], verb('close'));
  add('go', 'GeoUI Web: go to a URL, or search the words', [str('text')], WORDS, verb('go'));
  add('t', 'GeoUI Web: type the words (Enter in a search box)', [str('text')], WORDS, verb('t'));
  add('enter', 'GeoUI Web: press Enter', [], [], verb('enter'));
  add('key', 'GeoUI Web: press a key (Enter Tab Backspace Escape ArrowDown Control+A …)', [str('key')], [], verb('key'));
  for (const v of ['back', 'forward', 'reload', 'home']) add(v, 'GeoUI Web: ' + v, [], [], verb(v));
  add('tab', 'GeoUI Web: the tab of that number', [{ name: 'n', type: CustomCommandParamType.Integer }], [], verb('tab'));
  add('newtab', 'GeoUI Web: a new tab (a URL)', [], [str('url')], verb('newtab'));
  add('closetab', 'GeoUI Web: close the tab (this one, or that number)', [], [{ name: 'n', type: CustomCommandParamType.Integer }], verb('closetab'));
  add('zoom', 'GeoUI Web: zoom (25-500 %)', [{ name: 'pct', type: CustomCommandParamType.Integer }], [], verb('zoom'));
  add('size', 'GeoUI Web: your screen\\'s shape (WxH, "16:9" …, auto, fit) — or box <shape> — and the picture\\'s height', [str('shape')], [str('more'), str('height')], verb('size'));
  add('res', 'GeoUI Web: the picture\\'s height in px (sharper, heavier)', [{ name: 'height', type: CustomCommandParamType.Integer }], [], verb('res'));
  add('sens', 'GeoUI Web: the pointer\\'s speed', [{ name: 'n', type: CustomCommandParamType.Float }], [], verb('sens'));
  add('click', 'GeoUI Web: click at the pointer (right: the right button)', [], [str('button')], verb('click'));
  add('f1', 'F1: hide the whole HUD, the arm and the held item (the game mode stays)', [], [str('on_off')], verb('f1'));
  ${ws ? `// (the WebSocket link: the service runs /${C}:pump as the player over the game's WebSocket — its output is the player's outbox)
  reg.registerCommand({ name: ${JSON.stringify(C)} + ':pump', description: 'GeoUI Web: the WebSocket link (the service runs it over /connect)', permissionLevel: CommandPermissionLevel.Any, mandatoryParameters: [str('data')] }, (o, data) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    try { const msg = link.pump(p, data); return msg ? { status: CustomCommandStatus.Success, message: msg } : { status: CustomCommandStatus.Success }; } catch (x) { return { status: CustomCommandStatus.Failure, message: 'pump ' + x }; }
  });` : `add('service', 'GeoUI Web: the service\\'s address (operators)', [], [str('url')], (p, a) => { world.setDynamicProperty(NS + ':service', a[0] || undefined); return ''; }, true);
  add('public', 'GeoUI Web: the pictures\\' address — lan, tunnel or a URL (operators)', [], [str('mode')], (p, a) => { world.setDynamicProperty(NS + ':public', a[0] || undefined); return ''; }, true);`}
});
// (a player who left: the browser forgotten; one who comes back: the camera, the HUD and the title as the game has them)
world.afterEvents.playerLeave.subscribe((e) => { engine.forget({ id: e.playerId }); ch.drop({ id: e.playerId }); held.delete(e.playerId); pend.delete(e.playerId); });
world.afterEvents.playerSpawn.subscribe((e) => {
  const p = e.player;
  if (!e.initialSpawn) { if (engine.isOpen(p)) engine.close(p); return; }
  system.run(() => {
    if (!p.isValid) return;
    try { p.camera.clear(); } catch (x) { /* (none) */ }
    try { p.onScreenDisplay.resetHudElementsVisibility(); } catch (x) { /* (an older game) */ }
    try { p.setProperty(NS + ':flg', 0); p.setProperty(NS + ':f1', 0); } catch (x) { /* (none) */ }
  });
});
world.afterEvents.entityDie.subscribe((e) => { if (e.deadEntity instanceof Player && engine.isOpen(e.deadEntity)) engine.close(e.deadEntity); });
`;
  }

  W.runtime = { frameOf, layoutFor, aspectOf, aspectFromProbes, createBrowsers, wsLink, scriptOf };
  if (typeof module === 'object' && module && module.exports) module.exports = W.runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this);

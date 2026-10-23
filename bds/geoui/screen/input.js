// GeoUI Screen — what a player's inputs mean to a GeoUI screen, without any form (pure: samples in, events out; the pack's
// script feeds it each tick and the tests feed it made-up ones). The PC's mouse and keys, rebuilt from what a player can do on
// every device:
//   pointer   the turn of the head = a mouse: the change of yaw and pitch since the last sample, times sens, moves a pointer
//             kept inside its bounds (no dead zone at an edge: like a mouse, coming back moves it at once). The pitch stops at
//             ±90°, so past pitchLimit the script turns the player back level (the camera is frozen: nothing is seen) and the
//             sample right after a turn-back may still be from before it — whichever reading of it is the smaller move wins
//             (two frames: the old one and the turned-back one), so the turn-back never shows as a jump of the pointer
//   keys      the move input (W A S D, a stick, the touch pad) = arrow keys: a press moves the focus that way (nav.js: any
//             angle, the ambiguous case settled by where the player looks), held it repeats (after repeatDelay ticks, then
//             every repeatEvery)
//   buttons   jump = the primary button / Enter (down, up, click), sneak = the secondary one / Escape (back), the attack
//             swing (left click, a tap of the screen) = a click at the pointer, use = the secondary click
//   wheel     the hotbar's selected slot: the change (−4…+4, shortest way round) = the wheel, the slot itself = keys 1–9
// A press goes to what the player last pointed with: the element under the pointer after the pointer moved, the focus after a
// key moved it.
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const nav = () => S.nav || (typeof require === 'function' ? require('./nav.js') : null);
  const wrap180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const DEFAULTS = Object.freeze({
    sens: 4,                 // pointer units per degree of turning
    bounds: { x0: -150, y0: -85, x1: 150, y1: 85 },
    pitchLimit: 45,          // past this the player is turned back level
    jumpLimit: 60,           // a change bigger than this in one sample is a teleport or a respawn, not a hand: dropped
    deadzone: 0.35, release: 0.2,
    repeatDelay: 8, repeatEvery: 3,
    altTtl: 40,              // samples to wait for a turn-back to arrive
    // the move input's x is +1 to the LEFT (Bedrock's: `walk left` → movementVector 1,0, bds/docs/EVENTS.md); y is +1 forward
    leftIsPositive: true,
    focusFollowsPointer: true,
    clickTicks: 0,           // 0: a click whenever the press and the release are on the same element
  });

  function createController(cfg0 = {}) {
    const cfg = Object.assign({}, DEFAULTS, cfg0, { bounds: Object.assign({}, DEFAULTS.bounds, cfg0.bounds || {}) });
    let targets = (cfg.targets || []).slice();
    const st = {
      pointer: [clamp(cfg.start ? cfg.start[0] : 0, cfg.bounds.x0, cfg.bounds.x1), clamp(cfg.start ? cfg.start[1] : 0, cfg.bounds.y0, cfg.bounds.y1)],
      last: null, alt: null, focus: cfg.focus ?? null, hover: null, via: 'keys',
      held: { jump: false, sneak: false }, press: null, move: { active: false, vec: null, next: 0 },
      slot: null, mode: null, tick: 0, recentred: 0,
    };
    const targetById = (id) => targets.find((t) => t.id === id) || null;
    /** the turn between two rotations (degrees: yaw the short way round) */
    const turn = (a, b) => ({ yaw: wrap180(a.y - b.y), pitch: a.x - b.x });
    const size = (d) => Math.abs(d.yaw) + Math.abs(d.pitch);

    function setTargets(list) {
      targets = (list || []).slice();
      if (st.focus !== null && !targetById(st.focus)) st.focus = null;
      if (st.hover !== null && !targetById(st.hover)) st.hover = null;
    }
    /** the player's state when the screen opens (or the camera changes): rotation and slot become the reference */
    function reset(rot, slot) { st.last = rot ? { x: rot.x, y: rot.y } : null; st.alt = null; st.slot = Number.isInteger(slot) ? slot : null; st.move = { active: false, vec: null, next: 0 }; }
    /** the script turned the player to `rot` (a turn-back): until a sample from after it arrives, both frames are read */
    function turnedTo(rot) { st.alt = { rot: { x: rot.x, y: rot.y }, ttl: cfg.altTtl }; st.recentred++; }

    function step(sm) {
      const events = [], actions = [], N = nav();
      st.tick = Number.isFinite(sm.tick) ? sm.tick : st.tick + 1;
      // ---- the pointer
      let moved = false;
      if (sm.rot) {
        const rot = { x: sm.rot.x, y: sm.rot.y };
        if (!st.last) st.last = rot;
        let d = turn(rot, st.last);
        if (st.alt) {
          const dB = turn(rot, st.alt.rot);
          if (size(dB) < size(d)) { d = dB; st.alt = null; } else if (--st.alt.ttl <= 0) st.alt = null;
        }
        st.last = rot;
        if (size(d) > cfg.jumpLimit) d = { yaw: 0, pitch: 0 };
        if (d.yaw || d.pitch) {
          const nx = clamp(st.pointer[0] + d.yaw * cfg.sens, cfg.bounds.x0, cfg.bounds.x1), ny = clamp(st.pointer[1] + d.pitch * cfg.sens, cfg.bounds.y0, cfg.bounds.y1);
          if (nx !== st.pointer[0] || ny !== st.pointer[1]) { events.push({ type: 'pointer', x: nx, y: ny, dx: nx - st.pointer[0], dy: ny - st.pointer[1] }); st.pointer = [nx, ny]; moved = true; }
        }
        if (!st.alt && Math.abs(rot.x) > cfg.pitchLimit && cfg.recentre !== false) {
          const to = { x: 0, y: rot.y };
          actions.push({ type: 'setRotation', rotation: to });
          turnedTo(to);
        }
      }
      if (moved) {
        const h = N.hit(targets, st.pointer);
        if (h !== st.hover) { st.hover = h; events.push({ type: 'hover', id: h }); }
        st.via = 'pointer';
        if (cfg.focusFollowsPointer && h !== null && h !== st.focus) { st.focus = h; events.push({ type: 'focus', id: h, via: 'pointer' }); }
      }
      // ---- the keys: the move input as arrows
      if (sm.move) {
        const mx = cfg.leftIsPositive ? -sm.move.x : sm.move.x, my = -sm.move.y, mag = Math.hypot(mx, my);
        const vec = [mx, my];
        if (mag >= cfg.deadzone) {
          const angleOff = st.move.vec ? Math.abs(wrap180((Math.atan2(vec[1], vec[0]) - Math.atan2(st.move.vec[1], st.move.vec[0])) * 180 / Math.PI)) : 180;
          const fresh = !st.move.active || angleOff > 30;
          if (fresh || st.tick >= st.move.next) {
            const from = st.focus;
            const to = N.navigate(targets, from, vec, { pointer: st.pointer, wrap: cfg.wrap || 'none' });
            events.push({ type: 'key', key: keyOf(vec), vec, repeat: !fresh });
            if (to !== null && to !== from) { st.focus = to; st.via = 'keys'; events.push({ type: 'nav', from, to, vec }); events.push({ type: 'focus', id: to, via: 'keys' }); }
            else if (to === null && from === null && targets.length) { const f = N.first(targets.filter((t) => !t.disabled), st.pointer); if (f !== null) { st.focus = f; st.via = 'keys'; events.push({ type: 'focus', id: f, via: 'keys' }); } }
            st.move = { active: true, vec, next: st.tick + (fresh ? cfg.repeatDelay : cfg.repeatEvery) };
          }
        } else if (mag < cfg.release) st.move = { active: false, vec: null, next: 0 };
      }
      // ---- the buttons
      const target = () => (st.via === 'pointer' ? st.hover : st.focus);
      const edge = (name, now, button) => {
        if (now === undefined || now === st.held[name]) return;
        st.held[name] = now;
        if (now) {
          const t = target();
          st.press = { button, target: t, tick: st.tick, source: name };
          events.push({ type: 'down', button, source: name, target: t });
          if (button === 'secondary') events.push({ type: 'back', target: t });
        } else {
          const p = st.press && st.press.button === button ? st.press : null;
          events.push({ type: 'up', button, source: name, target: p ? p.target : null });
          if (p && p.target !== null && p.target === target() && (!cfg.clickTicks || st.tick - p.tick <= cfg.clickTicks)) events.push({ type: 'click', button, source: name, target: p.target });
          if (p) st.press = null;
        }
      };
      edge('jump', sm.jump, 'primary');
      edge('sneak', sm.sneak, 'secondary');
      // (a swing — the left button, a tap of the screen — and a use — the right button — are whole clicks at the pointer)
      for (let i = 0; i < (sm.swings || 0); i++) events.push({ type: 'click', button: 'primary', source: 'swing', target: st.hover });
      for (let i = 0; i < (sm.uses || 0); i++) events.push({ type: 'click', button: 'secondary', source: 'use', target: st.hover });
      // ---- the wheel and the number keys: the hotbar's slot
      if (Number.isInteger(sm.slot)) {
        if (st.slot !== null && sm.slot !== st.slot) {
          const d = ((sm.slot - st.slot + 13) % 9) - 4;
          if (d) events.push({ type: 'wheel', delta: d, slot: sm.slot, from: st.slot, target: target() });
          events.push({ type: 'slot', index: sm.slot });
        }
        st.slot = sm.slot;
      }
      if (sm.mode && sm.mode !== st.mode) { if (st.mode !== null) events.push({ type: 'mode', mode: sm.mode, from: st.mode }); st.mode = sm.mode; }
      return { events, actions, pointer: st.pointer.slice(), focus: st.focus, hover: st.hover, pressed: st.press ? st.press.target : null, via: st.via };
    }
    const keyOf = (v) => { const a = Math.atan2(v[1], v[0]) * 180 / Math.PI; const k = Math.round(a / 45); return ['D', 'SD', 'S', 'AS', 'A', 'AW', 'W', 'WD'][((k % 8) + 8) % 8]; };
    function focus(id) { if (id === null || targetById(id)) { st.focus = id; st.via = 'keys'; } }
    function pointerTo(x, y) { st.pointer = [clamp(x, cfg.bounds.x0, cfg.bounds.x1), clamp(y, cfg.bounds.y0, cfg.bounds.y1)]; }
    function hints() { return st.focus === null ? { W: null, A: null, S: null, D: null } : nav().hintsFor(targets, st.focus, { pointer: st.pointer }); }
    return { cfg, state: st, step, reset, turnedTo, setTargets, focus, pointerTo, hints };
  }

  /** pack two numbers into one int property of 24 bits (each 12: v in [−range, range) at `step`) and back */
  function pack2(a, b, range = 204.8, stepv = 0.1) {
    const q = (v) => clamp(Math.round((v + range) / stepv), 0, 4095);
    return q(a) + q(b) * 4096;
  }
  function unpack2(n, range = 204.8, stepv = 0.1) { return [(n % 4096) * stepv - range, Math.floor(n / 4096) * stepv - range]; }
  /** the same unpacking in Molang (expr: the property) */
  function unpack2Molang(expr, range = 204.8, stepv = 0.1) {
    return [`(math.mod(${expr}, 4096) * ${stepv} - ${range})`, `(math.floor(${expr} / 4096) * ${stepv} - ${range})`];
  }

  S.input = { DEFAULTS, createController, wrap180, pack2, unpack2, unpack2Molang };
  if (typeof module === 'object' && module && module.exports) module.exports = S.input;
})(typeof globalThis !== 'undefined' ? globalThis : this);

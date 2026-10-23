// GeoUI timeline — runtime: the behaviour pack's side (bds/geoui/timeline/PLAN.md step 4). The script that plays a sequence
// for a player (scriptevent <ns>:play / stop / pause / resume / seek / offset), puts each streamed instance into its slot just
// before it shows, judges the player's presses against the instances' times (osu!'s 300 / 100 / 50 windows), sends hits and
// misses to the slots (the resource pack's trigger / until clips answer), keeps score, combo, accuracy and health in the
// pack's v0 … v3, plays the audio clips on the sequence's time (and stops them at a pause, a seek or a stop) and sends a
// player who joins again the sequence from where it is. A loop or a pingpong goes round again: each round its instances are
// streamed and judged anew (a pingpong's way back, where the time runs backwards, is shown but not judged and not heard).
// The engine below is one self-contained function: the pack's script carries its source, and the tests run the very same
// code with a fake world. The properties are contract.js's (seq: sequence + 1024 × paused + 2048 × generation).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  // (a name as compile.js and media.js make it: a sound's id in the pack)
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';

  /** the engine (no outside names: its source goes into the pack's script as is). io: { tick() (the server's tick), setProp(p,
   *  name, value), getProp(p, name) (what the player has: a world keeps its players' properties), players() (everyone in the
   *  world), event(p, id, message) (a scriptevent: markers), sound(p, id, volume, pitch) and stopSound(p, id) (the sequence's
   *  audio clips) } */
  function createEngine(CFG, io, createGame) {
    const P = (x) => `${CFG.ns}:${x}`, players = new Map(), HIT = 1, MISS = 2, LATE = 250, PAUSE = 1024, GEN = 2048, GENS = 8192;
    const W = CFG.windows, POINTS = { great: 300, good: 100, ok: 50 };
    const get = (p, name) => { try { return io.getProp ? io.getProp(p, name) : undefined; } catch (e) { return undefined; } };
    function stateOf(p) {
      let s = players.get(p.id);
      // (the generation goes on from the one the player has: a client that saw it already would not count again from a
      //  play that only set it to the same number — after a server restart the script begins at 0, the world keeps it)
      if (!s) { const v0 = Number(get(p, P('seq'))), g0 = Number.isFinite(v0) ? Math.floor(v0 / GEN) % GENS : 0; s = { seq: 0, gen: g0, from: 0, start: 0, paused: false, offset: 0, slots: new Map(), results: new Map(), cur: new Map(), groups: new Map(), judged: new Set(), marks: new Set(), played: new Set(), ringing: new Set(), round: 0, score: 0, combo: 0, best: 0, total: 0, earned: 0, health: 100,
        game: null, mode: CFG.mode || 'aim', sens: CFG.sens || 2.4, ref: null, pending: [], prevMs: null, ge: {}, gp: {} }; players.set(p.id, s); }
      return s;
    }
    /** every sound this player was sent stops (a pause, a seek, a stop: a sound in the game cannot be held or moved) */
    function silence(p, s) { if (io.stopSound) for (const id of s.ringing) { try { io.stopSound(p, id); } catch (e) { /* (gone) */ } } s.ringing.clear(); }
    const seqOf = (s) => CFG.sequences.find((q) => q.index === s.seq) || null;
    const nowMs = (s) => (s.paused ? s.from : s.from + (io.tick() - s.start) * 50);
    // (where the sequence is, as the client's Molang has it: loop and pingpong over its range, hold on its end)
    function seqTime(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if (q.loop === 'hold') return Math.min(t, b - 0.001);
      if (!(len > 0) || t < a) return t;
      if (q.loop === 'loop') return a + ((t - a) % len);
      if (q.loop === 'pingpong') { const m = (t - a) % (2 * len); return a + (m <= len ? m : 2 * len - m); }
      return t;
    }
    // (which round of a loop or a pingpong it is: 0 before the range; a pingpong's odd rounds run backwards)
    function roundOf(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if ((q.loop !== 'loop' && q.loop !== 'pingpong') || !(len > 0) || t < a) return 0;
      return Math.floor((t - a) / len);
    }
    const backwards = (q, s) => q.loop === 'pingpong' && s.round % 2 === 1;
    /** the seq property: the sequence, paused or not, the generation */
    const seqProp = (p, s) => set(p, P('seq'), s.seq + (s.paused ? PAUSE : 0) + GEN * s.gen);
    const set = (p, name, v) => { try { io.setProp(p, name, v); } catch (e) { /* (a property the pack does not have: said once by the pack's check) */ } };
    function values(p, s) {
      const acc = s.game ? s.acc : s.total ? Math.round((s.earned / s.total) * 10000) : 10000;
      set(p, P(CFG.values.score), s.score); set(p, P(CFG.values.combo), s.combo); set(p, P(CFG.values.accuracy), acc); set(p, P(CFG.values.health), Math.round(s.health));
    }
    function clearSlots(p, s) { for (const key of s.slots.keys()) set(p, P(`${key}t`), -1); s.slots.clear(); }
    /** each slot's result (3 bits of its group's property, contract.js): the result of the instance now in the slot (the last
     *  to have begun in it), 0 while it has none. Sent: the groups whose slots changed instance, and `also` (true: all) */
    function results(p, s, q, t, also) {
      for (const tp of q.templates) {
        if (!tp.events) continue;
        const now = new Map(), dirty = new Set();
        // (items in time order: in start order too — one lead for a template)
        for (const it of tp.items) { if (it[5] > t) break; now.set(it[1], it[6]); }
        for (const [k, id] of now) { const key = `${tp.tag}${k}`; if (s.cur.get(key) !== id) { s.cur.set(key, id); dirty.add(Math.floor(k / 8)); } }
        for (let g = 0; g * 8 < tp.slots; g++) {
          const name = `${tp.tag}e${g}`;
          if (!(also === true || (also && also.has(name)) || dirty.has(g))) continue;
          let v = 0;
          for (let k = g * 8; k < Math.min(tp.slots, g * 8 + 8); k++) v += (s.results.get(s.cur.get(`${tp.tag}${k}`)) || 0) * 2 ** (3 * (k - g * 8));
          if (also === true || s.groups.get(name) !== v) { s.groups.set(name, v); set(p, P(name), v); }
        }
      }
    }
    /** a new round (a play, a seek, a resume, a loop going round): nothing judged, every slot sent again */
    function newRound(p, s, q, t) {
      clearSlots(p, s);
      s.judged = new Set(); s.marks = new Set(); s.played = new Set(); s.results = new Map(); s.cur = new Map();
      if (q) {
        // (what is behind the time is judged already, with no result: a press cannot take it and it is no miss)
        for (const h of q.hits) if (h[0] + W.ok < t) s.judged.add(h[4]);
        for (const m of q.markers) if (m[0] < t) s.marks.add(m[1]);
        results(p, s, q, t, true);
      }
    }
    /** from a time on (a play, a seek, a resume): the client counts again from it (a new generation) */
    function restart(p, s, fromMs) {
      s.from = Math.max(0, Math.min(16777215, Math.round(fromMs))); s.start = io.tick(); s.gen = (s.gen + 1) % GENS;
      set(p, P('seq_from'), s.from); seqProp(p, s);
      silence(p, s);
      const q = seqOf(s);
      // (a sound starts only within LATE of its time: one already past at a seek or a resume stays silent)
      s.round = q ? roundOf(q, s.from) : 0;
      newRound(p, s, q, q ? seqTime(q, s.from) : s.from);
      if (q && q.game) gameStart(p, s, q, seqTime(q, s.from), false);
    }
    /** an instance's result, to its slot's group (seen only while it is the instance in its slot) */
    function send(p, s, q, h, result) {
      s.results.set(h[4], result);
      results(p, s, q, seqTime(q, nowMs(s)), new Set([`${h[1]}e${Math.floor(h[2] / 8)}`]));
    }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    // ---- osu!'s rules (osugame.js, a sequence with a game): the cursor from where the player looks, presses queued with their
    //      time, the game stepped each tick — its results to the slots, its events to the whole play's counters, its sounds
    //      played, its states to their properties (contract.js: 24 bits a property, packed as an instance's params)
    const GL = CFG.global || { events: [], groups: [], specs: {} };
    const packOf = (vals, spec) => { let n = 0, sh = 0; for (const f of spec) { const v = Math.min(Math.max(Number(vals[f.name]) || 0, f.min), f.max), L = 2 ** f.bits - 1; n += Math.round(((v - f.min) / (f.max - f.min)) * L) * 2 ** sh; sh += f.bits; } return n; };
    const NAMES = ['none', 'hit', 'miss', 'great', 'good', 'ok', 'early', 'drop'];
    function gameStart(p, s, q, ms, fresh) { if (!q.game || !createGame) { s.game = null; return; } if (fresh || !s.game) s.game = createGame(q.game).start(ms); else s.game.seek(ms); s.ref = null; s.pending = []; s.prevMs = null; }
    function gameTick(p, s, q, ms) {
      const g = s.game, prev = s.prevMs === null ? ms : s.prevMs;
      let inp;
      if (s.mode === 'auto') inp = g.autoInput(prev, ms);
      else {
        const rot = io.rotation ? io.rotation(p) : { x: 0, y: 0 };
        if (!s.ref) s.ref = { x: rot.x, y: rot.y };
        let dy = rot.y - s.ref.y; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        const hx = (CFG.field && CFG.field[0]) || 90, hy = (CFG.field && CFG.field[1]) || 68;
        inp = { cx: Math.max(-hx, Math.min(hx, dy * s.sens)), cy: Math.max(-hy, Math.min(hy, -(rot.x - s.ref.x) * s.sens)), hold: io.held ? (io.held(p) ? 1 : 0) : 0, presses: s.pending.splice(0), aim: s.mode !== 'relax' };
        // (relax: held through a spinner, it spins by itself — a phone's thumb cannot draw circles with the camera)
        if (s.mode === 'relax' && inp.hold) { const a = g.autoInput(prev, ms); if (a.hold && !a.presses.length) { inp.cx = a.cx; inp.cy = a.cy; } }
      }
      s.prevMs = ms;
      const r = g.step(ms, inp);
      for (const [key, code] of r.results) { const h = q.keyMap && q.keyMap[key]; if (h) send(p, s, q, h, code); }
      let geDirty = false;
      for (const [name] of r.events) if (GL.events.includes(name)) { s.ge[name] = ((s.ge[name] || 0) + 1) % 64; geDirty = true; }
      if (geDirty) for (let k = 0; k < GL.events.length; k += 4) { let v = 0; GL.events.slice(k, k + 4).forEach((e, j) => { v += (s.ge[e] || 0) * 2 ** (6 * j); }); set(p, P(k ? `ge${k / 4}` : 'ge'), v); }
      for (const [id] of r.sounds) if (io.sound) { try { io.sound(p, id, 1, 1); } catch (e) { /* (a sound the pack does not have: silent) */ } }
      const st = g.state();
      s.score = st.score; s.combo = st.combo; s.health = st.hp; s.acc = Math.round(st.acc * 100);
      for (const grp of GL.groups) { const v = packOf(st, GL.specs[grp]); if (s.gp[grp] !== v) { s.gp[grp] = v; set(p, P(grp), v); } }
      values(p, s);
    }
    const api = {
      /** a scriptevent's verb and words for a player */
      command(p, verb, args) {
        const s = stateOf(p);
        if (verb === 'play') {
          const want = String(args[0] || '1'), q = CFG.sequences.find((x) => String(x.index) === want || x.id === want);
          if (!q) return `${CFG.ns}: no sequence ${want} (${CFG.sequences.map((x) => `${x.index}=${x.id}`).join(', ')})`;
          s.seq = q.index; s.paused = false; s.score = 0; s.combo = 0; s.best = 0; s.total = 0; s.earned = 0; s.health = 100; s.game = null;
          if (q.game) gameStart(p, s, q, Number(args[1] || 0) * 1000, true);
          restart(p, s, Number(args[1] || 0) * 1000); values(p, s);
          return '';
        }
        if (verb === 'stop') { s.seq = 0; s.paused = false; s.game = null; seqProp(p, s); clearSlots(p, s); silence(p, s); return ''; }
        // (how the player plays a game: auto — it plays itself; aim — the cursor where they look, a press to hit; relax — any
        //  press on time hits, sliders followed and spinners spun while held. sens: model units of cursor a degree of looking)
        if (verb === 'mode') { if (!['auto', 'aim', 'relax'].includes(String(args[0]))) return `${CFG.ns}: mode auto | aim | relax`; s.mode = String(args[0]); s.ref = null; return ''; }
        if (verb === 'sens') { const v = Number(args[0]); if (!(v > 0 && v < 50)) return `${CFG.ns}: sens <0.1…50>`; s.sens = v; return ''; }
        if (!s.seq) return `${CFG.ns}: nothing is playing`;
        if (verb === 'pause') { if (!s.paused) { s.from = Math.round(nowMs(s)); s.paused = true; set(p, P('seq_from'), s.from); seqProp(p, s); silence(p, s); } return ''; }
        if (verb === 'resume') { if (s.paused) { s.paused = false; restart(p, s, s.from); } return ''; }
        if (verb === 'seek') { restart(p, s, Number(args[0] || 0) * 1000); return ''; }
        if (verb === 'offset') { s.offset = Number(args[0] || 0) || 0; return ''; }
        return `${CFG.ns}: unknown ${verb} (play stop pause resume seek offset mode sens)`;
      },
      /** every tick: the streamed slots, the misses, the markers */
      tick() {
        for (const p of io.players()) {
          const s = players.get(p.id);
          if (!s || !s.seq) continue;
          const q = seqOf(s);
          if (!q) continue;
          const raw = nowMs(s), round = roundOf(q, raw), t = seqTime(q, raw);
          // (a loop or a pingpong going round: its instances streamed and judged anew)
          if (round !== s.round) { s.round = round; newRound(p, s, q, t); }
          const back = backwards(q, s);
          for (const tp of q.templates) {
            if (tp.mode !== 'streamed') continue;
            const want = new Map();
            for (const it of tp.items) if (t >= it[0] - tp.lead - CFG.margin && t < it[3]) want.set(`${tp.tag}${it[1]}`, it);
            for (const [key, it] of want) if (s.slots.get(key) !== it) { s.slots.set(key, it); set(p, P(`${key}p`), it[2]); set(p, P(`${key}t`), it[0]); }
            for (const key of [...s.slots.keys()]) if (key.startsWith(tp.tag) && !want.has(key) && q.templates.every((o) => o === tp || !key.startsWith(o.tag))) { s.slots.delete(key); set(p, P(`${key}t`), -1); }
          }
          results(p, s, q, t, false);
          if (s.game && !s.paused) {
            gameTick(p, s, q, t);
            // (a game held on its end: stopped a while after, its rank seen)
            if (q.autoStop && raw > q.autoStop) { api.command(p, 'stop', []); continue; }
            (q.sounds || []).forEach((c, i) => { if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return; s.played.add(i); if (!io.sound) return; try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (silent) */ } });
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
            continue;
          }
          if (!s.paused && !back) {
            // (the sequence's audio clips, each once a round)
            (q.sounds || []).forEach((c, i) => {
              if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return;
              s.played.add(i);
              if (!io.sound) return;
              try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (a sound the pack does not have: silent) */ }
            });
            for (const h of q.hits) if (!s.judged.has(h[4]) && t > h[0] + W.ok) {
              s.judged.add(h[4]); send(p, s, q, h, MISS);
              s.combo = 0; s.total += 1; s.health = Math.max(0, s.health - CFG.missDrain); values(p, s);
            }
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
          }
        }
      },
      /** a press (a button, an item used): the nearest instance not judged yet, within the widest window */
      press(p) {
        const s = players.get(p.id);
        if (!s || !s.seq || s.paused) return null;
        const q = seqOf(s);
        if (!q || backwards(q, s)) return null;
        // (a game: the press queued with its time, judged by the game on the next tick — where the cursor is)
        if (s.game) { if (s.mode !== 'auto') s.pending.push(seqTime(q, nowMs(s)) + s.offset); return { queued: true }; }
        const t = seqTime(q, nowMs(s)) + s.offset;
        let best = null;
        for (const h of q.hits) if (!s.judged.has(h[4]) && Math.abs(t - h[0]) <= W.ok && (!best || Math.abs(t - h[0]) < Math.abs(t - best[0]))) best = h;
        if (!best) return null;
        const j = judgeOf(t - best[0]);
        s.judged.add(best[4]); send(p, s, q, best, HIT);
        s.combo += 1; s.best = Math.max(s.best, s.combo); s.total += 1; s.earned += POINTS[j] / 300;
        s.score += POINTS[j] * (1 + Math.floor(s.combo / 10) / 10); s.score = Math.round(s.score);
        s.health = Math.min(100, s.health + CFG.hitGain); values(p, s);
        return { judge: j, dt: t - best[0], instance: best[3] };
      },
      /** a player (back) in the world: a client that joins again counts from its own first moment, so the sequence it was
       *  playing is sent again from where it is now; with nothing playing for it, a sequence its properties still name (a
       *  world saved while one played) is stopped */
      joined(p) {
        const s = players.get(p.id);
        if (s && s.seq) { restart(p, s, nowMs(s)); values(p, s); return; }
        const st = stateOf(p);
        if (Number(get(p, P('seq'))) % PAUSE !== 0) { st.seq = 0; st.paused = false; seqProp(p, st); }
      },
      state: (p) => players.get(p.id),
    };
    return api;
  }

  /** what the script needs of a document (and of compile's stats: each template's slots) → its CFG */
  function planOf(doc0, stats, opts = {}) {
    const M = T.model, K = T.contract, doc = M.normalize(doc0), ns = String(opts.ns || 'geoui');
    const windows = Object.assign({ great: 50, good: 100, ok: 150 }, opts.windows || {});
    const sequences = doc.sequences.map((seq, si) => {
      const i = si + 1, templates = [], hits = [];
      (seq.templates || []).forEach((tpl) => {
        const sl = stats && stats.slots && stats.slots[`${i}:${tpl.id}`];
        if (!sl) return;
        const judged = tpl.tracks.some((tr) => tr.clips.some((c) => c.trigger === 'hit' || c.until === 'hit' || c.trigger === 'miss'));
        const spec = tpl.pack || K.DEFAULT_PACK, items = [];
        for (const x of seq.instances.filter((y) => y.template === tpl.id).sort((a, b) => a.t - b.t)) {
          const slot = sl.slotOf[x.id];
          if (slot === undefined) continue;
          const tail = x.tail !== undefined ? x.tail : tpl.tail;
          // (time, slot, packed params, end, the instance, its start (when it takes its slot), its key (template/instance))
          items.push([Math.round(x.t * 1000), slot, sl.mode === 'streamed' ? K.pack(x.params, spec) : 0, Math.round((x.t + tail) * 1000), x.id, Math.round((x.t - tpl.lead) * 1000), `${tpl.id}/${x.id}`]);
          if (judged) hits.push([Math.round(x.t * 1000), sl.tag, slot, x.id, `${tpl.id}/${x.id}`]);
        }
        templates.push({ tag: sl.tag, mode: sl.mode, lead: Math.round(tpl.lead * 1000), slots: sl.slots, events: Boolean(sl.events), items });
      });
      // (each audio clip: its time, the sound's name as compile.js defines it, its volume and pitch)
      const sounds = [];
      for (const tr of seq.tracks) if (tr.kind === 'audio' && !tr.muted) for (const c of tr.clips) if (c.sound) sounds.push([Math.round(c.start * 1000), `${ns}.${clean(c.sound)}`, num(c.volume, 1), num(c.pitch, 1)]);
      const out = { index: i, id: seq.id, duration: Math.round(seq.duration * 1000), loop: seq.loop, inOut: seq.inOut ? seq.inOut.map((x) => Math.round(x * 1000)) : null,
        markers: seq.markers.map((m) => [Math.round(m.t * 1000), m.id, m.event]), templates, hits: hits.sort((a, b) => a[0] - b[0]), sounds: sounds.sort((a, b) => a[0] - b[0]) };
      // (a game: osu!'s rules for it — osugame.js — and each instance's key to its slot; held on its end, stopped 8 s after)
      if (seq.game) { out.game = seq.game; out.keyMap = Object.fromEntries(out.hits.map((h) => [h[4], h])); if (seq.loop === 'hold') out.autoStop = out.duration + 8000; }
      return out;
    });
    const gl = (stats && stats.budget && stats.budget.global) || { events: [], groups: [], states: [] };
    return { ns, windows, margin: num(opts.margin, 250), missDrain: num(opts.missDrain, 8), hitGain: num(opts.hitGain, 2), mode: opts.mode || 'aim', sens: num(opts.sens, 2.4), field: opts.field || [90, 68],
      global: { events: gl.events, groups: gl.groups, specs: Object.fromEntries(gl.groups.map((g) => [g, K.STATE_GROUPS[g]])) },
      values: Object.assign({ score: 'v0', combo: 'v1', accuracy: 'v2', health: 'v3' }, opts.values || {}), sequences };
  }

  /** the pack's script for a CFG: the engine, wired to the world */
  function scriptOf(CFG) {
    return `// GeoUI timeline: plays the pack's sequences for each player (GeoUI Builder's timeline; bds-lab bds/geoui/timeline).
// /scriptevent ${CFG.ns}:play <sequence number or id> [from seconds] · ${CFG.ns}:stop · ${CFG.ns}:pause · ${CFG.ns}:resume
// ${CFG.ns}:seek <seconds> · ${CFG.ns}:offset <ms> (presses judged that much later: the lag of a device)
// A game (osu!): ${CFG.ns}:mode auto | aim | relax (it plays itself / the cursor where you look / any press on time) · ${CFG.ns}:sens <units a degree>
// Presses: jump or sneak, or using an item. Score, combo, accuracy (x100) and health go to ${CFG.ns}:${CFG.values.score} … ${CFG.values.health}.
// Markers with an event send /scriptevent ${CFG.ns}:marker <sequence>:<marker> <event>. Audio clips play when the time
// reaches them and stop at a pause, a seek or a stop (a sound already past at a seek or a resume stays silent).
import { world, system, ButtonState, InputButton } from '@minecraft/server';

const CFG = ${JSON.stringify(CFG)};
const createEngine = ${createEngine.toString()};
${CFG.sequences.some((q) => q.game) && T.osugame ? `// osu!'s rules (GeoUI timeline osugame.js): what a game sequence is played by
const createGame = ${T.osugame.createGame.toString()};
` : 'const createGame = null;\n'}const engine = createEngine(CFG, {
  tick: () => system.currentTick,
  setProp: (p, name, value) => { if (p.isValid) p.setProperty(name, value); },
  getProp: (p, name) => (p.isValid ? p.getProperty(name) : undefined),
  players: () => world.getAllPlayers(),
  event: (p, id, message) => system.sendScriptEvent(id, message),
  sound: (p, id, volume, pitch) => { if (p.isValid) p.playSound(id, { volume, pitch }); },
  stopSound: (p, id) => { if (p.isValid) p.runCommand(\`stopsound @s \${id}\`); },
  rotation: (p) => (p.isValid ? p.getRotation() : { x: 0, y: 0 }),
  held: (p) => { if (!p.isValid) return false; const i = p.inputInfo; return i.getButtonState(InputButton.Jump) === ButtonState.Pressed || i.getButtonState(InputButton.Sneak) === ButtonState.Pressed; },
}, createGame);
// (a player who joins again counts from their own first moment: what they were playing is sent again from where it is)
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) engine.joined(e.player); }); });
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(CFG.ns.length + 1);
  if (!['play', 'stop', 'pause', 'resume', 'seek', 'offset', 'mode', 'sens'].includes(verb)) return;
  const words = String(e.message).trim().split(/\\s+/).filter(Boolean);
  const targets = e.sourceEntity && e.sourceEntity.typeId === 'minecraft:player' ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = engine.command(p, verb, words); if (why) console.warn(why); }
}, { namespaces: [CFG.ns] });
system.runInterval(() => engine.tick(), 1);
world.afterEvents.playerButtonInput.subscribe((e) => { if (e.newButtonState === ButtonState.Pressed) engine.press(e.player); });
world.afterEvents.itemUse.subscribe((e) => engine.press(e.source));
`;
  }

  /** the timeline into GeoUI Builder's files, BP side: the properties (contract.propertyDefs) on the player and the script.
   *  ctx: { stats (compile.extendPack's), ns, windows (osu.js hitWindows: { great, good, meh }), margin, mode (a game's: 'aim',
   *  'relax', 'auto'), sens (model units of cursor a degree of looking), field ([half width, half height] the cursor stays in) }
   *  → { files, warnings, cfg } */
  function extendBehavior(files0, doc, ctx = {}) {
    const files = Object.assign({}, files0), warnings = [], ns = String(ctx.ns || 'geoui'), bpDir = `${ns}_BP`, K = T.contract;
    const playerFile = `${bpDir}/entities/player.json`, mainFile = `${bpDir}/scripts/main.js`;
    if (!files[playerFile] || !files[mainFile]) { warnings.push('ビヘイビアパックがありません（GeoUI の設定で「ビヘイビアパックも作る」）: ゲームの中で再生する命令は書き出せません'); return { files, warnings, cfg: null }; }
    const w = ctx.windows || {}, cfg = planOf(doc, ctx.stats, { ns, margin: ctx.margin, windows: w.great !== undefined ? { great: w.great, good: w.good, ok: w.meh !== undefined ? w.meh : w.ok } : undefined, mode: ctx.mode, sens: ctx.sens, field: ctx.field });
    const pj = JSON.parse(typeof files[playerFile] === 'string' ? files[playerFile] : JSON.stringify(files[playerFile]));
    const desc = pj['minecraft:entity'].description, budget = ctx.stats && ctx.stats.budget ? ctx.stats.budget : K.budget(T.model.normalize(doc), { ns });
    desc.properties = Object.assign({}, desc.properties || {}, K.propertyDefs(budget, ns));
    const count = Object.keys(desc.properties).length;
    if (count > 32) warnings.push(`プレイヤーのプロパティが ${count} 個です（上限は 32 と見込む・要実測）`);
    files[playerFile] = `${JSON.stringify(pj, null, 2)}\n`;
    files[`${bpDir}/scripts/timeline.js`] = scriptOf(cfg);
    const main = String(files[mainFile]);
    if (!/import '\.\/timeline\.js';/.test(main)) files[mainFile] = `${main.replace(/\n*$/, '\n')}import './timeline.js';\n`;
    return { files, warnings, cfg };
  }

  T.runtime = { createEngine, planOf, scriptOf, extendBehavior };
  if (typeof module === 'object' && module && module.exports) module.exports = T.runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this);

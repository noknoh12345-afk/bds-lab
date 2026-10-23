// GeoUI timeline — osu!'s gameplay (pure, self-contained): the rules a beatmap is played by, the same in the game and in the
// editor's preview. A hit circle is hit by a press on time with the cursor on it (osu!'s 300 / 100 / 50 windows; a press before
// its window shakes it — notelock); a slider's head is a hit circle, then its ball is followed — the button held and the cursor
// inside the follow circle — through its ticks and turns, and judged at its end by how much of it was (all: 300, half: 100,
// some: 50); a spinner is spun around the playfield's middle, the spins it needs counted (osu!lazer's minimum spins per second
// for its OD), bonus spins past it. Score v1 (each hit's value grows with the combo and the beatmap's difficulty), accuracy,
// rank (SS … D), health (drained over time, filled by hits, emptied by misses), the combo and its breaks, hitsounds.
// Mods (osu!'s letters): HD and FL change what the client draws and the score (×1.06, ×1.12), NF never fails (×0.5), SD fails
// on a miss or a combo break, PF on anything but a 300. A failed play judges nothing more (osu! ends it: the script stops it).
// createGame's source goes into the behaviour pack's script as it is (runtime.js): it names nothing outside itself. autoInput
// is the autoplay (the cursor eased from object to object, the ball followed, spinners spun at 477 rpm): the preview plays it
// and `/scriptevent <ns>:mode auto` makes the game play itself. The config (G) is made from a beatmap by osu.js gameOf.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};

  /** G: { r (circle radius, model units), follow (follow circle radius), windows { great, good, ok } (ms), preempt (ms),
   *  diffMul (score), hp (0…10), objects: [{ k: 'c' | 's' | 'p', t (ms), x, y, key, hs: [sound ids] — a slider also d (ms, all
   *  its slides), r (slides), line [[x, y]…] and acc (its cumulative lengths) and len (osu!'s length), ticks [ms from t],
   *  edges [ms from t] (each turn and the end), es [[sound ids] each edge], a spinner e (end ms), need (spins) }],
   *  breaks [[ms, ms]], kiai [[ms, ms]], sounds { break, tick, bonus, clear, spin } }.
   *  → { start(ms), seek(ms), step(ms, input) → { results: [[key, code]], events: [[name, ms]], sounds: [[id, ms]] }, state(),
   *    autoInput(ms0, ms1) → input, ballAt(index, ms), rankOf(…), fail(ms) → { events } (the play failed now: the tour's),
   *    fastForward(ms) (played by the autoplay up to ms, nothing told: a jump with the score it would have), mods } — input:
   *  { cx, cy, hold, presses: [ms], aim (false: the cursor not needed — relax) }. opts: { mods: ['HD', 'FL', 'NF', 'SD', 'PF'] } */
  function createGame(G, opts) {
    const CODE = { hit: 1, miss: 2, great: 3, good: 4, ok: 5, early: 6, drop: 7 };
    const VALUE = { great: 300, good: 100, ok: 50 };
    const objs = G.objects || [], W = G.windows, R = G.r, FOLLOW = G.follow || R * 2.4, TAU = Math.PI * 2;
    const lastEnd = objs.length ? Math.max(...objs.map((o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t))) : 0;
    const firstT = objs.length ? objs[0].t : 0;
    // (the mods: what the rules see of them — the client draws HD and FL by itself from the script's state)
    const MODS = new Set([].concat((opts && opts.mods) || []).map((m) => String(m).toUpperCase()).filter((m) => ['HD', 'FL', 'NF', 'SD', 'PF'].includes(m)));
    const MODMUL = (MODS.has('HD') ? 1.06 : 1) * (MODS.has('FL') ? 1.12 : 1) * (MODS.has('NF') ? 0.5 : 1);
    let S = null;
    const fresh = () => ({ t: 0, lo: 0, score: 0, combo: 0, maxcombo: 0, n300: 0, n100: 0, n50: 0, misses: 0, hp: 1, failed: false, failedAt: -1, broken: false,
      done: objs.map(() => false), head: objs.map(() => 0), parts: objs.map(() => [0, 0]), next: objs.map(() => 0), spins: objs.map(() => 0),
      angle: objs.map(() => null), sa: 0, rpmLog: [], bonus: objs.map(() => 0), cleared: objs.map(() => false), cx: 0, cy: 0, hold: 0, active: -1, kiaiAt: -1 });
    const inBreak = (t) => (G.breaks || []).some((b) => t >= b[0] && t < b[1]);
    const kiaiOf = (t) => (G.kiai || []).findIndex((b) => t >= b[0] && t < b[1]);
    /** where a slider's ball is at a time (model units): along its line, there and back by its slides */
    function ballAt(i, t) {
      const o = objs[i], span = o.d / o.r, e = Math.min(Math.max(0, t - o.t), o.d - 1e-6), n = Math.floor(e / span);
      let u = (e - n * span) / span;
      if (n % 2 === 1) u = 1 - u;
      const L = u * o.len, a = o.acc, p = o.line;
      if (L <= 0) return [p[0][0], p[0][1]];
      for (let j = 1; j < p.length; j++) if (a[j] >= L || j === p.length - 1) { const f = a[j] > a[j - 1] ? (L - a[j - 1]) / (a[j] - a[j - 1]) : 1; return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * f, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * f]; }
      return [p[p.length - 1][0], p[p.length - 1][1]];
    }
    /** osu!stable's rank from the counts: 0 none yet, 1 D, 2 C, 3 B, 4 A, 5 S, 6 SS (contract.js RANKS). SS: all 300s; S: over
     *  90 % 300s, under 1 % 50s and no miss; A: over 80 % with no miss, or over 90 %; B: over 70 % with no miss, or over 80 %;
     *  C: over 60 %; else D */
    function rankOf(n300, n100, n50, misses) {
      const total = n300 + n100 + n50 + misses;
      if (!total) return 0;
      const acc = (300 * n300 + 100 * n100 + 50 * n50) / (300 * total), r300 = n300 / total, r50 = n50 / total;
      return acc >= 1 ? 6 : r300 > 0.9 && r50 < 0.01 && !misses ? 5 : (r300 > 0.8 && !misses) || r300 > 0.9 ? 4 : (r300 > 0.7 && !misses) || r300 > 0.8 ? 3 : r300 > 0.6 ? 2 : 1;
    }
    const near = (x, y, cx, cy, r) => (cx - x) * (cx - x) + (cy - y) * (cy - y) <= r * r;
    function out() { return { results: [], events: [], sounds: [] }; }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    /** the play failed at t (once): judged no more — osu! ends it there */
    function failNow(o, t) { if (S.failed) return; S.failed = true; S.failedAt = t; o.events.push(['fail', t]); }
    // (health out: a fail, but with NF — the bar stays empty and the play goes on)
    function hpAdd(o, v, t) { S.hp = Math.min(1, Math.max(0, S.hp + v)); if (S.hp <= 0 && !MODS.has('NF')) failNow(o, t === undefined ? S.t : t); }
    const HPK = 1 + (G.hp || 5) / 5;
    function comboUp(o, t) { S.combo++; S.maxcombo = Math.max(S.maxcombo, S.combo); o.events.push(['combo', t]); }
    // (a break — a miss, a slider's head or tick let go — ends a full combo; SD and PF fail on it)
    function breakCombo(o, t) {
      if (S.combo > 0) { o.events.push(['break', t]); if (S.combo >= 20 && G.sounds && G.sounds.break) o.sounds.push([G.sounds.break, t]); }
      S.combo = 0; S.broken = true;
      if (MODS.has('SD') || MODS.has('PF')) failNow(o, t);
    }
    /** a judgement that counts towards accuracy (a circle, a slider's end, a spinner): its score with the combo before it */
    function judge(o, i, name, t) {
      const ob = objs[i];
      S.done[i] = true;
      if (name === 'miss') {
        S.misses++; o.results.push([ob.key, CODE.miss]); o.events.push(['miss', t]);
        breakCombo(o, t); hpAdd(o, -0.06 * HPK, t);
        return;
      }
      const v = VALUE[name];
      // (score v1: the hit's value, and its value again by the combo before it × the difficulty × the mods, over 25)
      S.score += v + Math.floor((v * Math.max(0, S.combo - 1) * (G.diffMul || 1) * MODMUL) / 25);
      if (name === 'great') S.n300++; else if (name === 'good') S.n100++; else S.n50++;
      // (a slider's end and a spinner add no combo of their own here: the combo went up on their head, ticks and turns — a spinner
      //  does count one, as in osu!)
      if (ob.k !== 's') comboUp(o, t);
      hpAdd(o, name === 'great' ? 0.05 : name === 'good' ? 0.025 : 0.008, t);
      o.results.push([ob.key, CODE[name]]); o.events.push(['hit', t], [name, t]);
      if (name !== 'great' && MODS.has('PF')) failNow(o, t);
    }
    /** a press at time pt with the cursor at cx, cy (aim: it must be on the object) */
    function press(o, pt, cx, cy, aim) {
      // (the earliest object still to be hit: only it can be — osu!'s notelock)
      let i = -1;
      for (let j = 0; j < objs.length; j++) { const ob = objs[j]; if (S.done[j] || ob.k === 'p' || (ob.k === 's' && S.head[j])) continue; if (ob.t + W.ok < pt) continue; i = j; break; }
      if (i < 0) return;
      const ob = objs[i];
      if (aim && !near(ob.x, ob.y, cx, cy, R)) return;
      const j = judgeOf(pt - ob.t);
      if (!j) {
        // (pressed before its window, while it shows: it shakes, nothing else)
        if (pt >= ob.t - (G.preempt || 1200)) o.results.push([ob.key, CODE.early]);
        return;
      }
      if (ob.k === 'c') { judge(o, i, j, pt); for (const id of ob.hs || []) o.sounds.push([id, pt]); return; }
      // a slider's head: a part of it (counted at its end), the combo up, its hitsound
      S.head[i] = 1; S.parts[i][0]++; S.parts[i][1]++; comboUp(o, pt); S.score += 30; hpAdd(o, 0.02);
      o.results.push([ob.key, CODE.hit]); o.events.push(['hit', pt]);
      for (const id of ob.es && ob.es[0] ? ob.es[0] : ob.hs || []) o.sounds.push([id, pt]);
    }
    /** everything due by time t that needs no press: missed heads and circles, slider ticks and turns, spinners, health */
    function settle(o, t0, t, inp) {
      // (S.lo: the first object not judged yet — those before it are all done)
      while (S.lo < objs.length && S.done[S.lo]) S.lo++;
      for (let i = S.lo; i < objs.length; i++) {
        const ob = objs[i];
        if (S.failed) return;
        if (S.done[i]) continue;
        if (ob.t - (G.preempt || 1200) > t) break;
        if (ob.k === 'c') { if (ob.t + W.ok < t) judge(o, i, 'miss', ob.t + W.ok); continue; }
        if (ob.k === 's') {
          if (!S.head[i] && ob.t + W.ok < t) { S.head[i] = 2; S.parts[i][1]++; breakCombo(o, ob.t + W.ok); o.results.push([ob.key, CODE.drop]); }
          // ticks and turns passed since the last step: followed when held with the cursor near the ball
          const marks = [...(ob.ticks || []).map((x) => [x, 'tick']), ...(ob.edges || []).map((x, k) => [x, k === ob.edges.length - 1 ? 'end' : 'turn', k])].sort((a, b) => a[0] - b[0]);
          while (S.next[i] < marks.length && ob.t + marks[S.next[i]][0] <= t) {
            const [dt, kind, k] = marks[S.next[i]++], at = ob.t + dt, b = ballAt(i, at), ok = inp.hold && (inp.aim === false || near(b[0], b[1], inp.cx, inp.cy, FOLLOW));
            S.parts[i][1]++;
            if (ok) {
              S.parts[i][0]++;
              if (kind !== 'end') { S.score += kind === 'tick' ? 10 : 30; comboUp(o, at); o.events.push(['tick', at]); hpAdd(o, 0.01); }
              const snd = kind === 'tick' ? (G.sounds && G.sounds.tick ? [G.sounds.tick] : []) : ob.es && ob.es[k + 1] ? ob.es[k + 1] : ob.hs || [];
              for (const id of snd) o.sounds.push([id, at]);
            } else if (kind !== 'end') breakCombo(o, at);
          }
          if (ob.t + ob.d <= t) {
            const [got, all] = S.parts[i], f = all ? got / all : 0;
            judge(o, i, f >= 1 ? 'great' : f >= 0.5 ? 'good' : f > 0 ? 'ok' : 'miss', ob.t + ob.d);
          }
          continue;
        }
        // a spinner: the cursor's turn around the middle while held, between its start and its end
        if (ob.k === 'p') {
          if (t >= ob.t && t0 < ob.e && inp.hold) {
            const a = Math.atan2(inp.cy - (ob.y || 0), inp.cx - (ob.x || 0)), prev = S.angle[i];
            if (prev !== null && Math.hypot(inp.cx - (ob.x || 0), inp.cy - (ob.y || 0)) > R * 0.25) {
              let d = a - prev;
              while (d > Math.PI) d -= TAU;
              while (d < -Math.PI) d += TAU;
              const turns = Math.abs(d) / TAU, before = Math.floor(S.spins[i]);
              S.spins[i] += turns; S.sa = (S.sa + (d * 180) / Math.PI + 3600) % 360;
              S.rpmLog.push([t, turns]);
              for (let k = before + 1; k <= Math.floor(S.spins[i]); k++) {
                if (k <= ob.need) S.score += 100;
                else { S.score += 1000; S.bonus[i]++; o.events.push(['bonus', t]); if (G.sounds && G.sounds.bonus) o.sounds.push([G.sounds.bonus, t]); }
              }
              if (!S.cleared[i] && S.spins[i] >= ob.need) { S.cleared[i] = true; o.events.push(['clear', t]); if (G.sounds && G.sounds.clear) o.sounds.push([G.sounds.clear, t]); }
            }
            S.angle[i] = a;
          } else if (!inp.hold) S.angle[i] = null;
          if (ob.e <= t) {
            const f = ob.need > 0 ? S.spins[i] / ob.need : 1;
            judge(o, i, f >= 1 ? 'great' : f > 0.9 ? 'good' : f > 0.75 ? 'ok' : 'miss', ob.e);
          }
        }
      }
      // (health drains while there is something to play, not in a break)
      if (t > firstT && t0 < lastEnd && !inBreak(t)) hpAdd(o, -((t - t0) / 1000) * (0.008 + 0.004 * (G.hp || 5)), t);
      if (S.failed) return;
      const k = kiaiOf(t);
      if (k >= 0 && k !== S.kiaiAt) o.events.push(['kiai', (G.kiai[k] || [t])[0]]);
      S.kiaiAt = k;
    }
    const api = {
      /** a new play from a time: everything scored afresh, what is before it left out */
      start(ms) { S = fresh(); api.seek(ms); return api; },
      /** from another time (a seek, a resume, a loop going round): what is before it left out, the score kept (the very time it
       *  is at already: nothing left out — a slider being followed stays followed) */
      seek(ms) {
        if (!S) S = fresh();
        if (ms === S.t && S.lo !== undefined) return api;
        S.t = ms; S.angle = objs.map(() => null); S.rpmLog = []; S.lo = 0;
        objs.forEach((ob, i) => {
          const end = ob.k === 's' ? ob.t + ob.d : ob.k === 'p' ? ob.e : ob.t + W.ok;
          S.done[i] = end < ms;
          if (!S.done[i] && ob.k === 's' && ob.t + W.ok < ms) { S.head[i] = 2; S.parts[i] = [0, 1]; const marks = (ob.ticks || []).length + (ob.edges || []).length; S.next[i] = [...(ob.ticks || []), ...(ob.edges || [])].filter((x) => ob.t + x <= ms).length; S.parts[i][1] += Math.min(marks, S.next[i]); }
          else if (!S.done[i]) { S.head[i] = 0; S.parts[i] = [0, 0]; S.next[i] = 0; }
        });
        S.kiaiAt = kiaiOf(ms);
        return api;
      },
      step(ms, inp0) {
        if (!S) S = fresh();
        const inp = Object.assign({ cx: S.cx, cy: S.cy, hold: 0, presses: [], aim: true }, inp0 || {}), o = out();
        S.cx = inp.cx; S.cy = inp.cy; S.hold = inp.hold ? 1 : 0;
        // (failed: nothing judged any more — the cursor still follows)
        if (S.failed) { S.t = Math.max(S.t, ms); return o; }
        // presses in time order, each after what was due before it (none once a press or what came due made the play fail)
        for (const pt of [...(inp.presses || [])].sort((a, b) => a - b)) { if (pt > ms || S.failed) continue; settle(o, S.t, Math.max(S.t, pt), inp); S.t = Math.max(S.t, pt); if (!S.failed) press(o, pt, inp.cx, inp.cy, inp.aim !== false); }
        if (!S.failed) settle(o, S.t, ms, inp);
        S.t = Math.max(S.t, ms);
        S.rpmLog = S.rpmLog.filter((x) => x[0] > ms - 1000);
        S.active = objs.findIndex((ob, i) => !S.done[i] && ob.t - (G.preempt || 1200) <= ms);
        return o;
      },
      state() {
        const total = S.n300 + S.n100 + S.n50 + S.misses, acc = total ? (300 * S.n300 + 100 * S.n100 + 50 * S.n50) / (300 * total) : 1;
        const rank = rankOf(S.n300, S.n100, S.n50, S.misses);
        const sp = objs.findIndex((ob, i) => ob.k === 'p' && S.t >= ob.t && S.t < ob.e);
        return { score: S.score, combo: S.combo, acc: Math.round(acc * 10000) / 100, hp: Math.round(S.hp * 100), cx: S.cx, cy: S.cy, hold: S.hold,
          spin: sp >= 0 && objs[sp].need > 0 ? Math.min(1, S.spins[sp] / objs[sp].need) : 0, rpm: Math.min(511, Math.round(S.rpmLog.reduce((a, x) => a + x[1], 0) * 60)), sa: S.sa,
          rank, maxcombo: S.maxcombo, misses: S.misses, n300: S.n300, n100: S.n100, n50: S.n50, failed: S.failed ? 1 : 0, failedAt: S.failedAt,
          // (a full combo so far: no miss and no break — osu!'s "perfect" stamp; done: every object judged, the play over)
          fc: S.broken ? 0 : 1, done: objs.length && S.t > lastEnd ? 1 : 0 };
      },
      /** the play fails now (a fail shown on purpose — the tour): the fail event, nothing judged after */
      fail(ms) { if (!S) S = fresh(); const o = out(); S.hp = 0; S.t = Math.max(S.t, ms); failNow(o, ms); return o; },
      /** the autoplay from where the play is up to ms, its results and sounds dropped: the score a jump would have. Every 50 ms
       *  through a slider or a spinner (the ball followed, the spinner turned), else one step to the next object — the server's
       *  script runs it within a tick (the tour's results: the whole play at once) */
      fastForward(ms) {
        if (!S) S = fresh();
        for (let t = S.t; t < ms && !S.failed;) {
          let busy = false, next = ms;
          for (let i = S.lo; i < objs.length; i++) {
            const ob = objs[i];
            if (ob.t > t) { next = Math.min(next, ob.t); if (ob.t - t > 50) break; }
            if ((ob.k === 's' && t + 50 > ob.t && t < ob.t + ob.d + 20) || (ob.k === 'p' && t + 50 > ob.t && t < ob.e)) { busy = true; break; }
          }
          const nt = busy || next <= t ? Math.min(ms, t + 50) : Math.min(ms, next);
          api.step(nt, api.autoInput(t, nt)); t = nt;
        }
        return api;
      },
      mods: [...MODS],
      /** the autoplay's input between two times: the cursor eased from where it was to the next object (on it at its time),
       *  along a slider's ball, around a spinner at 477 rpm; every press exactly on time */
      autoInput(ms0, ms) {
        const presses = [];
        for (const ob of objs) if ((ob.k === 'c' || ob.k === 's') && ob.t > ms0 && ob.t <= ms) presses.push(ob.t);
        let cx = 0, cy = 0, hold = 0;
        // (the object now: the first not over — a slider held a moment past its end, a spinner to its end)
        const i = objs.findIndex((ob) => (ob.k === 's' ? ob.t + ob.d + 20 : ob.k === 'p' ? ob.e : ob.t) >= ms);
        if (i < 0) { const l = objs[objs.length - 1]; if (l) { const e = l.k === 's' ? ballAt(objs.length - 1, l.t + l.d) : [l.x || 0, l.y || 0]; cx = e[0]; cy = e[1]; } }
        else {
          const ob = objs[i];
          if (ob.k === 's' && ms >= ob.t) { const b = ballAt(i, Math.min(ms, ob.t + ob.d)); cx = b[0]; cy = b[1]; hold = 1; }
          else if (ob.k === 'p' && ms >= ob.t) { const a = ((ms - ob.t) / 60000) * 477 * TAU; cx = (ob.x || 0) + Math.cos(a) * R * 1.6; cy = (ob.y || 0) + Math.sin(a) * R * 1.6; hold = 1; }
          else {
            // between the one before (its end) and this one: eased, there at its time
            const p = objs[i - 1], from = p ? (p.k === 's' ? ballAt(i - 1, p.t + p.d) : p.k === 'p' ? [p.x || 0, p.y || 0] : [p.x, p.y]) : [0, 0];
            const tFrom = p ? (p.k === 's' ? p.t + p.d : p.k === 'p' ? p.e : p.t) : Math.max(0, ob.t - 1000), to = ob.k === 'p' ? [(ob.x || 0) + R * 1.6, ob.y || 0] : [ob.x, ob.y];
            const f = Math.min(1, Math.max(0, (ms - tFrom) / Math.max(1, ob.t - tFrom))), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
            cx = from[0] + (to[0] - from[0]) * e; cy = from[1] + (to[1] - from[1]) * e;
            hold = presses.length ? 1 : 0;
          }
        }
        return { cx, cy, hold, presses, aim: true };
      },
      ballAt,
      rankOf,
    };
    return api;
  }

  /** the autoplay of a whole map, for the preview: every 1/fps s → { events: [{ instance (key's instance id, or null for the
   *  whole play), name, t (s) }], states: [{ … }] at i / fps, sounds: [[id, t (s)]] (its hitsounds), at(t) → the state at t } */
  function autoplay(G, { fps = 60, until, mods } = {}) {
    const g = createGame(G, { mods }).start(0), end = until !== undefined ? until : (G.objects || []).reduce((m, o) => Math.max(m, o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t), 0) + 2000;
    const events = [], states = [], sounds = [], dt = 1000 / fps, inst = (key) => String(key).split('/').pop();
    const NAMES = ['none', 'hit', 'miss', 'great', 'good', 'ok', 'early', 'drop'];
    let prev = 0;
    for (let i = 0; i * dt <= end; i++) {
      const ms = i * dt, r = g.step(ms, g.autoInput(prev, ms));
      for (const [key, code] of r.results) events.push({ instance: inst(key), name: NAMES[code], t: Math.round(ms) / 1000 });
      for (const [name, t] of r.events) events.push({ instance: null, name, t: Math.round(t) / 1000 });
      for (const [id, t] of r.sounds) sounds.push([id, Math.round(t) / 1000]);
      states.push(g.state());
      prev = ms;
    }
    return { events, states, sounds, at: (t) => states[Math.max(0, Math.min(states.length - 1, Math.round(t * fps)))] || {} };
  }

  T.osugame = { createGame, autoplay };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osugame;
})(typeof globalThis !== 'undefined' ? globalThis : this);

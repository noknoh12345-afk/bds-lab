// GeoUI timeline: plays the pack's sequences for each player (GeoUI Builder's timeline; bds-lab bds/geoui/timeline).
// /scriptevent geoui:play <sequence number or id> [from seconds] · geoui:stop · geoui:pause · geoui:resume
// geoui:seek <seconds> · geoui:offset <ms> (presses judged that much later: the lag of a device)
// Presses: jump or sneak, or using an item. Score, combo, accuracy (x100) and health go to geoui:v0 … v3.
// Markers with an event send /scriptevent geoui:marker <sequence>:<marker> <event>. Audio clips play when the time
// reaches them and stop at a pause, a seek or a stop (a sound already past at a seek or a resume stays silent).
import { world, system, ButtonState } from '@minecraft/server';

const CFG = {"ns":"geoui","windows":{"great":44,"good":92,"ok":140},"margin":250,"missDrain":8,"hitGain":2,"values":{"score":"v0","combo":"v1","accuracy":"v2","health":"v3"},"sequences":[{"index":1,"id":"osu","duration":13640,"loop":"once","inOut":null,"markers":[[13000,"end","done"]],"templates":[{"tag":"t0s","mode":"baked","lead":900,"slots":4,"events":true,"items":[[1000,0,0,1640,"o1",100,"osu-circle/o1"],[1500,1,0,2140,"o2",600,"osu-circle/o2"],[2000,2,0,2640,"o3",1100,"osu-circle/o3"],[2500,3,0,3140,"o4",1600,"osu-circle/o4"],[3000,0,0,3640,"o5",2100,"osu-circle/o5"],[3500,1,0,4140,"o6",2600,"osu-circle/o6"],[4000,2,0,4640,"o7",3100,"osu-circle/o7"],[4500,3,0,5140,"o8",3600,"osu-circle/o8"],[5000,0,0,5640,"o9",4100,"osu-circle/o9"],[5500,1,0,6140,"o10",4600,"osu-circle/o10"],[6000,2,0,6640,"o11",5100,"osu-circle/o11"],[6500,3,0,7140,"o12",5600,"osu-circle/o12"],[7000,0,0,7640,"o13",6100,"osu-circle/o13"],[12000,0,0,12640,"o16",11100,"osu-circle/o16"],[12250,1,0,12890,"o17",11350,"osu-circle/o17"],[12500,2,0,13140,"o18",11600,"osu-circle/o18"]]},{"tag":"t1s","mode":"baked","lead":900,"slots":1,"events":true,"items":[[7500,0,0,10000,"o14",6600,"osu-slider/o14"]]},{"tag":"t2s","mode":"baked","lead":300,"slots":1,"events":false,"items":[[9500,0,0,11800,"o15",9200,"osu-spinner/o15"]]}],"hits":[[1000,"t0s",0,"o1","osu-circle/o1"],[1500,"t0s",1,"o2","osu-circle/o2"],[2000,"t0s",2,"o3","osu-circle/o3"],[2500,"t0s",3,"o4","osu-circle/o4"],[3000,"t0s",0,"o5","osu-circle/o5"],[3500,"t0s",1,"o6","osu-circle/o6"],[4000,"t0s",2,"o7","osu-circle/o7"],[4500,"t0s",3,"o8","osu-circle/o8"],[5000,"t0s",0,"o9","osu-circle/o9"],[5500,"t0s",1,"o10","osu-circle/o10"],[6000,"t0s",2,"o11","osu-circle/o11"],[6500,"t0s",3,"o12","osu-circle/o12"],[7000,"t0s",0,"o13","osu-circle/o13"],[7500,"t1s",0,"o14","osu-slider/o14"],[12000,"t0s",0,"o16","osu-circle/o16"],[12250,"t0s",1,"o17","osu-circle/o17"],[12500,"t0s",2,"o18","osu-circle/o18"]],"sounds":[[0,"geoui.click",1,1]]}]};
const createEngine = function createEngine(CFG, io) {
    const P = (x) => `${CFG.ns}:${x}`, players = new Map(), HIT = 1, MISS = 2, LATE = 250, PAUSE = 1024, GEN = 2048, GENS = 8192;
    const W = CFG.windows, POINTS = { great: 300, good: 100, ok: 50 };
    const get = (p, name) => { try { return io.getProp ? io.getProp(p, name) : undefined; } catch (e) { return undefined; } };
    function stateOf(p) {
      let s = players.get(p.id);
      // (the generation goes on from the one the player has: a client that saw it already would not count again from a
      //  play that only set it to the same number — after a server restart the script begins at 0, the world keeps it)
      if (!s) { const v0 = Number(get(p, P('seq'))), g0 = Number.isFinite(v0) ? Math.floor(v0 / GEN) % GENS : 0; s = { seq: 0, gen: g0, from: 0, start: 0, paused: false, offset: 0, slots: new Map(), results: new Map(), cur: new Map(), groups: new Map(), judged: new Set(), marks: new Set(), played: new Set(), ringing: new Set(), round: 0, score: 0, combo: 0, best: 0, total: 0, earned: 0, health: 100 }; players.set(p.id, s); }
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
      const acc = s.total ? Math.round((s.earned / s.total) * 10000) : 10000;
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
    }
    /** an instance's result, to its slot's group (seen only while it is the instance in its slot) */
    function send(p, s, q, h, result) {
      s.results.set(h[4], result);
      results(p, s, q, seqTime(q, nowMs(s)), new Set([`${h[1]}e${Math.floor(h[2] / 8)}`]));
    }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    const api = {
      /** a scriptevent's verb and words for a player */
      command(p, verb, args) {
        const s = stateOf(p);
        if (verb === 'play') {
          const want = String(args[0] || '1'), q = CFG.sequences.find((x) => String(x.index) === want || x.id === want);
          if (!q) return `${CFG.ns}: no sequence ${want} (${CFG.sequences.map((x) => `${x.index}=${x.id}`).join(', ')})`;
          s.seq = q.index; s.paused = false; s.score = 0; s.combo = 0; s.best = 0; s.total = 0; s.earned = 0; s.health = 100;
          restart(p, s, Number(args[1] || 0) * 1000); values(p, s);
          return '';
        }
        if (verb === 'stop') { s.seq = 0; s.paused = false; seqProp(p, s); clearSlots(p, s); silence(p, s); return ''; }
        if (!s.seq) return `${CFG.ns}: nothing is playing`;
        if (verb === 'pause') { if (!s.paused) { s.from = Math.round(nowMs(s)); s.paused = true; set(p, P('seq_from'), s.from); seqProp(p, s); silence(p, s); } return ''; }
        if (verb === 'resume') { if (s.paused) { s.paused = false; restart(p, s, s.from); } return ''; }
        if (verb === 'seek') { restart(p, s, Number(args[0] || 0) * 1000); return ''; }
        if (verb === 'offset') { s.offset = Number(args[0] || 0) || 0; return ''; }
        return `${CFG.ns}: unknown ${verb} (play stop pause resume seek offset)`;
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
  };
const engine = createEngine(CFG, {
  tick: () => system.currentTick,
  setProp: (p, name, value) => { if (p.isValid) p.setProperty(name, value); },
  getProp: (p, name) => (p.isValid ? p.getProperty(name) : undefined),
  players: () => world.getAllPlayers(),
  event: (p, id, message) => system.sendScriptEvent(id, message),
  sound: (p, id, volume, pitch) => { if (p.isValid) p.playSound(id, { volume, pitch }); },
  stopSound: (p, id) => { if (p.isValid) p.runCommand(`stopsound @s ${id}`); },
});
// (a player who joins again counts from their own first moment: what they were playing is sent again from where it is)
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) engine.joined(e.player); }); });
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(CFG.ns.length + 1);
  if (!['play', 'stop', 'pause', 'resume', 'seek', 'offset'].includes(verb)) return;
  const words = String(e.message).trim().split(/\s+/).filter(Boolean);
  const targets = e.sourceEntity && e.sourceEntity.typeId === 'minecraft:player' ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = engine.command(p, verb, words); if (why) console.warn(why); }
}, { namespaces: [CFG.ns] });
system.runInterval(() => engine.tick(), 1);
world.afterEvents.playerButtonInput.subscribe((e) => { if (e.newButtonState === ButtonState.Pressed) engine.press(e.player); });
world.afterEvents.itemUse.subscribe((e) => engine.press(e.source));

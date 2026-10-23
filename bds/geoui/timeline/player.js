// GeoUI timeline — the player (bds/geoui/timeline/PLAN.md step 7): the preview's transport and clock. Its time is "where it
// started + the clock's time since × the rate", never a sum of frame times (a frame drawn late is late, not behind), and the
// clock is the audio's own while there is sound (WebAudio's currentTime, less its output latency: the picture follows what is
// heard — there is no drift to measure and correct). A loop over the in/out range, seeking, stepping by frames, J/K/L's rates.
// Each frame the sequence is evaluated (model.evaluate: the same values the export's Molang computes) and handed to the host to
// draw; instances' hits are the autoplay's (every instance hit on its time: what a trigger clip shows), or misses, or none.
// The audio clips play through WebAudio where they lie on the timeline (a few seconds ahead are scheduled; a seek, a pause, a
// new rate or a loop's turn start them again), each with its volume and pitch, muted / solo as their tracks.
// Frames for a video: renderFrames, and exportVideo — webm through MediaRecorder (a canvas stream, a frame requested at each
// frame's moment, the audio mixed in), or the frames as PNGs in a zip (media.zipStore).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const LOOK = 3;   // (seconds of audio scheduled ahead)

  /** the browser's clock: seconds, and its frames */
  const browserClock = () => ({
    now: () => (root.performance ? root.performance.now() : Date.now()) / 1000,
    raf: (f) => (root.requestAnimationFrame ? root.requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16)),
    caf: (id) => (root.cancelAnimationFrame ? root.cancelAnimationFrame(id) : clearTimeout(id)),
    wait: (s) => new Promise((r) => setTimeout(r, Math.max(0, s * 1000))),
  });

  /** WebAudio for the player: o.context (an AudioContext), o.buffer(id) → an AudioBuffer or null (decoding then: the player
   *  asks again next frame). Its clock is the context's; every source it starts can be stopped at once */
  function createAudio(o) {
    const ctx = o.context, live = new Set();
    let dest = ctx.destination, extra = null;
    return {
      context: ctx,
      now: () => ctx.currentTime,
      running: () => ctx.state === 'running',
      resume: () => (ctx.resume ? ctx.resume() : Promise.resolve()),
      latency: () => num(ctx.outputLatency, 0) || num(ctx.baseLatency, 0),
      buffer: (id) => o.buffer(id),
      /** also to another destination while a video is recorded (null: no longer) */
      tap(node) { extra = node || null; },
      start({ buffer, when, offset, duration, volume = 1, rate = 1 }) {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buffer; src.playbackRate.value = rate; g.gain.value = volume;
        src.connect(g); g.connect(dest); if (extra) g.connect(extra);
        src.start(Math.max(ctx.currentTime, when), Math.max(0, offset), Math.max(0.001, duration));
        live.add(src);
        src.onended = () => { live.delete(src); try { g.disconnect(); } catch (e) { /* (gone) */ } };
        return src;
      },
      stopAll() { for (const s of live) { try { s.stop(); } catch (e) { /* (not started yet or ended) */ } } live.clear(); },
      /** how many of its sources are started and not ended (scheduled ones too) */
      count: () => live.size,
      dispose() { this.stopAll(); extra = null; },
    };
  }

  /** the hits of an autoplay: every instance of a template that answers a hit (or a miss) at its own time */
  function autoEvents(seq, name = 'hit') {
    const judged = new Set((seq.templates || []).filter((tp) => tp.tracks.some((tr) => tr.clips.some((c) => c.trigger || c.until))).map((tp) => tp.id));
    return (seq.instances || []).filter((x) => judged.has(x.template)).map((x) => ({ instance: x.id, name, t: name === 'miss' ? x.t + 0.15 : x.t }));
  }

  /** the audio clips of a sequence that sound (muted tracks not; with a solo audio track, only the solo ones) */
  function audioClips(seq) {
    const tracks = (seq.tracks || []).filter((tr) => tr.kind === 'audio');
    const solo = tracks.some((tr) => tr.solo);
    const out = [];
    for (const tr of tracks) if (!tr.muted && (!solo || tr.solo)) for (const c of tr.clips) if (c.sound) out.push({ id: c.id, sound: c.sound, start: c.start, end: c.end, offset: num(c.offset), volume: num(c.volume, 1), pitch: num(c.pitch, 1) || 1 });
    return out.sort((a, b) => a.start - b.start);
  }

  /** o: { store (doc(), selection(), timeChanged()), host: { apply(states, t, seq), clear?(), capture?({ scale }) → Promise<bytes>,
   *  frameCanvas?({ scale }) → a canvas the frame is drawn into for a video }, clock (browserClock's shape), audio
   *  (createAudio's or null), events: 'hit' | 'miss' | 'none', onTime(t) } */
  function createPlayer(o = {}) {
    const store = o.store, host = o.host || { apply() {} }, base = o.clock || browserClock(), audio = o.audio || null;
    const evaluate = o.evaluate || ((d, s, t, opts) => M().evaluate(d, s, t, opts));
    const st = { playing: false, rate: 1, anchorT: 0, anchorC: 0, clock: base, latency: 0, raf: 0, loop: true, range: null, events: o.events || 'hit',
      run: 0, scheduled: new Set(), cache: { doc: null, seq: null, events: null, clips: null }, disposed: false, last: 0 };
    const seqOf = () => { const d = store.doc(), s = store.selection ? store.selection() : {}; return (d.sequences || []).find((q) => q.id === (s && s.seq)) || (d.sequences || [])[0] || null; };
    /** the sequence's events and audio clips, made again only when the document changed (an audio clip edited while playing:
     *  the sounds started again from where the time is, as they now lie) */
    function prepared() {
      const d = store.doc(), seq = seqOf();
      if (st.cache.doc !== d || st.cache.seq !== seq) {
        const clips = seq ? audioClips(seq) : [], sig = JSON.stringify(clips);
        if (st.playing && st.cache.sig !== undefined && sig !== st.cache.sig) silence();
        // (a game — osu!: osugame.js — plays itself: its events and its live states (the cursor, the score…) from its autoplay;
        //  'miss' shows it missing everything, 'none' nothing pressed)
        const game = seq && seq.game && T.osugame ? (st.events === 'hit' ? T.osugame.autoplay(seq.game, { fps: 60 }) : null) : null;
        // (and its hitsounds, where the autoplay hits: a short clip each, the sound's id in the project without the namespace)
        if (game) for (const [i, [id, t]] of game.sounds.entries()) clips.push({ id: `gs${i}`, sound: String(id).replace(/^[^.]*\./, ''), start: t, end: t + 0.8, offset: 0, volume: 0.7, pitch: 1 });
        st.cache = { doc: d, seq, events: game ? game.events : seq && st.events !== 'none' ? autoEvents(seq, st.events) : [], clips, sig, game };
      }
      return st.cache;
    }
    const rangeOf = (seq) => { if (st.range) return st.range; if (seq && seq.inOut) return seq.inOut; return [0, seq ? seq.duration : 0]; };
    const raw = () => (st.playing ? st.anchorT + Math.max(0, st.clock.now() - st.anchorC - st.latency) * st.rate : st.anchorT);
    function anchor(t) { st.anchorT = t; st.anchorC = st.clock.now(); }
    function silence() { if (audio) audio.stopAll(); st.scheduled = new Set(); st.run++; }
    /** the audio clips that start (or sound) within the next LOOK seconds of timeline time t, each once a run; whenOf(x): the
     *  audio clock's time at which timeline time x is to be heard */
    function schedule(t, rate, whenOf) {
      if (!audio || !(rate > 0)) return;
      const { clips, seq } = prepared(), [, end] = rangeOf(seq), ahead = t + LOOK * rate;
      for (const c of clips) {
        if (st.scheduled.has(c.id) || c.end <= t + 1e-6 || c.start >= ahead || c.start >= end) continue;
        const buf = audio.buffer(c.sound);
        if (!buf) continue;   // (decoding: asked again next frame, then from where the time is)
        const from = Math.max(c.start, t), until = Math.min(c.end, end);
        if (until - from <= 1e-6) continue;
        st.scheduled.add(c.id);
        audio.start({ buffer: buf, when: whenOf(from), offset: c.offset + (from - c.start) * c.pitch, duration: (until - from) * c.pitch, volume: c.volume, rate: rate * c.pitch });
      }
    }
    /** while playing: timeline time x is shown at the audio clock's anchorC + latency + (x − anchorT) / rate, so a sound for x
     *  starts at anchorC + (x − anchorT) / rate and is heard (after the output's latency) as the picture shows x */
    const playing = (t) => { if (st.playing && audio) schedule(t, st.rate, (x) => st.anchorC + (x - st.anchorT) / st.rate); };
    function render(t) {
      const seq = seqOf();
      if (!seq) { if (host.apply) host.apply({}, t, null); return; }
      const { events, game } = prepared();
      host.apply(evaluate(store.doc(), seq.id, t, { events, state: game ? game.at(t) : undefined }), t, seq);
    }
    function told(t) { st.last = t; if (o.onTime) o.onTime(t); if (store.timeChanged) store.timeChanged(); }
    function frame() {
      st.raf = 0;
      if (!st.playing || st.disposed) return;
      const seq = seqOf(), [a, b] = rangeOf(seq);
      let t = raw();
      if (st.rate > 0 && t >= b) {
        if (st.loop && b > a) { t = a + ((t - a) % (b - a)); anchor(t); silence(); }
        else { t = b; api.pause(); api.seekTo(b); return; }
      } else if (st.rate < 0 && t <= a) {
        if (st.loop && b > a) { t = b - ((a - t) % (b - a)); anchor(t); }
        else { t = a; api.pause(); api.seekTo(a); return; }
      }
      playing(t);
      render(t);
      told(t);
      st.raf = st.clock.raf(frame);
    }
    function start() {
      // (the audio's clock while there is sound to hear; the browser's otherwise)
      const useAudio = !!(audio && prepared().clips.length && st.rate > 0);
      if (useAudio && !audio.running()) audio.resume();
      st.clock = useAudio ? { now: audio.now, raf: base.raf, caf: base.caf } : base;
      st.latency = useAudio ? audio.latency() : 0;
      anchor(st.anchorT);
      if (!st.raf) st.raf = st.clock.raf(frame);
    }
    const api = {
      time: () => (st.playing ? Math.max(0, raw()) : st.anchorT),
      playing: () => st.playing,
      play() {
        if (st.playing || st.disposed) return;
        const seq = seqOf(), [a, b] = rangeOf(seq);
        // (from the start of the range when at its end — or before it)
        if (st.rate > 0 && (st.anchorT >= b - 1e-6 || st.anchorT < a)) st.anchorT = a;
        if (st.rate < 0 && st.anchorT <= a + 1e-6) st.anchorT = b;
        st.playing = true; silence(); start();
        told(st.anchorT);
      },
      pause() {
        if (!st.playing) return;
        st.anchorT = Math.max(0, raw()); st.playing = false;
        if (st.raf) { st.clock.caf(st.raf); st.raf = 0; }
        silence(); render(st.anchorT); told(st.anchorT);
      },
      toggle() { if (st.playing) api.pause(); else api.play(); },
      stop() { const was = st.playing; if (was) api.pause(); api.seekTo(rangeOf(seqOf())[0]); },
      seekTo(t) {
        const v = Math.max(0, num(t));
        if (st.playing) { anchor(v); silence(); playing(v); } else st.anchorT = v;
        render(v); told(v);
      },
      step(n = 1) { const seq = seqOf(), fps = (seq && seq.fps) || 20; if (st.playing) api.pause(); api.seekTo(Math.max(0, Math.round((st.anchorT + num(n, 1) / fps) * fps) / fps)); },
      /** J/K/L's rates: 1, 2, −1 … (a new anchor: the time goes on from where it is) */
      rate(r) { const v = num(r, 1) || 1; if (v === st.rate) return; const t = api.time(); st.rate = v; if (st.playing) { st.anchorT = t; silence(); start(); } },
      getRate: () => st.rate,
      setLoop(on) { st.loop = !!on; },
      /** the range played (and looped): [a, b] seconds, or null for the sequence's in/out (else all of it) */
      setRange(r) { st.range = Array.isArray(r) && r.length === 2 && r[1] > r[0] ? [num(r[0]), num(r[1])] : null; },
      range: () => rangeOf(seqOf()),
      setEvents(kind) { st.events = ['hit', 'miss', 'none'].includes(kind) ? kind : 'hit'; st.cache.doc = null; if (!st.playing) render(st.anchorT); },
      /** draw the time now again (the document or the sequence changed) */
      refresh() { if (!st.playing) render(st.anchorT); },
      render,
      /** every frame of [from, to) at fps drawn, each handed to each(i, t) (awaited) */
      async renderFrames({ from = 0, to, fps = 30, each, signal } = {}) {
        const seq = seqOf(), end = to !== undefined ? num(to) : rangeOf(seq)[1], n = Math.max(0, Math.ceil((end - num(from)) * fps - 1e-9));
        if (st.playing) api.pause();
        for (let i = 0; i < n; i++) {
          if (signal && signal.aborted) throw abortError();
          const t = num(from) + i / fps;
          render(t);
          if (each) await each(i, t, n);
        }
        return n;
      },
      /** a video of [from, to): { format: 'webm' | 'png-zip', fps, scale, background (webm: a colour under the screen, black when
       *  not given; null: clear — VP9 keeps the alpha), pngBackground (PNGs: clear unless given), onProgress(done, all), signal }
       *  → { data (Blob | bytes), frames, mime } */
      async exportVideo(opts = {}) {
        const fps = Math.max(1, Math.min(120, num(opts.fps, 30))), seq = seqOf(), [a, b] = rangeOf(seq);
        const from = opts.from !== undefined ? num(opts.from) : a, to = opts.to !== undefined ? num(opts.to) : b, format = opts.format || 'webm';
        if (!(to > from)) throw new Error('書き出す範囲がありません（終わりが始まりより後に）');
        const back = st.anchorT, progress = opts.onProgress || (() => {});
        try {
          if (format === 'png-zip') {
            if (!host.capture) throw new Error('この画面からはコマを取り出せません');
            const files = [];
            const n = await api.renderFrames({ from, to, fps, signal: opts.signal, each: async (i, t, all) => { files.push({ name: `frame_${String(i).padStart(5, '0')}.png`, data: await host.capture({ scale: opts.scale, background: opts.pngBackground || null }) }); progress(i + 1, all); } });
            files.push({ name: 'frames.txt', data: `GeoUI timeline: ${n} frames at ${fps} fps, ${from}–${to} s (frame_00000.png = ${from} s)\n` });
            return { data: T.media.zipStore(files), frames: n, mime: 'application/zip' };
          }
          if (format !== 'webm') throw new Error(`知らない形式: ${format}`);
          return await recordWebm({ from, to, fps, scale: opts.scale, background: opts.background === undefined ? '#000000' : opts.background, signal: opts.signal, progress });
        } finally { api.seekTo(back); }
      },
      dispose() {
        st.disposed = true; st.playing = false;
        if (st.raf) { st.clock.caf(st.raf); st.raf = 0; }
        silence(); if (audio && audio.dispose) audio.dispose();
        if (host.clear) host.clear();
      },
      state: st,
    };
    const abortError = () => { const e = new Error('書き出しをやめました'); e.name = 'AbortError'; return e; };
    /** webm: a canvas the host draws each frame into, its stream with a frame requested at each frame's moment (real time: a
     *  video player shows them as they were made), the audio clips played into it as they lie */
    async function recordWebm({ from, to, fps, scale, background, signal, progress }) {
      const R = root.MediaRecorder;
      if (!R || !host.frameCanvas) throw new Error('この環境では webm を作れません（MediaRecorder がありません）: PNG の連番（zip）で書き出してください');
      const cv = host.frameCanvas({ scale }), stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
      let mixed = null, hum = null;
      const { clips } = prepared();
      if (audio && clips.length && audio.context.createMediaStreamDestination) {
        mixed = audio.context.createMediaStreamDestination(); audio.tap(mixed);
        // (a silent source into it from the start: a destination with nothing playing gives the recorder no audio, and it then
        //  keeps every video frame waiting for some — the file would hold nothing)
        if (audio.context.createConstantSource) { const c = audio.context.createConstantSource(), g = audio.context.createGain(); g.gain.value = 0; c.connect(g); g.connect(mixed); c.start(); hum = c; }
        for (const t of mixed.stream.getAudioTracks()) stream.addTrack(t);
      }
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => !R.isTypeSupported || R.isTypeSupported(m)) || 'video/webm';
      const rec = new R(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const done = new Promise((ok) => { rec.onstop = ok; });
      const n = Math.max(1, Math.ceil((to - from) * fps - 1e-9));
      if (st.playing) api.pause();
      // (the frames on the browser's clock — the recorder stamps a video frame with the moment it is requested — and the audio
      //  as when playing from `from` at rate 1 on the audio clock, from the same moment: what the recorder takes in is not delayed
      //  by the speakers' latency, so timeline time x is heard at ta + (x − from). Not the audio clock for the frames: with no
      //  sound device — a headless browser — it may run faster than the wall, and the recorder then gets nothing in order)
      const useAudio = !!mixed, sleep = (s) => (base.wait ? base.wait(s) : new Promise((r) => setTimeout(r, s * 1000)));
      if (useAudio && !audio.running()) await audio.resume();
      // (every sound decoded before: one still decoding would be missing from the file — 3 s at most)
      if (useAudio) { const ids = [...new Set(clips.map((c) => c.sound))]; for (let k = 0; k < 60 && ids.some((id) => !audio.buffer(id)); k++) await sleep(0.05); }
      // (the first frame drawn once before: its shaders compiled, its canvases made — a first frame that comes late to a recorder
      //  just started left a file with nothing in it; and the recorder given a moment to start before the frames come)
      render(from);
      if (host.drawFrame) host.drawFrame(cv, { scale, background });
      silence();
      rec.start(1000);
      await sleep(0.2);
      const clock = base, t0 = clock.now() + 0.05, ta = useAudio ? audio.now() + 0.05 : 0, whenOf = (x) => ta + (x - from);
      try {
        for (let i = 0; i < n; i++) {
          if (signal && signal.aborted) throw abortError();
          const t = from + i / fps;
          if (useAudio && i % Math.max(1, Math.round(fps)) === 0) schedule(t, 1, whenOf);
          const due = t0 + i / fps, wait = due - clock.now();
          if (wait > 0) await sleep(wait);
          render(t);
          if (host.drawFrame) host.drawFrame(cv, { scale, background });
          if (track.requestFrame) track.requestFrame();
          progress(i + 1, n);
        }
        // (the last frame's own time, and a little more: the encoder still has frames in hand when the last one is asked)
        const tail = t0 + n / fps - clock.now() + Math.max(0.3, 2 / fps);
        if (tail > 0) await sleep(tail);
      } finally {
        if (rec.state !== 'inactive') rec.stop();
        await done;
        silence(); if (audio) audio.tap(null);
        if (hum) { try { hum.stop(); hum.disconnect(); } catch (e) { /* (ended) */ } }
        for (const t of stream.getTracks()) t.stop();
      }
      return { data: new root.Blob(parts, { type: mime.split(';')[0] }), frames: n, mime: mime.split(';')[0] };
    }
    return api;
  }

  T.player = { createPlayer, createAudio, browserClock, autoEvents, audioClips, LOOK };
  if (typeof module === 'object' && module && module.exports) module.exports = T.player;
})(typeof globalThis !== 'undefined' ? globalThis : this);

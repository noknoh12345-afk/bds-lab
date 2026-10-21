// GeoUI timeline — presets (pure): the moves a video editor offers ready-made, and a rhythm game's, as fragments of a
// sequence ({ tracks, markers }, times from 0) for the intent preset.apply (placed at the playhead). Each on one element.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const k = (t, v, ease) => (ease ? { t, v, ease } : { t, v });
  const clip = (start, end, extra) => Object.assign({ start, end, channels: {} }, extra);
  const one = (o, name, clips) => ({ tracks: [{ kind: 'layer', target: String(o.target || ''), name: `${name}${o.target ? `: ${o.target}` : ''}`, clips }], markers: [] });

  const PRESETS = [
    { id: 'title', name: 'タイトル', about: 'フェードイン・少し寄る・保つ・フェードアウト', options: { duration: 3, fade: 0.4 },
      make: (o) => one(o, 'タイトル', [clip(0, o.duration, { transitionIn: { kind: 'fade', duration: o.fade, ease: 'quad-out' }, transitionOut: { kind: 'fade', duration: o.fade, ease: 'quad-in' },
        channels: { scaleX: [k(0, 0.95, 'cubic-out'), k(o.duration, 1)], scaleY: [k(0, 0.95, 'cubic-out'), k(o.duration, 1)] } })]) },
    { id: 'lower-third', name: '名前のテロップ', about: '左から滑り込み、保ち、左へ出る', options: { duration: 4, slide: 0.45 },
      make: (o) => one(o, '名前のテロップ', [clip(0, o.duration, { transitionIn: { kind: 'slide-left', duration: o.slide, ease: 'cubic-out' }, transitionOut: { kind: 'slide-left', duration: o.slide, ease: 'cubic-in' } })]) },
    { id: 'score-pop', name: '点数のポップ', about: '値を数え上げ、ポンと出る（数字の要素）', options: { duration: 1.5, from: 0, to: 1000, count: 0.8 },
      make: (o) => one(o, '点数のポップ', [clip(0, o.duration, { transitionIn: { kind: 'pop', duration: 0.3, ease: 'linear' }, channels: { value: [k(0, o.from, 'quad-out'), k(o.count, o.to)] } })]) },
    { id: 'countdown', name: 'カウントダウン', about: '3・2・1（数字の要素。1 つずつ寄って消える）', options: { from: 3, step: 1 },
      make: (o) => one(o, 'カウントダウン', Array.from({ length: Math.max(1, Math.round(o.from)) }, (_, i) => clip(i * o.step, (i + 1) * o.step, {
        channels: { value: [k(0, Math.round(o.from) - i)], scaleX: [k(0, 1.6, 'back-out'), k(o.step * 0.4, 1)], scaleY: [k(0, 1.6, 'back-out'), k(o.step * 0.4, 1)], opacity: [k(0, 1), k(o.step * 0.75, 1, 'quad-in'), k(o.step, 0)] } }))) },
    { id: 'toast', name: '通知', about: '上から出て、少し保ち、消える', options: { duration: 2.5 },
      make: (o) => one(o, '通知', [clip(0, o.duration, { transitionIn: { kind: 'slide-up', duration: 0.35, ease: 'back-out' }, transitionOut: { kind: 'fade', duration: 0.4, ease: 'linear' } })]) },
    { id: 'progress', name: '進むゲージ', about: 'ゲージを 0 から 1 へ（ゲージの要素）', options: { duration: 3, ease: 'linear' },
      make: (o) => one(o, '進むゲージ', [clip(0, o.duration, { channels: { fill: [k(0, 0, o.ease), k(o.duration, 1)] } })]) },
    { id: 'blink', name: '点滅', about: '一定の間隔で消えては出る', options: { duration: 2, period: 0.5 },
      make: (o) => one(o, '点滅', [clip(0, o.duration, { channels: { opacity: Array.from({ length: Math.max(1, Math.ceil(o.duration / (o.period / 2))) }, (_, i) => k((i * o.period) / 2, i % 2 ? 0 : 1, 'step')) } })]) },
    { id: 'shake', name: '揺れ', about: '左右に揺れて収まる', options: { duration: 0.6, amplitude: 4, times: 6 },
      make: (o) => one(o, '揺れ', [clip(0, o.duration, { channels: { x: [...Array.from({ length: o.times }, (_, i) => k((i * o.duration) / o.times, (i % 2 ? -1 : 1) * o.amplitude * (1 - i / o.times), 'sine-inout')), k(o.duration, 0)] } })]) },
    { id: 'hit-burst', name: 'ヒットの弾け', about: '広がりながら消える（当たった時に: trigger hit）', options: { duration: 0.3, scale: 1.5, trigger: 'hit' },
      make: (o) => one(o, 'ヒットの弾け', [clip(0, o.duration, Object.assign(o.trigger ? { trigger: o.trigger } : {}, { channels: { scaleX: [k(0, 1, 'quad-out'), k(o.duration, o.scale)], scaleY: [k(0, 1, 'quad-out'), k(o.duration, o.scale)], opacity: [k(0, 1, 'quad-in'), k(o.duration, 0)] } }))]) },
    { id: 'combo-pop', name: 'コンボのポップ', about: '大きく出て元の大きさへ（数字の要素）', options: { duration: 0.25, scale: 1.3 },
      make: (o) => one(o, 'コンボのポップ', [clip(0, o.duration, { channels: { scaleX: [k(0, o.scale, 'back-out'), k(o.duration, 1)], scaleY: [k(0, o.scale, 'back-out'), k(o.duration, 1)] } })]) },
    { id: 'judgement', name: '判定の文字', about: '少し上がりながら消える（300・100・50・miss）', options: { duration: 0.6, rise: 8 },
      make: (o) => one(o, '判定の文字', [clip(0, o.duration, { channels: { y: [k(0, 0, 'quad-out'), k(o.duration, o.rise)], opacity: [k(0, 1), k(o.duration * 0.5, 1, 'quad-in'), k(o.duration, 0)] } })]) },
  ];
  const byId = new Map(PRESETS.map((p) => [p.id, p]));
  /** the presets: [{ id, name, about, options }] (options: their defaults) */
  const presetList = () => PRESETS.map(({ make: _m, ...p }) => ({ ...p, options: { ...p.options } }));
  /** a preset made for an element → the fragment preset.apply takes. opts: target (the element's name) and the preset's options */
  function makePreset(id, opts = {}) {
    const p = byId.get(id);
    if (!p) throw new Error(`プリセット「${id}」はありません（${PRESETS.map((x) => x.id).join('・')}）`);
    const o = { target: opts.target };
    for (const [key, d] of Object.entries(p.options)) o[key] = typeof d === 'number' ? Math.max(0, num(opts[key], d)) : opts[key] !== undefined ? opts[key] : d;
    if ('duration' in o) o.duration = Math.max(0.05, o.duration);
    return p.make(o);
  }

  T.presets = { presetList, makePreset };
  if (typeof module === 'object' && module && module.exports) module.exports = T.presets;
})(typeof globalThis !== 'undefined' ? globalThis : this);

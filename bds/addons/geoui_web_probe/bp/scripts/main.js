// GeoUI Web probe (bds-lab: bds/geoui/web/probe.mjs makes this file — change that, not this).
// /scriptevent gwp:<verb> — info · url <slot> <URL | /path (the service's own) | ~/path (through its tunnel) | -> · f1 0|1|touch ·
// layout <letter|-> · show <bits> · stay <ticks> [refresh ticks] · raw <title> · reset · mark · lat <slot> <URL…> · count <URL…> ·
// readout <k> <n> · cycle <n> <ticks> <slot> (n different pictures) · part api|flag|arm 0|1 (F1's parts alone) ·
// frames <n> <ticks> <buffered 0|1> <ms> (a browser's pictures) — every answer is a line GWP … in the server's log
import { world, system, HudElement, HudVisibility } from '@minecraft/server';
import { http, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import './screen_channel.js';
const NS = 'gwp', SVC = 'http://127.0.0.1:8787';
const log = (s) => console.warn('GWP ' + s);
let svc = null, stay = 600, mark = 0, seq = 0;
const io = {
  title: (p, t) => p.onScreenDisplay.setTitle(t, { stayDuration: stay, fadeInDuration: 0, fadeOutDuration: 0 }),
  prop: (p, k, v) => p.setProperty(k, v),
  hideHud: (p, keep) => { const before = p.onScreenDisplay.getHiddenHudElements(); p.onScreenDisplay.hideAllExcept(keep.map((k) => HudElement[k]).filter((v) => v !== undefined)); return before; },
  restoreHud: (p, before) => { p.onScreenDisplay.resetHudElementsVisibility(); if (before && before.length) p.onScreenDisplay.setHudVisibility(HudVisibility.Hide, before); },
};
const ch = globalThis.GeoUIScreen.channel.create({ ns: NS, slots: 6, width: 160, refreshTicks: 0 }, io);
const players = () => world.getAllPlayers();
async function getJson(p) {
  const r = await http.request(new HttpRequest(SVC + p).setMethod(HttpRequestMethod.Get).setTimeout(10));
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  return JSON.parse(r.body);
}
async function info() { try { svc = await getJson('/info'); return svc; } catch (e) { log('INFO FAIL ' + e); return null; } }
/** a URL as given: /path — the service's own (its address for the game), ~/path — through its tunnel, - — none */
async function full(u) {
  if (!u || u === '-') return '';
  if (!svc && (u.startsWith('/') || u.startsWith('~/'))) await info();
  if (u.startsWith('~/')) { if (!svc || !svc.tunnel) { log('NO TUNNEL'); return ''; } return svc.tunnel + u.slice(1); }
  if (u.startsWith('/')) return svc ? svc.public + u : '';
  return u;
}
const readout = (k, v) => { for (const p of players()) { try { p.setProperty(NS + ':r' + k, Math.max(0, Math.min(100000, Math.round(v)))); } catch (e) { log('readout ' + e); } } };
async function hitsSince(t) { const h = await getJson('/hits?since=' + (t - 1)); return h.hits || []; }
async function setUrl(slot, u) { const f = await full(u); for (const p of players()) ch.url(p, slot, f); log('URL slot=' + slot + ' ' + (f || '-')); return f; }
async function verb(v, a) {
  switch (v) {
    case 'info': {
      const i = await info();
      if (i) log('INFO public=' + i.public + ' tunnel=' + (i.tunnel || '-') + ' fonts=' + i.fonts + ' version=' + i.version);
      log('CHECK svc ' + (i ? 'PASS' : 'FAIL'));
      return;
    }
    case 'url': return void await setUrl(Number(a[0]) || 0, a[1]);
    case 'urls': { const list = {}; for (const w of a) { const m = /^(\d)=(.*)$/.exec(w); if (m) list[m[1]] = await full(m[2]); } for (const p of players()) ch.urls(p, list); log('URLS ' + JSON.stringify(list)); return; }
    case 'f1': { for (const p of players()) ch.f1(p, a[0] !== '0', a[0] === 'touch' ? { keep: ['TouchControls'] } : undefined); log('F1 ' + a[0]); return; }
    case 'layout': { for (const p of players()) ch.layout(p, a[0] && a[0] !== '-' ? a[0] : ''); log('LAYOUT ' + (a[0] || '-')); return; }
    case 'show': { for (const p of players()) p.setProperty(NS + ':show', Number(a[0]) || 0); return; }
    case 'stay': { stay = Math.max(1, Number(a[0]) || 600); ch.cfg.refreshTicks = Math.max(0, Number(a[1]) || 0); log('STAY ' + stay + ' refresh ' + ch.cfg.refreshTicks); for (const p of players()) { const t = ch.text(p); if (t.trim().length > 6) io.title(p, t); } return; }
    case 'raw': { for (const p of players()) p.onScreenDisplay.setTitle(a.join(' '), { stayDuration: 200, fadeInDuration: 0, fadeOutDuration: 0 }); return; }
    case 'reset': { for (const p of players()) { ch.reset(p); p.setProperty(NS + ':show', 0); } for (const k of [0, 1, 2]) readout(k, 0); stay = 600; ch.cfg.refreshTicks = 0; log('RESET'); return; }
    case 'mark': { mark = Date.now(); for (const k of [0, 1, 2]) readout(k, 0); log('MARK'); return; }
    case 'readout': return void readout(Number(a[0]) || 0, Number(a[1]) || 0);
    case 'lat': {
      // (the time from the title's change to the game's fetch of that picture: the service writes down each fetch)
      const slot = Number(a[0]) || 0, f = (await full(a[1])) + ((a[1] || '').includes('?') ? '&' : '?') + 'lat=' + (++seq), want = f.replace(/^https?:\/\/[^/]+/, '');
      const t0 = Date.now();
      for (const p of players()) ch.url(p, slot, f);
      for (let i = 0; i < 100; i++) {
        await system.waitTicks(4);
        let hit = null;
        try { hit = (await hitsSince(t0)).find((h) => h.path === want); } catch (e) { log('hits ' + e); }
        if (hit) { const ms = hit.t - t0; readout(0, ms / 10); log('LAT ms=' + ms + ' path=' + want); log('CHECK lat ' + (ms < 3000 ? 'PASS' : 'FAIL') + ' ms=' + ms); return; }
      }
      readout(0, 0); log('LAT timeout path=' + want); log('CHECK lat FAIL timeout');
      return;
    }
    case 'count': {
      const f = await full(a[0]), want = f.replace(/^https?:\/\/[^/]+/, '');
      let n = -1;
      try { n = (await hitsSince(mark)).filter((h) => h.path === want).length; } catch (e) { log('hits ' + e); }
      readout(1, n * 20); log('COUNT n=' + n + ' path=' + want);
      return;
    }
    case 'cycle': {
      const n = Math.max(1, Math.min(200, Number(a[0]) || 10)), every = Math.max(1, Number(a[1]) || 10), slot = Number(a[2]) || 0, t0 = Date.now();
      const HUES = ['ff0000', 'ff8000', 'ffff00', '80ff00', '00ff00', '00ff80', '00ffff', '0080ff', '0000ff', '8000ff', 'ff0080'];
      for (let i = 0; i < n; i++) { await setUrl(slot, '/solid/' + HUES[i % HUES.length] + '/64x64.png?cyc=' + (++seq)); await system.waitTicks(every); }
      let got = -1;
      try { got = (await hitsSince(t0)).filter((h) => h.path.includes('cyc=')).length; } catch (e) { log('hits ' + e); }
      readout(2, got * 10); log('CYCLE n=' + n + ' fetched=' + got);
      return;
    }
    case 'part': {
      // (F1's three parts one at a time: api — the HUD's elements; flag — the channel's F1 flag (root_panel); arm — the property)
      const on = a[1] === '1';
      for (const p of players()) {
        if (a[0] === 'api') { if (on) p.onScreenDisplay.hideAllExcept([]); else p.onScreenDisplay.resetHudElementsVisibility(); }
        else if (a[0] === 'flag') io.title(p, on ? '~gu~1a' : '~gu~0a');
        else if (a[0] === 'arm') p.setProperty(NS + ':f1', on ? 1 : 0);
      }
      log('PART ' + a.join(' '));
      return;
    }
    case 'frames': {
      // (a browser's pictures: n new ones, one every few ticks, each fetched slowly (ms) — with the two layers (the shown one put
      //  under, the new one on top two ticks later) or without)
      const n = Math.max(1, Math.min(200, Number(a[0]) || 20)), every = Math.max(1, Number(a[1]) || 5), buffered = a[2] !== '0', ms = Math.max(0, Number(a[3]) || 0);
      const HUES = ['ff0000', 'ff8000', 'ffff00', '80ff00', '00ff00', '00ff80', '00ffff', '0080ff', '0000ff', '8000ff', 'ff0080'];
      let shown = '';
      for (let i = 0; i < n; i++) {
        const u = await full((ms ? '/slow/' + ms : '') + '/solid/' + HUES[i % HUES.length] + '/64x64.png?fr=' + (++seq));
        if (buffered && shown) { for (const p of players()) ch.url(p, 5, shown); await system.waitTicks(2); }
        for (const p of players()) ch.url(p, 0, u);
        shown = u;
        await system.waitTicks(Math.max(1, every - (buffered ? 2 : 0)));
      }
      log('FRAMES n=' + n + ' buffered=' + buffered + ' ms=' + ms);
      return;
    }
    default: log('unknown verb ' + v);
  }
}
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const v = e.id.slice(NS.length + 1), a = String(e.message || '').trim().split(/\s+/).filter(Boolean);
  verb(v, a).catch((x) => log('ERROR ' + v + ' ' + x));
}, { namespaces: [NS] });
system.runInterval(() => ch.tick(system.currentTick), 1);
world.afterEvents.playerLeave.subscribe((e) => ch.drop({ id: e.playerId }));

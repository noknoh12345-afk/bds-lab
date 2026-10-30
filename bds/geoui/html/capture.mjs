// HTML → GeoUI, step 1: the page as a real browser draws it (Chromium through Playwright). The page is laid out at its design
// size (the size it was made for: <body data-geoui-design="1280x720"> or --design), and for every page of it (a section with
// data-geoui-page; the rest is on every page) the lab takes:
//   base      everything that does not move — the page without its controls and dynamic parts, on a clear background (the
//             page's own background colour is drawn as a plane of its own, past the design box to the screen's edges)
//   controls  each control alone (everything else hidden), in each of its states — normal, hover, focus, active, and checked /
//             selected for the ones that have it — forced with the DevTools protocol (CSS.forcePseudoState), as the page's own
//             CSS draws them
//   frames    a slider or a progress bar at 11 values (min … max) — a slider both as it is and focused (its focus picture
//             alone would show the first value's thumb) —, a number's digits 0–9 at each of its places
// and every control's box, kind, action and group (what nav.js moves the focus over). Nothing is guessed from the CSS: the
// browser draws it, the lab cuts it out. The capture is a folder (capture.json + PNGs) the rest reads with no browser:
//   node bds/geoui/html/capture.mjs <page.html | https://…> <out folder> [--design 1280x720] [--dpr 2] [--max-controls n]
// Any site works as well (a URL: its scripts run, the capture waits for the network to be quiet): the controls taken are the
// ones in the design box, at most --max-controls (120 for a URL) — the rest stay in the base picture, drawn as they are. A site
// that changes by itself is a picture of one moment here: for the live site, GeoUI Web (bds/geoui/web) shows it as it is.
// Needs Playwright and a Chromium: GEOUI_NODE_MODULES (default /opt/npm-tools/node_modules) and CHROMIUM (default
// /opt/pw-browsers/chromium), the same two bds/geoui/bbpage.mjs uses — else the ones GeoUI Web finds (web/engine.mjs).
/* global document, getComputedStyle */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CONTROL = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role=button], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=slider], [role=link], [role=menuitem], [role=option], [data-geoui-action], [data-geoui-slot], [data-geoui-slider], [data-geoui-focus]';
export const DYNAMIC = '[data-geoui-value], progress, meter, [data-geoui-gauge], [data-geoui-show]';
const STATES = { normal: [], hover: ['hover'], focus: ['focus', 'focus-visible', 'focus-within'], active: ['active', 'hover', 'focus', 'focus-visible', 'focus-within'] };
const FRAMES = 11;

function browserDeps() {
  const nm = process.env.GEOUI_NODE_MODULES || '/opt/npm-tools/node_modules', req = createRequire(path.join(nm, 'x.js'));
  let pw;
  try { pw = req('playwright-core'); } catch { try { pw = req('playwright'); } catch { throw new Error(`Playwright がありません（GEOUI_NODE_MODULES=${nm}）`); } }
  const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
  if (!fs.existsSync(exe)) throw new Error(`Chromium がありません（CHROMIUM=${exe}）`);
  return { chromium: pw.chromium, exe };
}

/** what the page says about itself, read in the browser: its design size, pages, controls and dynamic parts */
function analyse(SEL) {
  const ctl = new Set([...document.querySelectorAll(SEL.control)].filter((e) => !e.closest('[data-geoui-ignore]')));
  // (a control inside a control is part of it: a label's text, an icon in a button)
  for (const e of [...ctl]) { let p = e.parentElement; while (p) { if (ctl.has(p)) { ctl.delete(e); break; } p = p.parentElement; } }
  const dyn = [...document.querySelectorAll(SEL.dynamic)].filter((e) => !ctl.has(e) && ![...ctl].some((c) => c.contains(e)));
  const pages = [...document.querySelectorAll('[data-geoui-page]')].map((e) => e.getAttribute('data-geoui-page'));
  const pageOf = (e) => { const p = e.closest('[data-geoui-page]'); return p ? p.getAttribute('data-geoui-page') : null; };
  const kindOf = (e) => {
    const t = e.tagName.toLowerCase(), type = (e.getAttribute('type') || '').toLowerCase(), role = e.getAttribute('role') || '';
    if (e.hasAttribute('data-geoui-slider') || role === 'slider' || (t === 'input' && type === 'range')) return 'slider';
    if ((t === 'input' && type === 'checkbox') || role === 'checkbox' || role === 'switch') return 'checkbox';
    if ((t === 'input' && type === 'radio') || role === 'radio') return 'radio';
    if (role === 'tab') return 'tab';
    if (t === 'input' && ['text', 'search', 'email', 'number', 'password', 'url', ''].includes(type) || t === 'textarea') return 'text';
    if (t === 'select') return 'select';
    if (t === 'a') return 'link';
    return 'button';
  };
  const groupOf = (e) => { const g = e.closest('[data-geoui-group]'); if (g) return g.getAttribute('data-geoui-group'); const p = e.parentElement; return p && p !== document.body ? `auto:${[...document.querySelectorAll('*')].indexOf(p)}` : null; };
  const out = { pages, controls: [], dynamic: [] };
  [...ctl].forEach((e, i) => {
    e.setAttribute('data-geoui-idx', `c${i}`);
    const kind = kindOf(e), r = e.getBoundingClientRect();
    const href = e.getAttribute('href') || '';
    let action = e.getAttribute('data-geoui-action') || '';
    if (!action && href.startsWith('#') && href.length > 1 && pages.includes(href.slice(1))) action = `page:${href.slice(1)}`;
    if (!action && kind === 'tab' && e.getAttribute('aria-controls') && pages.includes(e.getAttribute('aria-controls'))) action = `page:${e.getAttribute('aria-controls')}`;
    const checked = kind === 'checkbox' || kind === 'radio' ? Boolean(e.checked || e.getAttribute('aria-checked') === 'true' || e.hasAttribute('data-geoui-checked'))
      : kind === 'tab' ? e.getAttribute('aria-selected') === 'true' || e.hasAttribute('data-geoui-checked') : null;
    const num = (a, d) => { const v = Number(e.getAttribute(a)); return Number.isFinite(v) && e.hasAttribute(a) ? v : d; };
    out.controls.push({
      key: `c${i}`, id: e.id || null, kind, page: pageOf(e), rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      action, slot: num('data-geoui-slot', null), group: groupOf(e), name: e.getAttribute('name') || e.getAttribute('data-geoui-radio') || null,
      checked, disabled: Boolean(e.disabled || e.getAttribute('aria-disabled') === 'true'),
      min: num('min', 0), max: num('max', 100), step: num('step', 1), value: kind === 'slider' ? Number(e.value ?? num('data-geoui-initial', 0)) || 0 : null,
      prop: e.getAttribute('data-geoui-value') || e.getAttribute('data-geoui-name') || null,
      label: (e.getAttribute('aria-label') || e.textContent || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    });
  });
  dyn.forEach((e, i) => {
    e.setAttribute('data-geoui-idx', `d${i}`);
    const t = e.tagName.toLowerCase(), r = e.getBoundingClientRect();
    const kind = e.hasAttribute('data-geoui-value') ? 'number' : e.hasAttribute('data-geoui-show') ? 'show' : 'gauge';
    const num = (a, d) => { const v = Number(e.getAttribute(a)); return Number.isFinite(v) && e.hasAttribute(a) ? v : d; };
    out.dynamic.push({
      key: `d${i}`, kind, page: pageOf(e), rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      prop: e.getAttribute('data-geoui-value') || e.getAttribute('data-geoui-gauge') || e.getAttribute('data-geoui-show') || e.id || `${t}${i}`,
      min: t === 'progress' ? 0 : num('min', 0), max: num('max', t === 'progress' ? 1 : 100), value: Number(e.value ?? e.getAttribute('value') ?? 0) || 0,
      digits: kind === 'number' ? (num('data-geoui-digits', null) ?? Math.max(1, (e.textContent || '').trim().length)) : null,
      text: kind === 'number' ? (e.textContent || '').trim() : null,
    });
  });
  const cs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body);
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  out.background = { color: !clear(bs.backgroundColor) ? bs.backgroundColor : !clear(cs.backgroundColor) ? cs.backgroundColor : 'rgb(0, 0, 0)', image: bs.backgroundImage !== 'none' || cs.backgroundImage !== 'none' };
  out.title = document.title || '';
  out.design = document.body.getAttribute('data-geoui-design') || null;
  out.start = document.body.getAttribute('data-geoui-start') || null;
  return out;
}

const CSS = `
* { transition: none !important; animation: none !important; caret-color: transparent !important; }
[data-geoui-page]:not(.geoui-page-on) { display: none !important; }
html.geoui-clear, html.geoui-clear body { background: transparent !important; }
html.geoui-base [data-geoui-idx] { visibility: hidden !important; }
html.geoui-solo * { visibility: hidden !important; }
html.geoui-solo .geoui-on, html.geoui-solo .geoui-on * { visibility: visible !important; }
`;

/** the browser: the configured Playwright and Chromium, else the ones GeoUI Web finds (its loader tries the machine's Chrome too) */
async function launch() {
  try {
    const { chromium, exe } = browserDeps();
    return await chromium.launch({ executablePath: exe, args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu'] });
  } catch (e) {
    const { loadBrowser } = await import('../web/engine.mjs');
    return (await loadBrowser()).browser;
  }
}
const isUrl = (s) => /^https?:\/\//i.test(String(s));
/** a page by its file or URL (a URL: until the network is quiet, at most 30 s) */
async function open(page, src) {
  if (!isUrl(src)) return page.goto(pathToFileURL(path.resolve(src)).href);
  await page.goto(src, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => { await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {}); });
  return null;
}

/** capture a page (a file or a URL) into dir: capture.json and the PNGs it names */
export async function capture(htmlFile, dir, opts = {}) {
  const browser = await launch();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const dpr = Number(opts.dpr) || 2;
    // the design size: the option, else the page's own, else 1280 x 720
    const probe = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await open(probe, htmlFile);
    const said = await probe.evaluate(() => document.body.getAttribute('data-geoui-design'));
    await probe.close();
    const [Dw, Dh] = String(opts.design || said || '1280x720').split('x').map(Number);
    const page = await browser.newPage({ viewport: { width: Dw, height: Dh }, deviceScaleFactor: dpr });
    await open(page, htmlFile);
    await page.addStyleTag({ content: CSS });
    await page.evaluate(async () => { await document.fonts.ready; });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const first = await page.evaluate(() => [...document.querySelectorAll('[data-geoui-page]')].map((e) => e.getAttribute('data-geoui-page')));
    const pages = first.length ? first : [null];
    const out = { version: 1, source: isUrl(htmlFile) ? String(htmlFile) : path.basename(htmlFile), design: { w: Dw, h: Dh }, dpr, pages: [], controls: [], dynamic: [], background: null, title: '' };
    // (a site's controls: the ones in the design box, at most maxControls — the others drawn in the base as they are)
    const maxControls = Number(opts.maxControls) || (isUrl(htmlFile) ? 120 : Infinity);
    const shot = async (name, clip) => {
      const buf = await page.screenshot({ clip, omitBackground: true, type: 'png' });
      fs.writeFileSync(path.join(dir, name), buf);
      return name;
    };
    const setPage = (id) => page.evaluate((p) => { for (const e of document.querySelectorAll('[data-geoui-page]')) e.classList.toggle('geoui-page-on', e.getAttribute('data-geoui-page') === p); }, id);
    const html = (cls, on) => page.evaluate(([c, o]) => document.documentElement.classList.toggle(c, o), [cls, on]);
    const nodeOf = async (key) => { const { root } = await cdp.send('DOM.getDocument', { depth: -1 }); return (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-geoui-idx="${key}"]` })).nodeId; };
    const seen = new Set();
    for (const pid of pages) {
      await setPage(pid);
      const a = await page.evaluate(analyse, { control: CONTROL, dynamic: DYNAMIC });
      const inBox = (r) => r.w > 1 && r.h > 1 && r.x < Dw && r.y < Dh && r.x + r.w > 0 && r.y + r.h > 0;
      const kept = a.controls.filter((c) => inBox(c.rect)).slice(0, maxControls), keep = new Set([...kept.map((c) => c.key), ...a.dynamic.map((d) => d.key)]);
      if (kept.length < a.controls.length) {
        await page.evaluate((k) => { for (const e of document.querySelectorAll('[data-geoui-idx]')) if (!k.includes(e.getAttribute('data-geoui-idx'))) e.removeAttribute('data-geoui-idx'); }, [...keep]);
        out.dropped = (out.dropped || 0) + a.controls.length - kept.length;
        a.controls = kept;
      }
      out.background = out.background || a.background; out.title = out.title || a.title; out.start = out.start || a.start;
      // the base: no controls, no dynamic parts, no background colour
      await html('geoui-clear', true); await html('geoui-base', true);
      const base = await shot(`base-${pid ?? 'main'}.png`, { x: 0, y: 0, width: Dw, height: Dh });
      await html('geoui-base', false);
      out.pages.push({ id: pid, base });
      // each control of this page (and those on every page, once), alone, in each state
      await html('geoui-solo', true);
      for (const c of a.controls) {
        const own = c.page === pid || (c.page === null && !seen.has(c.key));
        if (!own) continue;
        seen.add(c.key);
        const m = 6, clip = { x: Math.max(0, Math.floor(c.rect.x - m)), y: Math.max(0, Math.floor(c.rect.y - m)) };
        clip.width = Math.min(Dw, Math.ceil(c.rect.x + c.rect.w + m)) - clip.x; clip.height = Math.min(Dh, Math.ceil(c.rect.y + c.rect.h + m)) - clip.y;
        if (clip.width <= 0 || clip.height <= 0) continue;
        await page.evaluate((k) => document.querySelector(`[data-geoui-idx="${k}"]`).classList.add('geoui-on'), c.key);
        const nodeId = await nodeOf(c.key);
        c.clip = clip; c.states = {};
        const variants = c.checked === null ? [false] : [false, true];
        for (const chk of variants) {
          if (c.checked !== null) await page.evaluate(([k, v]) => { const e = document.querySelector(`[data-geoui-idx="${k}"]`); if ('checked' in e && (e.type === 'checkbox' || e.type === 'radio')) e.checked = v; if (e.getAttribute('role') === 'tab') e.setAttribute('aria-selected', String(v)); else if (e.hasAttribute('aria-checked')) e.setAttribute('aria-checked', String(v)); e.toggleAttribute('data-geoui-checked', v); }, [c.key, chk]);
          for (const [st, forced] of Object.entries(STATES)) {
            if (c.disabled && st !== 'normal') continue;
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced });
            c.states[`${st}${chk ? '-on' : ''}`] = await shot(`${c.key}-${st}${chk ? '-on' : ''}.png`, clip);
          }
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        }
        // (back to the page's own state: the next control and the previews see the page as it was)
        if (c.checked !== null) await page.evaluate(([k, v]) => { const e = document.querySelector(`[data-geoui-idx="${k}"]`); if ('checked' in e && (e.type === 'checkbox' || e.type === 'radio')) e.checked = v; if (e.getAttribute('role') === 'tab') e.setAttribute('aria-selected', String(v)); else if (e.hasAttribute('aria-checked')) e.setAttribute('aria-checked', String(v)); e.toggleAttribute('data-geoui-checked', v); }, [c.key, c.checked]);
        // a slider: the frames at 11 values (as the browser draws the range at each)
        if (c.kind === 'slider') {
          // (a slider of 11 steps or fewer: each of its values; else 11 evenly — the value shown is the nearest frame's)
          const steps = c.step > 0 ? Math.round((c.max - c.min) / c.step) : Infinity;
          c.frameValues = steps <= FRAMES - 1 ? Array.from({ length: steps + 1 }, (_, k) => c.min + k * c.step) : Array.from({ length: FRAMES }, (_, k) => c.min + (c.max - c.min) * k / (FRAMES - 1));
          c.frames = []; c.framesFocus = [];
          for (const [k, v] of c.frameValues.entries()) {
            await page.evaluate(([key, val]) => { const e = document.querySelector(`[data-geoui-idx="${key}"]`); if ('value' in e) e.value = String(val); e.setAttribute('aria-valuenow', String(val)); e.style.setProperty('--geoui-value', String(val)); }, [c.key, v]);
            c.frames.push(await shot(`${c.key}-f${k}.png`, clip));
            if (c.disabled) continue;
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: STATES.focus });
            c.framesFocus.push(await shot(`${c.key}-ff${k}.png`, clip));
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
          }
          await page.evaluate(([key, val]) => { const e = document.querySelector(`[data-geoui-idx="${key}"]`); if ('value' in e) e.value = String(val); }, [c.key, c.value]);
        }
        await page.evaluate((k) => document.querySelector(`[data-geoui-idx="${k}"]`).classList.remove('geoui-on'), c.key);
        out.controls.push(c);
      }
      // the dynamic parts: gauges at 11 values, numbers' digits at each place, shown parts as they are
      for (const d of a.dynamic) {
        if (!(d.page === pid || (d.page === null && !seen.has(d.key)))) continue;
        seen.add(d.key);
        const m = 2, clip = { x: Math.max(0, Math.floor(d.rect.x - m)), y: Math.max(0, Math.floor(d.rect.y - m)) };
        clip.width = Math.min(Dw, Math.ceil(d.rect.x + d.rect.w + m)) - clip.x; clip.height = Math.min(Dh, Math.ceil(d.rect.y + d.rect.h + m)) - clip.y;
        if (clip.width <= 0 || clip.height <= 0) continue;
        d.clip = clip;
        await page.evaluate((k) => document.querySelector(`[data-geoui-idx="${k}"]`).classList.add('geoui-on'), d.key);
        if (d.kind === 'gauge') {
          d.frames = [];
          d.frameValues = Array.from({ length: FRAMES }, (_, k) => d.min + (d.max - d.min) * k / (FRAMES - 1));
          for (const [k, v] of d.frameValues.entries()) {
            await page.evaluate(([key, val]) => { const e = document.querySelector(`[data-geoui-idx="${key}"]`); if ('value' in e) e.value = val; e.setAttribute('value', String(val)); e.style.setProperty('--geoui-value', String(val)); }, [d.key, v]);
            d.frames.push(await shot(`${d.key}-f${k}.png`, clip));
          }
          await page.evaluate(([key, val]) => { const e = document.querySelector(`[data-geoui-idx="${key}"]`); if ('value' in e) e.value = val; e.setAttribute('value', String(val)); }, [d.key, d.value]);
        } else if (d.kind === 'number') {
          // each digit drawn in every place: "0000", "1111" … and where each place's glyph is (a Range per character)
          const n = d.digits;
          d.places = []; d.glyphs = [];
          for (let g = 0; g < 10; g++) {
            const boxes = await page.evaluate(([key, text]) => {
              const e = document.querySelector(`[data-geoui-idx="${key}"]`); e.textContent = text;
              const node = e.firstChild, out = [];
              for (let i = 0; i < text.length; i++) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); out.push({ x: b.x, y: b.y, w: b.width, h: b.height }); }
              return out;
            }, [d.key, String(g).repeat(n)]);
            if (g === 0) d.places = boxes;
            d.glyphs.push(await shot(`${d.key}-g${g}.png`, clip));
          }
          await page.evaluate(([key, text]) => { document.querySelector(`[data-geoui-idx="${key}"]`).textContent = text; }, [d.key, d.text || '']);
        } else d.image = await shot(`${d.key}-show.png`, clip);
        await page.evaluate((k) => document.querySelector(`[data-geoui-idx="${k}"]`).classList.remove('geoui-on'), d.key);
        out.dynamic.push(d);
      }
      await html('geoui-solo', false); await html('geoui-clear', false);
    }
    // the whole page as a person sees it (each page): what the preview and the tests compare with
    out.previews = [];
    for (const pid of pages) { await setPage(pid); out.previews.push(await shot(`page-${pid ?? 'main'}.png`, { x: 0, y: 0, width: Dw, height: Dh })); }
    fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify(out, null, 1) + '\n');
    return out;
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [html, dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const val = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  if (!html || !dir) { console.error('node bds/geoui/html/capture.mjs <page.html | https://…> <out folder> [--design 1280x720] [--dpr 2] [--max-controls n]'); process.exit(2); }
  const c = await capture(html, dir, { design: val('--design'), dpr: val('--dpr'), maxControls: val('--max-controls') });
  console.log(`OK ${dir}: ページ ${c.pages.length}・操作できる物 ${c.controls.length}・動く物 ${c.dynamic.length}（${c.design.w}x${c.design.h} @${c.dpr}x）`);
}

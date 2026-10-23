'use strict';
// bds-lab 管理パネル, before anything is drawn: a classic script in <head> — it runs before the page is first painted, so nothing
// is ever shown in the wrong language, style or size. It puts this browser's choices on <html>:
//   - the language (lang): the one chosen here, else the first of the browser's the panel speaks, else English — as
//     lib/i18n.mjs pickLang chooses it. fonts.css and panel.css draw the letters by it; its dictionary (i18n/<lang>.json) is
//     asked for now, beside panel.js, so it is there when ui/i18n.mjs reads it
//   - the style (data-style: styles.css, lib/styles.mjs): the one chosen here, if any
//   - 見やすさ (a11y.css's classes): the choice made here over the device's own settings — as lib/a11y.mjs load(fromMedia())
// The modules make the same choices again when they start (tests/i18n-offline.mjs runs this file beside them). Nothing is sent
// anywhere: it reads this browser's storage and the page's own address only.
(() => {
  const root = document.documentElement;
  let store = null;
  try { store = globalThis.localStorage; } catch { /* refused: the defaults */ }
  const get = (k) => { try { return store ? store.getItem(k) : null; } catch { return null; } };

  // ---- the language ----
  const LANGS = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
  const of = (tag) => {
    const t = String(tag ?? '').toLowerCase().replace(/_/g, '-');
    if (/^ja\b/.test(t)) return 'ja';
    if (/^ko\b/.test(t)) return 'ko';
    if (/^zh\b/.test(t)) return /-hans\b/.test(t) ? 'zh-Hans' : /-hant\b|-(tw|hk|mo)\b/.test(t) ? 'zh-Hant' : 'zh-Hans';
    if (/^en\b/.test(t)) return 'en';
    return null;
  };
  let lang = get('bdslab.panel.lang');
  if (!LANGS.includes(lang)) {
    lang = null;
    const nav = globalThis.navigator ?? {};
    for (const t of nav.languages && nav.languages.length ? nav.languages : [nav.language]) { lang = of(t); if (lang) break; }
    if (!lang) lang = 'en';
  }
  root.lang = lang;
  if (lang !== 'ja') {
    const l = document.createElement('link');
    l.rel = 'preload'; l.as = 'fetch'; l.href = `i18n/${lang}.json`; l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }

  // ---- the style ----
  const style = get('bdslab.panel.style');
  if (typeof style === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(style) && style !== 'ore') root.setAttribute('data-style', style);

  // ---- 見やすさ ----
  const mm = (q) => { try { return Boolean(globalThis.matchMedia && globalThis.matchMedia(q).matches); } catch { return false; } };
  const on = { big: false, contrast: false, calm: false, links: false };
  if (mm('(prefers-reduced-motion: reduce)')) on.calm = true;
  if (mm('(prefers-contrast: more)') || mm('(forced-colors: active)')) { on.contrast = true; on.links = true; }
  try {
    const saved = JSON.parse(get('bdslab.panel.a11y') ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const k of Object.keys(on)) if (typeof saved[k] === 'boolean') on[k] = saved[k];
  } catch { /* broken: the device's */ }
  for (const k of Object.keys(on)) if (on[k]) root.classList.add(`a11y-${k}`);
})();

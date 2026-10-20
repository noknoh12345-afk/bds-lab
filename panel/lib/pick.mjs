// pick (「つまみ」: a bookmark of the lab's own, like a userscript — on a phone too, nothing to install): opened on a service's
// own page once the value is on the screen (Discord's bot token after Reset Token, Cloudflare's new API token and the account
// in the address, an Anthropic / OpenAI key just made; Google's oauth_token cookie when the page lets it be read), it finds
// the values, asks, and hands them to this panel after the # of its address (no server sees a #) — the panel takes them out
// of the address at once and puts them in the 「連携」 card's fields, to be sealed and checked as if pasted. The bookmark
// fetches nothing and loads nothing: all it does is in its own text (pickHere), made from this panel's address.
import * as C from './connect.mjs';

/** the services' values a pick may carry, and the 「連携」 card each belongs to */
export const PICK_KEYS = Object.freeze({ GOOGLE_OAUTH_TOKEN: 'google', DISCORD_BOT_TOKEN: 'discord', CLOUDFLARE_API_TOKEN: 'cloudflare', CLOUDFLARE_ACCOUNT_ID: 'cloudflare', ANTHROPIC_API_KEY: 'ai', OPENAI_API_KEY: 'ai' });

/** what the bookmark runs on the service's page (it is this function's own text: keep it self-contained — no imports, no
 *  comments inside, nothing from outside). P: the panel's address; w: the page's window → the names handed, or null */
export function pickHere(P, w) {
  const d = w.document, L = w.location, host = String(L.hostname), got = {};
  const add = (k, v) => { if (v && !got[k]) got[k] = v; };
  const on = (re) => re.test(host);
  if (on(/(^|\.)google\.com$/)) { const m = /(?:^|;\s*)oauth_token=([^;]+)/.exec(String(d.cookie || '')); if (m) add('GOOGLE_OAUTH_TOKEN', decodeURIComponent(m[1])); }
  const vals = [];
  const sel = w.getSelection ? String(w.getSelection()) : '';
  if (sel) vals.push(sel);
  for (const e of d.querySelectorAll('input,textarea')) if (e.value) vals.push(String(e.value));
  for (const e of d.querySelectorAll('code,pre,span,div,p,td,li')) if (!e.children.length && e.textContent) vals.push(String(e.textContent));
  for (const raw of vals) {
    const v = raw.trim();
    let m;
    if ((m = /\bsk-ant-[\w-]{20,}/.exec(v))) add('ANTHROPIC_API_KEY', m[0]);
    else if ((m = /\bsk-(?:proj-)?[\w-]{20,}/.exec(v))) add('OPENAI_API_KEY', m[0]);
    if (on(/(^|\.)discord\.com$/) && (m = /(?:^|[^\w.-])([\w-]{23,28}\.[\w-]{6}\.[\w-]{27,40})(?![\w.-])/.exec(` ${v} `))) add('DISCORD_BOT_TOKEN', m[1]);
    if (on(/(^|\.)cloudflare\.com$/) && /^[\w-]{40}$/.test(v)) add('CLOUDFLARE_API_TOKEN', v);
  }
  if (on(/(^|\.)cloudflare\.com$/)) { const m = /\/([0-9a-f]{32})(\/|$)/.exec(String(L.pathname)); if (m) add('CLOUDFLARE_ACCOUNT_ID', m[1]); }
  const names = Object.keys(got);
  if (!names.length) {
    w.alert(on(/(^|\.)google\.com$/) ? 'つまみ: oauth_token が読めません。ログインと「同意する」が済んだ画面で、もう一度押してください（それでも読めないなら、Google がページから読めないようにしています）' : 'つまみ: このページでは渡せる値が見つかりません。値（トークン・キー）が画面に出ている状態で、もう一度押してください');
    return null;
  }
  if (!w.confirm(`つまみ: bds-lab のパネルに渡しますか？\n${names.join('\n')}`)) return null;
  const b = w.btoa(JSON.stringify(got)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  L.assign(`${P}#bdslab-pick=${b}`);
  return names;
}
/** the bookmark for this panel (its address: origin + path) → a javascript: address to keep as a bookmark */
export function bookmarklet(panelUrl) {
  const u = new URL(String(panelUrl));
  if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw new Error('パネルのアドレスが https ではありません');
  const P = `${u.origin}${u.pathname}`;
  return `javascript:${encodeURIComponent(`(${pickHere.toString()})(${JSON.stringify(P)},window);void 0`)}`;
}
const unb64url = (s) => { try { return decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4)))); } catch { return null; } };
/** the panel's address on arrival → { picks: { NAME: value }, rejected: [names], rest } when it carries a pick (rest: the
 *  address's # without it), null otherwise (pure). Only the names above, each value of the shape its field checks */
export function takePick(hash) {
  const h = String(hash ?? '');
  const m = /(^#|&)bdslab-pick=([A-Za-z0-9_-]{1,12000})(?=&|$)/.exec(h);
  if (!m) return null;
  const rest = h.replace(m[0], m[1] === '#' ? '#' : '').replace(/^#&/, '#').replace(/^#$/, '');
  let j = null; try { j = JSON.parse(unb64url(m[2]) ?? 'null'); } catch { j = null; }
  const picks = {}, rejected = [];
  for (const [k, v] of Object.entries(j && typeof j === 'object' && !Array.isArray(j) ? j : {})) {
    const svc = PICK_KEYS[k] ? C.serviceOf(PICK_KEYS[k]) : null, f = svc?.fields.find((x) => x.name === k);
    if (f && typeof v === 'string' && !f.check(v.trim())) picks[k] = v.trim(); else rejected.push(String(k).slice(0, 40));
  }
  return { picks, rejected, rest };
}
/** the cards a pick opens, in the tab's order: [{ service, fields: { NAME: value } }] (pure) */
export function pickCards(picks) {
  const out = [];
  for (const s of C.SERVICES) {
    const fields = Object.fromEntries(Object.entries(picks ?? {}).filter(([k]) => PICK_KEYS[k] === s.key));
    if (Object.keys(fields).length) out.push({ service: s.key, fields });
  }
  return out;
}

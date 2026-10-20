// 「つまみ」 (panel/lib/pick.mjs): the lab's own bookmark, run as the browser runs it — its javascript: address decoded and
// run in a fresh context on a fake page of each service (Google's cookie, Discord's token after Reset Token, Cloudflare's new
// token and the account in the address, an Anthropic / OpenAI key): the values found, asked, handed after the panel's #; a
// page with none, or a "no", hands nothing. The panel's side: the # taken (only the known names, each of its field's shape),
// the rest of the address kept, the 「連携」 cards opened with the fields filled and nothing sent until the person presses.
// The bookmark loads nothing: no address in it but the panel's.
// node tests/pick-offline.mjs
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const PK = await imp('panel/lib/pick.mjs');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack?.split('\n').slice(0, 3).join('\n     ') ?? e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

// values made at run time (the lab's secret scan reads this file)
const BOT = `${'M'.repeat(26)}.${'G'.repeat(6)}.${'x'.repeat(38)}`, OAUTH = `oauth2_4/${'q'.repeat(60)}`, ANT = `sk-ant-api03-${'k'.repeat(40)}`, OAI = `sk-proj-${'o'.repeat(40)}`;
const CFT = 'C'.repeat(40), ACC = '0123456789abcdef0123456789abcdef', PANEL = 'https://owner.github.io/bds-lab/';

/** a fake page: host, path, cookie, the elements' values and texts; what the bookmark said and where it went */
function page({ host, path: p = '/', cookie = '', inputs = [], texts = [], selection = '', yes = true }) {
  const said = { alerts: [], confirms: [], went: null };
  const el = (o) => ({ children: [], ...o });
  const document = { cookie, querySelectorAll: (sel) => (sel === 'input,textarea' ? inputs.map((v) => el({ value: v })) : texts.map((x) => el({ textContent: x }))) };
  const w = { document, location: { hostname: host, pathname: p, assign: (u) => { said.went = u; } }, getSelection: () => selection, alert: (m) => said.alerts.push(m), confirm: (m) => { said.confirms.push(m); return yes; }, btoa: (s) => Buffer.from(s, 'binary').toString('base64') };
  return { w, said };
}
/** the bookmark run as a browser runs a javascript: address: decoded, in a context of its own with only `window` */
// (its own end, `;void 0`, keeps the browser from showing what it returns: taken off here to read the names it handed)
const run = (w) => { const src = decodeURIComponent(PK.bookmarklet(PANEL).slice('javascript:'.length)); ok(src.endsWith(';void 0'), 'ends in void 0'); return vm.runInNewContext(src.slice(0, -';void 0'.length), { window: w }); };
const handed = (said) => { ok(said.went?.startsWith(`${PANEL}#bdslab-pick=`), `went: ${said.went}`); return PK.takePick(said.went.slice(said.went.indexOf('#'))); };

await t('the bookmark: a javascript: address made for this panel, with nothing in it that fetches or loads, and no address but the panel\'s', () => {
  const src = decodeURIComponent(PK.bookmarklet(PANEL).slice('javascript:'.length));
  ok(PK.bookmarklet(PANEL).startsWith('javascript:') && src.includes(JSON.stringify(PANEL)), 'for this panel');
  ok(!/fetch\(|XMLHttpRequest|import\(|createElement|<script|eval\(|Function\(|sendBeacon|WebSocket/.test(src), 'loads nothing');
  eq([...src.matchAll(/https?:\/\/[\w.-]+/g)].map((m) => m[0]), ['https://owner.github.io'], 'no other address');
  let threw = false; try { PK.bookmarklet('http://evil.test/'); } catch { threw = true; } ok(threw, 'not http');
});
await t('Google (accounts.google.com, after the consent): the oauth_token cookie read when the page lets it, handed after the panel\'s #', () => {
  const { w, said } = page({ host: 'accounts.google.com', cookie: `NID=1; oauth_token=${encodeURIComponent(OAUTH)}; SID=2` });
  eq(run(w), ['GOOGLE_OAUTH_TOKEN']);
  ok(/GOOGLE_OAUTH_TOKEN/.test(said.confirms[0]) && !said.confirms[0].includes(OAUTH), 'asked by name, the value not shown');
  eq(handed(said).picks, { GOOGLE_OAUTH_TOKEN: OAUTH });
});
await t('Google with the cookie unreadable (HttpOnly): told so, nothing handed', () => {
  const { w, said } = page({ host: 'accounts.google.com', cookie: 'NID=1' });
  eq(run(w), null); ok(/oauth_token が読めません/.test(said.alerts[0]) && !said.went, said.alerts[0]);
});
await t('Discord (developers page after Reset Token): the bot token from the field; Cloudflare: the new token and the account in the address; Anthropic / OpenAI keys', () => {
  let p = page({ host: 'discord.com', path: '/developers/applications/1/bot', inputs: [BOT] });
  eq(run(p.w), ['DISCORD_BOT_TOKEN']); eq(handed(p.said).picks, { DISCORD_BOT_TOKEN: BOT });
  p = page({ host: 'dash.cloudflare.com', path: `/${ACC}/api-tokens`, inputs: [CFT] });
  eq(run(p.w).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']); eq(handed(p.said).picks, { CLOUDFLARE_API_TOKEN: CFT, CLOUDFLARE_ACCOUNT_ID: ACC });
  p = page({ host: 'console.anthropic.com', texts: [`Your key ${ANT}`] });
  eq(handed((run(p.w), p.said)).picks, { ANTHROPIC_API_KEY: ANT });
  p = page({ host: 'platform.openai.com', selection: OAI });
  eq(handed((run(p.w), p.said)).picks, { OPENAI_API_KEY: OAI });
});
await t('a Discord-like token on another site is not taken; 40 letters off Cloudflare are not a token; a page with nothing says so; a "no" hands nothing', () => {
  let p = page({ host: 'example.com', inputs: [BOT, CFT] }); eq(run(p.w), null); ok(/見つかりません/.test(p.said.alerts[0]), p.said.alerts[0]);
  p = page({ host: 'discord.com', inputs: [BOT], yes: false }); eq(run(p.w), null); ok(!p.said.went, 'not handed');
});
await t('the panel takes the # (pure): only the known names, each of its field\'s shape; the rest of the address kept; a broken one is nothing', () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const r = PK.takePick(`#runs&bdslab-pick=${b({ DISCORD_BOT_TOKEN: BOT, GOOGLE_OAUTH_TOKEN: 'nope', EVIL: 'x', ANTHROPIC_API_KEY: ` ${ANT} ` })}`);
  eq([r.picks, r.rejected.sort(), r.rest], [{ DISCORD_BOT_TOKEN: BOT, ANTHROPIC_API_KEY: ANT }, ['EVIL', 'GOOGLE_OAUTH_TOKEN'], '#runs']);
  eq(PK.takePick(`#bdslab-pick=${b({ OPENAI_API_KEY: OAI })}`).rest, '');
  eq(PK.takePick('#runs'), null);
  eq(PK.takePick('#bdslab-pick=!!!'), null);
  eq(PK.takePick('#bdslab-pick=AAAA').picks, {});
  eq(PK.pickCards({ ANTHROPIC_API_KEY: ANT, DISCORD_BOT_TOKEN: BOT }), [{ service: 'discord', fields: { DISCORD_BOT_TOKEN: BOT } }, { service: 'ai', fields: { ANTHROPIC_API_KEY: ANT } }]);
});
await t('the 「連携」 tab with a pick: the card opened, its field filled (a password field), the person told; nothing sent until they press; the pick used once', async () => {
  class N { get textContent() { return ''; } }
  class T extends N { constructor(s) { super(); this.data = String(s); } get textContent() { return this.data; } }
  class E extends N {
    constructor(tag) { super(); Object.assign(this, { tagName: tag.toUpperCase(), kids: [], attrs: {}, on: {}, style: {}, className: '', value: '', open: false, parent: null }); }
    setAttribute(k, v) { this.attrs[k] = String(v); } addEventListener(k, f) { (this.on[k] ??= []).push(f); }
    append(...xs) { for (const x of xs) { const n = x instanceof N ? x : new T(x); n.parent = this; this.kids.push(n); } }
    replaceChildren(...xs) { this.kids = []; this.append(...xs); }
    get textContent() { return this.kids.map((k) => k.textContent).join(''); }
    all(test) { const out = [], walk = (e) => { for (const k of e.kids) if (k instanceof E) { if (test(k)) out.push(k); walk(k); } }; walk(this); return out; }
  }
  globalThis.Node = N; globalThis.document = { createElement: (x) => new E(x), createTextNode: (s) => new T(s), getElementById: () => new E('div') };
  const UI = await imp('panel/ui/connect.mjs');
  let sent = 0, used = 0;
  const ctx = { api: { putSecret: async () => { sent++; } }, lab: { slug: 'o/lab', role: 'admin', secrets: [] }, me: { login: 'o' }, panelUrl: PANEL, pick: PK.takePick(`#bdslab-pick=${Buffer.from(JSON.stringify({ DISCORD_BOT_TOKEN: BOT })).toString('base64url')}`), pickUsed: () => { used++; } };
  const body = new E('div');
  await UI.connectTab(body, ctx);
  const d = body.all((e) => e.attrs['data-service'] === 'discord')[0];
  const tok = d.all((e) => e.tagName === 'INPUT' && e.attrs['aria-label'] === 'ボットのトークン')[0];
  eq([tok.value, tok.attrs.type, d.all((e) => e.tagName === 'DETAILS')[0].open], [BOT, 'password', true]);
  ok(/つまみから受け取りました: Discord/.test(body.textContent), 'told');
  eq([sent, used, ctx.pick], [0, 1, null], 'nothing sent; used once');
  ok(body.all((e) => e.attrs['data-part'] === 'pick').length === 1 && body.all((e) => e.tagName === 'A' && String(e.attrs.href).startsWith('javascript:')).length === 1, 'the bookmark offered');
  ok(!body.textContent.includes(BOT), 'the value not written as text');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

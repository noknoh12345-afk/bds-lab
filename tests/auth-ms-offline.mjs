// the sign-in service's Microsoft device sign-in (auth/handler.mjs /ms/device and /ms/token), against a fake live.com and Xbox
// Live, with no network: the code and the link with it filled in; the handle sealed (the device code and live.com's cookie
// inside, never in the clear); the poll carrying the cookie back; pending, slow down, expired, said no; the tokens and who it is
// (gamertag, xuid), an account with no Xbox profile; another origin refused; a handle altered or of another kind refused;
// Microsoft's own words never passed on.
// node tests/auth-ms-offline.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = await import(pathToFileURL(path.join(TOP, 'auth/handler.mjs')).href);
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const PANEL = 'https://panel.test', ENV = { GITHUB_CLIENT_ID: 'Iv23liFAKE', GITHUB_CLIENT_SECRET: 'fake-secret-0123456789', STATE_SECRET: 'fake-state-secret-0123456789abcdef-0123456789', PANEL_ORIGINS: PANEL };
const DC = 'M.C510_BAY.2.U.devicecode-0123456789abcdef', COOKIE = 'MSPOK=$uuid-1234-abcd', RT = 'M.C510_BL2.0.U.refresh-token-abc', AT = 'EwBoA+l3BAAU-access-token-xyz';
const ms = { seen: [], state: 'pending', profile: true };
const json = (status, j, headers = {}) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json', ...headers } });
async function fakeFetch(url, init = {}) {
  const u = new URL(url), body = String(init.body ?? '');
  ms.seen.push({ url: u.href, headers: { ...(init.headers ?? {}) }, body });
  if (u.href === 'https://login.live.com/oauth20_connect.srf') {
    const q = new URLSearchParams(body);
    if (q.get('client_id') !== A.MICROSOFT.clientId || q.get('response_type') !== 'device_code' || q.get('scope') !== A.MICROSOFT.scope) return json(400, { error: 'invalid_request', error_description: 'secret words of Microsoft' });
    return json(200, { user_code: 'AB12CD34', device_code: DC, verification_uri: 'https://www.microsoft.com/link', interval: 5, expires_in: 900 }, { 'set-cookie': `${COOKIE}; domain=.live.com; path=/; secure; HttpOnly` });
  }
  if (u.origin + u.pathname === 'https://login.live.com/oauth20_token.srf') {
    const q = new URLSearchParams(body);
    if (q.get('device_code') !== DC || q.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:device_code') return json(400, { error: 'invalid_grant', error_description: 'Microsoft words' });
    if (ms.state === 'pending') return json(400, { error: 'authorization_pending', error_description: 'still waiting (Microsoft words)' });
    if (ms.state === 'slow') return json(400, { error: 'slow_down' });
    if (ms.state === 'denied') return json(400, { error: 'access_denied' });
    if (ms.state === 'expired') return json(400, { error: 'expired_token' });
    if (ms.state === 'weird') return json(500, { error: 'server_error', error_description: 'Microsoft words' });
    return json(200, { token_type: 'bearer', expires_in: 86400, scope: A.MICROSOFT.scope, access_token: AT, refresh_token: RT, user_id: '0123abcd0123abcd' });
  }
  if (u.href === A.MICROSOFT.xbl) {
    const j = JSON.parse(body);
    if (j.Properties?.RpsTicket !== `t=${AT}`) return json(400, {});
    return json(200, { Token: 'xbl-user-token', DisplayClaims: { xui: [{ uhs: '1234' }] } });
  }
  if (u.href === A.MICROSOFT.xsts) {
    if (!ms.profile) return json(401, { XErr: 2148916233, Message: '', Redirect: 'https://start.ui.xboxlive.com/CreateAccount' });
    return json(200, { Token: 'xsts', DisplayClaims: { xui: [{ gtg: 'LabTester 42', xid: '2535400000000000', uhs: '1234' }] } });
  }
  return json(404, {});
}
const app = A.handler(ENV, { fetchImpl: fakeFetch });
const call = async (p, body, origin = PANEL) => { const r = await app(new Request(`https://auth.test${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: body === undefined ? '{}' : JSON.stringify(body) })); return { status: r.status, json: await r.json().catch(() => null), headers: Object.fromEntries(r.headers) }; };

let handle = null;
await t('/ms/device: the code and microsoft.com/link with it filled in (otc), CORS for the panel; the handle sealed: no device code or cookie in the clear', async () => {
  const r = await call('/ms/device');
  eq(r.status, 200);
  eq([r.json.user_code, r.json.verification_uri, r.json.verification_uri_complete, r.json.interval, r.json.expires_in], ['AB12CD34', 'https://www.microsoft.com/link', 'https://www.microsoft.com/link?otc=AB12CD34', 5, 900]);
  eq(r.headers['access-control-allow-origin'], PANEL);
  ok(/^bdsl_ms\./.test(r.json.handle), 'a sealed handle');
  const all = JSON.stringify(r);
  ok(!all.includes(DC) && !all.includes('MSPOK') && !all.includes('device_code'), 'the device code and cookie stay sealed');
  handle = r.json.handle;
});
await t('/ms/token while the person signs in: pending (and slow down), the poll carries live.com\'s cookie back; Microsoft\'s words are not passed on', async () => {
  ms.seen.length = 0;
  const r = await call('/ms/token', { handle });
  eq([r.status, r.json], [200, { pending: true }]);
  const poll = ms.seen.find((s) => s.url.startsWith('https://login.live.com/oauth20_token.srf'));
  eq(poll.headers.cookie, COOKIE, 'the cookie set with the code');
  ok(poll.url.includes(`client_id=${A.MICROSOFT.clientId}`), 'client_id on the address as prismarine-auth does');
  ms.state = 'slow';
  eq((await call('/ms/token', { handle })).json, { pending: true, slow: true });
  ok(!JSON.stringify(r).includes('Microsoft words'), 'no Microsoft words');
});
await t('/ms/token after the sign-in: live.com\'s tokens (to keep as a secret) and who it is (gamertag, xuid) from Xbox Live', async () => {
  ms.state = 'ok';
  const r = await call('/ms/token', { handle });
  eq(r.status, 200);
  eq(r.json, { live: { token_type: 'bearer', expires_in: 86400, scope: A.MICROSOFT.scope, access_token: AT, refresh_token: RT, user_id: '0123abcd0123abcd' }, gamertag: 'LabTester 42', xuid: '2535400000000000', profile: true });
  eq(r.headers['cache-control'], 'no-store');
});
await t('an account with no Xbox profile yet: the tokens and profile false', async () => {
  ms.profile = false;
  const r = await call('/ms/token', { handle });
  eq([r.json.profile, r.json.gamertag, r.json.live.refresh_token], [false, null, RT]);
  ms.profile = true;
});
await t('said no / too late / Microsoft broken → denied / expired / microsoft (no words of theirs)', async () => {
  ms.state = 'denied'; eq((await call('/ms/token', { handle })).json, { error: 'denied' });
  ms.state = 'expired'; eq((await call('/ms/token', { handle })).json, { error: 'expired' });
  ms.state = 'weird'; const r = await call('/ms/token', { handle }); eq([r.status, r.json], [502, { error: 'microsoft' }]);
});
await t('a handle altered, of another kind, or past its time → refused before Microsoft is asked', async () => {
  ms.state = 'ok'; ms.seen.length = 0;
  const bad = handle.slice(0, -4) + (handle.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  eq((await call('/ms/token', { handle: bad })).json, { error: 'handle' });
  eq((await call('/ms/token', { handle: handle.replace('bdsl_ms.', 'bdsl_cd.') })).json, { error: 'handle' });
  eq((await call('/ms/token', {})).json, { error: 'handle' });
  eq(ms.seen.length, 0, 'Microsoft not asked');
  let clock = Date.now();
  const later = A.handler(ENV, { fetchImpl: fakeFetch, now: () => clock });
  const d = await (await later(new Request('https://auth.test/ms/device', { method: 'POST', headers: { origin: PANEL } }))).json();
  clock += 901_000;
  const r = await (await later(new Request('https://auth.test/ms/token', { method: 'POST', headers: { origin: PANEL }, body: JSON.stringify({ handle: d.handle }) }))).json();
  eq(r, { error: 'expired' });
});
await t('another origin, or none: refused (403), Microsoft not asked; preflight from the panel only', async () => {
  ms.seen.length = 0;
  eq((await call('/ms/device', undefined, 'https://evil.test')).status, 403);
  eq((await call('/ms/device', undefined, null)).status, 403);
  eq(ms.seen.length, 0);
  const pre = await app(new Request('https://auth.test/ms/token', { method: 'OPTIONS', headers: { origin: PANEL, 'access-control-request-method': 'POST' } }));
  eq([pre.status, pre.headers.get('access-control-allow-origin')], [204, PANEL]);
  eq((await app(new Request('https://auth.test/ms/token', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }))).status, 403);
});
await t('/health says the service relays Microsoft\'s sign-in', async () => {
  const r = await app(new Request('https://auth.test/health', { headers: { origin: PANEL } }));
  eq((await r.json()).microsoft, true);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

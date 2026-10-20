// common/mslive.mjs: a Microsoft sign-in made on a phone (the panel → MS_LIVE_<NAME>) written where prismarine-auth reads it.
// The secret's name (the panel's own rule), its text read without repeating it, prismarine-auth's cache file name (sha1, 6)
// and content; when prismarine-auth is installed somewhere near, it reads the file itself (no network). Never in the
// environment of children (common/secrets.mjs SECRET).
// node tests/mslive-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const ML = await imp('common/mslive.mjs'), C = await imp('panel/lib/connect.mjs'), S = await imp('common/secrets.mjs');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

await t('the secret\'s name: the panel\'s rule and the lab\'s are one (MS_LIVE_<NAME>, MAIN when empty)', () => {
  for (const n of ['', 'main', ' my-bot#2 ', 'Bot One', 'x'.repeat(60), 'ボット']) eq(ML.secretName(n), C.msSecretName(n), n);
  ok(ML.SECRET.test('MS_LIVE_MAIN') && String(ML.SECRET) === String(C.MS_LIVE_SECRET), 'the same pattern');
});
await t('the secret\'s text: the panel\'s value read back; a broken one said without the value', () => {
  const v = C.msSecretValue({ live: { access_token: 'AT-1', refresh_token: 'RT-2', expires_in: 86400, scope: 's' } }, 1700000000000);
  eq(ML.parseSecret(v), { token_type: 'bearer', expires_in: 86400, scope: 's', access_token: 'AT-1', refresh_token: 'RT-2', user_id: null, obtainedOn: 1700000000000 });
  for (const bad of ['', 'not json', '{"access_token":"a"}']) { const e = ML.parseSecret(bad); ok(e instanceof Error && !e.message.includes('access_token":"a'), bad); }
});
await t('prismarine-auth\'s cache: <sha1(username)[0:6]>_live-cache.json with { token }, other caches kept, readable by this user alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mslive-'));
  eq(path.basename(ML.cacheFile(dir, 'botone')), `${crypto.createHash('sha1').update('botone').digest('hex').slice(0, 6)}_live-cache.json`);
  fs.writeFileSync(ML.cacheFile(dir, 'botone'), JSON.stringify({ other: 1 }));
  const tok = ML.parseSecret(C.msSecretValue({ live: { access_token: 'A', refresh_token: 'R' } }));
  const f = ML.writeLiveCache(dir, 'botone', tok);
  eq(JSON.parse(fs.readFileSync(f, 'utf8')), { other: 1, token: tok });
  if (process.platform !== 'win32') eq(fs.statSync(f).mode & 0o777, 0o600);
});
await t('MS_LIVE_* is never put into the environment of children (like passwords and the AAS token)', () => {
  ok(S.SECRET.test('MS_LIVE_MAIN') && S.SECRET.test('MS_PASSWORD') && !S.SECRET.test('MS_EMAIL'), String(S.SECRET));
});
await t('the device\'s sign-in, said on the live issue, read for the panel: the number to approve, a code to send back, a password asked (pure)', async () => {
  const LF = await imp('panel/lib/livefmt.mjs');
  eq(LF.signinAsk('スマホの Microsoft Authenticator でサインインを承認してください（番号 42）'), { kind: 'approve', number: '42' });
  eq(LF.signinAsk('スマホの Microsoft Authenticator でサインインを承認してください'), { kind: 'approve', number: null });
  eq(LF.signinAsk('メールかスマホに届いたコードを送ってください: パネルの「端末」タブに入れる欄が出ます'), { kind: 'code' });
  eq(LF.signinAsk('パスワードを聞かれています: MS_PASSWORD を secrets に'), { kind: 'password' });
  eq(LF.signinAsk('サインインしました'), null);
  eq([LF.codeCommand(' 123 456 '), LF.codeCommand('１２３４５６'), LF.codeCommand('12'), LF.codeCommand('12ab56')], ['code 123456', 'code 123456', null, null]);
  // (the words app.mjs really says: its tells and the panel's reading stay one)
  const src = fs.readFileSync(path.join(TOP, 'app', 'app.mjs'), 'utf8');
  for (const m of src.matchAll(/tellOnce\('(?:approve[^']*|code|password)'[^,]*, ['`]([^'`]+)['`]/g)) ok(LF.signinAsk(m[1].replace(/\$\{[^}]+\}/g, '（番号 12）')), m[1]);
  ok(/tellOnce\('code'/.test(src) && /tellOnce\(`approve/.test(src), 'the tells are there');
});
// (prismarine-auth itself, when it is installed near: it reads the file as its own cache — no network, no device code)
const pa = [path.join(TOP, 'node_modules', 'prismarine-auth'), process.env.PRISMARINE_AUTH].filter((p) => p && fs.existsSync(path.join(p, 'package.json')))[0];
if (pa) await t('prismarine-auth reads the written cache as its own: the access token valid, the refresh token there, no device code asked', async () => {
  const { createRequire } = await import('node:module'), req = createRequire(path.join(pa, 'package.json'));
  const { Authflow, Titles } = req(pa);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mslive-pa-'));
  ML.writeLiveCache(dir, 'botone', ML.parseSecret(C.msSecretValue({ live: { access_token: 'AT-123', refresh_token: 'RT-456', expires_in: 86400 } })));
  const flow = new Authflow('botone', dir, { flow: 'live', authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo' }, () => { throw new Error('asked for a device code'); });
  eq([(await flow.msa.getAccessToken()).token, (await flow.msa.getRefreshToken()).token, await flow.msa.verifyTokens()], ['AT-123', 'RT-456', true]);
});
else console.log('skip prismarine-auth itself (PRISMARINE_AUTH=<its folder> node tests/mslive-offline.mjs)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

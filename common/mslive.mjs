// mslive: a Microsoft sign-in made on a phone (the panel's 「連携」 → 📱 lan のボット: live.com's device sign-in relayed by the
// sign-in service, kept sealed in the secret MS_LIVE_<NAME>) written where prismarine-auth reads it — its live cache, the file
// `<sha1(username)[0:6]>_live-cache.json` in the profiles folder, holding { token: live.com's token + obtainedOn } — so a
// bot (bedrock-protocol / lan) starts signed in, with no browser and no password. Refreshing is prismarine-auth's own.
//   node lab.mjs lan account import <name>        (lan.mjs: the secret MS_LIVE_<NAME> → its profiles folder)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SECRET = /^MS_LIVE_[A-Z0-9_]{1,40}$/;
/** a bot's name → the secret it is kept in (the panel's msSecretName, the same rule) */
export function secretName(name) {
  const n = String(name ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `MS_LIVE_${n || 'MAIN'}`;
}
/** the secret's text → live.com's token as prismarine-auth keeps it, or an Error saying what is wrong (never the value) */
export function parseSecret(text) {
  let j; try { j = JSON.parse(String(text ?? '')); } catch { return new Error('JSON ではありません（パネルの「連携」→ 📱 で入れ直す）'); }
  if (!j || typeof j !== 'object' || typeof j.refresh_token !== 'string' || !j.refresh_token || typeof j.access_token !== 'string') return new Error('refresh_token がありません');
  return { token_type: j.token_type ?? 'bearer', expires_in: Number(j.expires_in) || 86400, scope: j.scope ?? 'service::user.auth.xboxlive.com::MBI_SSL', access_token: j.access_token, refresh_token: j.refresh_token, user_id: j.user_id ?? null, obtainedOn: Number(j.obtainedOn) || 0 };
}
/** prismarine-auth's cache file for a username (its common/Util createHash: sha1, hex, the first 6) */
export const cacheFile = (dir, username, cacheName = 'live') => path.join(dir, `${crypto.createHash('sha1').update(String(username ?? ''), 'binary').digest('hex').slice(0, 6)}_${cacheName}-cache.json`);
/** live.com's token → that file (only the live cache: Xbox and Minecraft tokens are made from it on the first sign-in);
 *  the folder made, the file readable by this user alone */
export function writeLiveCache(dir, username, token) {
  fs.mkdirSync(dir, { recursive: true });
  const f = cacheFile(dir, username);
  let old = {}; try { old = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { old = {}; }
  fs.writeFileSync(f, JSON.stringify({ ...old, token }), { mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch { /* Windows */ }
  return f;
}

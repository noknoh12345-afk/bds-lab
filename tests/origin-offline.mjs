#!/usr/bin/env node
// panel/lib/origin.mjs: which other GitHub Pages sites share the panel's github.io origin (and so its localStorage, a
// remembered account's token in it), and the panel's own domain sharing with none.
//   node tests/origin-offline.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = await import(pathToFileURL(path.join(TOP, 'panel/lib/origin.mjs')).href);
const G = await import(pathToFileURL(path.join(TOP, 'panel/lib/gh.mjs')).href);
let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };

await t('a domain of the panel\'s own shares with nobody', () => {
  for (const h of ['panel.example.com', 'localhost', 'github.io', 'a.b.github.io']) eq([O.sharedOrigin({ hostname: h, lab: 'a/lab', repos: [{ name: 'x', has_pages: true }] }).shared], [false], h);
});
await t('<owner>.github.io: the owner\'s other Pages sites are named, the lab itself and repositories without Pages are not', () => {
  const v = O.sharedOrigin({ hostname: 'Me.github.io', lab: 'me/bds-lab', repos: [{ name: 'bds-lab', has_pages: true }, { name: 'blog', has_pages: true }, { name: 'code', has_pages: false }, { name: 'me.github.io', has_pages: true }] });
  eq([v.shared, v.level, v.others], [true, 'warn', [{ name: 'blog', url: 'https://me.github.io/blog/' }, { name: 'me.github.io', url: 'https://me.github.io/' }]]);
  eq(O.sharedOrigin({ hostname: 'me.github.io', lab: 'me/bds-lab', repos: [{ name: 'BDS-LAB', has_pages: true }] }).level, 'ok', 'alone (names compared without case)');
  eq(O.sharedOrigin({ hostname: 'me.github.io', lab: 'me/bds-lab', repos: null }).level, 'unknown', 'not read: not called safe');
  eq(O.WAYS_OUT.length, 3);
});
await t('gh.ownerRepos: GitHub\'s public list of the owner\'s repositories', async () => {
  const seen = [];
  const api = G.gh({ token: 't', fetchImpl: async (u, o) => { seen.push(`${o.method} ${u}`); return { ok: true, status: 200, headers: { get: () => null }, text: async () => '[]' }; } });
  eq(await api.ownerRepos('me'), []);
  eq(seen, ['GET https://api.github.com/users/me/repos?type=owner&per_page=100']);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// The panel's 「サーバー」 screen, its pure part (panel/lib/vps.mjs) and its calls (panel/lib/gh.mjs): which runners are the
// lab's and awake, the line pasted into a root shell (nothing but checked words in it), the runs' args, the fork approval
// setting read as safe or not, a token's life, the vps runs listed — and the four GitHub calls at the addresses GitHub has.
//   node tests/vps-offline.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(TOP, f)).href);
const V = await imp('panel/lib/vps.mjs'), G = await imp('panel/lib/gh.mjs'), P = await imp('panel/lib/policy.mjs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m ?? 'not ok'); };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const throws = (fn, re, m) => { try { fn(); } catch (e) { if (re.test(e.message)) return; throw new Error(`${m}: threw ${e.message}`); } throw new Error(`${m}: did not throw`); };
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack ?? e}`); } };

const R = (name, status, busy, labels) => ({ id: name.length, name, os: 'Linux', status, busy, labels: labels.map((n) => ({ name: n })) });

await t('runnersView: the lab\'s runners (label bds-vps), idle / busy / offline, and whether a run would start now (pure)', () => {
  let v = V.runnersView([]);
  eq([v.ready, v.ours.length, /まだランナーがありません/.test(v.say)], [false, 0, true], 'none');
  v = V.runnersView([R('ci', 'online', false, ['self-hosted', 'gpu'])]);
  eq([v.ready, v.all.length, v.ours.length, /ラベル bds-vps のものがありません/.test(v.say)], [false, 1, 0, true], 'another label is not ours');
  v = V.runnersView([R('vps1', 'offline', false, ['self-hosted', 'bds-vps'])]);
  eq([v.ready, v.ours[0].state, v.ours[0].mark, /応答がありません/.test(v.say)], [false, 'offline', '⚫', true], 'asleep');
  v = V.runnersView([R('vps1', 'online', true, ['self-hosted', 'bds-vps'])]);
  eq([v.ready, v.busy, v.ours[0].state, /仕事中/.test(v.say)], [true, 1, 'busy', true], 'busy: a run waits, but it is there');
  v = V.runnersView([R('vps1', 'online', true, ['bds-vps']), R('vps2', 'online', false, ['bds-vps']), R('old', 'offline', false, ['bds-vps'])]);
  eq([v.ready, v.online, v.busy, /^1 台が待機中です/.test(v.say)], [true, 2, 1, true], 'two awake, one of them free: the free one is counted');
  eq(V.runnersView(null).all, [], 'no list is no runners');
  eq(V.runnersView([R('x', 'online', false, ['mine'])], { label: 'mine' }).ready, true, 'another label when asked');
});

await t('setupCommand: the one line for a root shell — every part checked, nothing a shell reads as more than a word (pure)', () => {
  eq(V.setupCommand({ slug: 'a-b/bds-lab', token: 'AABBCCDDEE1234567890' }),
    'curl -fsSL https://raw.githubusercontent.com/a-b/bds-lab/main/vps/runner-setup.sh -o runner-setup.sh && sudo env RUNNER_REPO=a-b/bds-lab RUNNER_TOKEN=AABBCCDDEE1234567890 sh runner-setup.sh');
  ok(!/RUNNER_TOKEN/.test(V.setupCommand({ slug: 'a/b' })), 'no token: the script asks on the server');
  ok(/RUNNER_LABELS=x,y /.test(V.setupCommand({ slug: 'a/b', labels: 'x,y', token: 'AAAAAAAAAAAA' })), 'other labels are said');
  ok(/\/dev\/vps\/runner-setup\.sh/.test(V.setupCommand({ slug: 'a/b', branch: 'dev' })), 'another branch');
  for (const slug of ['a/b; rm -rf /', 'a/b$(id)', 'a b/c', '../x/y', 'a/b`id`', 'a', '', null, 'a/b\nc']) throws(() => V.setupCommand({ slug }), /owner\/repo/, `slug ${JSON.stringify(slug)}`);
  for (const token of ['x; id', 'AAAA$(id)AAAAAAAA', 'short', 'AAAAAAAAAA AAAAAAAA', 'AAAAAAAAAA\nAAAA', 'AAAAAAAAAA|sh', "AAAAAAAAAA'AAAA"]) throws(() => V.setupCommand({ slug: 'a/b', token }), /登録トークン/, `token ${JSON.stringify(token)}`);
  for (const branch of ['main; id', 'a b', '../../etc', 'x$(id)', '']) throws(() => V.setupCommand({ slug: 'a/b', branch }), /枝/, `branch ${JSON.stringify(branch)}`);
  for (const labels of ['a b', 'a;b', 'a,,b', '$(id)', '']) throws(() => V.setupCommand({ slug: 'a/b', labels }), /ラベル/, `labels ${JSON.stringify(labels)}`);
  // (whatever goes in, the line has only the characters of a plain command)
  ok(/^[A-Za-z0-9 ./:=&_,-]+$/.test(V.setupCommand({ slug: 'A-1/b.c_d', branch: 'claude/x-1', token: 'A1_b2C3d4E5f6', labels: 'a.b,c-d' })), 'only plain characters');
});

await t('installCommands: the one-line installs; a fork or another branch installs itself (pure)', () => {
  eq(V.installCommands({ slug: 'noknoh12345-afk/bds-lab' }), { sh: 'curl -fsSL https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.sh | sh', ps1: 'irm https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.ps1 | iex' });
  const f = V.installCommands({ slug: 'me/bds-lab', branch: 'dev' });
  ok(/\| BDS_LAB_REPO=me\/bds-lab BDS_LAB_REF=dev sh$/.test(f.sh) && /^\$env:BDS_LAB_REPO='me\/bds-lab'; \$env:BDS_LAB_REF='dev'; irm /.test(f.ps1), JSON.stringify(f));
  throws(() => V.installCommands({ slug: "a/b'; calc" }), /owner\/repo/, 'a slug with a quote');
  throws(() => V.installCommands({ slug: 'a/b', branch: "x'; calc" }), /枝/, 'a branch with a quote');
});

await t('what the buttons run: the vps workflow has the input they fill; one addon; a typed line checked (pure)', () => {
  const wf = fs.readFileSync(path.join(TOP, '.github', 'workflows', V.VPS_WORKFLOW), 'utf8');
  ok(/workflow_dispatch:/.test(wf) && /^\s+args:/m.test(wf) && /^\s+ref:/m.test(wf), 'vps.yml takes args and ref');
  ok(new RegExp(`runs-on: \\[self-hosted, ${V.VPS_LABEL}\\]`).test(wf), 'vps.yml runs on the label the panel looks for');
  ok(!/pull_request/.test(wf.replace(/^\s*#.*$/gm, '')), 'vps.yml is never started by a pull request');
  eq(V.RUNS.map((r) => r.args), ['go all', 'selftest', 'status', 'doctor']);
  eq(V.goUnitArgs('coins'), 'go -a coins');
  for (const u of ['', 'a b', 'x;y', '../x', 'A', null]) throws(() => V.goUnitArgs(u), /アドオンの名前/, `unit ${JSON.stringify(u)}`);
  eq(V.runArgs('  go -a coins '), { ok: true, args: 'go -a coins' });
  eq(V.runArgs('node lab.mjs status'), { ok: true, args: 'status' }, 'the command\'s own name taken off');
  eq(V.runArgs('./lab.sh doctor'), { ok: true, args: 'doctor' });
  eq([V.runArgs('').ok, V.runArgs('   ').ok, V.runArgs('a\nb').ok, V.runArgs('x'.repeat(301)).ok], [false, false, false, false]);
});

await t('approvalView: only "every external contributor, every time" is safe on a public lab with a runner of its own (pure)', () => {
  eq([V.approvalView('all_external_contributors').ok, V.approvalView('all_external_contributors').fix], [true, null]);
  for (const p of ['first_time_contributors', 'first_time_contributors_new_to_github', 'something-new']) eq([V.approvalView(p).ok, V.approvalView(p).level, V.approvalView(p).fix], [false, 'bad', 'all_external_contributors'], p);
  eq([V.approvalView(null).ok, V.approvalView(null).level, V.approvalView(null).fix], [false, 'unknown', null], 'not readable: not called safe, no button that would fail');
  eq([V.approvalView('first_time_contributors', { visibility: 'private' }).ok, V.approvalView(null, { visibility: 'internal' }).ok], [true, true], 'a lab that is not public has no strangers');
});

await t('tokenLeft and runsView (pure)', () => {
  const now = Date.parse('2026-11-14T03:00:00Z');
  eq(V.tokenLeft('2026-11-14T03:59:30Z', now), { minutes: 59, say: 'あと 59 分使えます', dead: false });
  eq([V.tokenLeft('2026-11-14T02:59:00Z', now).dead, V.tokenLeft('nonsense', now).minutes, V.tokenLeft(undefined, now).dead], [true, null, false]);
  const runs = [{ id: 3, path: '.github/workflows/vps.yml', display_title: 'vps: lab go all', status: 'in_progress', conclusion: null, html_url: 'https://github.com/a/b/actions/runs/3', created_at: '2026-11-14T03:00:00Z' },
    { id: 2, path: '.github/workflows/verify.yml', status: 'completed', conclusion: 'success' },
    { id: 1, path: '.github/workflows/vps.yml', name: 'vps', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/a/b/actions/runs/1', created_at: '2026-11-14T02:00:00Z' },
    { id: 0, path: '.github/workflows/vps.yml', status: 'completed', conclusion: 'success' }, { id: -1, path: '.github/workflows/vps.yml', status: 'queued' }, { id: -2, path: '.github/workflows/vps.yml', status: 'completed', conclusion: 'cancelled' }];
  eq(V.runsView(runs).map((r) => [r.id, r.state, r.mark]), [[3, 'running', '🔄'], [1, 'failed', '❌'], [0, 'ok', '✅'], [-1, 'queued', '⏳'], [-2, 'stopped', '⏹️']], 'the vps runs only, as they stand');
  eq(V.runsView(runs, { limit: 1 }).length, 1);
  eq(V.runsView(undefined), []);
});

await t('gh: runners, a registration token, taking one off, the fork approval setting — GitHub\'s own addresses', async () => {
  const seen = [];
  const answers = { 'GET /repos/a/b/actions/runners?per_page=100': { total_count: 1, runners: [R('vps1', 'online', false, ['bds-vps'])] },
    'POST /repos/a/b/actions/runners/registration-token': { token: 'AABBCCDDEE1234567890', expires_at: '2026-11-14T04:00:00Z' },
    'GET /repos/a/b/actions/permissions/fork-pr-contributor-approval': { approval_policy: 'first_time_contributors' } };
  const fetchImpl = async (url, o) => {
    const key = `${o.method} ${url.replace('https://api.github.com', '')}`; seen.push([key, o.body ?? null, o.headers.authorization]);
    const a = answers[key];
    return { ok: true, status: a ? 200 : 204, headers: { get: () => null }, text: async () => (a ? JSON.stringify(a) : '') };
  };
  const api = G.gh({ token: 'tok', fetchImpl });
  eq((await api.runners('a/b')).map((r) => r.name), ['vps1']);
  eq((await api.runnerToken('a/b')).token, 'AABBCCDDEE1234567890');
  eq((await api.forkApproval('a/b')).approval_policy, 'first_time_contributors');
  await api.setForkApproval('a/b', 'all_external_contributors');
  await api.removeRunner('a/b', 7);
  eq(seen.map((s) => s[0]), ['GET /repos/a/b/actions/runners?per_page=100', 'POST /repos/a/b/actions/runners/registration-token', 'GET /repos/a/b/actions/permissions/fork-pr-contributor-approval',
    'PUT /repos/a/b/actions/permissions/fork-pr-contributor-approval', 'DELETE /repos/a/b/actions/runners/7']);
  eq(seen[3][1], JSON.stringify({ approval_policy: 'all_external_contributors' }));
  ok(seen.every((s) => s[2] === 'Bearer tok'), 'the person\'s own token, on GitHub\'s API only');
});

await t('the policy: servers is an administrator\'s action, named in words, off for writers whatever a file says', () => {
  ok(P.ACTIONS.includes('servers') && P.GITHUB_NEEDS.servers === 'admin' && /サーバー/.test(P.ACTION_WORDS.servers));
  const everything = P.checkPolicy({ roles: { admin: ['*'], write: ['*'] } }).policy;
  eq([P.can(everything, 'admin', 'servers'), P.can(everything, 'write', 'servers'), P.can(P.DEFAULT_POLICY, 'maintain', 'servers')], [true, false, false]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

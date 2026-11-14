// vps (the 「サーバー」 tab): the lab on the person's own server (a VPS), all from the panel.
//   1. is a server connected and awake (GitHub's runners with the label vps.yml asks for)
//   2. connect one: 「登録の 1 行を作る」 asks GitHub for a registration token (an hour) and shows the single line to paste
//      on the server; the only step outside the panel, because nothing reaches a server that has not called out yet
//   3. the one setting a public repository needs first (fork pull requests approved every time): read, and fixed by a button
//   4. run: go all / selftest / status / doctor / one addon / anything typed → the vps workflow (ctx.guarded('dispatch'))
//   5. the last runs, and the one-line installs for a person's own computer
// Reading writes nothing; every write goes through ctx.guarded (the role's policy, the confirmation, the audit log).
import { h, link, failView, toast } from './dom.mjs';
import * as V from '../lib/vps.mjs';
import { hasWorkflow } from '../lib/workspace.mjs';
import { listUnits } from '../lib/units.mjs';

const copyRow = (text, label) => {
  const pre = h('pre', { 'aria-label': label }, text);
  const btn = h('button', { onclick: () => (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(() => toast('写しました'), () => toast('写せませんでした: 長押しで選んで写してください', true)) }, '📋 写す');
  return h('div', {}, pre, h('div', { class: 'row' }, btn));
};

/** ctx: { api, lab: { slug, repo: { default_branch, visibility }, workflows }, units? ([{ name }]), gate(action)?, guarded(action,
 *  detail, fn, done), dispatch(workflow, inputs), go(tab)?, now? } (units: tests only; else read with lib/units.mjs) — draws into body */
export function vpsTab(body, ctx) {
  const slug = ctx.lab.slug, branch = ctx.lab.repo?.default_branch ?? 'main', visibility = ctx.lab.repo?.visibility ?? (ctx.lab.repo?.private ? 'private' : 'public');
  const g = ctx.gate?.('dispatch') ?? {}, hasWf = hasWorkflow(ctx.lab.workflows, V.VPS_WORKFLOW);
  const state = { ready: false };

  // ---- 1. the servers ----
  const runnersBox = h('div', { role: 'status' }, '読んでいます…');
  const runButtons = [];
  async function drawRunners() {
    try {
      const v = V.runnersView(await ctx.api.runners(slug));
      state.ready = v.ready;
      runnersBox.replaceChildren(h('p', { class: v.ready ? '' : 'warn' }, v.say),
        v.all.length ? h('ul', { class: 'plain' }, v.all.map((r) => h('li', { 'data-state': r.state }, h('div', { class: 'row' },
          h('span', { class: 'grow' }, `${r.mark} `, h('b', {}, r.name), ` ${r.os} · ${{ idle: '待機中', busy: '仕事中', offline: '応答なし' }[r.state]}`, r.ours ? null : h('small', {}, `（ラベル ${V.VPS_LABEL} なし）`)),
          h('button', { ...(ctx.gate?.('servers') ?? {}), onclick: () => ctx.guarded('servers', { name: `${r.name} を外す` }, async () => { await ctx.api.removeRunner(slug, r.id); return true; }, `${r.name} を外しました`).then((ok) => ok && drawRunners()) }, '外す'))))) : null);
    } catch (e) {
      state.ready = false;
      runnersBox.replaceChildren(e.status === 403 || e.status === 404
        ? h('p', { class: 'warn' }, 'ランナーの一覧は、リポジトリの管理者だけが読めます（トークンなら Administration: Read and write）。', ' ', link(`https://github.com/${slug}/settings/actions/runners`, 'GitHub の Runners の画面'))
        : failView(e, drawRunners));
    }
    for (const b of runButtons) b.update();
  }

  // ---- 2. connect a server ----
  const cmdBox = h('div', {});
  const make = h('button', { class: 'primary', ...(ctx.gate?.('servers') ?? {}), onclick: async () => {
    cmdBox.replaceChildren(h('p', { class: 'muted' }, 'GitHub に登録トークンを頼んでいます…'));
    let t = null;
    const ok = await ctx.guarded('servers', { name: '登録トークンを作る' }, async () => { t = await ctx.api.runnerToken(slug); return true; }, null).catch(() => false);
    if (!ok || !t?.token) {
      // (not an administrator, or refused: the same line without the token — the script then asks for it on the server)
      return cmdBox.replaceChildren(h('p', { class: 'warn' }, '登録トークンを作れませんでした（リポジトリの管理者だけが作れます）。次の 1 行をサーバーで実行すると、トークンをその場で聞かれます: ', link(`https://github.com/${slug}/settings/actions/runners/new`, 'GitHub でトークンを見る')),
        copyRow(V.setupCommand({ slug, branch }), 'サーバーで実行する 1 行'));
    }
    const left = V.tokenLeft(t.expires_at, ctx.now ?? Date.now());
    return cmdBox.replaceChildren(
      h('p', {}, 'サーバーに SSH で入り、次の 1 行を貼って実行します（root か sudo できる人で）。終わると上の一覧に出ます。'),
      copyRow(V.setupCommand({ slug, branch, token: t.token }), 'サーバーで実行する 1 行'),
      h('p', { class: 'muted' }, `この行には登録トークンが入っています（${left.say}。ランナーを 1 台登録できるだけで、ほかのことはできません）。人に見せないでください。`),
      h('div', { class: 'row' }, h('button', { onclick: () => drawRunners() }, '一覧を読み直す')));
  } }, '🖧 登録の 1 行を作る');

  // ---- 3. the setting a public repository needs first ----
  const safeBox = h('div', { role: 'status' }, '読んでいます…');
  async function drawSafe() {
    let policy = null;
    try { policy = (await ctx.api.forkApproval(slug))?.approval_policy ?? null; } catch (e) { if (e.status !== 403 && e.status !== 404) return safeBox.replaceChildren(failView(e, drawSafe)); }
    const a = V.approvalView(policy, { visibility });
    return safeBox.replaceChildren(h('p', { class: a.ok ? '' : 'warn' }, a.ok ? '✅ ' : '⚠️ ', a.say),
      a.fix ? h('div', { class: 'row' }, h('button', { class: 'primary', ...(ctx.gate?.('servers') ?? {}), onclick: () => ctx.guarded('servers', { name: '外部のプルリクエストに毎回の承認を必須に' }, async () => { await ctx.api.setForkApproval(slug, a.fix); return true; }, '外部の人のプルリクエストは、毎回の承認が要るようにしました').then((ok) => ok && drawSafe()) }, '🔒 毎回の承認を必須にする')) : null,
      a.ok ? null : h('p', {}, link(`https://github.com/${slug}/settings/actions`, 'GitHub の Actions の設定')));
  }

  // ---- 4. run ----
  const runNote = h('p', { class: 'warn' });
  const send = (args, what) => ctx.guarded('dispatch', { workflow: V.VPS_WORKFLOW, args }, async () => { await ctx.dispatch(V.VPS_WORKFLOW, { args, ref: '' }); return true; }, `サーバーで「${what}」を始めました（「進み具合」に出ます）`).then((ok) => { if (ok) setTimeout(drawRuns, 4000); return ok; });
  const runBtn = (label, onclick, primary = false) => {
    const b = h('button', { class: primary ? 'primary' : '', onclick }, label);
    b.update = () => {
      // (no vps.yml: the card above says so, with the way to get it — here the buttons are only off)
      const role = g.disabled ? g.title || 'この役割では走らせられません' : '', why = role || (!hasWf ? `このラボには .github/workflows/${V.VPS_WORKFLOW} がありません` : '');
      b.disabled = Boolean(why); if (why) b.setAttribute('title', why); else b.removeAttribute('title');
      const note = role || (hasWf && !state.ready ? 'いま応答するサーバーがありません: 始めても、サーバーが起きるまで待ちになります。' : '');
      runNote.replaceChildren(note); runNote.hidden = !note;
    };
    runButtons.push(b);
    return b;
  };
  // (the lab's addons, read once: a lab that cannot be listed just has no picker — the typed line still runs any of them)
  const unitSel = h('select', { 'aria-label': 'アドオン' }), unitRow = h('div', { class: 'row', hidden: true });
  (ctx.units ? Promise.resolve(ctx.units) : listUnits(ctx.api, slug)).then((us) => {
    const names = (us ?? []).filter((u) => (u.kind ?? 'bds') === 'bds').map((u) => u.name);
    if (!names.length) return;
    unitSel.replaceChildren(names.map((n) => h('option', { value: n }, n))); unitRow.hidden = false;
  }).catch(() => { /* no picker */ });
  const typed = h('input', { type: 'text', placeholder: 'status', 'aria-label': 'node lab.mjs に渡す引数', size: 28 });
  unitRow.append(h('span', {}, '🧩 アドオンを 1 本: '), unitSel, runBtn('go', () => { try { return send(V.goUnitArgs(unitSel.value), `go -a ${unitSel.value}`); } catch (e) { return toast(e.message, true); } }));
  const runCard = h('div', { class: 'card', 'data-card': 'vps-run' }, h('h2', {}, '▶️ サーバーで走らせる'), runNote,
    h('ul', { class: 'plain' }, V.RUNS.map((r, i) => h('li', {}, h('div', { class: 'row' }, h('span', { class: 'grow' }, h('strong', {}, r.label), h('div', { class: 'muted' }, r.say)), runBtn('始める', () => send(r.args, r.label), i === 0))))),
    unitRow,
    h('div', { class: 'row' }, h('span', {}, '⌨️ node lab.mjs '), typed, runBtn('走らせる', () => { const r = V.runArgs(typed.value); return r.ok ? send(r.args, r.args) : toast(r.why, true); })));

  // ---- 5. the last runs ----
  const runsBox = h('div', { role: 'status' }, '読んでいます…');
  async function drawRuns() {
    try {
      const list = V.runsView(await ctx.api.runs(slug, { per: 30, workflow: V.VPS_WORKFLOW }));
      runsBox.replaceChildren(list.length ? h('ul', { class: 'plain' }, list.map((r) => h('li', { 'data-state': r.state }, `${r.mark} `, link(r.url, r.title), h('small', {}, ` ${r.at.replace('T', ' ').replace('Z', '')}`))))
        : h('p', { class: 'muted' }, 'まだサーバーで走らせた記録がありません。'),
      ctx.go ? h('div', { class: 'row' }, h('button', { onclick: () => ctx.go('runs') }, '「進み具合」で全部を見る'), h('button', { onclick: () => drawRuns() }, '読み直す')) : null);
    } catch (e) { runsBox.replaceChildren(failView(e, drawRuns)); }
  }

  let inst = null; try { inst = V.installCommands({ slug, branch }); } catch { /* an odd repository name: no card */ }
  body.append(
    h('div', { class: 'card', 'data-card': 'vps-runners' }, h('h2', {}, '🖧 つないであるサーバー'),
      h('p', { class: 'muted' }, '自分のサーバー（VPS）を GitHub Actions のランナーにすると、ここからラボをそのサーバーで走らせられます。サーバーから GitHub へつなぐだけなので、SSH もポートを開けることも要りません。'),
      runnersBox, h('div', { class: 'row' }, h('button', { onclick: () => drawRunners() }, '読み直す'))),
    h('div', { class: 'card', 'data-card': 'vps-safe' }, h('h2', {}, '🔒 つなぐ前に'), safeBox),
    h('div', { class: 'card', 'data-card': 'vps-connect' }, h('h2', {}, '➕ サーバーをつなぐ'),
      h('p', { class: 'muted' }, 'systemd のある Linux のサーバーで 1 回だけ。sudo を持たない専用のユーザーを作り、ランナー本体をハッシュで確かめて入れ、サービスとして起こします（再起動のあとも動きます）。'),
      h('div', { class: 'row' }, make), cmdBox),
    hasWf ? null : h('div', { class: 'card' }, h('p', { class: 'warn' }, `このラボには .github/workflows/${V.VPS_WORKFLOW} がまだありません: ラボを新しくすると使えます（フォークなら GitHub のラボのページで Sync fork → Update branch）。`)),
    runCard,
    h('div', { class: 'card', 'data-card': 'vps-runs' }, h('h2', {}, '🕘 最近の実行'), runsBox),
    inst ? h('details', { class: 'card', 'data-card': 'vps-install' }, h('summary', {}, '💻 自分のパソコンにラボを入れる（1 行）'),
      h('p', { class: 'muted' }, '何も入っていないパソコンで、ラボの取得からサーバーの用意、本物のサーバーでの点検までを 1 行で。もう一度実行すると更新になります。'),
      h('h3', {}, 'Linux・macOS・WSL'), copyRow(inst.sh, 'Linux・macOS・WSL の 1 行'),
      h('h3', {}, 'Windows（PowerShell）'), copyRow(inst.ps1, 'Windows の 1 行')) : null);
  for (const b of runButtons) b.update();
  drawRunners(); drawSafe(); drawRuns();
}

// vps (pure): the lab on a person's own server, from the panel. The server (a VPS) is a GitHub Actions runner of the lab's
// repository (vps/runner-setup.sh makes it one); the `vps` workflow (.github/workflows/vps.yml) runs `node lab.mjs <args>` on
// it. The panel: is a runner there and awake, the one line to paste on the server (with a registration token GitHub gives for
// an hour), what to run, and the one setting a public repository needs before it has a runner of its own.
//   runnersView     GitHub's runners → the lab's (label bds-vps), each idle / busy / offline, and one sentence
//   setupCommand    the line to paste on the server (root); every part checked: it goes into a root shell
//   installCommands the one-line installs for a person's own computer (install.sh / install.ps1)
//   RUNS, runArgs   what the 「走らせる」 buttons send as the workflow's `args`; a typed one checked
//   approvalView    the fork pull request approval setting → safe or not, and why it matters with a runner of one's own
//   tokenLeft       how long a registration token still lives

export const VPS_WORKFLOW = 'vps.yml';
export const VPS_LABEL = 'bds-vps';

const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;
const TOKEN = /^[A-Za-z0-9_]{10,200}$/;
const UNIT = /^[a-z0-9_]{1,64}$/;

/** GitHub's list of self-hosted runners → { all, ours, online, busy, ready, say } (pure). ours: those with the label vps.yml
 *  asks for; ready: one of ours is online (a run would start now) */
export function runnersView(list, { label = VPS_LABEL } = {}) {
  const all = (Array.isArray(list) ? list : []).map((r) => {
    const labels = (r?.labels ?? []).map((l) => String(l?.name ?? l)), online = r?.status === 'online', busy = Boolean(r?.busy);
    const state = !online ? 'offline' : busy ? 'busy' : 'idle';
    return { id: r?.id ?? null, name: String(r?.name ?? ''), os: String(r?.os ?? ''), labels, ours: labels.includes(label), state, mark: { idle: '🟢', busy: '🟡', offline: '⚫' }[state] };
  });
  const ours = all.filter((r) => r.ours), online = ours.filter((r) => r.state !== 'offline'), busy = ours.filter((r) => r.state === 'busy');
  const say = !ours.length ? (all.length ? `ランナーは ${all.length} 台ありますが、ラベル ${label} のものがありません（vps のワークフローはそのラベルの機械で走ります）。` : 'まだランナーがありません。下の手順でサーバーを 1 台つなぎます。')
    : !online.length ? `${ours.length} 台つないでありますが、いまは応答がありません（サーバーが止まっているか、ランナーのサービスが止まっています）。`
      : busy.length === online.length ? `${online.length} 台が動いています（いま仕事中です。次の実行は終わるまで待ちます）。`
        : `${online.length - busy.length} 台が待機中です。すぐ走らせられます。`;
  return { all, ours, online: online.length, busy: busy.length, ready: online.length > 0, say };
}

/** the line to paste on the server, as root (pure). token: GitHub's registration token (null: the script asks for it on the
 *  terminal). Every part is checked — the line runs in a root shell: a slug, branch, token or label with anything a shell
 *  reads as more than a word throws */
export function setupCommand({ slug, branch = 'main', token = null, labels = VPS_LABEL } = {}) {
  if (!SLUG.test(String(slug ?? ''))) throw new Error('リポジトリの名前が owner/repo の形ではありません');
  if (!BRANCH.test(String(branch ?? '')) || String(branch).includes('..')) throw new Error('枝の名前に使えない文字があります');
  if (token !== null && !TOKEN.test(String(token))) throw new Error('登録トークンの形が違います（GitHub が出した英数字だけのもの）');
  if (!/^[A-Za-z0-9._-]{1,60}(,[A-Za-z0-9._-]{1,60})*$/.test(String(labels ?? ''))) throw new Error('ラベルに使えない文字があります');
  const env = [`RUNNER_REPO=${slug}`, ...(labels !== VPS_LABEL ? [`RUNNER_LABELS=${labels}`] : []), ...(token ? [`RUNNER_TOKEN=${token}`] : [])].join(' ');
  return `curl -fsSL https://raw.githubusercontent.com/${slug}/${branch}/vps/runner-setup.sh -o runner-setup.sh && sudo env ${env} sh runner-setup.sh`;
}

/** the one-line installs of the lab on a person's own computer (pure): { sh (Linux, macOS, WSL), ps1 (Windows PowerShell) } */
export function installCommands({ slug, branch = 'main' } = {}) {
  if (!SLUG.test(String(slug ?? ''))) throw new Error('リポジトリの名前が owner/repo の形ではありません');
  if (!BRANCH.test(String(branch ?? '')) || String(branch).includes('..')) throw new Error('枝の名前に使えない文字があります');
  const raw = `https://raw.githubusercontent.com/${slug}/${branch}`;
  // (a fork or another branch installs itself: the installers read BDS_LAB_REPO / BDS_LAB_REF)
  const own = slug === 'noknoh12345-afk/bds-lab' && branch === 'main';
  return {
    sh: own ? `curl -fsSL ${raw}/install.sh | sh` : `curl -fsSL ${raw}/install.sh | BDS_LAB_REPO=${slug} BDS_LAB_REF=${branch} sh`,
    ps1: own ? `irm ${raw}/install.ps1 | iex` : `$env:BDS_LAB_REPO='${slug}'; $env:BDS_LAB_REF='${branch}'; irm ${raw}/install.ps1 | iex`,
  };
}

/** what the buttons run: the workflow's `args` (what follows `node lab.mjs`) */
export const RUNS = Object.freeze([
  { id: 'goall', label: '⚡ 全アドオンを同時に確かめる', args: 'go all', say: 'コア数ぶんのサーバーを同時に立てて、全部のアドオンを go に通します' },
  { id: 'selftest', label: '🩺 サーバーごと点検（selftest）', args: 'selftest', say: '本物のサーバーと本物のクライアントで、ラボ自体を確かめます（1〜3 分）' },
  { id: 'status', label: '📋 いまの状態', args: 'status', say: 'サーバーの版・アドオン・ディスク' },
  { id: 'doctor', label: '🔧 この機械に足りないもの', args: 'doctor', say: '足りないもの・塞がれている通信と、その直し方' },
]);
/** one addon through go on the server: its args (pure); a name that is not an addon's folder name throws */
export function goUnitArgs(unit) {
  if (!UNIT.test(String(unit ?? ''))) throw new Error('アドオンの名前は英小文字・数字・_ だけです');
  return `go -a ${unit}`;
}
/** args typed by hand → { ok, args } | { ok: false, why } (pure). The workflow hands the words to lab.mjs without a shell
 *  (xargs), so nothing here can run a command of its own; this only keeps what could not be meant: empty, lines, too long */
export function runArgs(text) {
  const args = String(text ?? '').trim().replace(/^node\s+lab\.mjs\s+/, '').replace(/^\.\/lab\.sh\s+/, '');
  if (!args) return { ok: false, why: '何を走らせるかを書いてください（例: status）' };
  if (/[\r\n]/.test(args)) return { ok: false, why: '1 行で書いてください' };
  if (args.length > 300) return { ok: false, why: '長すぎます（300 文字まで）' };
  return { ok: true, args };
}

/** the repository's "approval for fork pull request workflows" setting → { ok, level, say, fix } (pure). With a runner of
 *  one's own on a public repository, a stranger's pull request must not start a workflow without someone reading it first:
 *  only `all_external_contributors` asks every time. A private repository has no strangers' pull requests: fine as it is.
 *  policy: GitHub's approval_policy, or null when it could not be read */
export function approvalView(policy, { visibility = 'public' } = {}) {
  if (visibility !== 'public') return { ok: true, level: 'ok', say: '公開していないリポジトリです: 知らない人のプルリクエストは来ません。', fix: null };
  if (policy === 'all_external_contributors') return { ok: true, level: 'ok', say: '外部の人のプルリクエストは、毎回だれかが承認するまでワークフローが走りません。', fix: null };
  if (policy === null || policy === undefined) return { ok: false, level: 'unknown', say: 'この設定を読めませんでした（管理者の権限が要ります）。GitHub の画面で「Require approval for all external contributors」になっているか確かめてください。', fix: null };
  return { ok: false, level: 'bad', say: '公開リポジトリに自分のサーバーをつなぐ前に: いまの設定では、外部の人のプルリクエストが承認なしでワークフローを走らせることがあります（あなたのサーバーで他人のコードが動きます）。', fix: 'all_external_contributors' };
}

/** how long a registration token still lives: { minutes, say, dead } (pure) */
export function tokenLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(String(expiresAt ?? '')) - now;
  if (!Number.isFinite(ms)) return { minutes: null, say: '1 時間だけ使えます', dead: false };
  const minutes = Math.floor(ms / 60000);
  return minutes <= 0 ? { minutes: 0, say: 'この登録トークンは切れました: もう一度作ってください', dead: true } : { minutes, say: `あと ${minutes} 分使えます`, dead: false };
}

/** the vps workflow's runs, newest first → the few lines the screen shows (pure): { id, title, state, mark, url, at } */
export function runsView(runs, { limit = 5 } = {}) {
  return (Array.isArray(runs) ? runs : []).filter((r) => /(^|\/)vps\.yml$/.test(String(r?.path ?? ''))).slice(0, limit).map((r) => {
    const state = r.status !== 'completed' ? (r.status === 'queued' ? 'queued' : 'running') : r.conclusion === 'success' ? 'ok' : r.conclusion === 'cancelled' ? 'stopped' : 'failed';
    return { id: r.id, title: String(r.display_title ?? r.name ?? 'vps'), state, mark: { queued: '⏳', running: '🔄', ok: '✅', stopped: '⏹️', failed: '❌' }[state], url: String(r.html_url ?? ''), at: String(r.created_at ?? '') };
  });
}

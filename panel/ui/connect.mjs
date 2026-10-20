// connect (the 「連携」 tab): one card for each service the lab can be tied to (lib/connect.mjs) — how it stands (✅ tied, ⚠️
// not yet, ❔ not checked), the steps with the official page to open (the person logs in, agrees and makes the token there:
// the panel presses none of it), fields whose shape is checked before anything is sent, and 「封じて登録して確かめる」:
// each value sealed in this browser into the lab's secrets, connect.yml started and waited for, its notice read and shown with
// the next step (Discord: the invite link). 「全部つなぐ」 opens the services not yet tied one after another. A secret field is
// a password field, not offered to the browser, and emptied once the value is sent; no value is kept, shown or recorded.
import { h, toast, link, failView } from './dom.mjs';
import * as C from '../lib/connect.mjs';
import * as P from '../lib/policy.mjs';
import * as PK from '../lib/pick.mjs';

const ICON = { ok: '✅ ', bad: '⚠️ ', missing: '⚠️ ', unchecked: '❔ ' };
const STATE_WORDS = { ok: 'つながっている', bad: 'つながらなかった', missing: '未（秘密がまだ入っていません）', unchecked: '入っているが、確かめていない' };
const NEEDS = ['secrets.put', 'dispatch'];
const roleName = (r) => (typeof r === 'string' ? r : r?.name ?? (r?.names?.length ? `${r.names.join(' か ')}（チームが読めません）` : 'なし'));
/** why this person may not connect (words), null when they may: GitHub's write role at least, and the policy's role allows
 *  putting secrets and starting a workflow */
function notAllowed(ctx) {
  const policy = ctx.policy ?? P.DEFAULT_POLICY, role = ctx.role ?? ctx.lab?.role;
  if (P.GITHUB_ROLES.indexOf(ctx.lab?.role) < P.GITHUB_ROLES.indexOf('write')) return 'このラボに書ける人（GitHub の write 以上）が連携できます';
  const no = NEEDS.filter((a) => !P.can(policy, role, a));
  return no.length ? `役割「${roleName(role)}」には、ポリシー（${P.POLICY_FILE} の roles）が「${no.map((a) => P.ACTION_WORDS[a] ?? a).join('・')}」を許していません` : null;
}

/** the 「連携」 tab. ctx: the same as setupTab's { api, lab: { slug, secrets, role }, me, policy, role, reload, record(action, detail)?,
 *  authUrl? (the sign-in service: Microsoft's sign-in from a phone goes through it), panelUrl? (「つまみ」 is made for it),
 *  pick? (「つまみ」's values on arrival: PK.takePick) and pickUsed(), fetchImpl?, sleep? (tests) } */
export function connectTab(body, ctx) {
  const checked = {}, cards = new Map(), say = h('div', { class: 'muted', role: 'status' });
  let queue = null;
  const secrets = () => ctx.lab.secrets ?? [];
  const refresh = () => { for (const s of C.status(secrets(), checked)) cards.get(s.key)?.paint(s); };
  // 「全部つなぐ」: the next service not yet tied, its card opened and scrolled to
  const advance = () => {
    const left = queue?.filter((k) => C.status(secrets(), checked).find((s) => s.key === k)?.state !== 'ok') ?? [];
    if (!queue || !left.length) { queue = null; say.replaceChildren(left.length ? '' : '✅ つなぐものは、すべてつながりました'); return; }
    const k = left[0], c = cards.get(k);
    c.details.open = true; c.details.scrollIntoView?.();
    say.replaceChildren(`つぎは ${C.serviceOf(k).name}: 手順の通りに画面を開いて、値を貼ってください（残り ${left.length}）`);
  };
  const no = notAllowed(ctx);
  const all = h('button', { class: 'primary', onclick: () => {
    if (no) return toast(no, true);
    queue = C.status(secrets(), checked).filter((s) => s.state !== 'ok').map((s) => s.key);
    advance();
  } }, '全部つなぐ');
  for (const svc of C.SERVICES) cards.set(svc.key, card(ctx, svc, { checked, no, secrets, refresh, done: (r) => { if (!queue) return; if (r.ok) return advance(); queue = null; say.replaceChildren(`${svc.name} がつながらないので止めました: 直してから、もう一度「全部つなぐ」`); }, skip: () => { if (queue) { queue = queue.filter((k) => k !== svc.key); advance(); } } }));
  put(body, h('div', { class: 'card' }, h('h2', {}, `連携（${ctx.lab.slug}）`),
    h('p', { class: 'muted' }, 'サービスごとに、公式の画面を開いて値を写し、ここに貼ります。値はこのブラウザで封じてから GitHub の秘密に入り、GitHub Actions で本物かを確かめます（値は残しません・表示しません）。ログインや同意の確認は、あなたが公式の画面で押します。'),
    no ? h('p', { class: 'bad', role: 'alert' }, `（${no}）`) : null, h('div', { class: 'row' }, all), say),
  ctx.panelUrl ? pickCard(ctx) : null, [...cards.values()].map((c) => c.el));
  refresh();
  // (「つまみ」 brought values: each card they belong to opened, its fields filled — sealed and checked only when the person
  //  presses 「封じて登録して確かめる」, as if they had pasted them)
  const p = ctx.pick;
  if (p && (Object.keys(p.picks ?? {}).length || p.rejected?.length)) {
    const opened = PK.pickCards(p.picks).map((x) => { const c = cards.get(x.service); c?.fill(x.fields); return C.serviceOf(x.service).name; });
    say.replaceChildren(h('div', { class: 'ok', role: 'status' }, `🔖 つまみから受け取りました: ${opened.join('・') || '（使える値なし）'}${opened.length ? ' — 開いたカードの「封じて登録して確かめる」を押してください' : ''}`),
      p.rejected?.length ? h('div', { class: 'bad' }, `形が違うので使いませんでした: ${p.rejected.join('・')}`) : null);
    const first = PK.pickCards(p.picks)[0];
    if (first) cards.get(first.service)?.details.scrollIntoView?.({ block: 'start' });
    ctx.pick = null; ctx.pickUsed?.();
  }
  return Promise.resolve([...cards.keys()]);
}

// (the children flattened and the empty ones dropped: replaceChildren/append alone would write a null or an array as text)
function put(el, ...kids) {
  const fresh = kids.at(-1) === true; if (fresh) kids.pop();
  const xs = kids.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);
  if (fresh) el.replaceChildren(...xs); else el.append(...xs);
}

function card(ctx, svc, k) {
  const st = h('div', {}), steps = h('ol', {}, svc.steps.map((s) => h('li', {}, s.say, s.link ? [' ', link(C.safeLink(s.link), '公式の画面を開く')] : null)));
  const fields = svc.fields.map((f) => [f, h('input', { type: f.secret ? 'password' : 'text', autocomplete: 'off', 'aria-label': f.label, placeholder: f.optional ? '（なくてもよい）' : null })]);
  const out = h('div', { class: 'muted', role: 'status' }), details = h('details', {}, h('summary', {}, 'つなぐ'));
  const btn = h('button', { class: 'primary', onclick: () => go() }, '封じて登録して確かめる');
  const skip = h('button', { onclick: () => k.skip() }, 'とばして次へ（「全部つなぐ」の途中）');
  const go = async () => {
    if (k.no) return toast(k.no, true);
    const values = Object.fromEntries(fields.map(([f, el]) => [f.name, el.value.trim()]));
    const bad = C.problems(svc, values, k.secrets());
    if (Object.keys(bad).length) { out.replaceChildren(h('div', { class: 'bad', role: 'alert' }, Object.values(bad).join(' / '))); return; }
    btn.disabled = true; out.replaceChildren('封じて登録しています…');
    try {
      for (const f of svc.fields) {
        if (!values[f.name]) continue;
        // (through the page's guard when it gives one — guarded: the policy's confirm, an administrator who must lend first,
        // the audit log per secret — else straight)
        const put1 = () => ctx.api.putSecret(ctx.lab.slug, f.name, values[f.name]);
        if (ctx.guarded) { if (await ctx.guarded('secrets.put', { name: f.name }, put1) === undefined) throw new Error(`${f.name} を登録しませんでした（上の知らせ）`); } else await put1();
        ctx.lab.secrets = [...new Set([...k.secrets(), f.name])];
        // (sent: the value leaves the page at once, not after the check)
        fields.find(([x]) => x.name === f.name)[1].value = '';
      }
      for (const [, el] of fields) el.value = '';
      k.refresh();
      const api = ctx.guarded ? { ...ctx.api, dispatch: async (...a) => { const r0 = await ctx.guarded('dispatch', { workflow: 'connect.yml' }, () => ctx.api.dispatch(...a)); if (r0 === undefined) throw new Error('connect.yml を始めませんでした（上の知らせ）'); return r0; } } : ctx.api;
      const r = await C.runCheck(api, ctx.lab.slug, svc.key, { ref: ctx.lab.repo?.default_branch ?? 'main', me: ctx.me?.login, onStep: (t) => out.replaceChildren(t) });
      k.checked[svc.key] = r;
      ctx.record?.(`connect.${svc.key}`, { ok: r.ok });
      put(out, h('div', { class: r.ok ? 'ok' : 'bad', role: r.ok ? 'status' : 'alert' }, (r.ok ? '✅ ' : '⚠️ ') + r.text),
        r.next ? h('div', {}, r.next.say, r.next.url ? [' ', link(r.next.url, '開く')] : null) : null, true);
      k.refresh(); k.done(r);
    } catch (e) {
      for (const [, el] of fields) el.value = '';
      put(out, failView(e, () => go()), true);
      k.refresh(); k.done({ ok: false });
    } finally { btn.disabled = false; }
  };
  put(details, h('p', { class: 'muted' }, svc.why), steps,
    k.no ? h('div', { class: 'muted' }, `（${k.no}）`) : [fields.map(([f, el]) => [h('label', {}, f.label), el]), h('div', { class: 'row' }, btn, skip)], out,
    svc.key === 'microsoft' && !k.no ? msPhone(ctx, k) : null);
  const el = h('div', { class: 'card', 'data-service': svc.key }, h('h3', {}, svc.name), st, details);
  const paint = (s) => {
    const n = s.state === 'missing' && s.missing.length ? ` — ${s.missing.join('・')}` : '';
    put(st, h('div', {}, ICON[s.state], STATE_WORDS[s.state], n), s.result && !s.result.ok ? h('div', { class: 'bad' }, s.result.text) : null, true);
  };
  /** values from 「つまみ」 → the fields filled and the card opened (nothing sent yet) */
  const fill = (vals) => { for (const [f, el] of fields) if (vals[f.name]) el.value = vals[f.name]; details.open = true; put(out, h('div', { class: 'ok' }, '🔖 つまみの値を入れました: 確かめて「封じて登録して確かめる」'), true); };
  return { el, details, paint, fill };
}

/** 「📱 Microsoft で普通にサインイン」 (lan's bots): a code from the sign-in service, Microsoft's own page opened with it filled in
 *  (the person signs in there as always — passkey, Authenticator, two-step), waited for, and live.com's tokens sealed into the
 *  secret MS_LIVE_<NAME>. Nothing is kept on this page: the handle and the tokens live in variables until the secret is put */
function msPhone(ctx, k) {
  const name = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'ボットの名前', placeholder: 'MAIN', maxlength: '40' });
  const out = h('div', { role: 'status', 'aria-live': 'polite' }), kept = h('div', { class: 'muted' });
  const paintKept = () => { const l = k.secrets().filter((n) => C.MS_LIVE_SECRET.test(n)); put(kept, l.length ? `登録済み: ${l.join('・')}` : 'まだ登録されていません', true); };
  let busy = false, left = false;
  const start = h('button', { class: 'primary', onclick: () => go() }, 'サインインを始める');
  const go = async () => {
    if (busy) return;
    if (!ctx.authUrl) return put(out, h('div', { class: 'bad', role: 'alert' }, 'サインインのサービスがありません: 「準備」でサインインのサービスを置いてください'), true);
    busy = true; left = false; start.disabled = true;
    const secret = C.msSecretName(name.value);
    try {
      const s = await C.msStart(ctx.authUrl, { fetchImpl: ctx.fetchImpl });
      const copy = h('button', { onclick: () => navigator.clipboard?.writeText(s.code).then(() => toast('コードを写しました'), () => toast('写せませんでした: 手で入れてください', true)) }, '📋 コードを写す');
      const stop = h('button', { onclick: () => { left = true; } }, 'やめる');
      const wait = h('div', { class: 'muted' }, 'Microsoft の画面でサインインが終わるのを待っています…');
      put(out, h('p', {}, '① 下のボタンで Microsoft の画面を開き、いつものようにサインインします（コードは入っています。聞かれたら下のコードを）。'),
        h('p', { class: 'code-big', 'aria-label': 'コード' }, s.code),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: s.link, target: '_blank', rel: 'noopener noreferrer' }, 'Microsoft の画面を開く'), copy, stop),
        h('p', { class: 'muted' }, '② 「Minecraft for Nintendo Switch」へのアクセスを聞かれたら「はい」。終わったらこの画面に戻ります。'), wait, true);
      const r = await C.msWait(ctx.authUrl, s, { fetchImpl: ctx.fetchImpl, sleep: ctx.sleep, stop: () => left, onTick: (sec) => wait.replaceChildren(`Microsoft の画面でサインインが終わるのを待っています…（あと ${Math.floor(sec / 60)} 分 ${sec % 60} 秒）`) });
      put(out, 'サインインできました: 封じて登録しています…', true);
      const value = C.msSecretValue(r);
      const put1 = () => ctx.api.putSecret(ctx.lab.slug, secret, value);
      if (ctx.guarded) { if (await ctx.guarded('secrets.put', { name: secret }, put1) === undefined) throw new Error(`${secret} を登録しませんでした（上の知らせ）`); } else await put1();
      ctx.lab.secrets = [...new Set([...k.secrets(), secret])];
      ctx.record?.('connect.microsoft.live', { name: secret, ok: true });
      const who = r.gamertag ? `「${r.gamertag}」` : 'そのアカウント';
      put(out, h('div', { class: 'ok', role: 'status' }, `✅ ${who}を ${secret} に封じて登録しました`),
        r.profile === false ? h('div', { class: 'bad' }, 'このアカウントにはまだ Xbox のプロフィールがありません: xbox.com で一度サインインしてプロフィールを作ってから使ってください') : null,
        h('div', { class: 'muted' }, `lan で使う: node lab.mjs lan account import ${secret.slice('MS_LIVE_'.length).toLowerCase()}（秘密 ${secret} を読みます）`), true);
      paintKept();
    } catch (e) {
      put(out, h('div', { class: 'bad', role: 'alert' }, `⚠️ ${e.message}`), true);
    } finally { busy = false; start.disabled = false; }
  };
  paintKept();
  return h('section', { class: 'card', 'data-part': 'ms-phone' }, h('h4', {}, '📱 lan のボット: Microsoft で普通にサインイン'),
    h('p', { class: 'muted' }, 'パスワードはここに入れません。Microsoft の画面（microsoft.com/link）で、いつものように（パスキー・Authenticator・二段階認証も）サインインするだけです。受け取ったトークンは、このブラウザで封じて秘密 MS_LIVE_<名前> に入れます。'),
    h('label', {}, 'ボットの名前（英数字。空なら MAIN）'), name, h('div', { class: 'row' }, start), out, kept);
}

/** 「🔖 つまみ」: the lab's own bookmark (lib/pick.mjs), made for this panel — how to keep it on a phone, and the link itself */
function pickCard(ctx) {
  let code;
  try { code = PK.bookmarklet(ctx.panelUrl); } catch { return null; }
  const box = h('textarea', { readonly: true, rows: '3', 'aria-label': 'つまみ（ブックマークの URL）' }, code);
  const copy = h('button', { class: 'primary', onclick: () => navigator.clipboard?.writeText(code).then(() => toast('つまみを写しました: ブックマークの URL に貼ってください'), () => { box.select?.(); toast('写せませんでした: 上の欄を長押しして全部コピー', true); }) }, '📋 つまみを写す');
  return h('details', { class: 'card', 'data-part': 'pick' }, h('summary', {}, '🔖 つまみ（スマホで値を拾うブックマーク・自作）'),
    h('p', { class: 'muted' }, '各サービスの画面で値（トークン・キー）が出ているときに押すと、その値を拾ってこのパネルに渡します。入れるものはありません。何も読み込まず、拾った値はこのパネルの「連携」のカードに入るだけです（封じて登録するのは、あなたがボタンを押したとき）。'),
    h('ol', {},
      h('li', {}, '下の「つまみを写す」を押す。'),
      h('li', {}, 'iPhone（Safari）: どのページでもよいので共有 →「ブックマークを追加」。ブックマークを編集して、アドレスを写したものに置き換え、名前を「つまみ」に。'),
      h('li', {}, 'Android（Chrome）: ☆ でブックマークを作り、編集でアドレスを写したものに置き換え、名前を「つまみ」に。使うときはアドレス欄に「つまみ」と打って候補のブックマークを押します。'),
      h('li', {}, '使う: Discord の Reset Token の後・Cloudflare でトークンを作った直後・API キーを作った直後などに、その画面で「つまみ」を開く → 確認 →「はい」でこのパネルに戻ります。')),
    h('p', { class: 'muted' }, 'Google の oauth_token は、ブラウザや Google の守り（cookie をページから読めなくする・ブックマークの実行を止める）で拾えないことがあります。そのときは、そう表示されます。'),
    box, h('div', { class: 'row' }, copy, h('a', { class: 'btn', href: code, title: 'パソコンではこれをブックマークバーへ引きずる' }, '🔖 つまみ')));
}

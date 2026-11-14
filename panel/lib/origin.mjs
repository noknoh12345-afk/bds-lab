// origin (pure): who else shares the panel's origin. A browser keeps localStorage per origin — scheme, host and port, never
// the path — and GitHub Pages serves every repository of one owner from the same origin, https://<owner>.github.io: the
// panel at /<lab>/ and the owner's other Pages sites at /<other>/ (and the owner's own site at /) are one origin. Any script
// on any of them can read what the panel keeps in this browser — a remembered account's token among it. The panel cannot
// wall itself off from them; it can say which sites they are and the ways out: a domain of the panel's own (a custom domain
// on the lab's Pages: an origin of its own), or not remembering the account (kept in this tab only), or turning the other
// sites' Pages off.
//   sharedOrigin   the page's host + the owner's repositories (GitHub's has_pages) → { shared, others, say, level }

const PAGES_HOST = /^([a-z0-9](?:[a-z0-9-]{0,38}))\.github\.io$/i;

/** hostname: the page's (location.hostname); lab: 'owner/repo'; repos: GitHub's repositories of that owner ([{ name,
 *  has_pages, html_url }], null when they could not be read) → { shared, others: [{ name, url }], level, say } (pure) */
export function sharedOrigin({ hostname, lab, repos }) {
  const m = PAGES_HOST.exec(String(hostname ?? ''));
  if (!m) return { shared: false, others: [], level: 'ok', say: 'このパネルは自分のドメインで開かれています: ほかのサイトとブラウザの保管場所を分け合いません。' };
  const owner = m[1].toLowerCase(), labName = String(lab ?? '').split('/')[1]?.toLowerCase() ?? '';
  if (!Array.isArray(repos)) return { shared: true, others: [], level: 'unknown', say: `このパネルは ${owner}.github.io で開かれています。同じ持ち主のほかの GitHub Pages のサイトとは、ブラウザの保管場所（覚えたアカウントのトークンを含む）を分け合います。どのサイトがあるかは読めませんでした。` };
  const others = repos.filter((r) => r?.has_pages && String(r.name ?? '').toLowerCase() !== labName).map((r) => {
    const n = String(r.name);
    return { name: n, url: n.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${n}/` };
  });
  if (!others.length) return { shared: true, others, level: 'ok', say: `${owner}.github.io にある GitHub Pages のサイトは、いまはこのパネルだけです（ほかのサイトを Pages で公開すると、そのサイトの JavaScript がここで覚えたトークンを読めるようになります）。` };
  return { shared: true, others, level: 'warn', say: `${owner}.github.io には、このパネルのほかに ${others.length} 個の GitHub Pages のサイトがあります。ブラウザは同じ場所として扱うので、それらのページの JavaScript は、このパネルが覚えたアカウントのトークンを読めます。` };
}

/** the ways out, in the order they help (pure) */
export const WAYS_OUT = Object.freeze([
  '自分のドメインでパネルを開く（ラボの Settings → Pages → Custom domain）: パネルだけの保管場所になります',
  'サインインのとき「このブラウザに覚える」を外す: トークンはこのタブだけに置かれ、タブを閉じると消えます',
  '要らないほかのサイトの Pages を止める（そのリポジトリの Settings → Pages）',
]);

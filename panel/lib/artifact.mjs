// artifact: a run's artifact, read through the lab's sign-in service (auth/handler.mjs GET /artifact) for the viewer
// (ui/viewer.mjs). GitHub hands an artifact out only as a redirect to its storage, which a page cannot follow and read (the
// browser hides the address), so the service asks GitHub with this person's own token — the token goes to that one service
// alone, as the page's CSP allows — and passes the bytes on. A small artifact is read whole, once; a big zip a part at a time
// (its directory at the end, then each file when it is opened: Range). An artifact kept as one file (upload-artifact's
// `archive: false`) is that one file. Pure but for fetch.
import { authBase } from './session.mjs';
import { UnpackError, zipBox, fileOf } from './unpack.mjs';

/** an artifact this big or smaller is read whole at once: one request, then everything is here */
export const WHOLE = 12e6;
/** why an artifact could not be read (code: config old origin token forbidden artifact expired range github storage net) */
export class ArtifactError extends Error {
  constructor(code, status = 0) { super(artifactWords(code)); this.code = code; this.status = status; }
}
export function artifactWords(code) {
  return ({
    config: 'このパネルにはサインインのサービスがありません（「準備」→ サインインのサービス）。それまでは GitHub で取ってください',
    old: 'サインインのサービスが古く、成果物の中身を出せません: 「準備」でサインインのサービスを置き直してください（auth-deploy）',
    origin: 'このパネルのアドレスは、サインインのサービスに許されていません（PANEL_ORIGINS）',
    token: 'GitHub がトークンを受け付けません（期限切れか、取り消された）: 入り直してください',
    forbidden: 'このアカウントには、この成果物を取る権限がありません',
    artifact: '成果物が見つかりません（消えたか、このアカウントでは見えません）',
    expired: '成果物の期限が切れて、GitHub が消しました',
    range: '成果物の大きさが変わりました: 開き直してください',
    github: 'GitHub が成果物の場所を教えてくれませんでした: 少しして「もう一度」',
    storage: '成果物の置き場から読めませんでした: 少しして「もう一度」',
    net: 'サインインのサービスにつながりません（ネットか、サービスが止まっている）',
  })[code] ?? `成果物を読めませんでした（${String(code ?? '').replace(/[^a-z_-]/g, '').slice(0, 24) || '?'}）`;
}

/** an answer's body → bytes, onProgress(done, total) told as they come */
async function bodyOf(r, onProgress) {
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body?.getReader || !onProgress) return new Uint8Array(await r.arrayBuffer());
  const rd = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; onProgress(n, total); }
  const out = new Uint8Array(n);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** → a reader { size, read(start, end, onProgress), all(onProgress), type } of one artifact through the service.
 *  token: the person's GitHub token, or a function giving it (the panel's, renewed); fresh: called once when the service says
 *  the token was refused (the panel renews its sign-in), then asked again; whole: up to which size it is read whole */
export function artifactReader({ authUrl, token, repo, id, size = 0, fetchImpl = (...a) => globalThis.fetch(...a), fresh = null, whole: wholeMax = WHOLE }) {
  const base = authBase(authUrl);
  let whole = null, wholeP = null;
  const me = { size: Number(size) || 0, type: null, whole: null };
  async function ask(range, onProgress, again = true) {
    if (!base) throw new ArtifactError('config');
    const t = typeof token === 'function' ? await token() : token;
    let r;
    try {
      r = await fetchImpl(`${base}/artifact?repo=${encodeURIComponent(repo)}&id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${t}`, ...(range ? { range } : {}) }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch { throw new ArtifactError('net'); }
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch { /* not ours: the words for the status below */ }
      const code = r.status === 404 && j?.error === 'not_found' ? 'old' : typeof j?.error === 'string' ? j.error : r.status === 401 ? 'token' : 'github';
      if (code === 'token' && again && fresh && (await fresh().catch(() => false))) return ask(range, onProgress, false);
      throw new ArtifactError(code, r.status);
    }
    me.type ??= r.headers.get('x-artifact-type');
    // (the size the storage says, over the list's: a 206 says the whole in Content-Range, a 200 its length)
    const all = /\/(\d+)$/.exec(r.headers.get('content-range') ?? '')?.[1] ?? (r.status === 200 ? r.headers.get('content-length') : null);
    if (all && Number(all) > 0) me.size = Number(all);
    return { r, bytes: await bodyOf(r, onProgress) };
  }
  /** the artifact whole: asked once, kept */
  me.all = (onProgress) => (wholeP ??= ask(null, onProgress).then(({ bytes }) => { whole = me.whole = bytes; me.size = bytes.length; return bytes; }).catch((e) => { wholeP = null; throw e; }));
  me.read = async (a, b, onProgress) => {
    if (whole) return whole.subarray(a, b);
    if (me.size && me.size <= wholeMax) return (await me.all(onProgress)).subarray(a, b);
    const { r, bytes } = await ask(`bytes=${a}-${Math.max(a, b - 1)}`, onProgress);
    // (a storage that sent it all anyway: kept whole)
    if (r.status === 200) { whole = me.whole = bytes; me.size = bytes.length; wholeP = Promise.resolve(bytes); return bytes.subarray(a, b); }
    return bytes;
  };
  return me;
}

/** the artifact (its list entry: { id, name, size_in_bytes }) through a reader → its box: a zip's files, read when opened; or
 *  — an artifact kept as one file — that file, named as the artifact is */
export async function artifactBox(reader, art, opts = {}) {
  // (no size known: read whole first — then it is known)
  if (!reader.size) await reader.all(opts.onProgress);
  try { return await zipBox(reader, opts); }
  catch (e) {
    if (!(e instanceof UnpackError) || e.code !== 'notzip') throw e;
    return { kind: 'single', files: [fileOf(String(art?.name ?? 'artifact'), reader.size, () => reader.all(opts.onProgress))] };
  }
}

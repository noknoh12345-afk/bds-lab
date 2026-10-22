import crypto from 'node:crypto';
const HASH_BY_ALG = { ES256: 'sha256', ES384: 'sha384', ES512: 'sha512' };
export function extractFingerprints(sdp) {
    const out = [];
    for (const line of sdp.split(/\r?\n/)) {
        const m = line.match(/^a=fingerprint:(\S+)\s+(\S+)/);
        if (m)
            out.push({ algorithm: m[1], digest: m[2] });
    }
    return out;
}
function b64urlJson(part) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}
function importCpk(cpk) {
    if (cpk && typeof cpk === 'object')
        return crypto.createPublicKey({ key: cpk, format: 'jwk' });
    if (typeof cpk === 'string') {
        return crypto.createPublicKey({ key: Buffer.from(cpk, 'base64'), format: 'der', type: 'spki' });
    }
    throw new Error('cpk がありません');
}
function verifyJws(signingInput, sigB64, alg, key) {
    const hash = HASH_BY_ALG[alg];
    if (!hash)
        throw new Error(`未対応の署名アルゴリズム ${alg}`);
    return crypto.verify(hash, Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sigB64, 'base64url'));
}
export function inspectIdentity(sdp, now = Date.now()) {
    const line = sdp.split(/\r?\n/).find((l) => l.startsWith('a=identity:'));
    if (!line)
        return { present: false, verified: false, reason: 'a=identity なし' };
    let keyDigest;
    let domain;
    try {
        const outer = JSON.parse(Buffer.from(line.slice('a=identity:'.length).trim(), 'base64').toString('utf8'));
        domain = typeof outer?.idp?.domain === 'string' ? outer.idp.domain : undefined;
        const assertion = typeof outer.assertion === 'string' ? JSON.parse(outer.assertion) : outer.assertion;
        const token = assertion?.token;
        const fingerprints = assertion?.fingerprints;
        if (typeof token !== 'string' || typeof fingerprints !== 'string')
            throw new Error('assertion に token/fingerprints がありません');
        const [th, tp, ts] = token.split('.');
        if (!th || !tp || !ts)
            throw new Error('token が JWT 形式ではありません');
        const header = b64urlJson(th);
        const payload = b64urlJson(tp);
        const key = importCpk(payload.cpk);
        keyDigest = crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
        if (!verifyJws(`${th}.${tp}`, ts, header.alg, key)) {
            return { present: true, verified: false, keyDigest, domain, reason: 'token の自己署名が一致しません' };
        }
        if (typeof payload.exp === 'number' && payload.exp * 1000 < now - 5 * 60_000) {
            return { present: true, verified: false, keyDigest, domain, reason: 'token の有効期限切れ' };
        }
        const [fh, fEmpty, fs] = fingerprints.split('.');
        if (!fh || fEmpty !== '' || !fs)
            throw new Error('fingerprints が detached JWS 形式ではありません');
        const fps = extractFingerprints(sdp);
        if (fps.length === 0)
            return { present: true, verified: false, keyDigest, domain, reason: 'SDP に a=fingerprint がありません' };
        const body = Buffer.from(JSON.stringify({ fingerprint: fps })).toString('base64url');
        if (!verifyJws(`${fh}.${body}`, fs, b64urlJson(fh).alg, key)) {
            return { present: true, verified: false, keyDigest, domain, reason: 'DTLS フィンガープリントへの署名が一致しません' };
        }
        return { present: true, verified: true, keyDigest, domain, reason: '署名検証OK' };
    }
    catch (e) {
        return { present: true, verified: false, keyDigest, domain, reason: `a=identity を解析できません: ${e.message}` };
    }
}
/** 信頼鍵リストとの照合 */
export function checkHostIdentity(id, trusted) {
    if (trusted.length === 0)
        return { allowed: true, reason: 'ホスト鍵の固定なし' };
    if (!id.present)
        return { allowed: false, reason: 'trustedHostKeys が設定されていますが、相手の Answer に a=identity がありません' };
    if (!id.verified)
        return { allowed: false, reason: `相手の a=identity を検証できません — ${id.reason}` };
    if (!id.keyDigest || !trusted.includes(id.keyDigest)) {
        return { allowed: false, reason: `相手の鍵 ${id.keyDigest?.slice(0, 16)}… は trustedHostKeys にありません（なりすましの可能性）` };
    }
    return { allowed: true, reason: `信頼済みの鍵 ${id.keyDigest.slice(0, 16)}… と一致` };
}

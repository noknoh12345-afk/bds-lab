/** "candidate:..." もしくは "a=candidate:..." をパース。形式不正なら null */
export function parseCandidate(line) {
    const raw = line.trim().replace(/^a=/, '');
    if (!raw.startsWith('candidate:'))
        return null;
    const t = raw.slice('candidate:'.length).split(/\s+/);
    if (t.length < 8)
        return null;
    const typIdx = t.indexOf('typ');
    if (typIdx < 0 || typIdx + 1 >= t.length)
        return null;
    const port = Number(t[5]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535)
        return null;
    return {
        foundation: t[0],
        component: t[1],
        transport: t[2].toLowerCase(),
        priority: t[3],
        address: t[4],
        port,
        type: t[typIdx + 1].toLowerCase(),
        raw,
    };
}
/**
 * SDP 中の a=candidate 行を accept で判定し、拒否されたものを除去する。
 * 他の行（fingerprint, ice-ufrag, sctp-port など）はそのまま残す。
 */
export function sanitizeSdp(sdp, accept) {
    const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
    const lines = sdp.split(/\r?\n/);
    const out = [];
    const kept = [];
    const dropped = [];
    for (const line of lines) {
        if (line.startsWith('a=candidate:')) {
            const c = parseCandidate(line);
            if (!c) {
                dropped.push({ line, reason: '候補行の形式が不正' });
                continue;
            }
            const d = accept(c);
            if (!d.allowed) {
                dropped.push({ line, reason: d.reason });
                continue;
            }
            kept.push(c);
        }
        out.push(line);
    }
    return { sdp: out.join(eol), kept, dropped };
}

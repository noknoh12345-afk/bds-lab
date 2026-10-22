import type { Decision } from './types.js';

/**
 * SDP と ICE candidate 行の検査・除去。
 *
 * NetherNet の接続情報は CONNECTREQUEST/CONNECTRESPONSE の SDP と
 * CANDIDATEADD の candidate 行で交換される。ここに LAN 外のアドレス
 * （STUN反射=srflx、TURN中継=relay、グローバルIP 等）が混ざっていたら、
 * WebRTC に渡す前に取り除く。
 */

export interface ParsedCandidate {
  foundation: string;
  component: string;
  transport: string;
  priority: string;
  address: string;
  port: number;
  type: string;
  raw: string;
}

/** "candidate:..." もしくは "a=candidate:..." をパース。形式不正なら null */
export function parseCandidate(line: string): ParsedCandidate | null {
  const raw = line.trim().replace(/^a=/, '');
  if (!raw.startsWith('candidate:')) return null;
  const t = raw.slice('candidate:'.length).split(/\s+/);
  if (t.length < 8) return null;
  const typIdx = t.indexOf('typ');
  if (typIdx < 0 || typIdx + 1 >= t.length) return null;
  const port = Number(t[5]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
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

export interface SanitizeResult {
  sdp: string;
  kept: ParsedCandidate[];
  dropped: { line: string; reason: string }[];
}

/**
 * SDP 中の a=candidate 行を accept で判定し、拒否されたものを除去する。
 * 他の行（fingerprint, ice-ufrag, sctp-port など）はそのまま残す。
 */
export function sanitizeSdp(sdp: string, accept: (c: ParsedCandidate) => Decision): SanitizeResult {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(/\r?\n/);
  const out: string[] = [];
  const kept: ParsedCandidate[] = [];
  const dropped: { line: string; reason: string }[] = [];
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

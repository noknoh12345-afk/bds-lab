import os from 'node:os';
import net from 'node:net';
import type { Decision, LanPolicy, TailscaleInfo } from './types.js';

/**
 * ★安全設計の中核★ 「このアドレスは“同一IP内(同一LAN)”か？」を判定する。
 *
 * ディスカバリ応答の送信元・シグナリングの送信元・SDP/ICE候補のアドレス・
 * 実際に確立したICE経路、のすべてがここを通る。ここで allowed:true に
 * ならないアドレスとは、どの段階でも通信しない。
 *
 * IPv4 のみ対応。IPv6・ホスト名・mDNS(.local) は判定不能として拒否する。
 */

export interface LocalInterface {
  name: string;
  address: string;
  netmask: string;
  internal: boolean;
}

interface Cidr {
  base: number;
  mask: number;
  text: string;
}

const PRIVATE_V4 = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8'].map(
  (c) => parseCidr(c)
);

export function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`IPv4ではありません: ${ip}`);
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) throw new Error(`IPv4ではありません: ${ip}`);
    const v = Number(p);
    if (v > 255) throw new Error(`IPv4ではありません: ${ip}`);
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export function intToIpv4(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function parseCidr(text: string): Cidr {
  const [ip, bitsStr] = text.split('/');
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error(`CIDRが不正です: ${text}`);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (ipv4ToInt(ip) & mask) >>> 0, mask, text };
}

function inCidr(ip: number, c: Cidr): boolean {
  return ((ip & c.mask) >>> 0) === c.base;
}

export function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return PRIVATE_V4.some((c) => inCidr(n, c));
}

/** "::ffff:192.168.1.2" のような IPv4-mapped 表記を素のIPv4に直す */
export function normalizeAddress(addr: string): string {
  const a = addr.trim();
  if (a.toLowerCase().startsWith('::ffff:') && net.isIPv4(a.slice(7))) return a.slice(7);
  return a;
}

export function listLocalInterfaces(onlyNames: string[] = []): LocalInterface[] {
  const out: LocalInterface[] = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family !== 'IPv4') continue;
      if (onlyNames.length > 0 && !i.internal && !onlyNames.includes(name)) continue;
      out.push({ name, address: i.address, netmask: i.netmask, internal: i.internal });
    }
  }
  return out;
}

export class LanScope {
  private readonly extra: Cidr[];

  /**
   * tailscale: loadTailscale の結果（v3）。その allowed にある自分の Tailscale の端末のアドレスも「自分のネットワーク」に入れる
   * （scope=same-subnet のときだけ。same-host はこのマシン自身だけのまま）。requirePrivateAddress と allowedSubnets は
   * LAN の絞り込みなので Tailscale の端末には当てない（端末は mode と devices で選んだ物だけ）。null / 省略 = 使わない
   */
  constructor(
    readonly policy: LanPolicy,
    readonly interfaces: LocalInterface[] = listLocalInterfaces(policy.interfaces),
    readonly tailscale: TailscaleInfo | null = null
  ) {
    this.extra = policy.allowedSubnets.map(parseCidr);
  }

  /** 自分のネットワークに入れた Tailscale の端末なら、その名前（scope=same-subnet のときだけ。違えば null） */
  tailscaleName(addr: string): string | null {
    if (!this.tailscale || this.policy.scope !== 'same-subnet') return null;
    return this.tailscale.allowed.get(normalizeAddress(addr)) ?? null;
  }

  /** このマシン自身の Tailscale のアドレス（Tailscale の端末と WebRTC でつなぐ時の、こちら側の候補） */
  ownTailscaleAddresses(): string[] {
    return this.tailscale?.self?.addresses.filter((a) => net.isIPv4(a)) ?? [];
  }

  /** このマシン自身のアドレスか（ループバック 127/8 を含む） */
  isOwnAddress(addr: string): boolean {
    const ip = normalizeAddress(addr);
    if (!net.isIPv4(ip)) return false;
    if (inCidr(ipv4ToInt(ip), PRIVATE_V4[4])) return true; // 127.0.0.0/8
    return this.interfaces.some((i) => i.address === ip);
  }

  /** ip と同じ直結サブネットにいる、このマシンの(非ループバック)NIC */
  interfaceFor(addr: string): LocalInterface | undefined {
    const ip = normalizeAddress(addr);
    if (!net.isIPv4(ip)) return undefined;
    const n = ipv4ToInt(ip);
    return this.interfaces.find((i) => {
      if (i.internal) return false;
      const c = parseCidr(`${i.address}/${maskBits(i.netmask)}`);
      return inCidr(n, c);
    });
  }

  /** 2つのアドレスが「同じ相手」とみなせるか（完全一致、または両方ともこのマシン自身） */
  sameEndpoint(a: string, b: string): boolean {
    const x = normalizeAddress(a);
    const y = normalizeAddress(b);
    return x === y || (this.isOwnAddress(x) && this.isOwnAddress(y));
  }

  /** 相手アドレスの判定（本体） */
  check(addr: string): Decision {
    const ip = normalizeAddress(addr);
    if (!net.isIPv4(ip)) {
      return deny(`${addr} はIPv4アドレスではありません（IPv6・ホスト名・mDNSは判定できないため拒否）`);
    }
    const n = ipv4ToInt(ip);
    if (n === 0 || n === 0xffffffff || (n >>> 28) === 0xe) {
      return deny(`${ip} は未指定/ブロードキャスト/マルチキャストアドレスです`);
    }

    if (this.isOwnAddress(ip)) {
      return allow(`${ip} はこのマシン自身のアドレス`);
    }
    if (this.policy.scope === 'same-host') {
      return deny(`${ip} はこのマシンのアドレスではありません（scope=same-host）`);
    }
    const ts = this.tailscaleName(ip);
    if (ts) return allow(`${ip} は自分の Tailscale の端末「${ts}」（lanPolicy.tailscale.mode=${this.tailscale?.mode}）`);

    const iface = this.interfaceFor(ip);
    if (!iface) {
      return deny(`${ip} はこのマシンのどのNICとも直結していません（ルーター越し＝同一LAN外）`);
    }
    const bits = maskBits(iface.netmask);
    if (bits < 31) {
      const c = parseCidr(`${iface.address}/${bits}`);
      if (n === c.base || n === ((c.base | (~c.mask >>> 0)) >>> 0)) {
        return deny(`${ip} はサブネット ${c.text} のネットワーク/ブロードキャストアドレスです`);
      }
    }
    if (this.policy.requirePrivateAddress && !(isPrivateV4(ip) && isPrivateV4(iface.address))) {
      return deny(
        `${ip} (NIC ${iface.name}=${iface.address}) はプライベートアドレスではありません（requirePrivateAddress=true）`
      );
    }
    if (this.extra.length > 0 && !this.extra.some((c) => inCidr(n, c))) {
      return deny(`${ip} は allowedSubnets (${this.policy.allowedSubnets.join(', ')}) に含まれません`);
    }
    return allow(`${ip} は ${iface.name} (${iface.address}/${bits}) と同一LAN`);
  }

  /**
   * ディスカバリ要求の送り先として良いか。
   * 255.255.255.255(ルーターを越えない)・許可NICの有向ブロードキャスト・許可済み単一アドレスのみ。
   */
  checkDiscoveryDestination(addr: string): Decision {
    const ip = normalizeAddress(addr);
    if (ip === '255.255.255.255') {
      if (this.policy.scope === 'same-host') {
        return deny('scope=same-host ではブロードキャストせず、自分のアドレスに直接問い合わせてください');
      }
      if (this.eligibleInterfaces().length === 0) {
        return deny('許可されたLAN用NICが無いため、ブロードキャストしません（非プライベートNICのみ等）');
      }
      return allow('リミテッドブロードキャスト(ルーターを越えない)');
    }
    if (net.isIPv4(ip) && this.policy.scope === 'same-subnet') {
      const n = ipv4ToInt(ip);
      const eligible = this.eligibleInterfaces();
      for (const i of this.interfaces) {
        if (i.internal) continue;
        const bits = maskBits(i.netmask);
        if (bits >= 31) continue;
        const c = parseCidr(`${i.address}/${bits}`);
        if (n === ((c.base | (~c.mask >>> 0)) >>> 0)) {
          if (!eligible.includes(i)) {
            return deny(`${ip} は許可対象外のNIC ${i.name}（非プライベート/allowedSubnets外）のブロードキャストです`);
          }
          return allow(`${i.name} の有向ブロードキャスト`);
        }
      }
    }
    return this.check(ip);
  }

  /** same-subnet で相手を探してよいNIC（非ループバック・プライベート条件・allowedSubnets と重なる） */
  eligibleInterfaces(): LocalInterface[] {
    if (this.policy.scope !== 'same-subnet') return [];
    return this.interfaces.filter((i) => {
      if (i.internal) return false;
      if (this.policy.requirePrivateAddress && !isPrivateV4(i.address)) return false;
      if (this.extra.length === 0) return true;
      const c = parseCidr(`${i.address}/${maskBits(i.netmask)}`);
      // NICのサブネットと allowedSubnets のどれかが重なっているか
      return this.extra.some((e) => {
        const m = (c.mask & e.mask) >>> 0;
        return ((c.base & m) >>> 0) === ((e.base & m) >>> 0);
      });
    });
  }

  /**
   * 既定のディスカバリ宛先。純正クライアントと同様に、リミテッドブロードキャストに加えて
   * 各NICのサブネット(有向)ブロードキャストにも送る（NICが複数ある時の取りこぼし防止）。
   */
  discoveryDestinations(): string[] {
    if (this.policy.scope === 'same-host') return ['127.0.0.1'];
    const nics = this.eligibleInterfaces();
    if (nics.length === 0) return [];
    const out = new Set<string>(['255.255.255.255']);
    for (const i of nics) {
      const bits = maskBits(i.netmask);
      if (bits >= 31) continue; // /31・/32 にはブロードキャストが無い
      const c = parseCidr(`${i.address}/${bits}`);
      out.add(intToIpv4((c.base | (~c.mask >>> 0)) >>> 0));
    }
    return [...out];
  }

  /** 表示用: 許可される範囲の説明 */
  describe(): string[] {
    const lines: string[] = [];
    lines.push(`scope=${this.policy.scope}, requirePrivateAddress=${this.policy.requirePrivateAddress}, pinToDiscoveryAddress=${this.policy.pinToDiscoveryAddress}`);
    lines.push('  このマシン自身: 127.0.0.0/8' + this.interfaces.filter((i) => !i.internal).map((i) => `, ${i.address}`).join(''));
    if (this.policy.scope === 'same-subnet') {
      const eligible = this.eligibleInterfaces();
      for (const i of this.interfaces) {
        if (i.internal) continue;
        const bits = maskBits(i.netmask);
        const c = parseCidr(`${i.address}/${bits}`);
        const ok = eligible.includes(i);
        const why = !ok ? (this.policy.requirePrivateAddress && !isPrivateV4(i.address) ? ' ※非プライベート' : ' ※allowedSubnets外') : '';
        lines.push(`  ${ok ? '許可' : '除外'} LAN: ${intToIpv4(c.base)}/${bits} (${i.name})${why}`);
      }
      if (eligible.length === 0) lines.push('  ※許可できるLAN用NICがありません（このマシン自身以外には接続できません）');
      if (this.extra.length) lines.push(`  追加絞り込み: ${this.policy.allowedSubnets.join(', ')}`);
    }
    if (this.tailscale) {
      const names = new Map<string, string[]>();
      for (const [ip, name] of this.tailscale.allowed) names.set(name, [...(names.get(name) ?? []), ip]);
      const list = [...names].map(([name, ips]) => `${name} ${ips.join(', ')}`).join(' / ');
      lines.push(this.policy.scope === 'same-subnet'
        ? `  Tailscale（${this.tailscale.mode}）: ${list || '許す端末がありません'}`
        : `  Tailscale（${this.tailscale.mode}）: scope=same-host なので使いません`);
    }
    return lines;
  }
}

export function maskBits(netmask: string): number {
  const n = ipv4ToInt(netmask);
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

const allow = (reason: string): Decision => ({ allowed: true, reason });
const deny = (reason: string): Decision => ({ allowed: false, reason });

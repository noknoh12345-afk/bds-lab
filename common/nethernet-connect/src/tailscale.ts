import { execFile } from 'node:child_process';
import net from 'node:net';
import type { TailscaleDevice, TailscaleInfo, TailscalePolicy } from './types.js';

export interface LoadTailscaleOptions {
  /** `tailscale status --json` を動かす関数（テスト用。既定は子プロセス）。cli はコマンドの場所 */
  run?: (cli: string, args: string[]) => Promise<string>;
}

/** Tailscale's own range (100.64.0.0/10, CGNAT): the only addresses taken from its status */
function inTailnetRange(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

const defaultRun = (cli: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
  execFile(cli, args, { timeout: 5000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
});

/** one node of `tailscale status --json` (Self or a Peer) → a device */
function deviceOf(n: any, self: any, isSelf: boolean): TailscaleDevice {
  const dns = typeof n?.DNSName === 'string' ? n.DNSName.split('.')[0] : '';
  return {
    name: (typeof n?.HostName === 'string' && n.HostName) || dns || '(名前なし)',
    addresses: (Array.isArray(n?.TailscaleIPs) ? n.TailscaleIPs : []).filter((x: unknown): x is string => typeof x === 'string' && inTailnetRange(x)),
    own: isSelf || (n?.UserID !== undefined && n.UserID === self?.UserID),
    online: isSelf || n?.Online === true,
    tags: Array.isArray(n?.Tags) ? n.Tags.filter((t: unknown): t is string => typeof t === 'string') : [],
    // (a node shared into this tailnet from another one: its owner is not of this tailnet — never "own network")
    shared: n?.ShareeNode === true,
    self: isSelf,
  };
}

/** the status JSON → what the policy allows (pure: the parsing and the choosing, without running anything) */
export function tailscaleInfoOf(policy: TailscalePolicy, status: any): TailscaleInfo | null {
  if (!status || typeof status !== 'object' || status.BackendState !== 'Running' || !status.Self) return null;
  const self = deviceOf(status.Self, status.Self, true);
  const devices = Object.values(status.Peer ?? {}).map((p) => deviceOf(p, status.Self, false));
  const allowed = new Map<string, string>();
  const named = new Set(policy.devices.map((d) => d.toLowerCase()));
  for (const d of devices) {
    if (d.shared || d.self) continue;
    const ok = (policy.mode === 'own' && d.own) || policy.mode === 'tailnet' || named.has(d.name.toLowerCase());
    if (ok) for (const a of d.addresses) allowed.set(a, d.name);
  }
  return { mode: policy.mode, self, devices, allowed };
}

/**
 * Tailscale の端末を読む（`tailscale status --json`）。mode = off・コマンドが無い・ログインしていない → null。
 * own = 自分のアカウントの端末、tailnet = 同じ tailnet の端末（共有された端末は除く）、devices の名前は mode によらず許す。
 * 結果の allowed（アドレス → 端末名）を LanScope の 3 つ目の引数に渡すと、その端末への通信だけが許される。
 */
export async function loadTailscale(policy: TailscalePolicy | undefined, opts: LoadTailscaleOptions = {}): Promise<TailscaleInfo | null> {
  if (!policy || policy.mode === 'off') return null;
  const run = opts.run ?? defaultRun;
  const cli = policy.cli ?? (process.platform === 'win32' ? 'tailscale.exe' : 'tailscale');
  let text: string;
  try { text = await run(cli, ['status', '--json']); } catch { return null; }   // (not installed, not running: no Tailscale)
  let status: any;
  try { status = JSON.parse(text); } catch { return null; }
  return tailscaleInfoOf(policy, status);
}

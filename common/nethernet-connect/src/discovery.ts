import type { LanGuard } from './guard.js';
import type { Config, Endpoint } from './types.js';

export interface DiscoverEndpointsOptions {
  /** 待つ時間（ms）。LAN の発見・RakNet の ping・HTTP の問い合わせを並行して、この時間だけ */
  timeoutMs: number;
  /** 問い合わせ先を 1 つに（IPv4）。省略時は LanScope の既定の宛先・discovery.hosts・Tailscale の端末 */
  host?: string;
}

/**
 * 自分のネットワーク（このマシン・同じ LAN・自分の Tailscale の端末）にいるワールドとサーバーを、それぞれの入り方で探す:
 * UDP 7551 の LAN の発見（ワールド・LAN に公開した BDS）、RakNet の unconnected ping（config.discovery.raknetPorts）、
 * BDS の NetherNet HTTP シグナリング（GET /v1/join、config.discovery.httpPorts）。同じ相手の入り方は 1 つの Endpoint に
 * まとめ、どれもガード（guard.scope）を通った相手だけ。判定（decision）は targets・認証方式・なりすましも見る。
 * (lane nc-discovery が作る)
 */
export async function discoverEndpoints(guard: LanGuard, config: Config, opts: DiscoverEndpointsOptions): Promise<Endpoint[]> {
  void guard; void config; void opts;
  throw new Error('discoverEndpoints: まだ作っていません（nethernet-connect v3）');
}

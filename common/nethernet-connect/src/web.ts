import type { Config } from './types.js';

export interface WebHandle {
  /** 開く URL（#t=<token> つき） */
  urls: string[];
  token: string;
  close(): Promise<void>;
}

/**
 * 自分のネットワークのダッシュボード（web/index.html・web/app.js）と、その API（/api/state・/api/events（SSE）・
 * /api/discover・/api/join・/api/sessions/*・/api/snapshots・/api/accounts）。X-NC-Token（SSE は ?t=）が合わない要求は 401。
 * bind = lan なら許可した LAN と自分の Tailscale のアドレスで、localhost ならこのマシンからだけ待ち受ける。
 * deps はテスト用（既定はこのパッケージの discoverEndpoints・connectToEndpoint・AccountStore・SnapshotStore・loadTailscale）
 * (lane nc-web が作る)
 */
export async function startWeb(config: Config, opts: { port?: number; deps?: Record<string, unknown> } = {}): Promise<WebHandle> {
  void config; void opts;
  throw new Error('startWeb: まだ作っていません（nethernet-connect v3）');
}

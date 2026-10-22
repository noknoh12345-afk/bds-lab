import type { TailscaleInfo, TailscalePolicy } from './types.js';

export interface LoadTailscaleOptions {
  /** `tailscale status --json` を動かす関数（テスト用。既定は子プロセス）。cli はコマンドの場所 */
  run?: (cli: string, args: string[]) => Promise<string>;
}

/**
 * Tailscale の端末を読む（`tailscale status --json`）。mode = off・コマンドが無い・ログインしていない → null。
 * own = 自分のアカウントの端末、tailnet = 同じ tailnet の端末（共有された端末は除く）、devices の名前は mode によらず許す。
 * 結果の allowed（アドレス → 端末名）を LanScope の 3 つ目の引数に渡すと、その端末への通信だけが許される。
 * (lane nc-discovery が作る)
 */
export async function loadTailscale(policy: TailscalePolicy | undefined, opts: LoadTailscaleOptions = {}): Promise<TailscaleInfo | null> {
  void opts;
  if (!policy || policy.mode === 'off') return null;
  throw new Error('loadTailscale: まだ作っていません（nethernet-connect v3）');
}

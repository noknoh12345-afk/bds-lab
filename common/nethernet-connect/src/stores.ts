import type { AccountInfo, SnapshotMeta } from './types.js';

/** サインインのコード（device code）。画面かコンソールに出す */
export interface DeviceCode {
  verification_uri: string;
  user_code: string;
  message?: string;
}

/**
 * ボットのアカウント（Microsoft のサインイン）を profilesFolder に。bedrock-protocol（prismarine-auth）のキャッシュと
 * 同じ置き方（`<sha1(name) の先頭 6 桁>_<live|xbl|bed>-cache.json`）で、名前の一覧は accounts.json。
 * connectToEndpoint は { username: name, profilesFolder, offline: false } でそのキャッシュを使う。
 * (lane nc-stores が作る)
 */
export class AccountStore {
  constructor(readonly folder: string) {}
  /** 登録した名前（accounts.json の順）。キャッシュのファイルが消えたものは出さない */
  list(): AccountInfo[] { throw new Error('AccountStore.list: まだ作っていません（nethernet-connect v3）'); }
  /** 名前を一覧に足す（サインインのキャッシュを外から置いたとき: lab の `lan account import`） */
  register(name: string, info: Partial<AccountInfo> = {}): AccountInfo { void name; void info; throw new Error('AccountStore.register: まだ作っていません（nethernet-connect v3）'); }
  /** device code でサインインして登録する（onCode にコードを渡す）。gamertag・xuid が分かれば入れる */
  async add(name: string, onCode: (c: DeviceCode) => void): Promise<AccountInfo> { void name; void onCode; throw new Error('AccountStore.add: まだ作っていません（nethernet-connect v3）'); }
  /** 一覧とキャッシュのファイルを消す。無ければ false */
  remove(name: string): boolean { void name; throw new Error('AccountStore.remove: まだ作っていません（nethernet-connect v3）'); }
}

/**
 * BDS・ワールドのフォルダを取っておき、元に戻す（このマシンにある物だけ。動いている間は戻さない: 呼ぶ側が止めてから）。
 * dir/<id>/meta.json と dir/<id>/files/…。restore は今の状態を先に取っておく（backup）。
 * (lane nc-stores が作る)
 */
export class SnapshotStore {
  constructor(readonly dir: string) {}
  take(kind: 'bds' | 'world', source: string, label: string): SnapshotMeta { void kind; void source; void label; throw new Error('SnapshotStore.take: まだ作っていません（nethernet-connect v3）'); }
  /** 新しい順 */
  list(): SnapshotMeta[] { throw new Error('SnapshotStore.list: まだ作っていません（nethernet-connect v3）'); }
  /** id の状態に戻す（無かったファイルは消す）。戻す前の状態を backup として取っておく */
  async restore(id: string, opts: { force?: boolean } = {}): Promise<{ restored: number; backup: SnapshotMeta }> { void id; void opts; throw new Error('SnapshotStore.restore: まだ作っていません（nethernet-connect v3）'); }
  remove(id: string): boolean { void id; throw new Error('SnapshotStore.remove: まだ作っていません（nethernet-connect v3）'); }
}

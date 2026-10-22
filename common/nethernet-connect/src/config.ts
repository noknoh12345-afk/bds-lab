import { readFileSync } from 'node:fs';
import type { Config, LanScopeMode, ObserveMode, RestoreTarget, TailscaleMode } from './types.js';
import { parseCidr } from './lan-scope.js';

/**
 * 設定を読み込み、安全側に倒した既定値で補う。
 *  - "_comment" で始まるキーは注釈として無視
 *  - 型が違う値は「黙って既定値にする」のではなく例外で止める（"false" を文字列で書いた等）
 *  - 知らないキー（綴り間違い等）は warnings に積む
 */
export function loadConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      throw new Error(`設定ファイルがありません: ${path}\nconfig.example.json を config.json にコピーして編集してください。`);
    }
    throw new Error(`設定ファイルを読めません: ${e.message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, '')); // BOM 付きでも読めるように
  } catch (e) {
    throw new Error(`設定ファイルのJSONが不正です: ${(e as Error).message}`);
  }
  return normalizeConfig(parsed);
}

const KNOWN: Record<string, string[]> = {
  '': ['auth', 'lanPolicy', 'discovery', 'targets', 'session', 'restore', 'web', 'requireManualConfirmation', 'botBehavior'],
  auth: ['offline', 'username', 'account', 'profilesFolder'],
  lanPolicy: ['scope', 'requirePrivateAddress', 'pinToDiscoveryAddress', 'allowedSubnets', 'interfaces', 'tailscale'],
  'lanPolicy.tailscale': ['mode', 'devices', 'cli'],
  discovery: ['raknetPorts', 'httpPorts', 'hosts'],
  targets: ['networkIds', 'levelNames', 'hostNames', 'trustedHostKeys'],
  session: ['observe', 'allowChat'],
  restore: ['store', 'targets'],
  web: ['port', 'bind', 'token'],
  botBehavior: ['logChat', 'version', 'discoveryTimeoutMs'],
};
const section = (parsed: any, name: string): any => name.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), parsed);

export function normalizeConfig(parsed: any): Config {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('設定ファイルの最上位はオブジェクトである必要があります');
  }
  const warnings: string[] = [];
  for (const [name, keys] of Object.entries(KNOWN)) {
    const obj = name ? section(parsed, name) : parsed;
    if (obj === undefined) continue;
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error(`${name} はオブジェクトである必要があります`);
    }
    for (const k of Object.keys(obj)) {
      if (k.startsWith('_comment') || keys.includes(k)) continue;
      warnings.push(`未知の設定キー ${name ? name + '.' : ''}${k} は無視しました（綴りを確認してください）`);
    }
  }

  const p = parsed.lanPolicy ?? {};
  const t = parsed.targets ?? {};
  const b = parsed.botBehavior ?? {};
  const a = parsed.auth ?? {};

  const scope: LanScopeMode = p.scope ?? 'same-subnet';
  if (scope !== 'same-subnet' && scope !== 'same-host') {
    throw new Error(`lanPolicy.scope が不正です: ${JSON.stringify(scope)}（same-subnet / same-host）`);
  }
  const allowedSubnets = strList(p.allowedSubnets, 'lanPolicy.allowedSubnets');
  for (const c of allowedSubnets) parseCidr(c); // 不正なら例外

  const trustedHostKeys = strList(t.trustedHostKeys, 'targets.trustedHostKeys').map((k) => k.toLowerCase());
  for (const k of trustedHostKeys) {
    if (!/^[0-9a-f]{64}$/.test(k)) throw new Error(`targets.trustedHostKeys の値が SHA-256(16進64文字) ではありません: ${k}`);
  }
  if (Array.isArray(t.networkIds) && t.networkIds.some((x: unknown) => typeof x === 'number')) {
    // 64bit の ID は JSON の数値だと精度が落ちて別の ID になる
    throw new Error('targets.networkIds は "1234567890123456789" のように引用符付きの文字列で書いてください');
  }
  for (const id of strList(t.networkIds, 'targets.networkIds')) {
    if (!/^\d{1,20}$/.test(id)) throw new Error(`targets.networkIds の値が10進数ではありません: ${id}`);
  }

  const timeout = b.discoveryTimeoutMs ?? 4000;
  if (!Number.isInteger(timeout) || timeout < 500 || timeout > 60000) {
    throw new Error(`botBehavior.discoveryTimeoutMs は 500〜60000 の整数にしてください: ${JSON.stringify(timeout)}`);
  }
  if (b.version !== undefined && b.version !== null && (typeof b.version !== 'string' || !b.version)) {
    throw new Error('botBehavior.version は文字列か null にしてください');
  }
  const username = a.username ?? 'NetherBot';
  if (typeof username !== 'string' || !username.trim()) throw new Error('auth.username は空でない文字列にしてください');
  const profilesFolder = a.profilesFolder ?? './.auth-cache';
  if (typeof profilesFolder !== 'string' || !profilesFolder) throw new Error('auth.profilesFolder は文字列にしてください');
  const account = a.account ?? null;
  if (account !== null && (typeof account !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(account))) {
    throw new Error(`auth.account はアカウント名（英数字・_・- の 1〜32 文字）か null にしてください: ${JSON.stringify(account)}`);
  }

  // (v3) Tailscale: own / tailnet / off、許す端末名、tailscale コマンドの場所
  const ts = p.tailscale ?? {};
  const tsMode: TailscaleMode = ts.mode ?? 'own';
  if (!['own', 'tailnet', 'off'].includes(tsMode)) throw new Error(`lanPolicy.tailscale.mode が不正です: ${JSON.stringify(tsMode)}（own / tailnet / off）`);
  if (ts.cli !== undefined && ts.cli !== null && (typeof ts.cli !== 'string' || !ts.cli)) throw new Error('lanPolicy.tailscale.cli は文字列か null にしてください');

  // (v3) 探し方: ポート（1〜65535 の整数）と直接指定の相手（IPv4[:port]）
  const d = parsed.discovery ?? {};
  const ports = (v: unknown, key: string, def: number[]): number[] => {
    if (v === undefined || v === null) return def;
    if (!Array.isArray(v)) throw new Error(`${key} は配列で指定してください`);
    return v.map((x) => {
      if (!Number.isInteger(x) || (x as number) < 1 || (x as number) > 65535) throw new Error(`${key} の要素は 1〜65535 の整数にしてください: ${JSON.stringify(x)}`);
      return x as number;
    });
  };
  const hosts = strList(d.hosts, 'discovery.hosts');
  for (const h of hosts) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(h);
    if (!m || m[1].split('.').some((o) => Number(o) > 255) || (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535))) {
      throw new Error(`discovery.hosts の値は IPv4 か IPv4:ポート で指定してください: ${h}`);
    }
  }

  // (v3) 接続の振る舞い
  const se = parsed.session ?? {};
  const observe: ObserveMode = se.observe ?? 'auto';
  if (!['auto', 'on', 'off'].includes(observe)) throw new Error(`session.observe が不正です: ${JSON.stringify(observe)}（auto / on / off）`);

  // (v3) 元に戻す対象
  const re = parsed.restore ?? {};
  const store = re.store ?? './snapshots';
  if (typeof store !== 'string' || !store) throw new Error('restore.store は文字列にしてください');
  if (re.targets !== undefined && re.targets !== null && !Array.isArray(re.targets)) throw new Error('restore.targets は配列で指定してください');
  const targetsR: RestoreTarget[] = (re.targets ?? []).map((t: any, i: number) => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error(`restore.targets[${i}] はオブジェクトにしてください`);
    for (const k of Object.keys(t)) if (!k.startsWith('_comment') && !['name', 'kind', 'path'].includes(k)) warnings.push(`未知の設定キー restore.targets[${i}].${k} は無視しました（綴りを確認してください）`);
    if (typeof t.name !== 'string' || !t.name.trim()) throw new Error(`restore.targets[${i}].name は空でない文字列にしてください`);
    if (t.kind !== 'bds' && t.kind !== 'world') throw new Error(`restore.targets[${i}].kind は "bds" か "world" にしてください: ${JSON.stringify(t.kind)}`);
    if (typeof t.path !== 'string' || !t.path) throw new Error(`restore.targets[${i}].path は文字列にしてください`);
    return { name: t.name.trim(), kind: t.kind, path: t.path };
  });

  // (v3) Web 画面
  const w = parsed.web ?? {};
  const webPort = w.port ?? 8765;
  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) throw new Error(`web.port は 1〜65535 の整数にしてください: ${JSON.stringify(webPort)}`);
  const bind = w.bind ?? 'lan';
  if (bind !== 'lan' && bind !== 'localhost') throw new Error(`web.bind が不正です: ${JSON.stringify(bind)}（lan / localhost）`);
  const token = w.token ?? null;
  if (token !== null && (typeof token !== 'string' || token.length < 16)) throw new Error('web.token は 16 文字以上の文字列か null にしてください');

  return {
    auth: {
      offline: bool(a.offline, false, 'auth.offline'),
      username: username.trim(),
      account,
      profilesFolder,
    },
    lanPolicy: {
      scope,
      // 安全側: 明示的に false と書かない限り true
      requirePrivateAddress: bool(p.requirePrivateAddress, true, 'lanPolicy.requirePrivateAddress'),
      pinToDiscoveryAddress: bool(p.pinToDiscoveryAddress, true, 'lanPolicy.pinToDiscoveryAddress'),
      allowedSubnets,
      interfaces: strList(p.interfaces, 'lanPolicy.interfaces'),
      tailscale: { mode: tsMode, devices: strList(ts.devices, 'lanPolicy.tailscale.devices'), cli: typeof ts.cli === 'string' ? ts.cli : null },
    },
    discovery: { raknetPorts: ports(d.raknetPorts, 'discovery.raknetPorts', [19132]), httpPorts: ports(d.httpPorts, 'discovery.httpPorts', [19132]), hosts },
    targets: {
      networkIds: strList(t.networkIds, 'targets.networkIds'),
      levelNames: strList(t.levelNames, 'targets.levelNames'),
      hostNames: strList(t.hostNames, 'targets.hostNames'),
      trustedHostKeys,
    },
    session: { observe, allowChat: bool(se.allowChat, true, 'session.allowChat') },
    restore: { store, targets: targetsR },
    web: { port: webPort, bind, token },
    requireManualConfirmation: bool(parsed.requireManualConfirmation, true, 'requireManualConfirmation'),
    botBehavior: {
      logChat: bool(b.logChat, true, 'botBehavior.logChat'),
      version: typeof b.version === 'string' ? b.version : null,
      discoveryTimeoutMs: timeout,
    },
    warnings,
  };
}

/**
 * オフライン(自己署名)ログインで使う名前の検査。
 * 26.30 以降「ゲーム機能に干渉しうる名前」の接続は拒否されるため、英数字・_・空白の 1〜16 文字に限定する。
 */
export function validateOfflineUsername(name: string): string | null {
  if (!/^[A-Za-z0-9_ ]{1,16}$/.test(name) || name !== name.trim() || /\s{2,}/.test(name)) {
    return `オフライン用の名前「${name}」は使えません（英数字・_・空白の1〜16文字、前後と連続の空白なし）`;
  }
  return null;
}

function bool(v: unknown, def: boolean, key: string): boolean {
  if (v === undefined) return def;
  if (typeof v !== 'boolean') throw new Error(`${key} は true / false（引用符なし）で指定してください: ${JSON.stringify(v)}`);
  return v;
}

function strList(v: unknown, key: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`${key} は配列で指定してください`);
  return v.map((x) => {
    if (typeof x !== 'string' && typeof x !== 'number') throw new Error(`${key} の要素は文字列にしてください`);
    return String(x).trim();
  }).filter((x) => x.length > 0);
}

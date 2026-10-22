import net from 'node:net';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { LanScope, normalizeAddress } from './lan-scope.js';
import { LanGuard } from './guard.js';
import { discoverLanWorlds } from './discover.js';
import { connectToWorld } from './connect.js';
import { confirm, choose } from './prompt.js';
export class UsageError extends Error {
}
export function parseArgs(argv) {
    const cmd = argv[0] ?? 'list';
    if (cmd !== 'list' && cmd !== 'connect')
        throw new UsageError(`不明なコマンド: ${cmd}（list / connect）`);
    const a = { cmd, config: './config.json', offline: false, yes: false, verbose: false };
    for (let i = 1; i < argv.length; i++) {
        const k = argv[i];
        const v = () => {
            const x = argv[++i];
            if (x === undefined || x.startsWith('--'))
                throw new UsageError(`${k} に値がありません`);
            return x;
        };
        if (k === '--config')
            a.config = v();
        else if (k === '--host') {
            const h = normalizeAddress(v());
            if (!net.isIPv4(h))
                throw new UsageError(`--host はIPv4アドレスで指定してください: ${h}`);
            a.host = h;
        }
        else if (k === '--network-id') {
            const id = v();
            if (!/^\d{1,20}$/.test(id))
                throw new UsageError(`--network-id は10進数で指定してください: ${id}`);
            a.networkId = BigInt(id).toString();
        }
        else if (k === '--timeout') {
            const t = Number(v());
            if (!Number.isInteger(t) || t < 500 || t > 60000)
                throw new UsageError('--timeout は 500〜60000 の整数(ms)にしてください');
            a.timeout = t;
        }
        else if (k === '--offline')
            a.offline = true;
        else if (k === '--yes' || k === '-y')
            a.yes = true;
        else if (k === '--verbose' || k === '-v')
            a.verbose = true;
        else
            throw new UsageError(`不明なオプション: ${k}`);
    }
    return a;
}
function printWorlds(worlds) {
    if (worlds.length === 0) {
        console.log('  （応答なし）');
        return;
    }
    worlds.forEach((w, i) => {
        const mark = w.decision.allowed ? '✔ 許可' : '✖ 拒否';
        const ver = w.gameVersion ? ` v${w.gameVersion}` : w.protocol ? ` protocol ${w.protocol}` : '';
        const auth = w.acceptsOnlineAuth === undefined ? '' : ` 認証:${w.acceptsOnlineAuth ? 'オンライン' : ''}${w.acceptsSelfSignedAuth ? (w.acceptsOnlineAuth ? '/' : '') + 'オフライン' : ''}`;
        console.log(`  ${i + 1}. [${mark}] 「${w.levelName}」 host=${w.motd}  ${w.playerCount}/${w.playersMax}人${ver}${auth}`);
        console.log(`       ${w.addresses.join(', ')}:${w.port}  NetherNetID=${w.networkId}  広告v${w.advertisementVersion}`);
        console.log(`       理由: ${w.decision.reason}`);
        for (const warn of w.warnings)
            console.log(`       注意: ${warn}`);
    });
}
async function main() {
    const major = Number(process.versions.node.split('.')[0]);
    // (bedrock-protocol 3.60 says Node 24 in its engines; its NetherNet and RakNet run on 22 — the lab's Node, its tests on it)
    if (major < 22) {
        console.error(`[nethernet-connect] Node.js 22 以上が必要です（現在 ${process.versions.node}）`);
        return 1;
    }
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    }
    catch (e) {
        console.error(`[nethernet-connect] ${e.message}`);
        return 2;
    }
    const config = loadConfig(args.config);
    if (args.offline)
        config.auth.offline = true;
    for (const w of config.warnings)
        console.log(`[config] 注意: ${w}`);
    const scope = new LanScope(config.lanPolicy);
    const guard = new LanGuard(scope, {
        onDeny: (stage, detail) => console.log(`  [guard:拒否/${stage}] ${detail}`),
        onWarn: (stage, detail) => console.log(`  [guard:注意/${stage}] ${detail}`),
        onInfo: args.verbose ? (stage, detail) => console.log(`  [guard:${stage}] ${detail}`) : undefined,
    }, { trustedHostKeys: config.targets.trustedHostKeys });
    console.log('[nethernet-connect] 接続範囲（これ以外とは一切通信しません）');
    for (const line of scope.describe())
        console.log('  ' + line);
    const dests = args.host ? [args.host] : scope.discoveryDestinations();
    const timeoutMs = args.timeout ?? config.botBehavior.discoveryTimeoutMs;
    console.log(`\n[discover] LANディスカバリ中… 宛先=${dests.join(', ') || '(なし)'} (UDP 7551, ${timeoutMs}ms)`);
    const worlds = await discoverLanWorlds(guard, config.targets, { host: args.host, timeoutMs, offline: config.auth.offline });
    printWorlds(worlds);
    if (args.cmd === 'list')
        return 0;
    let candidates = worlds.filter((w) => w.decision.allowed);
    if (args.networkId) {
        candidates = candidates.filter((w) => w.networkId.toString() === args.networkId);
        if (candidates.length === 0)
            throw new Error(`NetherNet ID ${args.networkId} の許可済みワールドが見つかりません`);
    }
    if (candidates.length === 0) {
        throw new Error('接続できるワールドがありません。ホスト側で「LANプレイヤーに表示」がONか、同じLANにいるかを確認してください。');
    }
    let target = candidates[0];
    if (candidates.length > 1) {
        if (args.yes)
            throw new Error('許可ワールドが複数あります。--network-id で指定してください');
        candidates.forEach((w, i) => console.log(`  ${i + 1}) 「${w.levelName}」 host=${w.motd} ${w.address}`));
        const idx = await choose('接続するワールドを選んでください', candidates.length);
        if (idx < 0)
            throw new Error('[中止] 選択されませんでした');
        target = candidates[idx];
    }
    if (config.requireManualConfirmation && !args.yes) {
        const ok = await confirm(`「${target.levelName}」(${target.motd} / ${target.address}) に接続しますか？`);
        if (!ok)
            throw new Error('[中止] 手動確認でキャンセルしました');
    }
    const { client, done } = connectToWorld(config, guard, target);
    process.once('SIGINT', () => {
        console.log('\n[main] 終了します');
        client.close();
    });
    console.log('[main] 接続処理を開始しました。Ctrl+C で終了します。');
    const outcome = await done;
    console.log(`[main] 終了: ${outcome.reason}`);
    return outcome.connected ? 0 : 1;
}
// テストから parseArgs だけ import した時は実行しない
if (isMain()) {
    main()
        .then((code) => setTimeout(() => process.exit(code), 300))
        .catch((err) => {
        console.error(`[nethernet-connect] ${err.message}`);
        setTimeout(() => process.exit(1), 300);
    });
}
function isMain() {
    try {
        return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
    }
    catch {
        return false;
    }
}

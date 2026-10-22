import { listLocalInterfaces, normalizeAddress } from './lan-scope.js';
/** このマシン自身のアドレスか（127/8 と自分の NIC） */
export function isThisHost(address) {
    const ip = normalizeAddress(address);
    return /^127\./.test(ip) || listLocalInterfaces().some((i) => i.address === ip);
}
/**
 * LAN の発見（discoverLanWorlds）で見つけたワールドを、discoverEndpoints の形（Endpoint）に。
 * 入り方は lan だけ・既定も lan。via はアドレスで決める（このマシン自身なら this-host、Tailscale の判定は discoverEndpoints が上書きする）
 */
export function endpointFromWorld(w, via) {
    return {
        id: w.networkId.toString(),
        kind: 'world',
        address: w.address,
        via: via ?? (isThisHost(w.address) ? 'this-host' : 'lan'),
        motd: w.motd,
        levelName: w.levelName,
        playerCount: w.playerCount,
        playersMax: w.playersMax,
        ...(w.protocol !== undefined ? { protocol: w.protocol } : {}),
        ...(w.gameVersion !== undefined ? { gameVersion: w.gameVersion } : {}),
        lan: { networkId: w.networkId, port: w.port, world: w },
        preferred: 'lan',
        decision: w.decision,
        warnings: [...w.warnings],
    };
}

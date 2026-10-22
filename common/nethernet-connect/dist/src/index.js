// ライブラリとして使う場合のエントリ（bds-lab の common/lan.mjs・invite-bot などから import する用）
// v3: 使う bedrock-protocol は呼ぶ側が渡す（useBedrockProtocol）。読み込んだだけでは bedrock-protocol を読まない
export { useBedrockProtocol, bpRequire } from './bp.js';
export { loadConfig, normalizeConfig, validateOfflineUsername } from './config.js';
export { LanScope, isPrivateV4, listLocalInterfaces, normalizeAddress } from './lan-scope.js';
export { LanGuard, installLanGuard, withGuard, guardOfClient, describeConnectError, netherNet } from './guard.js';
export { discoverLanWorlds, evaluateWorld } from './discover.js';
export { connectToWorld, connectToEndpoint, resolveVersion } from './connect.js';
export { endpointFromWorld, isThisHost } from './endpoint.js';
export { discoverEndpoints } from './discovery.js';
export { loadTailscale } from './tailscale.js';
export { AccountStore, SnapshotStore } from './stores.js';
export { findWorldFolders, worldRoots } from './worlds.js';
export { startWeb } from './web.js';
export { inspectIdentity, checkHostIdentity } from './host-identity.js';
export { Phase, PhaseTracker } from './phase.js';
export { parseCandidate, sanitizeSdp } from './sdp-filter.js';

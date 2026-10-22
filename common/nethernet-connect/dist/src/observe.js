/**
 * 観戦モード: 世界を変えるパケットを送らない（動き・ブロック・持ち物・コマンド・フォームの答え…）。
 *
 * 通すのは、決まった一覧（PASS）の物だけ: ログイン・合図・パック・チャンクの求め・時刻合わせなど、入って見ているのに要る物。
 * それ以外はどれも、送る前に落とす（新しい種類が足されても、一覧に無ければ落ちる側）。チャット（text）は allowChat のときだけ、
 * コマンド（command_request）は観戦中は決して送らない。落とした種類は log に "[observe] <名前>" を 1 回ずつ。
 *
 * bedrock-protocol の Client が送る道はどれも包む: write（すぐ送る）・queue（次の tick にまとめて）・sendBuffer（組み立て済みの
 * バイト列。中身の名前が分からないので、観戦中は落とす）。
 */
/** what an observer may send: being in the world and watching it, nothing that changes it */
export const OBSERVE_PASS = new Set([
    // the way in (handshake, encryption, packs, chunks)
    'request_network_settings', 'login', 'client_to_server_handshake', 'resource_pack_client_response', 'resource_pack_chunk_request',
    'client_cache_status', 'client_cache_blob_status', 'request_chunk_radius', 'set_local_player_as_initialized',
    'serverbound_loading_screen', 'subchunk_request',
    // keeping the connection (latency, time, the client's own reports)
    'tick_sync', 'network_stack_latency', 'packet_violation_warning', 'serverbound_diagnostics', 'emote_list',
    // looking (maps, settings the server shows)
    'map_info_request', 'server_settings_request',
]);
/** never sent while observing, whatever allowChat says */
const NEVER = new Set(['command_request']);
/** may this packet go out (pure) */
export function observeAllows(name, o) {
    if (!o.observe)
        return true;
    if (NEVER.has(name))
        return false;
    if (name === 'text')
        return o.allowChat;
    return OBSERVE_PASS.has(name);
}
/**
 * client の送る道を包む（観戦でなくても包むが、何も落とさない）。observer.observe・allowChat は後から変えてもよい
 * （Web の画面の切り替え）。戻り値は observer そのもの
 */
export function applyObserver(client, observer, log = () => { }) {
    if (!client || client.__ncObserver)
        return client?.__ncObserver ?? observer;
    const drop = (name) => {
        if (observeAllows(name, observer))
            return false;
        const n = (observer.blocked.get(name) ?? 0) + 1;
        observer.blocked.set(name, n);
        if (n === 1)
            log(`[observe] ${name}`);
        return true;
    };
    for (const method of ['write', 'queue']) {
        const orig = client[method];
        if (typeof orig !== 'function')
            continue;
        client[method] = function (name, params) {
            if (drop(String(name)))
                return;
            return orig.call(this, name, params);
        };
    }
    const origBuf = client.sendBuffer;
    if (typeof origBuf === 'function') {
        client.sendBuffer = function (buffer, immediate) {
            // (built bytes: what is in them is not known here — an observer sends none)
            if (observer.observe && drop('rawBuffer'))
                return;
            return origBuf.call(this, buffer, immediate);
        };
    }
    Object.defineProperty(client, '__ncObserver', { value: observer, enumerable: false });
    return observer;
}

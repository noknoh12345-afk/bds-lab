/**
 * 接続フェーズの状態機械（nethernet-sandbox の state-machine.ts を実接続用に流用）。
 *
 * sandbox では全部ダミーだった各フェーズを、ここでは実際のイベントで進める:
 *   Signaling    … LANディスカバリ(UDP 7551)で相手ワールドの応答を確認
 *   SdpExchange  … CONNECTREQUEST(Offer SDP) をLAN内の相手へ送信
 *   IceGathering … CONNECTRESPONSE(Answer SDP) を受信し、相手の候補を検査して受理
 *   IceChecking  … ICE 疎通確認中（LAN内の候補ペアだけ）
 *   Dtls         … ICE 成立 → DTLS ハンドシェイク
 *   Sctp         … DTLS 完了 → SCTP データチャネル
 *   Connected    … ゲームパケット(network_settings)を受信
 */
export var Phase;
(function (Phase) {
    Phase["Idle"] = "Idle";
    Phase["Signaling"] = "Signaling";
    Phase["SdpExchange"] = "SdpExchange";
    Phase["IceGathering"] = "IceGathering";
    Phase["IceChecking"] = "IceChecking";
    Phase["Dtls"] = "Dtls";
    Phase["Sctp"] = "Sctp";
    Phase["Connected"] = "Connected";
    Phase["Failed"] = "Failed";
    Phase["Closed"] = "Closed";
})(Phase || (Phase = {}));
const ORDER = [
    Phase.Idle,
    Phase.Signaling,
    Phase.SdpExchange,
    Phase.IceGathering,
    Phase.IceChecking,
    Phase.Dtls,
    Phase.Sctp,
    Phase.Connected,
];
export const ALLOWED_TRANSITIONS = {
    [Phase.Idle]: [Phase.Signaling, Phase.Failed, Phase.Closed],
    [Phase.Signaling]: [Phase.SdpExchange, Phase.Failed, Phase.Closed],
    [Phase.SdpExchange]: [Phase.IceGathering, Phase.Failed, Phase.Closed],
    [Phase.IceGathering]: [Phase.IceChecking, Phase.Failed, Phase.Closed],
    [Phase.IceChecking]: [Phase.Dtls, Phase.Failed, Phase.Closed],
    [Phase.Dtls]: [Phase.Sctp, Phase.Failed, Phase.Closed],
    [Phase.Sctp]: [Phase.Connected, Phase.Failed, Phase.Closed],
    [Phase.Connected]: [Phase.Closed, Phase.Failed],
    [Phase.Failed]: [Phase.Closed],
    [Phase.Closed]: [],
};
/**
 * 実イベントは順番が前後したり一部が観測できないことがあるため、
 * advanceTo() は「目標フェーズまで順に進める（途中は“通過”として記録）」。
 * 後戻りはしない。
 */
export class PhaseTracker {
    _phase = Phase.Idle;
    step = 0;
    t0 = Date.now();
    listeners = [];
    get phase() {
        return this._phase;
    }
    onTransition(fn) {
        this.listeners.push(fn);
    }
    advanceTo(target, note) {
        if (this._phase === Phase.Failed || this._phase === Phase.Closed)
            return;
        if (target === Phase.Failed || target === Phase.Closed) {
            this.transition(target, note);
            return;
        }
        const cur = ORDER.indexOf(this._phase);
        const dst = ORDER.indexOf(target);
        if (dst <= cur)
            return;
        for (let i = cur + 1; i < dst; i++)
            this.transition(ORDER[i], '(通過)');
        this.transition(target, note);
    }
    transition(to, note) {
        const allowed = ALLOWED_TRANSITIONS[this._phase];
        if (!allowed.includes(to)) {
            throw new Error(`不正な遷移: ${this._phase} → ${to}（許可: ${allowed.join(', ') || 'なし'}）`);
        }
        const ev = { from: this._phase, to, note, at: ++this.step, elapsedMs: Date.now() - this.t0 };
        this._phase = to;
        for (const fn of this.listeners)
            fn(ev);
    }
}

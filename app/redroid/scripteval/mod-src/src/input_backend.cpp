// input_backend.cpp — scripteval の injectInput バックエンド（戦略A: ローカルプレイヤーのメモリへ直接書き込み）と
// JS バインド（__native.input）、mod_init からの install。
//
// 重要: mcpelauncher(Mac/Linux)も素の APK(Android)も **同じ libminecraftpe** を読み込むので、クラス配置＝
// オフセットは同一。だから戦略A の1実装が両方で効く（= mac も apk も一緒）。
//
// 自己較正(0.3.2): 移動ベクタと視点は、ScriptEval が「読み取り」で既に当てている ECS コンポーネント
//   （StateVectorComponent / ActorRotationComponent …、game.cpp が RTTI 名で解決しサイズも実測較正済み）へ
//   直接書く。これで config.json の版依存オフセットが無くても効く（版が変わってもコンポーネント名で付いていく）。
//   config.json に offsets.moveVectorX/Z・cameraYaw/Pitch があればそちらを優先（手動上書き）。
// 離散操作（攻撃/使用/インベントリ/チャット等）は版依存の関数呼び出しが要るため配線可視化のみ（順次結線）。
//
// 読み取り専用の 0.3.0 に「書き込み」を足す箇所。in-process なので、書き込み先が rw 領域
// (se::mem::isWritableData)であることを確かめてから直接ポインタに書く（process_vm_writev は使わない）。
#include "inject_input.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <set>
#include <string>

#include "common.h"
#include "config.h"
#include "game.h"
#include "jsutil.h"
#include "memory.h"

using se::js::newStr;
using se::js::toStr;

namespace {

constexpr double kDeg2Rad = 3.14159265358979323846 / 180.0;
// 1 tick あたりの水平移動量(ブロック)。実プレイヤーの歩き ~0.216/ダッシュ ~0.28。保持中このデルタを毎tick書く。
constexpr float kWalkDelta = 0.216f;
constexpr float kSprintDelta = 0.281f;

int off(const char* key, int def = -1) {
    const auto& m = se::config().offsets;
    auto it = m.find(key);
    return it == m.end() ? def : it->second;
}

bool writeF(uintptr_t addr, float v) {
    if (!addr || !se::mem::isWritableData(addr) || !std::isfinite(v)) return false;
    *reinterpret_cast<float*>(addr) = v;  // in-process, rw 確認済み
    return true;
}

// いま in-world なら、ローカルエンティティの component(RTTI 名で解決、game.cpp と同じ経路)の先頭番地。無ければ 0。
uintptr_t compAddr(const char* name) {
    auto& g = se::game::game();
    if (!g.ensure(nullptr, false)) return 0;  // quickValid のみ（遅いスキャンはしない）
    uint32_t e = g.localEntity();
    if (!e && !g.localPlayer()) return 0;
    return g.registry().get(name, e);
}

// このバックエンドが「いま実際に効く」か（自己較正でコンポーネントが取れる or 手動オフセットがある）
bool moveResolvable() { return compAddr("StateVectorComponent") || (off("moveVectorX") >= 0 && off("moveVectorZ") >= 0); }
bool camResolvable() { return compAddr("ActorRotationComponent") || (off("cameraYaw") >= 0 && off("cameraPitch") >= 0); }

bool g_warnedMove = false, g_warnedCam = false;
bool g_logged = false;
std::set<std::string> g_loggedPending;

void logPendingOnce(const std::string& what) {
    if (g_loggedPending.insert(what).second)
        SE_LOGI("injectInput: '%s' は配線済みだがこの版の関数が未結線（順次結線）", what.c_str());
}

// 現在の視点ヨー(度)。ActorRotationComponent の yaw(v[1]) を読む。取れなければ 0。
float currentYaw() {
    if (uintptr_t rc = compAddr("ActorRotationComponent")) {
        float v[2];
        if (se::mem::read(rc, v, sizeof v) && std::isfinite(v[1])) return v[1];
    }
    if (int oy = off("cameraYaw"); oy >= 0) {
        uintptr_t lp = se::game::game().localPlayer();
        if (lp) return se::mem::readOr<float>(lp + (uintptr_t)oy, 0.f);
    }
    return 0.f;
}

// forward/strafe(-1..1) → ワールド水平速度(vx, vz)。Minecraft の yaw: 南=0 西=90 北=180 東=-90。
// 前方 = (-sin yaw, cos yaw)、右 = (cos yaw, sin yaw)（前方を -90° 回したもの）。純粋なので host 試験可。
void moveToVelocity(float forward, float strafe, float yawDeg, float speed, float& vx, float& vz) {
    double y = yawDeg * kDeg2Rad;
    double fx = -std::sin(y), fz = std::cos(y);
    double rx = std::cos(y), rz = std::sin(y);
    double mx = forward * fx + strafe * rx, mz = forward * fz + strafe * rz;
    double mag = std::sqrt(mx * mx + mz * mz);
    if (mag > 1e-6) { mx /= mag; mz /= mag; }  // 斜めでも速くならないよう正規化
    double in = std::sqrt((double)forward * forward + (double)strafe * strafe);
    float scale = (mag > 1e-6) ? speed * (float)std::min(1.0, in) : 0.f;
    vx = (float)(mx * scale);
    vz = (float)(mz * scale);
}

// 保持中の移動の強さ(sprint 判定)はコア側が別途 button("sprint") を送る。ここでは forward 1.0 の大きさで walk/sprint を見分けない
// 単純版（速度の係数は kWalkDelta 固定、sprint は g_sprint フラグで上げる）。
bool g_sprint = false;

// 戦略A: 移動入力。StateVectorComponent の delta(v[6..8] = +24,+28,+32)へワールド速度を書く（自己較正）。
void be_setMoveVector(float forward, float strafe, void*) {
    // 手動オフセット優先（旧挙動: ローカルプレイヤー内の移動入力ベクタに forward/strafe をそのまま）
    int ox = off("moveVectorX"), oz = off("moveVectorZ");
    if (ox >= 0 && oz >= 0) {
        uintptr_t lp = se::game::game().localPlayer();
        if (lp) { writeF(lp + (uintptr_t)ox, strafe); writeF(lp + (uintptr_t)oz, forward); }
        return;
    }
    uintptr_t sv = compAddr("StateVectorComponent");
    if (!sv) {
        if (!g_warnedMove) { SE_LOGW("injectInput: 移動先が取れません（未参加？ StateVectorComponent 未解決、offsets.moveVectorX/Z も無し）"); g_warnedMove = true; }
        return;
    }
    if (forward == 0.f && strafe == 0.f) return;  // 保持解除時は速度を触らない（ゲームの自然減速に任せる）
    float vx, vz;
    moveToVelocity(forward, strafe, currentYaw(), g_sprint ? kSprintDelta : kWalkDelta, vx, vz);
    writeF(sv + 24, vx);  // delta.x
    writeF(sv + 32, vz);  // delta.z
}

// 上下（飛行/水泳）: StateVectorComponent の delta.y(+28)。手動 moveVectorY があればローカルプレイヤー内へ。
void be_setVertical(float v, void*) {
    if (int ov = off("moveVectorY", -1); ov >= 0) {
        uintptr_t lp = se::game::game().localPlayer();
        if (lp) writeF(lp + (uintptr_t)ov, v);
        return;
    }
    if (v == 0.f) return;
    if (uintptr_t sv = compAddr("StateVectorComponent")) writeF(sv + 28, v * (g_sprint ? kSprintDelta : kWalkDelta));
}

// 視点。absolute=1 で絶対角、0 で相対デルタ。ActorRotationComponent(v[0]=pitch, v[1]=yaw)へ自己較正で書く。
// 体の向き・頭の向きも揃える（ActorHeadRotationComponent / MobBodyRotationComponent、あれば）。
void be_setCamera(float yaw, float pitch, int absolute, void*) {
    int oy = off("cameraYaw"), op = off("cameraPitch");
    uintptr_t ay = 0, ap = 0, lp = se::game::game().localPlayer();
    if (oy >= 0 && op >= 0 && lp) { ay = lp + (uintptr_t)oy; ap = lp + (uintptr_t)op; }
    else if (uintptr_t rc = compAddr("ActorRotationComponent")) { ap = rc; ay = rc + 4; }  // v[0]=pitch, v[1]=yaw
    if (!ay || !ap) {
        if (!g_warnedCam) { SE_LOGW("injectInput: 視点先が取れません（未参加？ ActorRotationComponent 未解決、offsets.cameraYaw/Pitch も無し）"); g_warnedCam = true; }
        return;
    }
    float ny, np;
    if (absolute) { ny = yaw; np = pitch; }
    else { ny = se::mem::readOr<float>(ay, 0.f) + yaw; np = se::mem::readOr<float>(ap, 0.f) + pitch; }
    if (np > 90.f) np = 90.f; else if (np < -90.f) np = -90.f;  // ピッチは ±90 まで
    writeF(ay, ny); writeF(ap, np);
    // 頭と体の yaw も合わせる（違うと首だけ回って見える）。無ければ黙って飛ばす。
    if (uintptr_t hc = compAddr("ActorHeadRotationComponent")) writeF(hc, ny);
    if (uintptr_t bc = compAddr("MobBodyRotationComponent")) writeF(bc, ny);
}

void be_hotbar(int slot, void*) { logPendingOnce("hotbar"); (void)slot; }
void be_scrollSlot(int dir, void*) { logPendingOnce("scrollSlot"); (void)dir; }
void be_button(const char* name, int down, void*) {
    std::string n = name ? name : "?";
    if (n == "sprint") { g_sprint = down != 0; return; }  // sprint は移動速度係数で反映（自己較正経路）
    if (down) logPendingOnce(std::string("button:") + n);
}
void be_pointer(const char* op, double, double, int, void*) { logPendingOnce(std::string("pointer:") + (op ? op : "?")); }
void be_slotClick(int, const char* mode, void*) { logPendingOnce(std::string("slotClick:") + (mode ? mode : "?")); }
void be_form(const char* op, const char*, void*) { logPendingOnce(std::string("form:") + (op ? op : "?")); }
void be_text(const char*, const char* kind, void*) { logPendingOnce(std::string("text:") + (kind ? kind : "?")); }

SeInputBackend g_be;

// __native.input.inject(jsonString) -> 状態要約(JSON文字列)
JSValue n_inject(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
    std::string json = argc > 0 ? toStr(ctx, argv[0]) : std::string("{}");
    const char* res = scripteval_inject_input(json.c_str());
    return newStr(ctx, res ? res : "{\"ok\":false}");
}

// __native.input.status() -> どの口が実動作するか。自己較正でコンポーネントが取れていれば move/camera は true。
JSValue n_status(JSContext* ctx, JSValueConst, int, JSValueConst*) {
    bool moveOk = moveResolvable(), camOk = camResolvable();
    bool selfCal = compAddr("StateVectorComponent") != 0 || compAddr("ActorRotationComponent") != 0;
    char buf[320];
    std::snprintf(buf, sizeof buf,
        "{\"wired\":true,\"move\":%s,\"camera\":%s,\"vertical\":%s,\"selfCalibrated\":%s,\"discrete\":\"pending-version-functions\"}",
        moveOk ? "true" : "false", camOk ? "true" : "false", moveOk ? "true" : "false", selfCal ? "true" : "false");
    return newStr(ctx, buf);
}

}  // namespace

namespace se::js {
void registerInputBindings(JSContext* ctx, JSValueConst obj) {
    setFn(ctx, obj, "inject", n_inject, 1);
    setFn(ctx, obj, "status", n_status, 0);
}
}  // namespace se::js

// mod_init から1回。未参加でも安全（no-op + 一度だけ警告）。
extern "C" void scripteval_install_input_backend() {
    std::memset(&g_be, 0, sizeof g_be);
    g_be.setMoveVector = be_setMoveVector;  // 戦略A（自己較正の直接書き込み）
    g_be.setCamera = be_setCamera;
    g_be.setVertical = be_setVertical;
    g_be.hotbar = be_hotbar;
    g_be.scrollSlot = be_scrollSlot;
    g_be.button = be_button;
    g_be.pointer = be_pointer;
    g_be.slotClick = be_slotClick;
    g_be.form = be_form;
    g_be.text = be_text;
    g_be.lookSensitivity = 6.0;
    scripteval_input_set_backend(&g_be);
    (void)g_logged;
    SE_LOGI("injectInput: backend installed (strategy A self-calibrated: ECS StateVector/Rotation direct write; discrete ops await version functions)");
}

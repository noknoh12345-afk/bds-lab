// inject_input.cpp v2 — クライアント完結の入力注入コア(全入力・全 UI 操作を網羅)。MC/mcpelauncher/OS 非依存。
// 単体テスト: g++ -std=c++17 -DINJECT_INPUT_SELFTEST inject_input.cpp -o t && ./t
//
// 実プレイヤーが出来る操作を漏れなく: アナログ移動(前後左右上下)・相対/絶対視点・スプリント/スニーク/ジャンプ(保持+単発)・
// 採掘/使用の保持・攻撃/使用の単発・ホットバー選択/送り・ドロップ/持ち替え・インベントリ等の画面開閉・UI ナビゲーション・
// マウス/タッチのポインタ操作・コンテナのスロット操作・サーバーフォーム応答・チャット/コマンド/生文字入力・
// クライアント操作、さらに任意の名前付きボタンの保持/単発(保険)。保持は毎tick反映、離散はキューで消化。
#include "inject_input.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <deque>
#include <map>
#include <string>

namespace {

struct State {
  float f = 0, s = 0, v = 0;               // 前後 / 左右 / 上下 (-1..1)
  float yawRate = 0, pitchRate = 0;        // 相対視点(度/tick)
  float absYaw = 0, absPitch = 0; bool hasAbs = false;
  bool sprint = false, sneak = false, jump = false; // ロコモーション保持
  bool mine = false, useHold = false;      // 左/右ボタン保持
};

State g;
SeInputBackend gb;
bool gbSet = false;

bool keyHeld[SE_KEY__COUNT] = {false};
struct Btn { bool emitted = false; int pulse = 0; }; // 2=このtickで押す,1=次tickで離してよい,0=idle
Btn bL, bR, bM;
int jmpPulse = 0;
int pendingSlot = -1;

std::map<std::string, bool> heldBtnWant;   // 任意ボタンの保持希望
std::map<std::string, bool> heldBtnEmit;   // 実際に押している状態
std::deque<std::string> qTap;              // 名前付きボタン単発(press)
std::deque<std::string> qTapRelease;       // 次tickで離す
struct PointerOp { std::string op; double x, y; int button; };
std::deque<PointerOp> qPointer;
struct SlotOp { int index; std::string mode; };
std::deque<SlotOp> qSlot;
struct FormOp { std::string op, arg; };
std::deque<FormOp> qForm;
struct TextOp { std::string content, kind; };
std::deque<TextOp> qText;
char outBuf[384];

double sens() { return (gbSet && gb.lookSensitivity > 0) ? gb.lookSensitivity : 6.0; }

// --- 極小フラット JSON ヘルパ(scripteval 側が出す限定スキーマ用。ネストは pointer/slotClick/form を個別に拾う) ---
const char* findVal(const char* j, const char* key) {
  char pat[48]; std::snprintf(pat, sizeof pat, "\"%s\"", key);
  const char* p = std::strstr(j, pat);
  if (!p) return nullptr;
  p = std::strchr(p + std::strlen(pat), ':');
  if (!p) return nullptr;
  ++p; while (*p == ' ' || *p == '\t') ++p;
  return p;
}
bool getNum(const char* j, const char* key, float* out) {
  const char* p = findVal(j, key); if (!p) return false;
  char* end = nullptr; double val = std::strtod(p, &end);
  if (end == p) return false;
  *out = (float)val; return true;
}
bool getBool(const char* j, const char* key, bool* out) {
  const char* p = findVal(j, key); if (!p) return false;
  if (!std::strncmp(p, "true", 4)) { *out = true; return true; }
  if (!std::strncmp(p, "false", 5)) { *out = false; return true; }
  return false;
}
bool getStr(const char* j, const char* key, char* out, size_t n) {
  const char* p = findVal(j, key); if (!p || *p != '"') return false;
  ++p; size_t i = 0;
  while (*p && *p != '"' && i + 1 < n) {
    if (*p == '\\' && p[1]) { ++p; out[i++] = (*p == 'n') ? '\n' : *p; ++p; }
    else out[i++] = *p++;
  }
  out[i] = 0; return true;
}
// "hold":{"name":true,...} を拾って heldBtnWant に反映(極小オブジェクトパーサ)
void parseHold(const char* j) {
  const char* p = findVal(j, "hold"); if (!p || *p != '{') return;
  ++p;
  while (*p && *p != '}') {
    while (*p == ' ' || *p == ',' ) ++p;
    if (*p != '"') { if (*p) ++p; continue; }
    ++p; char name[48]; size_t i = 0;
    while (*p && *p != '"' && i + 1 < sizeof name) name[i++] = *p++;
    name[i] = 0; if (*p == '"') ++p;
    while (*p == ' ' || *p == ':') ++p;
    bool val = !std::strncmp(p, "true", 4);
    heldBtnWant[name] = val;
    while (*p && *p != ',' && *p != '}') ++p;
  }
}

void setKey(SeInputKey k, bool want) {
  if (keyHeld[k] == want) return;
  keyHeld[k] = want;
  if (gbSet && gb.key) gb.key(k, want ? 1 : 0, gb.ud);
}
void driveButton(Btn& b, int button, bool hold) {
  bool want = hold;
  if (b.pulse == 2) { want = true; b.pulse = 1; }
  else if (b.pulse == 1) { b.pulse = 0; }
  if (want != b.emitted) { if (gbSet && gb.mouseButton) gb.mouseButton(button, want ? 1 : 0, gb.ud); b.emitted = want; }
}
void emitBtn(const std::string& name, bool down) { if (gbSet && gb.button) gb.button(name.c_str(), down ? 1 : 0, gb.ud); }

// action 名の仕分け: 専用口があるものはそちらへ、他は名前付きボタン単発(qTap)へ。
void routeAction(const char* a) {
  if (!std::strcmp(a, "attack") || !std::strcmp(a, "mineOnce")) { bL.pulse = 2; return; }
  if (!std::strcmp(a, "use") || !std::strcmp(a, "useOnce")) { bR.pulse = 2; return; }
  if (!std::strcmp(a, "pickBlock")) { if (gbSet && gb.button) qTap.push_back("pickBlock"); else bM.pulse = 2; return; }
  if (!std::strcmp(a, "jumpOnce")) { if (!g.jump) jmpPulse = 2; return; }
  if (!std::strcmp(a, "slotNext")) { qTap.push_back("__slotNext"); return; }
  if (!std::strcmp(a, "slotPrev")) { qTap.push_back("__slotPrev"); return; }
  if (!std::strcmp(a, "sneakToggle")) { g.sneak = !g.sneak; return; }
  if (!std::strcmp(a, "sprintToggle")) { g.sprint = !g.sprint; return; }
  if (!std::strcmp(a, "stop")) { g.f = g.s = g.v = g.yawRate = g.pitchRate = 0; g.sprint = g.sneak = g.jump = g.mine = g.useHold = false; return; }
  if (!std::strcmp(a, "reset")) {
    g = State(); heldBtnWant.clear(); qTap.clear(); qTapRelease.clear(); qPointer.clear();
    qSlot.clear(); qForm.clear(); qText.clear(); pendingSlot = -1; return;
  }
  qTap.push_back(a);  // inventory/drop/dropStack/swapHands/perspective/emote/sleep/pause/chatOpen/commandOpen/
                      // recipeBook/map/screenshot/toggleHud/fullscreen/toggleGui/nav*/生キー名 など全部
}

} // namespace

extern "C" void scripteval_input_set_backend(const SeInputBackend* b) {
  if (b) { gb = *b; gbSet = true; } else { gbSet = false; }
}

extern "C" const char* scripteval_inject_input(const char* json) {
  if (!json) json = "";
  float n; bool b; char buf[256];

  if (getStr(json, "action", buf, sizeof buf)) routeAction(buf);
  if (getStr(json, "press", buf, sizeof buf)) qTap.push_back(buf);
  parseHold(json);

  if (getNum(json, "f", &n)) g.f = n;
  if (getNum(json, "s", &n)) g.s = n;
  if (getNum(json, "v", &n)) g.v = n;
  if (getNum(json, "yaw", &n)) g.yawRate = n;
  if (getNum(json, "pitch", &n)) g.pitchRate = n;
  if (getNum(json, "absYaw", &n)) { g.absYaw = n; g.hasAbs = true; }
  if (getNum(json, "absPitch", &n)) { g.absPitch = n; g.hasAbs = true; }
  if (getNum(json, "slot", &n)) { int sl = (int)n; if (sl >= 1 && sl <= 9) pendingSlot = sl - 1; }
  if (getBool(json, "sprint", &b)) g.sprint = b;
  if (getBool(json, "sneak", &b)) g.sneak = b;
  if (getBool(json, "jump", &b)) g.jump = b;
  if (getBool(json, "mine", &b)) g.mine = b;
  if (getBool(json, "useHold", &b)) g.useHold = b;

  // ポインタ(マウス/タッチ UI)
  { const char* p = findVal(json, "pointer");
    if (p && *p == '{') {
      PointerOp po{"move", 0, 0, 0}; char opb[24]; float t;
      if (getStr(p, "op", opb, sizeof opb)) po.op = opb;
      if (getNum(p, "x", &t)) po.x = t;
      if (getNum(p, "y", &t)) po.y = t;
      if (getNum(p, "button", &t)) po.button = (int)t;
      if (getNum(p, "amount", &t)) po.y = t;             // scroll 量は y に載せる
      qPointer.push_back(po);
    } }
  // コンテナのスロット操作
  { const char* p = findVal(json, "slotClick");
    if (p && *p == '{') {
      SlotOp so{0, "left"}; float t; char mb[16];
      if (getNum(p, "index", &t)) so.index = (int)t;
      if (getStr(p, "mode", mb, sizeof mb)) so.mode = mb;
      qSlot.push_back(so);
    } }
  // サーバーフォーム
  { const char* p = findVal(json, "form");
    if (p && *p == '{') {
      FormOp fo; char ob[16], ab[128];
      if (getStr(p, "op", ob, sizeof ob)) fo.op = ob;
      if (getStr(p, "arg", ab, sizeof ab)) fo.arg = ab;
      if (!fo.op.empty()) qForm.push_back(fo);
    } }
  if (getNum(json, "formButton", &n)) qForm.push_back({"button", std::to_string((int)n)});
  if (getBool(json, "formClose", &b) && b) qForm.push_back({"close", ""});

  // 文字入力
  if (getStr(json, "chat", buf, sizeof buf)) qText.push_back({buf, "chat"});
  if (getStr(json, "command", buf, sizeof buf)) qText.push_back({buf, "command"});
  if (getStr(json, "type", buf, sizeof buf)) qText.push_back({buf, "raw"});
  if (getStr(json, "emote", buf, sizeof buf)) qTap.push_back("emote");
  else if (getNum(json, "emote", &n)) qTap.push_back("emote");

  std::snprintf(outBuf, sizeof outBuf,
    "{\"ok\":true,\"f\":%.2f,\"s\":%.2f,\"v\":%.2f,\"yaw\":%.2f,\"pitch\":%.2f,"
    "\"sprint\":%s,\"sneak\":%s,\"jump\":%s,\"mine\":%s,\"useHold\":%s,\"queued\":%zu}",
    g.f, g.s, g.v, g.yawRate, g.pitchRate,
    g.sprint ? "true" : "false", g.sneak ? "true" : "false", g.jump ? "true" : "false",
    g.mine ? "true" : "false", g.useHold ? "true" : "false",
    qTap.size() + qPointer.size() + qSlot.size() + qForm.size() + qText.size());
  return outBuf;
}

extern "C" void scripteval_input_tick(void) {
  if (!gbSet) return;

  // 前tickで押した名前付きボタンを離す
  while (!qTapRelease.empty()) { emitBtn(qTapRelease.front(), false); qTapRelease.pop_front(); }

  // 移動
  if (gb.setMoveVector) gb.setMoveVector(g.f, g.s, gb.ud);
  else { setKey(SE_KEY_FORWARD, g.f > 0.3f); setKey(SE_KEY_BACK, g.f < -0.3f);
         setKey(SE_KEY_LEFT, g.s < -0.3f); setKey(SE_KEY_RIGHT, g.s > 0.3f); }
  // 上下(飛行/水泳): 専用口 or jump/sneak 代替
  bool jumpWant = g.jump, sneakWant = g.sneak;
  if (gb.setVertical) gb.setVertical(g.v, gb.ud);
  else { if (g.v > 0.3f) jumpWant = true; if (g.v < -0.3f) sneakWant = true; }
  setKey(SE_KEY_SNEAK, sneakWant);
  setKey(SE_KEY_SPRINT, g.sprint);

  // 視点
  if (g.hasAbs) { if (gb.setCamera) gb.setCamera(g.absYaw, g.absPitch, 1, gb.ud); g.hasAbs = false; }
  else if (g.yawRate != 0 || g.pitchRate != 0) {
    if (gb.setCamera) gb.setCamera(g.yawRate, g.pitchRate, 0, gb.ud);
    else if (gb.mouseMove) gb.mouseMove(g.yawRate * sens(), g.pitchRate * sens(), gb.ud);
  }

  // 左右(採掘/使用の保持 + 攻撃/使用の単発)・中(ピック単発)
  driveButton(bL, SE_BTN_LEFT, g.mine);
  driveButton(bR, SE_BTN_RIGHT, g.useHold);
  driveButton(bM, SE_BTN_MIDDLE, false);

  // ジャンプ(保持 + 単発)
  bool jumpEmit = jumpWant;
  if (jmpPulse == 2) { jumpEmit = true; jmpPulse = 1; } else if (jmpPulse == 1) { jmpPulse = 0; }
  setKey(SE_KEY_JUMP, jumpEmit);

  // 任意ボタンの保持(エッジのみ)
  for (auto& kv : heldBtnWant) {
    bool want = kv.second, cur = heldBtnEmit[kv.first];
    if (want != cur) { emitBtn(kv.first, want); heldBtnEmit[kv.first] = want; }
  }

  // ホットバー選択(1回)
  if (pendingSlot >= 0) { if (gb.hotbar) gb.hotbar(pendingSlot, gb.ud); pendingSlot = -1; }

  // 名前付きボタン単発(1tick1件。__slotNext/Prev は scrollSlot、他は button(name) で press→次tick release)
  if (!qTap.empty()) {
    std::string a = qTap.front(); qTap.pop_front();
    if (a == "__slotNext") { if (gb.scrollSlot) gb.scrollSlot(1, gb.ud); }
    else if (a == "__slotPrev") { if (gb.scrollSlot) gb.scrollSlot(-1, gb.ud); }
    else { emitBtn(a, true); qTapRelease.push_back(a); }
  }
  // ポインタ / スロット / フォーム / 文字(各 1tick1件)
  if (!qPointer.empty()) { auto o = qPointer.front(); qPointer.pop_front(); if (gb.pointer) gb.pointer(o.op.c_str(), o.x, o.y, o.button, gb.ud); }
  if (!qSlot.empty()) { auto o = qSlot.front(); qSlot.pop_front(); if (gb.slotClick) gb.slotClick(o.index, o.mode.c_str(), gb.ud); }
  if (!qForm.empty()) { auto o = qForm.front(); qForm.pop_front(); if (gb.form) gb.form(o.op.c_str(), o.arg.c_str(), gb.ud); }
  if (!qText.empty()) { auto o = qText.front(); qText.pop_front(); if (gb.text) gb.text(o.content.c_str(), o.kind.c_str(), gb.ud); }
}

#ifdef INJECT_INPUT_SELFTEST
#include <vector>
static std::vector<std::string> LOG;
static void r_key(SeInputKey k, int d, void*) { LOG.push_back("key " + std::to_string((int)k) + " " + std::to_string(d)); }
static void r_mm(double x, double y, void*) { char b[64]; std::snprintf(b, 64, "mm %.1f %.1f", x, y); LOG.push_back(b); }
static void r_mb(int b_, int d, void*) { LOG.push_back("mb " + std::to_string(b_) + " " + std::to_string(d)); }
static void r_vert(float v, void*) { char b[32]; std::snprintf(b, 32, "vert %.1f", v); LOG.push_back(b); }
static void r_hot(int s, void*) { LOG.push_back("hotbar " + std::to_string(s)); }
static void r_scroll(int d, void*) { LOG.push_back("scroll " + std::to_string(d)); }
static void r_btn(const char* n, int d, void*) { LOG.push_back(std::string("btn ") + n + " " + std::to_string(d)); }
static void r_ptr(const char* op, double x, double y, int b_, void*) { char bf[80]; std::snprintf(bf, 80, "ptr %s %.2f %.2f %d", op, x, y, b_); LOG.push_back(bf); }
static void r_slot(int i, const char* m, void*) { LOG.push_back("slot " + std::to_string(i) + " " + m); }
static void r_form(const char* op, const char* a, void*) { LOG.push_back(std::string("form ") + op + " " + a); }
static void r_text(const char* t, const char* k, void*) { LOG.push_back(std::string("text ") + k + " " + t); }
static bool has(const std::string& s) { for (auto& l : LOG) if (l == s) return true; return false; }

int main() {
  SeInputBackend be{};
  be.key = r_key; be.mouseMove = r_mm; be.mouseButton = r_mb; be.setVertical = r_vert;
  be.hotbar = r_hot; be.scrollSlot = r_scroll; be.button = r_btn; be.pointer = r_ptr;
  be.slotClick = r_slot; be.form = r_form; be.text = r_text; be.lookSensitivity = 10.0;
  scripteval_input_set_backend(&be);
  int fails = 0;
  auto ck = [&](bool c, const char* m) { if (!c) { ++fails; std::printf("FAIL %s\n", m); } else std::printf("ok   %s\n", m); };

  scripteval_inject_input("{\"f\":1,\"sprint\":true}"); scripteval_input_tick();
  ck(has("key 0 1"), "forward"); ck(has("key 6 1"), "sprint");
  LOG.clear(); scripteval_inject_input("{\"v\":1}"); scripteval_input_tick(); ck(has("vert 1.0"), "vertical");
  LOG.clear(); scripteval_inject_input("{\"action\":\"stop\"}"); scripteval_input_tick(); ck(has("key 0 0") && has("key 6 0"), "stop");
  LOG.clear(); scripteval_inject_input("{\"yaw\":2,\"pitch\":-1}"); scripteval_input_tick(); ck(has("mm 20.0 -10.0"), "look");
  LOG.clear(); scripteval_inject_input("{\"mine\":true}"); scripteval_input_tick(); ck(has("mb 0 1"), "mine down");
  LOG.clear(); scripteval_input_tick(); ck(!has("mb 0 0"), "mine stays");
  LOG.clear(); scripteval_inject_input("{\"mine\":false}"); scripteval_input_tick(); ck(has("mb 0 0"), "mine up");
  LOG.clear(); scripteval_inject_input("{\"action\":\"attack\"}"); scripteval_input_tick(); ck(has("mb 0 1"), "attack press");
  scripteval_input_tick(); ck(has("mb 0 0"), "attack release");
  LOG.clear(); scripteval_inject_input("{\"slot\":3}"); scripteval_input_tick(); ck(has("hotbar 2"), "hotbar");
  LOG.clear(); scripteval_inject_input("{\"action\":\"slotNext\"}"); scripteval_input_tick(); ck(has("scroll 1"), "slotNext");
  // 名前付きボタン単発: inventory は press→次tick release
  LOG.clear(); scripteval_inject_input("{\"action\":\"inventory\"}"); scripteval_input_tick(); ck(has("btn inventory 1"), "inventory down");
  scripteval_input_tick(); ck(has("btn inventory 0"), "inventory up");
  // UI ナビ・クライアント操作も名前付きボタンで
  LOG.clear(); scripteval_inject_input("{\"action\":\"navSelect\"}"); scripteval_input_tick(); ck(has("btn navSelect 1"), "navSelect");
  LOG.clear(); scripteval_inject_input("{\"action\":\"screenshot\"}"); scripteval_input_tick(); ck(has("btn screenshot 1"), "screenshot");
  // 任意ボタンの保持
  LOG.clear(); scripteval_inject_input("{\"hold\":{\"use\":true}}"); scripteval_input_tick(); ck(has("btn use 1"), "hold use down");
  LOG.clear(); scripteval_inject_input("{\"hold\":{\"use\":false}}"); scripteval_input_tick(); ck(has("btn use 0"), "hold use up");
  // ポインタ(マウス/タッチ)
  LOG.clear(); scripteval_inject_input("{\"pointer\":{\"op\":\"tap\",\"x\":0.5,\"y\":0.25,\"button\":0}}"); scripteval_input_tick(); ck(has("ptr tap 0.50 0.25 0"), "pointer tap");
  // コンテナのスロット
  LOG.clear(); scripteval_inject_input("{\"slotClick\":{\"index\":5,\"mode\":\"shift\"}}"); scripteval_input_tick(); ck(has("slot 5 shift"), "slotClick");
  // サーバーフォーム
  LOG.clear(); scripteval_inject_input("{\"formButton\":2}"); scripteval_input_tick(); ck(has("form button 2"), "formButton");
  // 文字入力
  LOG.clear(); scripteval_inject_input("{\"chat\":\"hi\"}"); scripteval_inject_input("{\"command\":\"/day\"}"); scripteval_inject_input("{\"type\":\"abc\"}");
  scripteval_input_tick(); scripteval_input_tick(); scripteval_input_tick();
  ck(has("text chat hi"), "chat"); ck(has("text command /day"), "command"); ck(has("text raw abc"), "type raw");

  std::printf(fails ? "\nSELFTEST FAIL (%d)\n" : "\nSELFTEST OK\n", fails);
  return fails ? 1 : 0;
}
#endif

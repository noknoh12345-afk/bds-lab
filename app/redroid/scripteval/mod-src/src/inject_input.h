// inject_input.h — scripteval クライアント入力注入コア v2(全入力・全 UI 操作を網羅)。MC/mcpelauncher/OS 非依存。
//
// 実プレイヤーが Minecraft Bedrock で出来る操作を漏れなく。JS(ScriptEval.injectInput)から来る操作を、
// 毎tick InputBackend(関数ポインタ)へ反映する。MC/OS 依存はこの層に無く、実際に入力を流す所は backend に隔離。
// Android 素APK = 戦略A(直接書き込み)+離散は関数/uinput、Mac(mcpelauncher) = 戦略B(入力イベント合成)。
// 同じコアが両方を駆動する(= mac も apk も一緒)。埋めた backend 関数だけが使われ、未実装は no-op。
//
// ――――――― 網羅する操作の全体像(これが「全入力・全 UI」) ―――――――
//  移動(アナログ保持): f=前後 s=左右 v=上下  (-1..1)
//  視点:              yaw/pitch=相対レート(度/tick 保持)  absYaw/absPitch=絶対(1回)  mouseMove=生の相対
//  ロコモーション(保持): sprint sneak jump   (+ 単発 jumpOnce、トグル sneakToggle/sprintToggle)
//  手:                attack(単発) use(単発) mine(左保持) useHold(右保持) pickBlock(中)
//  ホットバー/持ち物:  slot=1..9 選択 / slotNext slotPrev / drop dropStack / swapHands
//  画面の開閉:         inventory pause chatOpen commandOpen perspective emote sleep recipeBook map
//  UI ナビゲーション:  navUp navDown navLeft navRight navSelect navBack navMenu navPageLeft navPageRight
//  ポインタ(マウス/タッチ UI): move / down / up / tap / longpress / drag / scroll (x,y は 0..1 の画面比)
//  コンテナ(インベントリ/チェスト/作業台): slotClick(index, mode) mode=left/right/shift/drop/half/double
//  サーバーフォーム(ActionForm/Modal): form button/submit/close/input
//  文字入力:           chat="…" / command="/…" / type="…"(フォーカス中の欄へ生入力)
//  クライアント操作:    screenshot toggleHud fullscreen toggleGui
//  汎用(保険):         press="<任意ボタン名>"(1回) / hold={"<名前>":true|false}(任意ボタンの保持)
//                      これで上に無い将来のバインドも名前で叩ける(= 文字どおり全部)。
//
// JS 側契約: globalThis.ScriptEval.injectInput(jsonString) がこの scripteval_inject_input を呼ぶ。
//   さらに mod は毎フレーム/每tick scripteval_input_tick() を呼ぶ(保持入力の反映・キュー消化)。
#ifndef SCRIPTEVAL_INJECT_INPUT_H
#define SCRIPTEVAL_INJECT_INPUT_H
#ifdef __cplusplus
extern "C" {
#endif

// ロコモーションの意味キー(実キーコードは backend が各プラットフォームのコードへ対応づける)
typedef enum {
  SE_KEY_FORWARD = 0, SE_KEY_BACK, SE_KEY_LEFT, SE_KEY_RIGHT,
  SE_KEY_JUMP, SE_KEY_SNEAK, SE_KEY_SPRINT, SE_KEY__COUNT
} SeInputKey;

typedef enum { SE_BTN_LEFT = 0, SE_BTN_RIGHT = 1, SE_BTN_MIDDLE = 2 } SeMouseButton;

// libscripteval(mod)が埋める差し込み口。使う戦略に応じて埋めたものだけ使われる。
// ※ 先頭の key..setCamera, lookSensitivity, ud は 0.3.0 scaffold と名前・意味が互換(既存 backend はそのまま compile)。
typedef struct {
  // --- 戦略B: 入力デバイス合成(ロコモーション/視点) ---
  void (*key)(SeInputKey key, int down, void* ud);
  void (*mouseMove)(double dx, double dy, void* ud);
  void (*mouseButton)(int button, int down, void* ud);              // 0=左 1=右 2=中

  // --- 戦略A: 直接(埋めれば key/mouseMove より優先) ---
  void (*setMoveVector)(float forward, float strafe, void* ud);     // -1..1
  void (*setCamera)(float yaw, float pitch, int absolute, void* ud);// absolute=1:絶対 0:相対

  // --- 上下・ホットバー ---
  void (*setVertical)(float v, void* ud);                           // -1..1 飛行/水泳。未実装なら jump/sneak で代替
  void (*hotbar)(int slot, void* ud);                               // ホットバー選択 0..8
  void (*scrollSlot)(int dir, void* ud);                            // -1=前 / +1=次

  // --- 汎用ボタン(上記以外のあらゆるバインド/UI ボタン/名前付きキーを1本で。down:1/0) ---
  //  name 例: "inventory" "drop" "dropStack" "swapHands" "pickBlock" "perspective" "emote" "sleep" "pause"
  //           "chatOpen" "commandOpen" "recipeBook" "map" "screenshot" "toggleHud" "fullscreen" "toggleGui"
  //           "navUp" "navDown" "navLeft" "navRight" "navSelect" "navBack" "navMenu" "navPageLeft" "navPageRight"
  //           "enter" "escape" "backspace" "tab" など生キー名も可
  void (*button)(const char* name, int down, void* ud);

  // --- UI: ポインタ(マウス/タッチ)。x,y は 0..1 の画面比。op: move/down/up/tap/longpress/drag/scroll ---
  void (*pointer)(const char* op, double x, double y, int button, void* ud);

  // --- UI: コンテナのスロット操作。mode: left/right/shift/drop/half/double ---
  void (*slotClick)(int index, const char* mode, void* ud);

  // --- UI: サーバーフォーム。op: button(arg=番号/文言) / submit / close / input(arg="field=value") ---
  void (*form)(const char* op, const char* arg, void* ud);

  // --- 文字入力。kind: "chat" / "command" / "raw"(フォーカス欄へ) ---
  void (*text)(const char* content, const char* kind, void* ud);

  double lookSensitivity; // 戦略B の mouseMove 係数(度→ピクセル)。0 で既定 6.0
  void* ud;
} SeInputBackend;

// backend を登録(mod 初期化時に1回)。NULL 可。
void scripteval_input_set_backend(const SeInputBackend* backend);

// JS からの1操作(フラット JSON)を適用。返り値は静的バッファの JSON(現在状態の要約)。
//  保持: f,s,v,yaw,pitch(数)  sprint,sneak,jump,mine,useHold(bool)  hold={"name":bool}(任意ボタン保持)
//  1回: absYaw,absPitch(絶対視点)  slot(1..9)  press="name"(任意ボタン単発)
//       action="<下の語>"  pointer={op,x,y,button,amount}  slotClick={index,mode}
//       form={op,arg} / formButton=n / formClose=true   chat / command / type (文字列)  emote=<番号|名前>
//  action 語: attack use mineOnce useOnce pickBlock jumpOnce drop dropStack inventory pause chatOpen commandOpen
//             perspective emote sleep recipeBook map swapHands slotNext slotPrev sneakToggle sprintToggle
//             screenshot toggleHud fullscreen toggleGui navUp navDown navLeft navRight navSelect navBack navMenu
//             navPageLeft navPageRight stop(移動/保持を0) reset(全初期化)
const char* scripteval_inject_input(const char* json);

// mod が毎フレーム/每tick 呼ぶ。保持状態を反映し、単発/ポインタ/スロット/フォーム/文字のキューを消化する。
void scripteval_input_tick(void);

#ifdef __cplusplus
}
#endif
#endif // SCRIPTEVAL_INJECT_INPUT_H

import { world, system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
/*FORM_START*/import { ActionFormData } from "@minecraft/server-ui";/*FORM_END*/
/*IPC_START*/import IPC, { PROTO } from "./ipc.js";/*IPC_END*/

/* ============================================================
   GeoUI Studio 生成スクリプト
   ・アスペクト比の自動推定＋ルーラー校正
   ・シーンの連鎖再生（遅延つき）
   ・IPC で外部パックから操作
   ============================================================ */
const CFG = {
  "ns": "geoui",
  "mode": "loop",
  "duration": 11,
  "loop": true,
  "autoplay": true,
  "defaultAspect": 1778,
  "autoAspect": true,
  "centerFix": {
    "desktop": {
      "x": -0.00057,
      "y": -0.02784
    },
    "mobile": {
      "x": -0.0017,
      "y": -0.05256
    },
    "console": {
      "x": -0.00057,
      "y": -0.02784
    }
  },
  "centerAuto": true,
  "startScene": -1,
  "scenes": [],
  "audio": [],
  "values": [
    {
      "obj": "score",
      "prop": "geoui:v0"
    },
    {
      "obj": "hp",
      "prop": "geoui:v1"
    }
  ],
  "trigger": {
    "onJoin": true,
    "chatCommand": true,
    "item": "",
    "itemEnabled": false,
    "ipc": true,
    "forms": true
  },
  "tuner": true,
  "forms": true,
  "ipc": true,
  "onEnd": []
};
const P = (id) => CFG.ns + ":" + id;
const DP = (id) => CFG.ns + "." + id;

/* ---------------- ことば（日本語 / English の 2 つだけ） ----------------
   プレイヤーの端末の言語をそのまま読む手段が無いので、
   日本語以外の環境向けに English を用意し、/geoui lang で切り替える。   */
const L10N = {
  ja: {
    setupTitle: "GeoUI 画面設定", now: "いまの設定", aspect: "画面比", center: "中央", size: "大きさ",
    device: "端末", pickHint: "ずれているところを選んでください",
    bDevice: "端末を選ぶ", bDeviceSub: "機種から選ぶだけ",
    bAspect: "画面比を選ぶ", bAspectSub: "左右が切れる／余るとき",
    bCenter: "中央を合わせる", bCenterSub: "絵が上下にずれているとき",
    bScale: "大きさを合わせる", bScaleSub: "小さすぎる／大きすぎるとき",
    bAuto: "自動で測る", bAutoSub: "JUCF が入っているとき", bReset: "はじめの設定に戻す",
    devTitle: "端末を選ぶ", devBody: "お使いの端末に近いものを選んでください。\n画面比と中央のずれを、まとめて合わせます。",
    aspTitle: "画面比を選ぶ", aspBody: "絵が左右に切れるなら大きい方へ、余るなら小さい方へ。",
    cenTitle: "中央を合わせる", cenBody: "絵の中心が画面のど真ん中に来るまで動かしてください。",
    horiz: "よこ", vert: "たて", step: "きざみ", cenTip: "押すと画面がすぐ動きます。合ったら「決定」。",
    up: "▲ うえへ", down: "▼ したへ", left: "◀ ひだりへ", right: "▶ みぎへ",
    fine: "きざみを細かく（0.05%）", coarse: "きざみを粗く（0.20%）",
    zero: "ずれ無しに戻す", save: "決定して保存", back: "もどる",
    sclTitle: "大きさを合わせる", sclNow: "いま", sclTip: "押すとすぐ変わります。",
    bigger2: "もっと大きく　×2", bigger: "少し大きく　×1.25",
    smaller: "少し小さく　×0.8", smaller2: "半分にする　÷2", reset100: "100% に戻す",
    savedCenter: "中央のずれを保存しました", savedScale: "大きさを保存しました",
    savedAspect: "画面比を", didReset: "はじめの設定に戻しました",
    autoFail: "自動診断は使えませんでした", autoAlt: "かわりに、お使いの端末を選んでください",
    setupHint: "ずれていたら §f/CMD §7（端末を選ぶだけ）", estimated: "画面比を", estimatedAs: "と推定"
  },
  en: {
    setupTitle: "GeoUI Screen Setup", now: "Current", aspect: "Aspect", center: "Center", size: "Size",
    device: "Device", pickHint: "Pick whatever looks wrong",
    bDevice: "Choose your device", bDeviceSub: "Just pick a model",
    bAspect: "Choose aspect ratio", bAspectSub: "If the sides are cut off or padded",
    bCenter: "Align the center", bCenterSub: "If the art sits too high or low",
    bScale: "Adjust the size", bScaleSub: "If it looks too small or too large",
    bAuto: "Measure automatically", bAutoSub: "Requires JUCF", bReset: "Reset to defaults",
    devTitle: "Choose your device", devBody: "Pick the closest match.\nThis sets both the aspect ratio and the centre offset.",
    aspTitle: "Choose aspect ratio", aspBody: "If the sides are cut off pick a wider one; if padded pick a narrower one.",
    cenTitle: "Align the center", cenBody: "Nudge until the centre of your art sits dead centre on screen.",
    horiz: "Horizontal", vert: "Vertical", step: "Step", cenTip: "The screen moves as you press. Save when it lines up.",
    up: "▲ Up", down: "▼ Down", left: "◀ Left", right: "▶ Right",
    fine: "Finer step (0.05%)", coarse: "Coarser step (0.20%)",
    zero: "Back to no offset", save: "Save", back: "Back",
    sclTitle: "Adjust the size", sclNow: "Now", sclTip: "Changes apply immediately.",
    bigger2: "Much bigger  x2", bigger: "A bit bigger  x1.25",
    smaller: "A bit smaller  x0.8", smaller2: "Half  /2", reset100: "Back to 100%",
    savedCenter: "Saved the centre offset", savedScale: "Saved the size",
    savedAspect: "Aspect ratio set to", didReset: "Reset to defaults",
    autoFail: "Automatic measurement was not available", autoAlt: "Please choose your device instead",
    setupHint: "If it looks off, run §f/CMD §7(just pick your device)", estimated: "Aspect ratio", estimatedAs: "(estimated)"
  }
};
let LANG = "ja";
try {
  const sv = world.getDynamicProperty(CFG.ns + ".lang");
  if (sv === "en" || sv === "ja") LANG = sv;
} catch (e) {}
const L = (k) => (L10N[LANG] || L10N.ja)[k] || (L10N.ja[k] || k);
function setLang(v) {
  if (v !== "ja" && v !== "en") return;
  LANG = v;
  try { world.setDynamicProperty(CFG.ns + ".lang", v); } catch (e) {}
}

const PLATFORM_GUESS = {
  Desktop: { aspect: 1778, h: 1080 },
  Mobile: { aspect: 2000, h: 1080 },
  Console: { aspect: 1778, h: 1080 }
};
const ASPECT_TABLE = [
  [1333, "4:3"], [1500, "3:2"], [1600, "16:10"], [1778, "16:9"],
  [2000, "18:9"], [2167, "19.5:9"], [2222, "20:9"], [2333, "21:9"]
];

const state = new Map();
function st(p) {
  let s = state.get(p.id);
  if (!s) { s = { gen: 0, startTick: 0, playing: false, scene: CFG.startScene, timers: [], queue: null, rulerBack: null }; state.set(p.id, s); }
  return s;
}
function setProp(p, id, v) { try { if (p.getProperty(P(id)) !== v) p.setProperty(P(id), v); } catch (e) {} }
function getProp(p, id) { try { return p.getProperty(P(id)); } catch (e) { return undefined; } }
function clearTimers(s) { for (const t of s.timers) { try { system.clearRun(t); } catch (e) {} } s.timers = []; }
function targets(name) {
  const all = world.getPlayers();
  if (!name || name === "@a" || name === "*") return all;
  return all.filter(p => p.name === name || p.id === name);
}

/* ---------------- アスペクト比 ---------------- */
function platformOf(p) {
  try {
    const info = p.clientSystemInfo;
    if (info && info.platformType) return String(info.platformType);
  } catch (e) {}
  return "Unknown";
}
function applyAspect(p, milli, remember) {
  const v = Math.max(600, Math.min(5000, Math.round(milli)));
  setProp(p, "aspect", v);
  if (remember) { try { p.setDynamicProperty(DP("aspect"), v); } catch (e) {} }
  return v;
}
/* ---------------- 中央のズレ補正 ----------------
   板ポリの中心は端末ごとに少し下にずれる。実測した差を押し戻して、
   作った絵の中心が画面のど真ん中に来るようにする。
   ・保存済みの手動値があればそれを最優先
   ・無ければ端末の種類（Desktop / Mobile / Console）から自動で決める        */
const CENTER_PRESETS = [
  ["desktop", "PC・パソコン", 0],
  ["mobile", "スマホ・タブレット（iOS / Android）", 0],
  ["console", "ゲーム機（Switch / PS / Xbox）", 0]
];
function centerKeyOf(p) {
  const t = platformOf(p);
  if (t === "Mobile") return "mobile";
  if (t === "Console") return "console";
  return "desktop";
}
function applyCenter(p, x, y, remember) {
  const cx = Math.max(-3000, Math.min(3000, Math.round(x * 10000)));
  const cy = Math.max(-3000, Math.min(3000, Math.round(y * 10000)));
  setProp(p, "cx", cx); setProp(p, "cy", cy);
  if (remember) {
    try { p.setDynamicProperty(DP("cx"), cx); p.setDynamicProperty(DP("cy"), cy); } catch (e) {}
  }
  return { x: cx, y: cy };
}
function resolveCenter(p) {
  let sx, sy;
  try { sx = p.getDynamicProperty(DP("cx")); sy = p.getDynamicProperty(DP("cy")); } catch (e) {}
  if (typeof sx === "number" && typeof sy === "number") return applyCenter(p, sx / 10000, sy / 10000, false);
  const f = (CFG.centerFix || {})[CFG.centerAuto === false ? "desktop" : centerKeyOf(p)] ||
            (CFG.centerFix || {}).desktop || { x: 0, y: 0 };
  return applyCenter(p, f.x || 0, f.y || 0, false);
}
function centerNow(p) {
  let x = getProp(p, "cx"), y = getProp(p, "cy");
  if (typeof x !== "number") x = 0;
  if (typeof y !== "number") y = 0;
  return { x, y };
}

function resolveAspect(p) {
  let saved;
  try { saved = p.getDynamicProperty(DP("aspect")); } catch (e) {}
  if (typeof saved === "number" && saved >= 600) return applyAspect(p, saved, false);
  if (CFG.autoAspect) {
    const g = PLATFORM_GUESS[platformOf(p)];
    if (g) return applyAspect(p, g.aspect, false);
  }
  return applyAspect(p, CFG.defaultAspect, false);
}
/* 画面まわりの設定をまとめて反映する（参加時・再読込時に呼ぶ） */
function resolveScreen(p) { resolveAspect(p); resolveCenter(p); }
function estimateResolution(p, aspect) {
  const g = PLATFORM_GUESS[platformOf(p)] || PLATFORM_GUESS.Desktop;
  return { w: Math.round(g.h * aspect / 1000 / 2) * 2, h: g.h };
}
function aspectLabel(v) {
  let best = ASPECT_TABLE[0];
  for (const e of ASPECT_TABLE) if (Math.abs(e[0] - v) < Math.abs(best[0] - v)) best = e;
  return Math.abs(best[0] - v) <= 40 ? best[1] : (v / 1000).toFixed(2) + ":1";
}

/* ---------------- 画面診断（JUCF フォームをスクリプトから出す） ----------------
   JUCF は「1 要素ちょうど 14 キー」「同じ form_name は登録できない」という決まりが
   あるので、必ず全キーを書き、登録前に古い form を消す。
   フォームは画面中央に置かれ、画面より外側は切れる。この性質を使い、
   「切れずに見えている、いちばん外側のボタン」を押してもらって画面の端を測る。
   粗い目盛り → その 1 区間だけ細かい目盛り、の 2 段階で押す回数は片側 2 回。   */
/*FORM_START*/
const SCAN_W = 2400, SCAN_H = 1600;   /* どんな画面より確実に大きい */
const SCAN_CX = SCAN_W / 2, SCAN_CY = SCAN_H / 2;
/* 粗い段は 9 個まで。JUCF は「フォーム JSON をまるごとタグに入れる」仕組みで、
   タグには長さの上限がある。18 個だと 4000 文字を超えて登録に失敗していたので、
   段数を半分にし、1 段あたりの幅を広げて同じ範囲を測れるようにした。       */
const SCAN_COARSE = { from: 40, step: 80, n: 9 };    /* 40〜680 を 80 きざみ */
const SCAN_TAG_LIMIT = 3800;   /* タグ 1 個の実用上限。超えると addTag が黙って失敗する */
const scanState = new Map();

function scanSt(p) {
  let s = scanState.get(p.id);
  if (!s) { s = { halfW: 0, halfH: 0, tick: 0, key: scanKey(p) }; scanState.set(p.id, s); }
  return s;
}
/** フォーム名はプレイヤーごとに変える（同時に測っても混ざらないように） */
function scanKey(p) {
  const raw = String(p.id || p.name || "p").toLowerCase().replace(/[^a-z0-9]/g, "");
  return "p" + (raw.slice(-6) || "0");
}
const scanName = (p, tag) => CFG.ns + "_f" + scanSt(p).key + tag;
/** JUCF の要素は 14 キーちょうど。1 つでも欠けても多くてもエラーになる */
function scanEl(o) {
  const b = {
    h: "0", w: "0", x: "0", y: "0", text: "", texture: "", hover_text: "", command: "", aux: "0",
    is_show_button: "false", is_show_close: "false", is_show_image: "false",
    is_show_text: "false", is_show_item: "false"
  };
  for (const k of Object.keys(o)) b[k] = String(o[k]);
  return b;
}
function scanBtn(x, y, w, h, text, cmd) {
  return scanEl({
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    text: text, is_show_text: "true", is_show_button: "true", command: cmd
  });
}
function scanLabel(x, y, w, h, text) {
  return scanEl({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text: text, is_show_text: "true" });
}
/** 片側ぶんのボタンを並べたフォームを作る
    c（粗い）… 中心から外へ、となり合わせに並べた列。いちばん外の「丸ごと見える」ボタンを押す
    f（細かい）… 階段状にずらした 6 個。段の外側の辺が少しずつ伸びるので、
                 押しやすい大きさのまま細かく測れる（小さいボタンは指で押せないため）
    cross … 直交方向の「画面の半分」。分かっていれば、はみ出さない大きさに自動調整する */
function scanForm(name, axis, stage, from, step, n, cross) {
  const els = [];
  const horiz = axis === "x";
  const fine = stage === "f";
  /* 直交方向に使ってよい幅（画面の 80%）。階段がはみ出すと押せなくなるので詰める */
  const room = cross > 0 ? cross * 2 * 0.8 : 0;
  let gap = 0, bw = 0, bh = 0;
  if (fine) {
    if (horiz) {
      gap = Math.max(12, Math.min(30, room > 0 ? Math.floor(room / n) : 24));
      bw = 68; bh = Math.max(10, gap - 4);
    } else {
      gap = Math.max(18, Math.min(56, room > 0 ? Math.floor(room / n) : 48));
      bw = Math.max(12, gap - 6); bh = 46;
    }
  }
  for (let i = 0; i < n; i++) {
    const d = from + step * i;
    let x, y, w, h, edge;
    if (!fine) {
      w = horiz ? Math.max(16, step - 5) : Math.max(26, Math.min(62, cross > 0 ? Math.floor(cross * 1.2) : 62));
      h = horiz ? Math.max(20, Math.min(40, cross > 0 ? Math.floor(cross * 0.5) : 40)) : Math.max(16, step - 5);
      x = horiz ? SCAN_CX + d - w / 2 : SCAN_CX - w / 2;
      y = horiz ? SCAN_CY - h / 2 : SCAN_CY + d - h / 2;
      edge = d + (horiz ? w : h) / 2;      /* このボタンが丸ごと見えるのに必要な端の位置 */
    } else if (horiz) {
      w = bw; h = bh;
      x = SCAN_CX + d - w;                 /* 右端をちょうど d に合わせる */
      y = SCAN_CY - (n * gap) / 2 + i * gap + (gap - h) / 2;
      edge = d;
    } else {
      w = bw; h = bh;
      x = SCAN_CX - (n * gap) / 2 + i * gap + (gap - w) / 2;
      y = SCAN_CY + d - h;                 /* 下端をちょうど d に合わせる */
      edge = d;
    }
    els.push(scanBtn(x, y, w, h, String(i + 1),
      "scriptevent " + CFG.ns + ":scan " + axis + stage + " " + Math.round(edge) + " " + Math.round(step)));
  }
  const tip = fine
    ? (horiz ? "§e階段の、いちばん §fみぎ §eまで届いている段を押す" : "§e階段の、いちばん §fした §eまで届いている段を押す")
    : (horiz ? "§eいちばん §fみぎ §eの『まるごと見えている』ボタンを押す" : "§eいちばん §fした §eの『まるごと見えている』ボタンを押す");
  const sub = "§7はしが切れているボタンは押さないでください";
  const again = "scriptevent " + CFG.ns + ":scan again 0 0";
  if (horiz) {
    const ty = SCAN_CY - (fine ? (n * gap) / 2 + 56 : 92);
    els.push(scanLabel(SCAN_CX - 250, ty, 500, 26, tip));
    els.push(scanLabel(SCAN_CX - 250, ty + 26, 500, 22, sub));
    els.push(scanBtn(SCAN_CX - 88, SCAN_CY + (fine ? (n * gap) / 2 + 16 : 60), 176, 26, "§7もう一度はじめから", again));
  } else {
    /* 縦のときは列が中央を占めるので、案内は横にずらす */
    const lx = SCAN_CX - (fine ? (n * gap) / 2 : 40) - 300;
    els.push(scanLabel(lx, SCAN_CY - 116, 280, 26, tip));
    els.push(scanLabel(lx, SCAN_CY - 90, 280, 22, sub));
    els.push(scanBtn(SCAN_CX + (fine ? (n * gap) / 2 : 40) + 20, SCAN_CY - 116, 176, 26, "§7もう一度はじめから", again));
  }
  return {
    form_name: name, form_size: { x: String(SCAN_W), y: String(SCAN_H) },
    is_show_form_frame: "true", variables: {}, elements: els
  };
}
/** 大きさを目で見て決めるパネル */
function sizeForm(name) {
  const W = 460, H = 300, cx = W / 2;
  const els = [];
  els.push(scanLabel(cx - 200, 10, 400, 28, "§f大きさの調整"));
  els.push(scanLabel(cx - 200, 38, 400, 26, "§7実際の見た目を見ながら押してください"));
  const rows = [
    ["§aもっと大きく  (×2)", 200], ["§a少し大きく  (×1.25)", 125],
    ["§e少し小さく  (×0.8)", 80], ["§e半分にする  (÷2)", 50],
    ["§7もとに戻す  (100%)", 0]
  ];
  for (let i = 0; i < rows.length; i++) {
    els.push(scanBtn(cx - 150, 76 + i * 42, 300, 36, rows[i][0],
      "scriptevent " + CFG.ns + ":size " + rows[i][1]));
  }
  return {
    form_name: name, form_size: { x: String(W), y: String(H) },
    is_show_form_frame: "true", variables: {}, elements: els
  };
}
/** 使い終わった form の登録を消す（同じ名前では登録できないため）
    who を渡すとそのプレイヤーぶんだけ、省略すると GeoUI が作った全部を消す */
function scanClean(who) {
  const pre = "cf:" + CFG.ns + "_f" + (who ? scanSt(who).key : "");
  let ids = [];
  try { ids = world.getDynamicPropertyIds(); } catch (e) { return; }
  for (const id of ids) {
    if (id.indexOf(pre) !== 0) continue;
    try { world.setDynamicProperty(id, undefined); } catch (e) {}
  }
}
/** 前回の途中終了などで残った、自分が付けた巨大タグを外す */
function scanDropTags(p) {
  let tags = [];
  try { tags = p.getTags(); } catch (e) { return; }
  for (const t of tags) {
    if (t.length > 200 && t.charAt(0) === "{" && t.indexOf(CFG.ns + "_f") > 0) {
      try { p.removeTag(t); } catch (e) {}
    }
  }
}
/** タグ登録 → cf:tag → cfs:name をスクリプトから実行する。
    ・権限が無い／JUCF が無い／タグが長すぎる、をそれぞれ見分けて案内する
    ・失敗したときは巨大タグを必ず外す（残すとプレイヤーデータが汚れるため） */
function scanOpen(p, form) {
  if (!p || !p.isValid) return;
  const name = form.form_name;
  scanClean(p);
  scanDropTags(p);
  let tag = "";
  try { tag = JSON.stringify(form); } catch (e) { p.sendMessage("§c[GeoUI] 診断フォームを作れませんでした"); return; }
  /* タグには長さの上限がある。超えていたら、その場でボタンを間引いて作り直す。
     それでも入らなければ JUCF は諦めて、選ぶだけの設定画面へ切り替える。      */
  if (tag.length > SCAN_TAG_LIMIT) {
    const shrunk = scanShrink(form);
    if (shrunk) { try { tag = JSON.stringify(shrunk); } catch (e) { tag = ""; } }
    if (!tag || tag.length > SCAN_TAG_LIMIT) { scanFallback(p, "フォームが大きすぎました"); return; }
  }
  let added = false;
  try { p.addTag(tag); added = true; } catch (e) { added = false; }
  if (added) { try { added = p.getTags().indexOf(tag) >= 0; } catch (e) { added = true; } }
  if (!added) { scanFallback(p, "フォームを登録できませんでした"); return; }
  try { p.runCommand("scriptevent cf:tag"); }
  catch (e) {
    try { p.removeTag(tag); } catch (e2) {}
    scanFallback(p, "コマンドを実行できませんでした（チート／権限）");
    return;
  }
  system.runTimeout(() => {
    if (!p.isValid) return;
    let done = false;
    try { done = world.getDynamicPropertyIds().indexOf("cf:" + name) >= 0; } catch (e) {}
    if (!done) {
      try { p.removeTag(tag); } catch (e) {}
      scanFallback(p, "JUCF が見つかりません");
      return;
    }
    try { p.runCommand("scriptevent cfs:" + name); } catch (e) {}
  }, 8);
}
/* タグに収まらないとき、ボタンを 1 つおきに間引いた軽いフォームを作る */
function scanShrink(form) {
  const els = form.elements || [];
  if (els.length < 6) return null;
  const kept = [];
  for (let i = 0; i < els.length; i++) {
    /* ボタン以外（案内文）は 1 行だけ残す。ボタンは 1 つおきに間引く */
    if (els[i].is_show_button !== "true") { if (kept.length === 0) kept.push(els[i]); continue; }
    if (i % 2 === 0) kept.push(els[i]);
  }
  if (kept.length < 3) return null;
  return { form_name: form.form_name, form_size: form.form_size,
           is_show_form_frame: form.is_show_form_frame, variables: {}, elements: kept };
}
/* 自動診断が使えないときは、選ぶだけの設定画面へ逃がす（行き止まりを作らない） */
function scanFallback(p, why) {
  try { scanDropTags(p); } catch (e) {}
  p.sendMessage("§e[GeoUI] " + L("autoFail") + "（" + why + "）");
  p.sendMessage("§7" + L("autoAlt"));
  system.runTimeout(() => setupMenu(p), 10);
}

function scanStart(p) {
  const s = scanSt(p);
  s.halfW = 0; s.halfH = 0; s.tick = system.currentTick;
  p.sendMessage("§e[GeoUI] 画面を測ります。切れずに見えている、いちばん外側のボタンを押してください");
  scanOpen(p, scanForm(scanName(p, "yc"), "y", "c", SCAN_COARSE.from, SCAN_COARSE.step, SCAN_COARSE.n, 0));
}
/** ボタンが押されたときの続き（edge = そのボタンが要求する画面の端の位置） */
function scanStep(p, tag, edge, step) {
  const s = scanSt(p);
  if (tag === "again") { scanStart(p); return; }
  if (system.currentTick - s.tick < 3) return;        /* 連打で二重に進まないように */
  s.tick = system.currentTick;
  if (!(edge > 0) || !(step > 0) || edge > 4000) {    /* 壊れた値は無視 */
    p.sendMessage("§c[GeoUI] うまく読み取れませんでした。もう一度お試しください");
    return;
  }
  /* 階段は直交方向に場所を取るので、入る段数を先に決める（小さい画面でも必ず押せるように）。
     縦→横 の順に測るので、横のときは測り終えた「画面の高さ」をそのまま使える。 */
  const horiz = tag.charAt(0) === "x";
  const cross = horiz ? s.halfH : edge * 1.3;      /* 縦のときは最低でも 4:3 とみなす */
  const minGap = horiz ? 12 : 18;
  const room = Math.max(0, cross * 2 * 0.8);
  const n = room >= 9 * minGap ? 9 : room >= 6 * minGap ? 6 : 4;
  const fs = Math.max(2, Math.round(step / (n - 1)));
  if (tag === "yc") {
    scanOpen(p, scanForm(scanName(p, "yf"), "y", "f", edge, fs, n, cross));
  } else if (tag === "yf") {
    s.halfH = edge + step / 2;
    p.sendMessage("§7[GeoUI] 縦はここまで。つぎは横です");
    system.runTimeout(() => scanOpen(p, scanForm(scanName(p, "xc"), "x", "c",
      SCAN_COARSE.from, SCAN_COARSE.step, SCAN_COARSE.n, s.halfH)), 10);
  } else if (tag === "xc") {
    scanOpen(p, scanForm(scanName(p, "xf"), "x", "f", edge, fs, n, cross));
  } else if (tag === "xf") {
    s.halfW = edge + step / 2;
    scanFinish(p);
  }
}
function scanFinish(p) {
  const s = scanSt(p);
  const w = Math.round(s.halfW * 2), h = Math.round(s.halfH * 2);
  if (!(w > 0 && h > 0) || w / h < 0.4 || w / h > 6) {
    p.sendMessage("§c[GeoUI] うまく測れませんでした。§f/" + CFG.ns + ":geoui scan §cでもう一度お試しください");
    scanClean(p); return;
  }
  let milli = Math.round(w / h * 1000);
  for (const e of ASPECT_TABLE) {                     /* 測定誤差ぶん、近い定番比に寄せる */
    if (Math.abs(e[0] - milli) / e[0] < 0.06) { milli = e[0]; break; }
  }
  const v = applyAspect(p, milli, true);
  try { p.setDynamicProperty(DP("uiw"), w); p.setDynamicProperty(DP("uih"), h); } catch (e) {}
  p.sendMessage("§a[GeoUI] 画面比を " + aspectLabel(v) + " (" + (v / 1000).toFixed(3) + ") にしました");
  p.sendMessage("§7測定値 " + w + " × " + h + "（json-ui 単位） / 端末 " + platformOf(p));
  p.sendMessage("§7この設定はあなた専用に保存されました");
  scanClean();
  system.runTimeout(() => sizeStart(p), 30);
}
function sizeStart(p) {
  p.sendMessage("§e[GeoUI] 見た目の大きさを調整します。パネルを見ながら押してください（やめるときは画面外をタップ）");
  scanOpen(p, sizeForm(scanName(p, "sz")));
}
function sizeStep(p, pct) {
  let cur = getProp(p, "scale");
  if (!(cur > 0)) cur = 100;
  const next = pct === 0 ? 100 : Math.max(1, Math.min(1000, Math.round(cur * pct / 100)));
  setProp(p, "scale", next);
  try { p.setDynamicProperty(DP("scale"), next); } catch (e) {}
  p.sendMessage("§a[GeoUI] 大きさ " + next + "%");
  scanClean();
  system.runTimeout(() => scanOpen(p, sizeForm(scanName(p, "sz"))), 12);
}
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== CFG.ns + ":scan" && ev.id !== CFG.ns + ":size") return;
  const p = ev.sourceEntity;
  if (!p || p.typeId !== "minecraft:player" || !p.isValid) return;
  const a = String(ev.message || "").trim().split(" ").filter(x => x.length);
  system.run(() => {
    try {
      if (ev.id === CFG.ns + ":size") sizeStep(p, Number(a[0]) || 0);
      else scanStep(p, a[0] || "again", Number(a[1]) || 0, Number(a[2]) || 0);
    } catch (e) { console.warn(e); }
  });
});
world.afterEvents.playerLeave.subscribe((ev) => {
  const id = ev.playerId;
  if (!id) return;
  const s = scanState.get(id);
  if (s) {
    const pre = "cf:" + CFG.ns + "_f" + s.key;
    try {
      for (const dp of world.getDynamicPropertyIds()) {
        if (dp.indexOf(pre) === 0) world.setDynamicProperty(dp, undefined);
      }
    } catch (e) {}
    scanState.delete(id);
  }
});
/* 前回の途中終了などで残った登録を、起動時に掃除しておく */
system.run(() => { try { scanClean(); } catch (e) {} });

/* ============================================================
   設定メニュー（バニラの ActionForm だけで動く）
   JUCF が無くても、権限が無くても、ここから必ず設定できる。
     1. 端末を選ぶ            … よくある機種から選ぶだけ
     2. 画面比を選ぶ          … 4:3 〜 21:9 を一覧から
     3. 中央を合わせる        … 十字を見ながら少しずつ動かす
     4. 大きさを合わせる      … 見ながら拡大・縮小
   ============================================================ */
const DEVICE_PRESETS = [
  { id: "pc",      label: "PC・パソコン",              aspect: 1778, center: "desktop" },
  { id: "pc16",    label: "PC（16:10）",                aspect: 1600, center: "desktop" },
  { id: "uw",      label: "ウルトラワイド（21:9）",     aspect: 2333, center: "desktop" },
  { id: "iphone",  label: "iPhone（ホームバーあり）",   aspect: 2167, center: "mobile" },
  { id: "iphone8", label: "iPhone（ホームボタン）",     aspect: 1778, center: "mobile" },
  { id: "ipad",    label: "iPad（4:3）",                aspect: 1333, center: "mobile" },
  { id: "and20",   label: "Android（20:9）",            aspect: 2222, center: "mobile" },
  { id: "and18",   label: "Android（18:9）",            aspect: 2000, center: "mobile" },
  { id: "switch",  label: "Nintendo Switch",            aspect: 1778, center: "console" },
  { id: "console", label: "PlayStation / Xbox",         aspect: 1778, center: "console" }
];

function formOK(res) { return res && !res.canceled; }

function setupMenu(p) {
  const a = getProp(p, "aspect") || CFG.defaultAspect;
  const c = centerNow(p);
  const f = new ActionFormData()
    .title(L("setupTitle"))
    .body(
      "§7" + L("now") + "§r\n" +
      "　" + L("aspect") + "　" + aspectLabel(a) + "　(" + (a / 1000).toFixed(3) + ")\n" +
      "　" + L("center") + "　x " + (c.x / 100).toFixed(2) + "%　y " + (c.y / 100).toFixed(2) + "%\n" +
      "　" + L("size") + "　" + (getProp(p, "scale") || 100) + "%\n" +
      "　" + L("device") + "　" + platformOf(p) + "\n\n" +
      "§7" + L("pickHint") + "§r"
    )
    .button(L("bDevice") + "\n§7" + L("bDeviceSub"))
    .button(L("bAspect") + "\n§7" + L("bAspectSub"))
    .button(L("bCenter") + "\n§7" + L("bCenterSub"))
    .button(L("bScale") + "\n§7" + L("bScaleSub"))
    .button(L("bAuto") + "\n§7" + L("bAutoSub"))
    .button(L("bReset"));
  f.show(p).then((r) => {
    if (!formOK(r)) return;
    switch (r.selection) {
      case 0: deviceMenu(p); break;
      case 1: aspectMenu(p); break;
      case 2: centerMenu(p); break;
      case 3: scaleMenu(p); break;
      case 4: scanStart(p); break;
      case 5:
        try {
          p.setDynamicProperty(DP("aspect"), undefined);
          p.setDynamicProperty(DP("cx"), undefined); p.setDynamicProperty(DP("cy"), undefined);
          p.setDynamicProperty(DP("scale"), undefined);
        } catch (e) {}
        setProp(p, "scale", 100);
        resolveScreen(p);
        p.sendMessage("§a[GeoUI] " + L("didReset"));
        system.runTimeout(() => setupMenu(p), 6);
        break;
    }
  }).catch(() => {});
}

function deviceMenu(p) {
  const f = new ActionFormData()
    .title("端末を選ぶ")
    .body("§7お使いの端末に近いものを選んでください。§r\n§7画面比と中央のずれを、まとめて合わせます。§r");
  for (const d of DEVICE_PRESETS) f.button(d.label);
  f.button("§7もどる");
  f.show(p).then((r) => {
    if (!formOK(r)) return;
    const d = DEVICE_PRESETS[r.selection];
    if (!d) { setupMenu(p); return; }
    applyAspect(p, d.aspect, true);
    const fx = (CFG.centerFix || {})[d.center] || { x: 0, y: 0 };
    applyCenter(p, fx.x || 0, fx.y || 0, true);
    p.sendMessage("§a[GeoUI] " + d.label + " に合わせました（" + aspectLabel(d.aspect) + "）");
    system.runTimeout(() => setupMenu(p), 6);
  }).catch(() => {});
}

function aspectMenu(p) {
  const f = new ActionFormData()
    .title("画面比を選ぶ")
    .body("§7絵が左右に切れるなら大きい方へ、余るなら小さい方へ。§r");
  for (const e of ASPECT_TABLE) f.button(e[1] + "　§7" + (e[0] / 1000).toFixed(3));
  f.button("§7もどる");
  f.show(p).then((r) => {
    if (!formOK(r)) return;
    const e = ASPECT_TABLE[r.selection];
    if (!e) { setupMenu(p); return; }
    applyAspect(p, e[0], true);
    p.sendMessage("§a[GeoUI] 画面比を " + e[1] + " にしました");
    system.runTimeout(() => setupMenu(p), 6);
  }).catch(() => {});
}

/* 中央合わせ。押すたびに絵が動くので、十字や絵の中心を見ながら詰めていく */
function centerMenu(p, step) {
  const st = step || 20;                       /* 画面の高さに対する 0.20% きざみ */
  const c = centerNow(p);
  const f = new ActionFormData()
    .title("中央を合わせる")
    .body(
      "§7絵の中心が画面のど真ん中に来るまで動かしてください。§r\n\n" +
      "　よこ　" + (c.x / 100).toFixed(2) + "%\n" +
      "　たて　" + (c.y / 100).toFixed(2) + "%\n" +
      "　きざみ　" + (st / 100).toFixed(2) + "%\n\n" +
      "§7押すと画面がすぐ動きます。合ったら「決定」。§r"
    )
    .button("▲ うえへ")
    .button("▼ したへ")
    .button("◀ ひだりへ")
    .button("▶ みぎへ")
    .button(st > 5 ? "きざみを細かく（0.05%）" : "きざみを粗く（0.20%）")
    .button("§7ずれ無しに戻す")
    .button("§a決定して保存");
  f.show(p).then((r) => {
    if (!formOK(r)) { applyCenter(p, c.x / 10000, c.y / 10000, true); return; }
    let x = c.x, y = c.y, next = st;
    switch (r.selection) {
      case 0: y += st; break;
      case 1: y -= st; break;
      case 2: x -= st; break;
      case 3: x += st; break;
      case 4: next = st > 5 ? 5 : 20; break;
      case 5: x = 0; y = 0; break;
      case 6:
        applyCenter(p, x / 10000, y / 10000, true);
        p.sendMessage("§a[GeoUI] 中央のずれを保存しました（x " + (x / 100).toFixed(2) + "% / y " + (y / 100).toFixed(2) + "%）");
        system.runTimeout(() => setupMenu(p), 6);
        return;
    }
    applyCenter(p, x / 10000, y / 10000, false);
    system.runTimeout(() => centerMenu(p, next), 2);
  }).catch(() => {});
}

function scaleMenu(p) {
  const cur = getProp(p, "scale") || 100;
  const f = new ActionFormData()
    .title("大きさを合わせる")
    .body("§7いま " + cur + "%§r\n§7押すとすぐ変わります。§r")
    .button("もっと大きく　×2")
    .button("少し大きく　×1.25")
    .button("少し小さく　×0.8")
    .button("半分にする　÷2")
    .button("§7100% に戻す")
    .button("§a決定して保存");
  f.show(p).then((r) => {
    if (!formOK(r)) return;
    const mul = [200, 125, 80, 50, 0][r.selection];
    if (r.selection === 5) {
      try { p.setDynamicProperty(DP("scale"), getProp(p, "scale")); } catch (e) {}
      p.sendMessage("§a[GeoUI] 大きさを保存しました（" + getProp(p, "scale") + "%）");
      system.runTimeout(() => setupMenu(p), 6);
      return;
    }
    const next = mul === 0 ? 100 : Math.max(1, Math.min(1000, Math.round(cur * mul / 100)));
    setProp(p, "scale", next);
    system.runTimeout(() => scaleMenu(p), 2);
  }).catch(() => {});
}
/*FORM_END*/

/* ---------------- 再生 ---------------- */
function play(p, seekTicks, scene) {
  const s = st(p);
  clearTimers(s);
  if (scene != null && scene >= 0) { s.scene = scene; setProp(p, "scene", Math.round(scene)); }
  s.gen = (s.gen + 1) % 2000000000;
  s.startTick = system.currentTick - (seekTicks || 0);
  s.playing = true;
  setProp(p, "seek", Math.max(0, Math.floor(seekTicks || 0)));
  setProp(p, "gen", s.gen);
  setProp(p, "playing", 1);
  try { p.camera.setCamera("minecraft:first_person"); } catch (e) {}
  scheduleAudio(p, s, (seekTicks || 0) / 20, s.scene);
  emit("started", p, s.scene);
  const sc = CFG.scenes[s.scene];
  const len = sc && sc.duration > 0 ? sc.duration : (CFG.loop ? 0 : CFG.duration);
  if (len > 0) s.timers.push(system.runTimeout(() => finish(p), Math.ceil(len * 20) + 1));
}
function stop(p) {
  const s = st(p);
  clearTimers(s); s.playing = false; s.queue = null;
  setProp(p, "playing", 0); setProp(p, "seek", 0);
  s.gen = (s.gen + 1) % 2000000000; setProp(p, "gen", s.gen);
  try { p.camera.clear(); } catch (e) {}
  stopAudio(p); emit("stopped", p, s.scene);
}
function pause(p) {
  const s = st(p);
  if (!s.playing) return;
  clearTimers(s); s.playing = false;
  setProp(p, "playing", 0);
  setProp(p, "seek", system.currentTick - s.startTick);
  stopAudio(p);
}
function resume(p) { const s = st(p); if (!s.playing) play(p, getProp(p, "seek") || 0, null); }
function seek(p, sec) { play(p, Math.max(0, Math.floor(sec * 20)), null); }

function finish(p) {
  const s = st(p);
  s.playing = false; setProp(p, "playing", 0);
  const sc = CFG.scenes[s.scene];
  emit("ended", p, s.scene);
  const cmds = sc && sc.commands.length ? sc.commands : CFG.onEnd;
  for (const c of cmds) { try { p.runCommand(c); } catch (e) {} }
  if (s.queue && s.queue.length) { const n = s.queue.shift(); playScene(p, n.scene, n.delay); return; }
  if (sc && sc.chain) { const nx = CFG.scenes[sc.next]; if (nx) playScene(p, nx.i, nx.delay); }
}
function playScene(p, index, delay) {
  const s = st(p);
  clearTimers(s);
  const sc = CFG.scenes[index];
  const d = Math.max(0, Math.round((delay != null ? delay : (sc ? sc.delay : 0)) * 20));
  const go = () => { emit("scene", p, index); play(p, 0, index); };
  if (d > 0) { setProp(p, "playing", 0); s.timers.push(system.runTimeout(go, d)); }
  else go();
}
function queueScenes(p, list, gap) {
  const s = st(p);
  const items = [];
  for (let i = 0; i < list.length; i++) items.push({ scene: list[i], delay: i === 0 ? 0 : (gap || 0) });
  if (!items.length) return;
  const first = items.shift();
  s.queue = items;
  playScene(p, first.scene, first.delay);
}

/* ---------------- 音声 ---------------- */
function scheduleAudio(p, s, fromSec, scene) {
  for (const a of CFG.audio) {
    if (a.scene >= 0 && a.scene !== scene) continue;
    const delay = Math.round((a.at - fromSec) * 20);
    const fire = () => {
      try { p.playSound(a.id, { volume: a.volume, pitch: a.pitch }); } catch (e) {}
      if (a.loop && a.length > 0) s.timers.push(system.runInterval(fire, Math.round(a.length * 20)));
    };
    if (delay <= 0 && a.at + (a.length || 0) > fromSec) fire();
    else if (delay > 0) s.timers.push(system.runTimeout(fire, delay));
  }
}
function stopAudio(p) { for (const a of CFG.audio) { try { p.runCommand("stopsound @s " + a.id); } catch (e) {} } }

/* ---------------- スコア同期 ---------------- */
function syncValues() {
  if (!CFG.values.length) return;
  for (const v of CFG.values) {
    let obj = world.scoreboard.getObjective(v.obj);
    if (!obj) { try { obj = world.scoreboard.addObjective(v.obj, v.obj); } catch (e) { continue; } }
    for (const p of world.getPlayers()) {
      let sc = 0;
      try { sc = obj.hasParticipant(p) ? (obj.getScore(p) ?? 0) : 0; } catch (e) {}
      try { if (p.getProperty(v.prop) !== sc) p.setProperty(v.prop, sc); } catch (e) {}
    }
  }
}

/* ---------------- IPC ---------------- */
/*IPC_START*/
const TargetS = PROTO.Object({ target: PROTO.String });
const PlayS = PROTO.Object({ target: PROTO.String, scene: PROTO.Int32, seek: PROTO.Float32 });
const SceneS = PROTO.Object({ target: PROTO.String, scene: PROTO.Int32 });
const QueueS = PROTO.Object({ target: PROTO.String, scenes: PROTO.Array(PROTO.Int32), gap: PROTO.Float32 });
const SetS = PROTO.Object({ target: PROTO.String, key: PROTO.String, value: PROTO.Int32 });
const EventS = PROTO.Object({ event: PROTO.String, target: PROTO.String, scene: PROTO.Int32 });
const StatusS = PROTO.Object({
  found: PROTO.Boolean, playing: PROTO.Boolean, scene: PROTO.Int32, time: PROTO.Float32,
  aspect: PROTO.Int32, width: PROTO.Int32, height: PROTO.Int32, platform: PROTO.String, name: PROTO.String
});
IPC.on(CFG.ns + ":play", PlayS, (v) => {
  for (const p of targets(v.target)) {
    if (v.scene >= 0) playScene(p, v.scene, 0); else play(p, Math.round((v.seek || 0) * 20), null);
  }
});
IPC.on(CFG.ns + ":stop", TargetS, (v) => { for (const p of targets(v.target)) stop(p); });
IPC.on(CFG.ns + ":pause", TargetS, (v) => { for (const p of targets(v.target)) pause(p); });
IPC.on(CFG.ns + ":resume", TargetS, (v) => { for (const p of targets(v.target)) resume(p); });
IPC.on(CFG.ns + ":scene", SceneS, (v) => { for (const p of targets(v.target)) playScene(p, v.scene, 0); });
IPC.on(CFG.ns + ":queue", QueueS, (v) => { for (const p of targets(v.target)) queueScenes(p, v.scenes, v.gap); });
IPC.on(CFG.ns + ":set", SetS, (v) => {
  for (const p of targets(v.target)) {
    if (v.key === "aspect") applyAspect(p, v.value, true); else setProp(p, v.key, v.value);
  }
});
IPC.handle(CFG.ns + ":status", TargetS, StatusS, (v) => {
  const p = targets(v.target)[0];
  if (!p) return { found: false, playing: false, scene: -1, time: 0, aspect: 0, width: 0, height: 0, platform: "", name: "" };
  const s = st(p);
  const a = getProp(p, "aspect") || CFG.defaultAspect;
  const res = estimateResolution(p, a);
  return {
    found: true, playing: !!s.playing, scene: s.scene == null ? -1 : s.scene,
    time: (system.currentTick - s.startTick) / 20, aspect: a,
    width: res.w, height: res.h, platform: platformOf(p), name: p.name
  };
});
/*IPC_END*/
function emit(name, p, scene) {
/*IPC_START*/
  try { IPC.send(CFG.ns + ":event", EventS, { event: name, target: p.name, scene: scene == null ? -1 : scene }); } catch (e) {}
/*IPC_END*/
}

/* ---------------- 参加時 ---------------- */
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  system.runTimeout(() => {
    let sv = 100;
    try { const d = p.getDynamicProperty(DP("scale")); if (typeof d === "number" && d > 0) sv = d; } catch (e) {}
    setProp(p, "scale", sv); setProp(p, "alpha", 100);
    const a = resolveAspect(p);
    resolveCenter(p);
    if (CFG.startScene >= 0) setProp(p, "scene", CFG.startScene);
    if (CFG.mode === "script" && CFG.autoplay) {
      if (CFG.scenes.length) playScene(p, Math.max(0, CFG.startScene), 0); else play(p, 0, null);
    }
    if (CFG.trigger.chatCommand) {
      let done = false;
      try { done = typeof p.getDynamicProperty(DP("uih")) === "number"; } catch (e) {}
      p.sendMessage("§7[GeoUI] 画面比を " + aspectLabel(a) + " と推定（" + platformOf(p) + "）");
      if (!done && CFG.forms) p.sendMessage("§7 " + L("setupHint").replace("CMD", CFG.ns + ":geoui setup"));
    }
  }, 20);
});

if (CFG.trigger.itemEnabled && CFG.trigger.item) {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (!ev.itemStack || ev.itemStack.typeId !== CFG.trigger.item) return;
    const s = st(ev.source);
    if (s.playing) stop(ev.source); else play(ev.source, 0, null);
  });
}

/* ---------------- カスタムコマンド ---------------- */
if (CFG.trigger.chatCommand) {
  system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerEnum(CFG.ns + ":sub", [
      "play", "stop", "pause", "resume", "seek", "scene", "queue",
      "aspect", "scan", "size", "scale", "ox", "oy", "alpha", "info",
      "setup", "center", "lang"
    ]);
    customCommandRegistry.registerCommand({
      name: CFG.ns + ":geoui",
      description: "GeoUI 画面演出の操作",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: CFG.ns + ":sub", type: CustomCommandParamType.Enum }
      ],
      optionalParameters: [
        { name: "arg1", type: CustomCommandParamType.String },
        { name: "arg2", type: CustomCommandParamType.String }
      ]
    }, (origin, sub, arg1, arg2) => {
      const p = origin.sourceEntity;
      if (!p || p.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行してください" };
      system.run(() => {
        switch (sub) {
          case "play": play(p, 0, arg1 != null ? Number(arg1) : null); break;
          case "stop": stop(p); break;
          case "pause": pause(p); break;
          case "resume": resume(p); break;
          case "seek": seek(p, Number(arg1) || 0); break;
          case "scene": playScene(p, Math.max(0, Math.round(Number(arg1) || 0)), 0); break;
          case "queue": queueScenes(p, (arg1 || "").split(",").map(Number).filter(n => !isNaN(n)), Number(arg2) || 0); break;
          case "aspect":
            if (arg1) {
              const v = applyAspect(p, Number(arg1) > 100 ? Number(arg1) : Number(arg1) * 1000, true);
              p.sendMessage("§a[GeoUI] 画面比を " + aspectLabel(v) + " にしました");
            } else if (CFG.forms) scanStart(p);
            else p.sendMessage("§7[GeoUI] 例: §f/" + CFG.ns + ":geoui aspect 1.778");
            break;
          case "scan":
            if (CFG.forms) scanStart(p);
            else p.sendMessage("§c[GeoUI] このパックは診断なしで書き出されています");
            break;
          case "lang":
            if (arg1 === "en" || arg1 === "ja") { setLang(arg1); p.sendMessage("§a[GeoUI] language: " + arg1); }
            else p.sendMessage("§7[GeoUI] /" + CFG.ns + ":geoui lang ja  |  /" + CFG.ns + ":geoui lang en");
            break;
          case "setup":
            if (CFG.forms) setupMenu(p);
            else p.sendMessage("§c[GeoUI] このパックは設定画面なしで書き出されています");
            break;
          case "center":
            if (arg1 != null && arg2 != null) {
              const cv = applyCenter(p, Number(arg1) || 0, Number(arg2) || 0, true);
              p.sendMessage("§a[GeoUI] 中央のずれを x " + (cv.x / 100).toFixed(2) + "% / y " + (cv.y / 100).toFixed(2) + "% にしました");
            } else if (CFG.forms) centerMenu(p);
            else p.sendMessage("§7[GeoUI] 例: §f/" + CFG.ns + ":geoui center -0.0006 -0.0278");
            break;
          case "size":
            if (CFG.forms) sizeStart(p);
            else p.sendMessage("§7[GeoUI] 例: §f/" + CFG.ns + ":geoui scale 150");
            break;
          case "scale": setProp(p, "scale", Math.max(1, Math.min(1000, Math.round(Number(arg1) || 100)))); break;
          case "ox": setProp(p, "ox", Math.round(Number(arg1) || 0)); break;
          case "oy": setProp(p, "oy", Math.round(Number(arg1) || 0)); break;
          case "alpha": setProp(p, "alpha", Math.max(0, Math.min(100, Math.round(Number(arg1) || 100)))); break;
          case "info": {
            const a = getProp(p, "aspect") || CFG.defaultAspect;
            const r = estimateResolution(p, a);
            p.sendMessage("§7端末 " + platformOf(p) + " / 画面比 " + aspectLabel(a) + " (" + (a / 1000).toFixed(3) + ")");
            const cc = centerNow(p);
            p.sendMessage("§7推定解像度 " + r.w + "×" + r.h + " / 倍率 " + getProp(p, "scale") + "% / シーン " + getProp(p, "scene"));
            p.sendMessage("§7中央のずれ x " + (cc.x / 100).toFixed(2) + "% / y " + (cc.y / 100).toFixed(2) + "%");
            break;
          }
        }
      });
      return { status: CustomCommandStatus.Success };
    });
  });
}

system.runInterval(syncValues, 2);

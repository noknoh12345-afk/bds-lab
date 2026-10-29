// ScriptEval Studio - browser IDE for the ScriptEval mod.
// Talks JSON-RPC over a WebSocket to the mod (same origin), authenticated with
// the per-launch token from the URL fragment (#t=...).
import { EditorState, StateEffect, StateField, Compartment, Prec } from "@codemirror/state";
import {
  EditorView, keymap, Decoration, WidgetType, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, highlightSpecialChars, placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, completionStatus } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { setDiagnostics, lintGutter } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { transform } from "sucrase";
import { initPacks } from "./packs.js";

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("se." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("se." + k, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem("se." + k); } catch {} },
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

// ------------------------------------------------------------------ state
const S = {
  ws: null, seq: 1, pending: new Map(), connected: false, everOpened: false, authFailures: 0, retry: 0,
  info: null, status: null, files: [], modules: [], tabs: [], active: null, hz: [], doctor: null,
  watches: store.get("watches", []), rtab: "state", history: store.get("history", []), histPos: -1,
};

// ------------------------------------------------------------------ toasts & dialogs
function toast(text, err = false) {
  const d = el("div", { class: err ? "err" : "" }, text);
  $("toast").append(d);
  setTimeout(() => d.remove(), err ? 6000 : 2800);
}
function dialog(title, body) {
  $("dlg-title").textContent = title;
  $("dlg-body").replaceChildren(body);
  $("dlg").showModal();
}
$("dlg-close").onclick = () => $("dlg").close();
async function copy(text, what = "コピーしました") {
  try { await navigator.clipboard.writeText(text); toast(what); }
  catch { dialog("コピーできませんでした", el("pre", {}, text)); }
}

// ------------------------------------------------------------------ connection
function readToken() {
  const m = /[#&]t=([0-9a-f]{16,128})/.exec(location.hash);
  if (m) {
    sessionStorage.setItem("se.token", m[1]);
    window.history.replaceState(null, "", location.pathname);
  }
  return sessionStorage.getItem("se.token");
}
function showGate(on, msg) {
  $("gate").classList.toggle("on", on);
  if (msg) $("gate").querySelector("p").textContent = msg;
  if (on) setTimeout(() => $("gate-token").focus(), 0);
}
$("gate-form").onsubmit = e => {
  e.preventDefault();
  const v = $("gate-token").value.trim().toLowerCase();
  if (!/^[0-9a-f]{16,128}$/.test(v)) { toast("トークンは 16 進数の文字列です", true); return; }
  sessionStorage.setItem("se.token", v);
  S.authFailures = 0;
  showGate(false);
  connect();
};

function setConn(on, text) {
  $("conn").classList.toggle("on", on);
  $("conn").textContent = text;
}

function connect() {
  const tok = readToken();
  if (!tok) { showGate(true); setConn(false, "トークン待ち"); return; }
  setConn(false, "接続中…");
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/ws`, ["scripteval.v1", "token." + tok]); }
  catch { scheduleReconnect(); return; }
  S.ws = ws;
  let opened = false;
  ws.onopen = () => { opened = true; S.everOpened = true; S.authFailures = 0; S.retry = 0; onOpen(); };
  ws.onmessage = ev => onMessage(ev.data);
  ws.onclose = async () => {
    const was = S.connected;
    S.connected = false;
    S.ws = null;
    for (const p of S.pending.values()) p.rej(new Error("接続が切れました"));
    S.pending.clear();
    setConn(false, "切断");
    if (was) print(2, "Studio との接続が切れました。再接続します…");
    if (!opened) {
      // server up but the handshake failed -> token is wrong or the game restarted (new token)
      try {
        const h = await fetch("/health", { cache: "no-store" });
        if (h.ok && ++S.authFailures >= 2) {
          sessionStorage.removeItem("se.token");
          showGate(true, "トークンが合いません。ゲームを再起動すると新しいトークンになります。ゲーム内のメニュー「ScriptEval → Studio を開く」か client.studio() で開き直してください。");
          setConn(false, "トークン待ち");
          return;
        }
      } catch {}
    }
    scheduleReconnect();
  };
}
function scheduleReconnect() {
  const delay = Math.min(5000, 600 * 2 ** S.retry++);
  setConn(false, "再接続を待っています");
  setTimeout(connect, delay);
}
function rpc(method, params = {}) {
  return new Promise((res, rej) => {
    if (!S.ws || S.ws.readyState !== 1) { rej(new Error("ゲームに接続していません")); return; }
    const id = S.seq++;
    S.pending.set(id, { res, rej });
    S.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}
// Binary request (resource pack upload): [u32 big-endian header length][JSON-RPC header][bytes]
function rpcBinary(method, params, bytes) {
  return new Promise((res, rej) => {
    if (!S.ws || S.ws.readyState !== 1) { rej(new Error("ゲームに接続していません")); return; }
    const id = S.seq++;
    S.pending.set(id, { res, rej });
    const head = new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    const buf = new Uint8Array(4 + head.length + bytes.length);
    new DataView(buf.buffer).setUint32(0, head.length);
    buf.set(head, 4);
    buf.set(bytes, 4 + head.length);
    S.ws.send(buf);
  });
}
function onMessage(data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  if (msg.id !== undefined && msg.id !== null && S.pending.has(msg.id)) {
    const p = S.pending.get(msg.id);
    S.pending.delete(msg.id);
    if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
    return;
  }
  if (msg.method === "event") onEvent(msg.params);
}
async function onOpen() {
  S.connected = true;
  setConn(true, "接続中");
  try {
    S.info = await rpc("hello");
    document.title = `ScriptEval Studio (${S.info.gameVersion || "Minecraft"})`;
    await rpc("subscribe", { topics: ["console", "status"] });
    await Promise.all([refreshFiles(), refreshModules(), refreshDoctor(), packs.refresh()]);
    if (!S.tabs.length) for (const name of store.get("tabs", [])) await openFile(name, { quiet: true });
    const want = store.get("active");
    if (want && S.tabs.some(x => x.name === want)) activate(want);
    renderRight();
  } catch (e) { toast("初期化に失敗しました: " + e.message, true); }
}
function onEvent(p) {
  if (p.topic === "console") for (const l of p.lines) print(l.level, l.text);
  else if (p.topic === "status") onStatus(p.data);
}

// ------------------------------------------------------------------ top bar
function onStatus(st) {
  S.status = st;
  const hz = st.tick?.real ? st.tick.hz : 0;
  S.hz.push(hz);
  if (S.hz.length > 60) S.hz.shift();
  renderTicks();
  $("tps").firstElementChild.textContent = st.tick?.real ? Math.round(hz) : "–";
  const w = $("where");
  if (st.inWorld && st.player) {
    const p = st.player, l = p.location;
    w.replaceChildren(el("b", {}, p.name), ` ${p.dimension.replace("minecraft:", "")}  ${fmt(l)}${p.gameMode ? "  " + p.gameMode : ""}`);
  } else {
    w.textContent = st.error ? `ワールド外（${st.error}）` : "ワールド外";
  }
  if (S.rtab === "state") renderState();
}
function renderTicks() {
  const box = $("ticks");
  if (box.children.length !== 60) box.replaceChildren(...Array.from({ length: 60 }, () => el("i")));
  const pad = 60 - S.hz.length;
  [...box.children].forEach((c, i) => {
    const v = i < pad ? null : S.hz[i - pad];
    c.className = v === null ? "" : v >= 19 ? "full" : v > 0 ? "low" : "zero";
    c.style.height = v === null ? "3px" : `${Math.max(3, Math.round(Math.min(20, v) / 20 * 24))}px`;
  });
}
const r2 = n => Math.round(n * 100) / 100;
const fmt = v => v ? `${r2(v.x)}, ${r2(v.y)}, ${r2(v.z)}` : "-";

async function refreshDoctor() {
  try { S.doctor = await rpc("doctor"); } catch { return; }
  const chip = $("doc-chip");
  const bad = S.doctor.checks.filter(c => c.state === "FAIL");
  const wait = S.doctor.checks.filter(c => c.state === "WAIT" || c.state === "OFF" || c.state === "ON");
  chip.className = bad.length ? "bad" : wait.length ? "wait" : "ok";
  chip.textContent = bad.length ? `要確認 ${bad.length}` : wait.length ? "準備中" : "正常";
  if (S.rtab === "doctor") renderDoctor();
}
$("doc-chip").onclick = () => selectRtab("doctor");
setInterval(() => { if (S.connected) refreshDoctor(); }, 15000);

// ------------------------------------------------------------------ console
const out = $("out");
let printQueue = [];
function print(level, text, cls = "") {
  printQueue.push({ level, text, cls });
  if (printQueue.length === 1) requestAnimationFrame(flushPrint);
}
function flushPrint() {
  const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
  const frag = document.createDocumentFragment();
  for (const { level, text, cls } of printQueue) frag.append(el("div", { class: `l l${level} ${cls}` }, text));
  printQueue = [];
  out.append(frag);
  while (out.childElementCount > 3000) out.firstElementChild.remove();
  if (atBottom) out.scrollTop = out.scrollHeight;
}
$("btn-clear").onclick = () => out.replaceChildren();
$("btn-interrupt").onclick = () => rpc("interrupt").then(() => toast("中断を要求しました")).catch(e => toast(e.message, true));
for (const cb of document.querySelectorAll("#console-head input[data-level]"))
  cb.onchange = () => out.classList.toggle("hide" + cb.dataset.level, !cb.checked);

function showEval(code, r, source) {
  const first = code.trim().split("\n");
  print(4, "› " + (first.length > 1 ? first[0] + " …" : first[0]));
  for (const l of r.logs ?? []) print(0, l);
  if (r.error) print(3, r.error);
  else if (r.result !== undefined && r.result !== null) print(5, r.result, "res");
}

// ------------------------------------------------------------------ editor theme
const theme = EditorView.theme({
  "&": { color: "#e6e3da", backgroundColor: "#2f343c", fontSize: "13px" },
  ".cm-content": { fontFamily: "var(--code)", caretColor: "#f0c75e" },
  ".cm-scroller": { fontFamily: "var(--code)", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "#2f343c", color: "#6f747c", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.035)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#b4b2ab" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#f0c75e", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(168,139,224,.28) !important" },
  ".cm-tooltip": { backgroundColor: "#23272e", border: "1px solid #3f4651", borderRadius: "6px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#8c6fca", color: "#fff" },
  ".cm-completionIcon": { opacity: ".7" },
  ".cm-panels": { backgroundColor: "#23272e", color: "#e6e3da" },
  ".cm-searchMatch": { backgroundColor: "rgba(240,199,94,.25)" },
  ".cm-matchingBracket": { backgroundColor: "rgba(168,139,224,.25)", outline: "none" },
  ".cm-diagnostic-error": { borderLeftColor: "#e0564f" },
}, { dark: true });
const hl = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#c4a8f2" },
  { tag: [t.string, t.special(t.string)], color: "#9fd3a9" },
  { tag: [t.number, t.bool, t.null], color: "#f0c75e" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#7d828a", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#9fc3ff" },
  { tag: [t.typeName, t.className, t.namespace], color: "#e2a87a" },
  { tag: [t.definition(t.variableName)], color: "#e6e3da" },
  { tag: [t.propertyName], color: "#d8d5cc" },
  { tag: [t.regexp], color: "#e2a87a" },
  { tag: [t.invalid], color: "#ff8a83" },
]);

// inline results after run (cleared on edit)
const addResult = StateEffect.define();
const clearResults = StateEffect.define();
class ResultWidget extends WidgetType {
  constructor(text, err) { super(); this.text = text; this.err = err; }
  eq(o) { return o.text === this.text && o.err === this.err; }
  toDOM() { return el("span", { class: "cm-inline-result" + (this.err ? " err" : "") }, "⇢ " + this.text); }
}
const resultField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) return Decoration.none;
    for (const e of tr.effects) {
      if (e.is(clearResults)) deco = Decoration.none;
      if (e.is(addResult)) {
        const line = tr.state.doc.lineAt(e.value.pos);
        deco = deco.update({ add: [Decoration.widget({ widget: new ResultWidget(e.value.text, e.value.err), side: 1 }).range(line.to)] });
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// live completion: asks the game what exists on the object left of the cursor
async function liveComplete(ctx) {
  if (!S.connected) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  if (!ctx.explicit && !/[\w$.]$/.test(before)) return null;
  if (/(^|[^\w$])(\/\/|["'`])[^"'`]*$/.test(before) && !ctx.explicit) return null;
  let r;
  try { r = await rpc("complete", { text: before.slice(-400) }); } catch { return null; }
  if (ctx.aborted || !r || !r.options.length) return null;
  const type = k => ({ method: "method", function: "function", class: "class", keyword: "keyword", property: "property" }[k] ?? "variable");
  return { from: line.from + (r.from - (before.length - Math.min(before.length, 400))), options: r.options.map(o => ({ label: o.label, type: type(o.type) })), validFor: /^[\w$]*$/ };
}

const lang = new Compartment();
function editorExtensions(isTs) {
  return [
    lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
    EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(hl), bracketMatching(), closeBrackets(),
    autocompletion({ override: [liveComplete], activateOnTypingDelay: 120 }), highlightActiveLine(), highlightSelectionMatches(), lintGutter(),
    lang.of(javascript({ typescript: isTs })), theme, resultField, EditorState.tabSize.of(2),
    Prec.highest(keymap.of([
      { key: "Mod-Enter", run: () => { runActive(); return true; } },
      { key: "Mod-s", run: () => { saveActive(true); return true; }, preventDefault: true },
      { key: "Shift-Mod-Enter", run: () => { runActive({ whole: true }); return true; } },
    ])),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
    EditorView.updateListener.of(u => { if (u.docChanged) onEdit(); }),
  ];
}

const view = new EditorView({ parent: $("editor"), state: EditorState.create({ doc: "", extensions: editorExtensions(false) }) });
view.dom.style.display = "none";

// ------------------------------------------------------------------ files and tabs
async function refreshFiles() {
  try { S.files = await rpc("scripts.list"); } catch { return; }
  renderFiles();
}
async function refreshModules() {
  try { S.modules = await rpc("module.list"); } catch { return; }
  renderModules();
  renderFiles();
  updateButtons();
}
setInterval(() => { if (S.connected) refreshModules(); }, 5000);

function renderFiles() {
  const box = $("files");
  if (!S.files.length) { box.replaceChildren(el("p", { class: "note", style: "padding:0 8px" }, "スクリプトはまだありません。")); return; }
  box.replaceChildren(...S.files.map(f => {
    const running = S.modules.some(m => m.name === "scripts/" + f.name);
    const err = S.modules.find(m => m.name === "scripts/" + f.name)?.error;
    return el("button", { class: "row" + (S.active === f.name ? " active" : ""), title: f.name, onclick: () => openFile(f.name) },
      running ? el("span", { class: "dot" + (err ? " err" : ""), title: err ? "エラーで止まりました" : "実行中" }) : el("span", { style: "width:7px" }),
      el("span", { class: "name" }, f.name),
      el("span", { class: "sub" }, f.size < 1024 ? `${f.size} B` : `${Math.round(f.size / 102.4) / 10} KB`));
  }));
}
function renderModules() {
  const box = $("modules");
  if (!S.modules.length) { box.replaceChildren(el("p", { class: "note", style: "padding:0 8px" }, "動いているものはありません。")); return; }
  box.replaceChildren(...S.modules.map(m => {
    const parts = [];
    if (m.timers) parts.push(`タイマー ${m.timers}`);
    if (m.handlers) parts.push(`購読 ${m.handlers}`);
    if (m.panels) parts.push(`パネル ${m.panels}`);
    if (m.jobs) parts.push(`ジョブ ${m.jobs}`);
    return el("div", { class: "row", title: m.error ?? "" },
      el("span", { class: "dot" + (m.error ? " err" : "") }),
      el("span", { class: "name" }, m.name.replace(/^scripts\//, ""), el("br"), el("span", { class: "sub" }, m.error ? "エラー" : parts.join("、") || "常駐なし")),
      el("button", { class: "ghost", title: "停止して解放", onclick: () => stopModule(m.name) }, "停止"));
  }));
}
async function stopModule(name) {
  try {
    const r = await rpc("module.stop", { name });
    const rel = r.released;
    toast(`停止しました: ${name.replace(/^scripts\//, "")}（タイマー ${rel.timers}、購読 ${rel.handlers}）`);
  } catch (e) { toast(e.message, true); }
  refreshModules();
}
$("btn-reset").onclick = async () => {
  try { const r = await rpc("reset"); toast(r); } catch (e) { toast(e.message, true); }
  refreshModules();
};

const isTsName = n => /\.ts$/.test(n);
const tabByName = n => S.tabs.find(x => x.name === n);
const activeTab = () => tabByName(S.active);

async function openFile(name, { quiet = false } = {}) {
  if (tabByName(name)) { activate(name); return; }
  let content;
  try { content = (await rpc("scripts.read", { name })).content; }
  catch (e) { if (!quiet) toast(e.message, true); return; }
  const draft = store.get("draft:" + name);
  const tab = { name, saved: content, state: null };
  tab.state = EditorState.create({ doc: draft ?? content, extensions: editorExtensions(isTsName(name)) });
  S.tabs.push(tab);
  persistTabs();
  activate(name);
  if (draft !== undefined && draft !== null && draft !== content) toast(`${name} は保存していない変更を復元しました`);
}
function activate(name) {
  const cur = activeTab();
  if (cur) cur.state = view.state;
  const tab = tabByName(name);
  if (!tab) return;
  S.active = name;
  store.set("active", name);
  view.setState(tab.state);
  view.dom.style.display = "";
  $("empty").style.display = "none";
  renderTabs();
  renderFiles();
  updateButtons();
  view.focus();
}
function closeTab(name) {
  const tab = tabByName(name);
  if (!tab) return;
  const dirty = (tab.name === S.active ? view.state : tab.state).doc.toString() !== tab.saved;
  if (dirty && !confirm(`${name} の変更を保存せずに閉じますか？（下書きは残ります）`)) return;
  if (tab.name === S.active) tab.state = view.state;
  S.tabs = S.tabs.filter(x => x !== tab);
  persistTabs();
  if (S.active === name) {
    S.active = null;
    if (S.tabs.length) activate(S.tabs.at(-1).name);
    else { view.dom.style.display = "none"; $("empty").style.display = ""; renderTabs(); updateButtons(); renderFiles(); }
  } else renderTabs();
}
function persistTabs() { store.set("tabs", S.tabs.map(x => x.name)); }
function isDirty(tab) { return (tab.name === S.active ? view.state : tab.state).doc.toString() !== tab.saved; }
function renderTabs() {
  const bar = $("editor-bar");
  for (const n of [...$("tabs").querySelectorAll(".tab")]) n.remove();
  for (const tab of S.tabs) {
    const node = el("div", { class: "tab" + (tab.name === S.active ? " active" : "") + (isDirty(tab) ? " dirty" : ""), role: "tab", "aria-selected": tab.name === S.active ? "true" : "false" },
      el("button", { class: "ghost label", onclick: () => activate(tab.name) }, tab.name),
      el("button", { class: "ghost x", title: "閉じる", "aria-label": `${tab.name} を閉じる`, onclick: () => closeTab(tab.name) }, "×"));
    $("tabs").insertBefore(node, bar);
  }
}
let draftTimer = 0;
function onEdit() {
  const tab = activeTab();
  if (!tab) return;
  const node = [...$("tabs").querySelectorAll(".tab")].find(n => n.textContent.startsWith(tab.name));
  node?.classList.toggle("dirty", isDirty(tab));
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const doc = view.state.doc.toString();
    if (doc === tab.saved) store.del("draft:" + tab.name); else store.set("draft:" + tab.name, doc);
  }, 400);
}
function updateButtons() {
  const tab = activeTab();
  $("btn-run").disabled = !tab;
  $("btn-stop").disabled = !tab || !S.modules.some(m => m.name === "scripts/" + tab.name);
}

const TEMPLATE = `import { world, system } from "@minecraft/server";

// 保存すると再実行されます。前回のタイマーやイベント購読は自動で解除されます。
system.runInterval(() => {
  const me = world.getLocalPlayer();
  console.log(me.name, fmt(me.location));
}, 40);

client.onDispose(() => console.log("停止しました"));
`;
$("btn-new").onclick = () => { $("new-file").classList.toggle("open"); $("new-name").focus(); };
$("new-file").onsubmit = async e => {
  e.preventDefault();
  let name = $("new-name").value.trim();
  if (!name) return;
  if (!/\.(js|ts|mjs|json|txt|md)$/.test(name)) name += ".ts";
  if (S.files.some(f => f.name === name)) { openFile(name); return; }
  try {
    await rpc("scripts.write", { name, content: /\.(ts|m?js)$/.test(name) ? TEMPLATE : "" });
    $("new-name").value = "";
    $("new-file").classList.remove("open");
    await refreshFiles();
    await openFile(name);
  } catch (err) { toast(err.message, true); }
};

// ------------------------------------------------------------------ save & run
function compile(code, name) {
  if (!isTsName(name)) return code;
  return transform(code, { transforms: ["typescript"], filePath: name, disableESTransforms: true }).code;
}
function diagFromError(message, name) {
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\d+)(?::(\\d+))?`);
  const m = re.exec(message) ?? /\((\d+):(\d+)\)/.exec(message);
  if (!m) return [];
  const doc = view.state.doc;
  const ln = Math.min(doc.lines, Math.max(1, Number(m[1])));
  const line = doc.line(ln);
  const from = Math.min(line.to, line.from + Math.max(0, Number(m[2] ?? 1) - 1));
  return [{ from, to: Math.max(from, line.to), severity: "error", message: message.split("\n")[0] }];
}
async function saveActive(fromKey) {
  const tab = activeTab();
  if (!tab) return false;
  const content = view.state.doc.toString();
  try {
    await rpc("scripts.write", { name: tab.name, content });
    tab.saved = content;
    store.del("draft:" + tab.name);
    renderTabs();
    refreshFiles();
    if (fromKey && $("live").checked && /\.(ts|m?js)$/.test(tab.name)) await runFile(tab);
    else if (fromKey) toast(`保存しました: ${tab.name}`);
    return true;
  } catch (e) { toast("保存できませんでした: " + e.message, true); return false; }
}
async function runFile(tab) {
  view.dispatch(setDiagnostics(view.state, []));
  let code;
  try { code = compile(view.state.doc.toString(), tab.name); }
  catch (e) {
    const msg = String(e.message ?? e);
    view.dispatch(setDiagnostics(view.state, diagFromError(msg, tab.name)));
    print(3, `${tab.name}: ${msg}`);
    return;
  }
  const name = "scripts/" + tab.name;
  try {
    const r = await rpc("module.run", { name, code });
    print(4, `▶ ${tab.name}`);
    for (const l of r.logs) print(0, l);
    if (!r.ok) {
      print(3, r.error);
      view.dispatch(setDiagnostics(view.state, diagFromError(r.error, name)));
      toast(`エラーで止まりました: ${tab.name}`, true);
    } else {
      const res = r.resources, parts = [];
      if (res.timers) parts.push(`タイマー ${res.timers}`);
      if (res.handlers) parts.push(`購読 ${res.handlers}`);
      if (res.panels) parts.push(`パネル ${res.panels}`);
      toast(parts.length ? `実行中: ${tab.name}（${parts.join("、")}）` : `実行しました: ${tab.name}`);
    }
  } catch (e) { toast(e.message, true); }
  refreshModules();
}
async function runActive({ whole = false } = {}) {
  const tab = activeTab();
  if (!tab) return;
  const sel = view.state.selection.main;
  if (whole || sel.empty) {
    if (isDirty(tab)) await saveActive(false);
    await runFile(tab);
    return;
  }
  const src = view.state.sliceDoc(sel.from, sel.to);
  let code;
  try { code = compile(src, tab.name); } catch (e) { toast(String(e.message ?? e), true); return; }
  try {
    const r = await rpc("eval", { code, source: tab.name + " (選択範囲)" });
    showEval(src, r);
    const text = r.error ? r.error.split("\n")[0] : r.result ?? (r.logs?.length ? r.logs.at(-1) : "undefined");
    view.dispatch({ effects: addResult.of({ pos: sel.to, text: text.length > 120 ? text.slice(0, 117) + "…" : text.replace(/\n/g, " "), err: !!r.error }) });
  } catch (e) { toast(e.message, true); }
}
$("btn-run").onclick = () => runActive();
$("btn-stop").onclick = () => { const tab = activeTab(); if (tab) stopModule("scripts/" + tab.name); };

// ------------------------------------------------------------------ REPL input
function submitRepl() {
  const code = repl.state.doc.toString();
  if (!code.trim()) return true;
  S.history = [code, ...S.history.filter(h => h !== code)].slice(0, 200);
  store.set("history", S.history);
  S.histPos = -1;
  repl.dispatch({ changes: { from: 0, to: repl.state.doc.length, insert: "" } });
  rpc("eval", { code, source: "<studio>" }).then(r => showEval(code, r)).catch(e => print(3, e.message));
  return true;
}
function historyMove(dir) {
  if (completionStatus(repl.state)) return false;
  const pos = repl.state.selection.main.head, doc = repl.state.doc;
  if (dir < 0 && doc.lineAt(pos).number !== 1) return false;
  if (dir > 0 && doc.lineAt(pos).number !== doc.lines) return false;
  const next = S.histPos + (dir < 0 ? 1 : -1);
  if (next < -1 || next >= S.history.length) return true;
  S.histPos = next;
  const text = next === -1 ? "" : S.history[next];
  repl.dispatch({ changes: { from: 0, to: doc.length, insert: text }, selection: { anchor: text.length } });
  return true;
}
const repl = new EditorView({
  parent: $("repl"),
  state: EditorState.create({
    doc: "",
    extensions: [
      history(), drawSelection(), syntaxHighlighting(hl), closeBrackets(), bracketMatching(), javascript(),
      autocompletion({ override: [liveComplete], activateOnTypingDelay: 120 }), theme,
      EditorView.theme({ "&": { backgroundColor: "transparent" }, ".cm-gutters": { display: "none" } }),
      placeholder("JavaScript を入力して Enter（Shift + Enter で改行）"),
      keymap.of([...completionKeymap]),
      Prec.high(keymap.of([
        { key: "Enter", run: () => (completionStatus(repl.state) === "active" ? false : submitRepl()) },
        { key: "ArrowUp", run: () => historyMove(-1) },
        { key: "ArrowDown", run: () => historyMove(1) },
      ])),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
    ],
  }),
});

// ------------------------------------------------------------------ right panel
function selectRtab(name) {
  S.rtab = name;
  for (const b of document.querySelectorAll("#rtabs button")) b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false");
  for (const p of document.querySelectorAll(".rpanel")) p.classList.toggle("on", p.id === "p-" + name);
  renderRight();
}
for (const b of document.querySelectorAll("#rtabs button")) b.onclick = () => selectRtab(b.dataset.tab);
function renderRight() {
  if (S.rtab === "state") renderState();
  if (S.rtab === "doctor") { renderDoctor(); refreshDoctor(); }
  if (S.rtab === "ai") refreshAi();
  if (S.rtab === "watch") renderWatches();
  if (S.rtab === "agent") renderAgent();
}

// ------------------------------------------------------------------ Agent control pad
// 実プレイヤー同等の操作(injectInput)をブラウザから。各ボタンは client で `agent.*` を eval する。
function agEval(code) { rpc("eval", { code, source: "<agent>" }).catch(e => toast(e.message, true)); }
function agTap(label, code, cls) { return el("button", { class: cls, onclick: () => agEval(code) }, label); }
function agHold(label, on, off, cls) {
  // 押している間だけ保持入力(pointerdown→on, pointerup/leave→off)
  const b = el("button", { class: cls }, label);
  const down = e => { e.preventDefault(); b.classList.add("held"); agEval(on); };
  const up = () => { if (!b.classList.contains("held")) return; b.classList.remove("held"); agEval(off); };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointerleave", up);
  b.addEventListener("pointercancel", up);
  return b;
}
function renderAgent() {
  const p = $("p-agent");
  if (!p) return;
  const move = el("div", { class: "agpad" },
    el("span", {}), agHold("前 W", "agent.forward(true)", "agent.forward(false)"), el("span", {}),
    agHold("左 A", "agent.strafe(-1)", "agent.strafe(0)"),
    agTap("停止", "agent.stop()"),
    agHold("右 D", "agent.strafe(1)", "agent.strafe(0)"),
    el("span", {}), agHold("後 S", "agent.back(true)", "agent.back(false)"), el("span", {}));
  const move2 = el("div", { class: "agpad", style: "margin-top:6px" },
    agHold("ジャンプ", "agent.jump(true)", "agent.jump(false)"),
    agHold("スニーク", "agent.sneak(true)", "agent.sneak(false)"),
    agHold("ダッシュ", "agent.sprint(true)", "agent.sprint(false)"));
  const look = el("div", { class: "agpad", style: "margin-top:6px" },
    el("span", {}), agTap("視点上", "agent.turn(0,-10)"), el("span", {}),
    agTap("左", "agent.turn(-15,0)"), agTap("正面", "agent.look(0,0)"), agTap("右", "agent.turn(15,0)"),
    el("span", {}), agTap("視点下", "agent.turn(0,10)"), el("span", {}));
  const hands = el("div", { class: "agpad wide", style: "margin-top:6px" },
    agTap("攻撃", "agent.attack()"), agTap("使用", "agent.use()"),
    agHold("採掘", "agent.mine(true)", "agent.mine(false)"), agHold("長押使用", "agent.useHold(true)", "agent.useHold(false)"),
    agTap("ピック", "agent.pick()"), agTap("持替", "agent.swapHands()"),
    agTap("ドロップ", "agent.drop()"), agTap("視点切替", "agent.perspective()"));
  const slots = el("div", { class: "agpad wide", style: "margin-top:6px" });
  for (let i = 1; i <= 9; i++) slots.append(agTap(String(i), `agent.slot(${i})`));
  slots.append(agTap("インベ", "agent.inventory()", "span3"));
  const packForm = el("form", { class: "addrow", onsubmit: e => { e.preventDefault(); const u = $("ag-pack").value.trim(); if (u) agEval(`ScriptEval.installPack(${JSON.stringify(u)})`); } },
    el("input", { type: "text", id: "ag-pack", placeholder: "https://…/pack.mcpack", "aria-label": "パック URL" }), el("button", { class: "primary" }, "強制導入"));
  const updForm = el("form", { class: "addrow", onsubmit: e => { e.preventDefault(); const u = $("ag-upd").value.trim(); if (u && confirm("mod を更新します（次回起動で反映）。続けますか？")) agEval(`ScriptEval.update(${JSON.stringify(u)})`); } },
    el("input", { type: "text", id: "ag-upd", placeholder: "https://…/libscripteval.so", "aria-label": "更新 URL" }), el("button", {}, "mod 更新"));
  p.replaceChildren(
    el("p", { class: "note" }, "実プレイヤー同等の操作を送ります。押している間だけ効くボタン（前/左/右/後/ジャンプ等）と、1 回のボタンがあります。"),
    el("div", { class: "agsec" }, "移動"), move, move2,
    el("div", { class: "agsec" }, "視点"), look,
    el("div", { class: "agsec" }, "手・アイテム"), hands,
    el("div", { class: "agsec" }, "ホットバー"), slots,
    el("div", { class: "agsec" }, "グローバルリソースパック（Web から強制）"), packForm,
    el("div", { class: "agsec" }, "mod の自己更新"), updForm,
    el("div", { id: "ag-status" }));
  rpc("eval", { code: "JSON.stringify(agent.status())", source: "<agent>" })
    .then(r => { const s = $("ag-status"); if (s) s.textContent = "injectInput: " + (r?.result ?? r ?? ""); }).catch(() => {});
}

function renderState() {
  const box = $("p-state"), st = S.status, info = S.info;
  if (!S.connected || !st) { box.replaceChildren(el("p", { class: "note" }, "ゲームに接続すると、ここに今の状態が出ます。")); return; }
  const kids = [];
  if (st.safeMode) kids.push(el("div", { class: "banner" },
    el("p", {}, "セーフモードです。前回の起動が 1 分以内に終わったため、autorun と tick フックを止めています。"),
    el("button", { class: "primary", onclick: async () => { try { toast(await rpc("safe.leave")); } catch (e) { toast(e.message, true); } } }, "セーフモードを解除")));
  if (!st.inWorld) {
    kids.push(el("p", { class: "big" }, "ワールド外"), el("p", { class: "note" }, st.error || "ワールドに入ると、プレイヤーやエンティティを読み取れるようになります。"));
  } else {
    const p = st.player ?? {};
    kids.push(el("p", { class: "big" }, p.name ?? "（プレイヤー未検出）"));
    kids.push(el("dl", { class: "kv" },
      el("dt", {}, "座標"), el("dd", {}, fmt(p.location)),
      el("dt", {}, "ディメンション"), el("dd", {}, (p.dimension ?? "-").replace("minecraft:", "")),
      el("dt", {}, "ゲームモード"), el("dd", {}, p.gameMode ?? "-"),
      el("dt", {}, "プレイヤー"), el("dd", {}, st.players ? `読み込み済み ${st.players.loaded}${st.players.list !== undefined ? `／リスト ${st.players.list}` : ""}` : "-"),
      el("dt", {}, "アクター"), el("dd", {}, st.actors),
      el("dt", {}, "ECS プール"), el("dd", {}, st.pools)));
  }
  kids.push(el("h3", {}, "実行環境"));
  kids.push(el("dl", { class: "kv" },
    el("dt", {}, "tick"), el("dd", {}, st.tick.installed ? `${st.tick.ticking ? Math.round(st.tick.hz) + " TPS" : "停止中"}（tick ${st.currentTick}）` : "フック無し（20 Hz の仮想 tick）"),
    el("dt", {}, "RTTI"), el("dd", {}, st.rtti || "作成待ち"),
    el("dt", {}, "モジュール"), el("dd", {}, st.modules),
    el("dt", {}, "Studio"), el("dd", {}, `接続 ${st.studioClients}`),
    el("dt", {}, "MCP"), el("dd", {}, `${st.mcpCalls} 回${st.mcpPaused ? "（一時停止中）" : ""}`),
    el("dt", {}, "バージョン"), el("dd", {}, info ? `ScriptEval ${info.version}、Minecraft ${info.gameVersion || "（不明）"}、${info.host}-${info.arch}` : "-")));
  kids.push(el("button", { class: "ghost", onclick: () => dialog("同梱ライブラリのライセンス", el("pre", {}, $("licenses")?.textContent ?? "")) }, "同梱ライブラリのライセンス"));
  box.replaceChildren(...kids);
}

function renderDoctor() {
  const box = $("p-doctor"), d = S.doctor;
  if (!d) { box.replaceChildren(el("p", { class: "note" }, "診断を実行しています…")); return; }
  box.replaceChildren(
    el("h3", {}, "診断コード"),
    el("p", { class: "note" }, "不具合を報告するときは、この 1 行とログを貼ってください。"),
    el("div", { class: "docline" }, el("code", {}, d.line), el("button", { onclick: () => copy(d.line, "診断コードをコピーしました") }, "コピー")),
    el("div", { class: "row-actions" },
      el("button", { onclick: copyDiag }, "診断とログをまとめてコピー"),
      el("button", { onclick: showLog }, "ログを表示")),
    el("h3", {}, "確認項目"),
    el("table", { class: "checks" }, ...d.checks.map(c => el("tr", {},
      el("td", { class: "mono" }, c.name),
      el("td", { class: "state " + c.state }, c.state === "ok" ? "正常" : c.state === "FAIL" ? "失敗" : c.state === "WAIT" ? "待機" : c.state === "OFF" ? "停止" : c.state === "ON" ? "有効" : c.state),
      el("td", {}, el("div", { class: "mono" }, c.value), c.hint ? el("div", { class: "hint" }, c.hint) : null)))));
}
async function copyDiag() {
  try {
    const [d, log] = await Promise.all([rpc("doctor"), rpc("log.tail", { lines: 200 })]);
    copy(`${d.line}\n\n${d.checks.map(c => `${c.name} ${c.state} ${c.value} ${c.hint}`).join("\n")}\n\n--- log ---\n${log.join("\n")}`, "診断とログをコピーしました");
  } catch (e) { toast(e.message, true); }
}
async function showLog() {
  try { const log = await rpc("log.tail", { lines: 400 }); dialog("ScriptEval のログ", el("pre", {}, log.join("\n"))); }
  catch (e) { toast(e.message, true); }
}

// watches
function renderWatches(values) {
  const box = $("watches");
  if (!S.watches.length) { box.replaceChildren(el("p", { class: "note" }, "式を追加すると、値がここで更新され続けます。")); return; }
  box.replaceChildren(...S.watches.map((w, i) => el("div", { class: "watch" },
    el("div", { class: "expr" }, w),
    el("button", { class: "ghost", "aria-label": "削除", onclick: () => { S.watches.splice(i, 1); store.set("watches", S.watches); renderWatches(); } }, "×"),
    el("div", { class: "val" + (values?.[i] && !values[i].ok ? " err" : "") }, values?.[i]?.value ?? "…"))));
}
$("watch-form").onsubmit = e => {
  e.preventDefault();
  const v = $("watch-input").value.trim();
  if (!v) return;
  S.watches.push(v);
  store.set("watches", S.watches);
  $("watch-input").value = "";
  renderWatches();
};
setInterval(async () => {
  if (S.rtab !== "watch" || !S.connected || !S.watches.length || document.hidden) return;
  try { renderWatches(await rpc("watch.eval", { exprs: S.watches })); } catch {}
}, 500);

// AI (MCP)
async function refreshAi() {
  if (!S.connected) return;
  let info, recent;
  try { [info, recent] = await Promise.all([rpc("mcp.info"), rpc("ai.recent")]); } catch { return; }
  const box = $("p-ai");
  const kids = [
    el("h3", {}, "Claude Code からこのゲームを操作する"),
    el("p", { class: "note" }, "MCP で登録すると、AI が状態を読み、コードを試し、スクリプトを書いて動かせます。下のコマンドをターミナルで 1 回実行してください。"),
  ];
  if (!info.enabled) kids.push(el("p", { class: "note" }, "MCP は無効です（config.json の \"mcp\": false）。"));
  else kids.push(
    el("div", { class: "cmdbox" }, info.command),
    el("div", { class: "row-actions" },
      el("button", { class: "primary", onclick: () => copy(info.command, "登録コマンドをコピーしました") }, "コマンドをコピー"),
      el("button", { onclick: async () => { if (confirm("トークンを作り直すと、登録済みの AI は再登録が必要になります。続けますか？")) { await rpc("mcp.regenerate"); toast("トークンを作り直しました"); refreshAi(); } } }, "トークンを作り直す")),
    el("p", { class: "note" }, `接続先 ${info.url}`));
  kids.push(el("h3", {}, "AI の呼び出し"),
    el("div", { class: "row-actions" },
      el("button", { class: recent.paused ? "primary" : "", onclick: async () => { await rpc("ai.pause", { paused: !recent.paused }); refreshAi(); } }, recent.paused ? "再開する" : "一時停止する")),
    recent.calls.length ? el("div", { class: "calls" }, ...recent.calls.slice().reverse().slice(0, 100).map(c => el("div", { class: "call" + (c.ok ? "" : " err") },
      el("div", { class: "meta" }, `${new Date(c.time).toLocaleTimeString()}  ${c.tool}  ${c.ms} ms`),
      c.args && c.args !== "{}" ? el("div", { class: "sum" }, c.args) : null,
      el("div", { class: "sum" }, c.summary)))) : el("p", { class: "note" }, "まだ呼び出しはありません。"));
  box.replaceChildren(...kids);
}
setInterval(() => { if (S.rtab === "ai" && !document.hidden) refreshAi(); }, 2000);

// ------------------------------------------------------------------ splitter
{
  const center = $("center"), sp = $("splitter");
  const h = store.get("consoleH");
  if (h) center.style.setProperty("--console-h", h);
  let drag = false;
  sp.onpointerdown = e => { drag = true; sp.setPointerCapture(e.pointerId); };
  sp.onpointermove = e => {
    if (!drag) return;
    const rect = center.getBoundingClientRect();
    const px = Math.max(90, Math.min(rect.height - 160, rect.bottom - e.clientY));
    center.style.setProperty("--console-h", px + "px");
  };
  sp.onpointerup = () => { drag = false; store.set("consoleH", center.style.getPropertyValue("--console-h")); };
  sp.onkeydown = e => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const cur = parseInt(getComputedStyle(center).gridTemplateRows.split(" ").at(-1)) || 240;
    center.style.setProperty("--console-h", Math.max(90, cur + (e.key === "ArrowUp" ? 24 : -24)) + "px");
  };
}

// ------------------------------------------------------------------ resource packs
const packs = initPacks({ $, el, rpc, rpcBinary, toast, store, isConnected: () => S.connected });

window.addEventListener("beforeunload", e => { if (S.tabs.some(isDirty)) e.preventDefault(); });
$("btn-run").title = `選択範囲、またはファイル全体を実行（${MOD} + Enter）`;
renderTicks();
renderRight();
renderFiles();
renderModules();
connect();

// Studio > リソースパック: drop .mcpack / .zip / .mcaddon files or folders, they are
// unpacked here in the browser and uploaded file by file (binary WebSocket
// frames, rp.put); the mod moves them into games/com.mojang/resource_packs and
// edits global_resource_packs.json. "強制" packs are put back by the mod at every
// launch even if they get switched off in the game's settings.
import { findPacks, fromFile } from "./zip.js";

export function initPacks({ $, el, rpc, rpcBinary, toast, store, isConnected }) {
  const P = {
    state: null, busy: false, progress: null,
    opts: { activate: true, force: true, ...store.get("packOpts", {}) },
    icons: new Map(),  // pack id -> data URL (or "" when the pack has none)
  };
  const dlg = $("packs-dlg"), body = $("packs-body"), btn = $("packs-btn");

  const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const shortDir = d => {
    if (!d) return "-";
    if (d.startsWith("/data/data/com.mojang.minecraftpe/")) return "（mcpelauncher のデータフォルダ）/" + d.slice("/data/data/com.mojang.minecraftpe/".length);
    return d;
  };

  async function refresh() {
    if (!isConnected()) return;
    try { P.state = await rpc("rp.list"); }
    catch (e) { P.state = { error: e.message }; }
    render();
    badge();
  }
  function badge() {
    const st = P.state;
    btn.replaceChildren("リソースパック");
    if (st?.restartNeeded) btn.append(el("span", { class: "badge", title: "変更はゲームの再起動で反映されます" }, "要再起動"));
    else if (st?.missing?.length) btn.append(el("span", { class: "badge" }, "!"));
  }

  // ------------------------------------------------------------------ install
  async function install(inputs) {
    if (P.busy) { toast("ほかのパックを入れています。終わるまで待ってください", true); return; }
    if (!isConnected()) { toast("ゲームに接続していません", true); return; }
    if (!dlg.open) open();
    P.busy = true;
    P.progress = { label: "パックを読んでいます…", done: 0, total: 1 };
    render();
    let found;
    try { found = await findPacks(inputs); }
    catch (e) { P.busy = false; P.progress = null; render(); toast("読み込めませんでした: " + e.message, true); return; }
    for (const s of found.skipped) toast(`${s.name}: ${s.reason}`, true);
    const packs = [];
    for (const p of found.packs) {
      if (p.error) toast(`${p.name}: ${p.error}`, true);
      else if (p.kind === "behavior") toast(`${p.name}: ビヘイビアーパックはグローバルにできないので飛ばしました`, true);
      else if (p.kind !== "resources") toast(`${p.name}: リソースパックではないので飛ばしました（${p.kind}）`, true);
      else packs.push(p);
    }
    let ok = 0;
    for (const p of packs) {
      try {
        const r = await uploadOne(p);
        ok++;
        P.state = r.state;
        const how = r.activated ? (P.opts.force ? "有効・強制" : "有効") : "インストールのみ";
        toast(`「${r.name}」${r.version} を${r.replaced ? "入れ替えました" : "入れました"}（${how}）`);
        if (r.warning) toast(r.warning, true);
      } catch (e) {
        toast(`「${p.name}」を入れられませんでした: ${e.message}`, true);
      }
    }
    P.busy = false;
    P.progress = null;
    P.icons.clear();
    await refresh();
    if (ok) toast("ゲームを再起動すると反映されます");
  }

  async function uploadOne(pack) {
    const total = Math.max(1, pack.size);
    P.progress = { label: `「${pack.name}」を送っています`, done: 0, total, file: "" };
    renderProgress();
    const { upload } = await rpc("rp.begin");
    const CHUNK = 1 << 20, WINDOW = 8;
    const inflight = new Set();
    let failed = null;
    const send = (path, offset, chunk) => {
      const pr = rpcBinary("rp.put", { upload, path, offset }, chunk)
        .then(() => { P.progress.done += chunk.length; renderProgress(); }, e => { failed ??= e; })
        .finally(() => inflight.delete(pr));
      inflight.add(pr);
    };
    try {
      for (const f of pack.files) {
        if (!f.rel || f.rel.endsWith("/")) continue;
        P.progress.file = f.rel;
        const data = await f.read();
        let off = 0;
        do {
          while (inflight.size >= WINDOW) await Promise.race(inflight);
          if (failed) throw failed;
          send(f.rel, off, data.subarray(off, Math.min(data.length, off + CHUNK)));
          off += CHUNK;
        } while (off < data.length);
      }
      await Promise.all(inflight);
      if (failed) throw failed;
      P.progress.label = `「${pack.name}」を入れています`;
      renderProgress();
      return await rpc("rp.commit", { upload, activate: P.opts.activate, force: P.opts.force });
    } catch (e) {
      rpc("rp.abort", { upload }).catch(() => {});
      throw e;
    }
  }

  // ------------------------------------------------------------------ actions on installed packs
  async function act(method, params, msg) {
    try {
      P.state = await rpc("rp." + method, params);
      render();
      badge();
      if (msg) toast(msg);
    } catch (e) { toast(e.message, true); }
  }

  // ------------------------------------------------------------------ rendering
  function renderProgress() {
    const box = body.querySelector(".progress");
    if (!box || !P.progress) return;
    const pct = Math.min(100, Math.round(P.progress.done / P.progress.total * 100));
    box.querySelector("i").style.width = pct + "%";
    box.querySelector(".what").textContent = `${P.progress.label}${P.progress.file ? "：" + P.progress.file : ""}（${pct}%）`;
  }

  function icon(p) {
    const img = el("img", { class: "icon", alt: "" });
    if (!p.hasIcon) return img;
    const cached = P.icons.get(p.id);
    if (cached !== undefined) { if (cached) img.src = cached; return img; }
    P.icons.set(p.id, "");
    rpc("rp.icon", { id: p.id }).then(r => {
      if (!r.png) return;
      const url = "data:image/png;base64," + r.png;
      P.icons.set(p.id, url);
      for (const i of body.querySelectorAll(`img[data-id="${CSS.escape(p.id)}"]`)) i.src = url;
    }).catch(() => {});
    img.dataset.id = p.id;
    return img;
  }

  function packRow(p, i, n) {
    const meta = [`v${p.version}`];
    if (p.folder) meta.push(p.folder);
    if (p.subpack) meta.push(`サブパック ${p.subpack}`);
    const title = el("div", { class: "title", title: p.description || p.name }, p.name,
      p.forced ? el("span", { class: "chip force", title: "設定で外されても、ゲームの起動時に入れ直します" }, "強制") : null,
      p.active && !p.installed ? el("span", { class: "chip missing", title: "resource_packs にありません" }, "未インストール") : null);
    const metaLine = el("div", { class: "meta" }, meta.join("  ·  "), p.error ? el("span", { class: "err" }, `  ${p.error}`) : null);
    const ctrl = el("div", { class: "ctrl" });
    if (p.active) {
      if (p.subpacks?.length) {
        const sel = el("select", { "aria-label": "サブパック", onchange: e => act("subpack", { id: p.id, subpack: e.target.value }, "サブパックを変えました") },
          el("option", { value: "" }, "サブパック: 既定"),
          ...p.subpacks.map(s => el("option", { value: s.folder_name, selected: s.folder_name === p.subpack }, s.name)));
        ctrl.append(sel);
      }
      ctrl.append(
        el("button", { class: "ghost", title: "優先度を上げる", "aria-label": `${p.name} の優先度を上げる`, disabled: i === 0, onclick: () => act("move", { id: p.id, delta: 1 }) }, "↑"),
        el("button", { class: "ghost", title: "優先度を下げる", "aria-label": `${p.name} の優先度を下げる`, disabled: i === n - 1, onclick: () => act("move", { id: p.id, delta: -1 }) }, "↓"),
        el("label", { title: "設定で外されても、ゲームの起動時に入れ直します" },
          el("input", { type: "checkbox", checked: p.forced, onchange: e => act("force", { id: p.id, on: e.target.checked }, e.target.checked ? "強制にしました" : "強制を外しました") }), "強制"),
        el("button", { onclick: () => act("disable", { id: p.id }, `「${p.name}」を無効にしました`) }, "無効にする"));
    } else if (!p.error) {
      ctrl.append(
        el("button", { class: "primary", onclick: () => act("enable", { id: p.id, force: P.opts.force }, `「${p.name}」を有効にしました`) }, "有効にする"),
        el("button", { class: "ghost", title: "resource_packs からフォルダごと消します", onclick: () => { if (confirm(`「${p.name}」を削除しますか？（resource_packs/${p.folder} を消します）`)) act("remove", { id: p.id }, `「${p.name}」を削除しました`); } }, "削除"));
    }
    return el("div", { class: "pack" }, icon(p), el("div", {}, title, metaLine), ctrl);
  }

  function render() {
    if (!dlg.open) return;
    const st = P.state;
    const kids = [];
    if (!st) { body.replaceChildren(el("p", { class: "note" }, "読み込んでいます…")); return; }
    if (st.error) { body.replaceChildren(el("div", { class: "banner" }, el("p", {}, st.error))); return; }
    if (st.restartNeeded) kids.push(el("div", { class: "banner" }, el("p", {}, "変更はゲームを再起動すると反映されます（グローバルリソースパックは起動時に読み込まれます）。")));
    if (!st.fileOk) kids.push(el("div", { class: "banner" }, el("p", {}, `global_resource_packs.json を読めません（${st.fileError}）。壊さないように ScriptEval はこのファイルに触りません。`)));
    if (!st.forcePacks) kids.push(el("div", { class: "banner" }, el("p", {}, "config.json の \"forcePacks\" が false なので、「強制」は働きません。")));
    if (!st.found) kids.push(el("div", { class: "banner" }, el("p", {}, `com.mojang フォルダがまだありません（${shortDir(st.dir)}）。入れると作ります。場所が違う場合は config.json の "comMojangDir" で指定してください。`)));

    const drop = el("div", { class: "drop", id: "packs-drop" },
      el("p", { class: "big" }, ".mcpack / .zip / .mcaddon、またはパックのフォルダをここにドロップ"),
      el("div", { class: "row-actions" },
        el("button", { class: "primary", disabled: P.busy, onclick: () => $("packs-file").click() }, "ファイルを選ぶ"),
        el("button", { disabled: P.busy, onclick: () => $("packs-folder").click() }, "フォルダを選ぶ")),
      el("div", { class: "opts" },
        el("label", {}, el("input", { type: "checkbox", id: "packs-opt-activate", checked: P.opts.activate, onchange: e => { P.opts.activate = e.target.checked; store.set("packOpts", P.opts); } }), "入れたらグローバルで有効にする"),
        el("label", { title: "ゲームの設定で外されても、ScriptEval が起動のたびに入れ直します" },
          el("input", { type: "checkbox", id: "packs-opt-force", checked: P.opts.force, onchange: e => { P.opts.force = e.target.checked; store.set("packOpts", P.opts); } }), "強制（外されても起動時に戻す）")));
    kids.push(drop);
    if (P.progress) {
      kids.push(el("div", { class: "progress" }, el("div", { class: "bar" }, el("i")), el("div", { class: "what" })));
    }

    kids.push(el("h3", {}, `有効なパック（上ほど優先・${st.active.length} 個）`));
    kids.push(st.active.length
      ? el("div", { class: "packs", id: "packs-active" }, ...st.active.map((p, i) => packRow(p, i, st.active.length)))
      : el("p", { class: "note" }, "グローバルで有効なパックはありません。"));
    const inactive = st.inactive ?? [];
    kids.push(el("h3", {}, `入っているが無効なパック（${inactive.length} 個）`));
    kids.push(inactive.length
      ? el("div", { class: "packs", id: "packs-inactive" }, ...inactive.map((p, i) => packRow(p, i, inactive.length)))
      : el("p", { class: "note" }, "ありません。"));
    if (st.missing?.length) {
      kids.push(el("h3", {}, "見つからない強制パック"));
      kids.push(el("div", { class: "packs" }, ...st.missing.map(m => el("div", { class: "pack" }, el("img", { class: "icon", alt: "" }),
        el("div", {}, el("div", { class: "title" }, m.name || m.id), el("div", { class: "meta" }, "resource_packs にありません。入れ直すか、強制を外してください")),
        el("div", { class: "ctrl" }, el("button", { onclick: () => act("disable", { id: m.id }, "強制を外しました") }, "強制を外す"))))));
    }
    kids.push(el("p", { class: "note" },
      `場所: ${shortDir(st.dir)}。ScriptEval が書き換えるのは resource_packs と minecraftpe/global_resource_packs.json だけです（最初の 1 回だけ、元のファイルを global_resource_packs.json.scripteval-backup に残します）。`));
    body.replaceChildren(...kids);
    renderProgress();
  }

  // ------------------------------------------------------------------ inputs: buttons, drag & drop
  function open() {
    // the modal dialog lives in the top layer: keep the toasts above its backdrop while it is open
    if (!dlg.open) { dlg.showModal(); dlg.append($("toast")); }
    render();
    refresh();
  }
  dlg.addEventListener("close", () => document.body.append($("toast")));
  btn.onclick = open;
  $("packs-close").onclick = () => dlg.close();
  $("packs-refresh").onclick = () => { P.icons.clear(); refresh(); };
  $("packs-file").onchange = e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.length) install(files.map(f => fromFile(f, f.name)));
  };
  $("packs-folder").onchange = e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.length) install(files.map(f => fromFile(f)));
  };

  // Directory entries must be taken from the drop event synchronously; walking them can wait.
  async function collect(entries, files) {
    if (!entries.length) return files.map(f => fromFile(f, f.name));
    const out = [];
    const walk = async entry => {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push(fromFile(file, entry.fullPath));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const c of batch) await walk(c);
        }
      }
    };
    for (const r of entries) await walk(r);
    return out;
  }
  // Pack files or folders dropped anywhere on Studio are installed (capture phase, before
  // the editor sees them). Other files (a .js on the editor) are left to the editor.
  const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes("Files");
  const ARCH = /\.(mcpack|zip|mcaddon)$/i;
  let veilTimer = 0;
  const unveil = () => { $("dropveil").classList.remove("on"); $("packs-drop")?.classList.remove("over"); };
  window.addEventListener("dragover", e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // .mcpack / .mcaddon / folders have no MIME type; zips are application/*zip*. Text files (a script
    // dragged onto the editor) do not get the veil.
    const packish = [...(e.dataTransfer.items ?? [])].some(i => i.kind === "file" && (!i.type || /zip|octet/.test(i.type)));
    if (dlg.open) $("packs-drop")?.classList.add("over");
    else if (packish) $("dropveil").classList.add("on");
    clearTimeout(veilTimer);
    veilTimer = setTimeout(unveil, 250);
  }, true);
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    unveil();
    const dt = e.dataTransfer;
    const entries = [...(dt.items ?? [])].filter(i => i.kind === "file").map(i => i.webkitGetAsEntry?.()).filter(Boolean);
    const files = [...dt.files];
    if (!dlg.open && !entries.some(x => x.isDirectory) && !files.some(f => ARCH.test(f.name))) {
      if (e.target?.closest?.(".cm-editor")) return;  // the editor opens text files itself
      e.preventDefault();  // never let the browser navigate away to the dropped file
      toast("リソースパック（.mcpack / .zip / .mcaddon）かパックのフォルダをドロップしてください", true);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    collect(entries, files).then(inputs => { if (inputs.length) install(inputs); },
      err => toast("ファイルを読めませんでした: " + err.message, true));
  }, true);

  return { refresh, open, install };
}

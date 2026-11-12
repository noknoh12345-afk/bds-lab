'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE_JA = { running: '稼働中', starting: '起動中', stopping: '停止中…', stopped: '停止' };
const TYPE_JA = { hot: 'ホット', manual: '手動', auto: '自動', offline: '停止中', 'pre-restore': '復元前退避', 'pre-reset': 'リセット前', 'pre-import': '取り込み前', export: '書き出し用', upload: 'アップロード' };
const LIMBO_JA = { ondemand: '必要時', always: '常時', disabled: '無効' };

const S = { chat: [], filePath: '', file: null, tasks: [], state: null, logs: { main: [], limbo: [] }, view: 'dash', dims: null, conHist: [], conHistIdx: -1 };

async function api(method, url, body, raw) {
  const opt = { method, headers: { 'x-levikit': '1' }, credentials: 'same-origin' };
  if (raw) opt.body = raw;
  else if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  if (r.status === 401 && !url.endsWith('/login')) {
    showLogin();
    throw new Error('ログインが必要です');
  }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.error || r.statusText);
  return data;
}

function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 4500);
}
const guard = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message, true);
  }
};

function fmtBytes(n) {
  if (!n && n !== 0) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDur(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}日${h}時間` : h ? `${h}時間${m}分` : `${m}分${s % 60}秒`;
}
const fmtDate = (t) => new Date(t).toLocaleString('ja-JP');

// ---------- login ----------
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginPw').focus();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('POST', '/api/login', { password: $('#loginPw').value });
    $('#loginPw').value = '';
    boot();
  } catch (err) {
    $('#loginErr').textContent = err.message;
  }
});
$('#logout').addEventListener('click', guard(async () => {
  await api('POST', '/api/logout');
  location.reload();
}));

// ---------- nav ----------
$$('#nav a[data-view]').forEach((a) =>
  a.addEventListener('click', () => {
    $$('#nav a').forEach((x) => x.classList.toggle('active', x === a));
    S.view = a.dataset.view;
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${S.view}`));
    onView(S.view);
  })
);
function onView(v) {
  if (v === 'console') renderConsole(true);
  if (v === 'players') {
    renderPlayers();
    api('POST', '/api/main/players/refresh').then(refreshState).then(renderPlayers).catch(() => {});
  }
  if (v === 'dims') loadDims();
  if (v === 'backups') loadBackups();
  if (v === 'props') loadProps();
  if (v === 'mods') loadMods();
  if (v === 'settings') loadSettings();
  if (v === 'dash') loadMetrics();
  if (v === 'chat') loadChat();
  if (v === 'access') loadAccess();
  if (v === 'tasks') loadTasks();
  if (v === 'files') loadFiles(S.filePath || '');
  if (v === 'warps') loadWarps();
  if (v === 'audit') loadAudit();
  if (v === 'map') loadMapView();
  if (v === 'addons') loadAddons();
}

// ---------- SSE ----------
let es = null;
function connect() {
  if (es) es.close();
  es = new EventSource('/api/events');
  es.addEventListener('hello', (e) => {
    S.state = JSON.parse(e.data);
    setConn(true);
    renderDash();
    loadMetrics();
  });
  es.addEventListener('state', (e) => {
    const s = JSON.parse(e.data);
    if (!S.state) return;
    S.state.instances[s.name] = s;
    renderDash();
    if (S.view === 'players') renderPlayers();
  });
  es.addEventListener('job', (e) => {
    if (!S.state) return;
    const j = JSON.parse(e.data);
    S.state.job = j;
    renderJob();
    if (j.status !== 'running') {
      toast(`${j.title}: ${j.status === 'done' ? '完了' : '失敗 ' + (j.error || '')}`, j.status !== 'done');
      if (j.status === 'done' && j.result?.download && S.waitExport === j.id) {
        S.waitExport = null;
        modal('書き出し完了', `<p><b>${esc(j.result.file)}</b>（${fmtBytes(j.result.size)} / ${j.result.chunks} チャンク）</p><p class="muted small">統合版でダブルクリックするとワールドとして読み込めます。ファイルは24時間で削除されます。</p>`, [
          { label: '閉じる', value: null },
          { label: 'ダウンロード', cls: 'primary', value: 'dl' },
        ]).then((r) => {
          if (r.value === 'dl') location.href = j.result.download;
        });
      }
      if (S.view === 'backups') loadBackups();
      if (S.view === 'mods') loadMods();
      if (S.view === 'dims') loadDims();
      if (S.view === 'map' && j.status === 'done') loadMapView(j.result);
      refreshState();
    }
  });
  es.addEventListener('line', (e) => {
    const l = JSON.parse(e.data);
    const arr = S.logs[l.inst];
    arr.push(l);
    if (arr.length > 3000) arr.splice(0, arr.length - 3000);
    if (S.view === 'console' && $('#conInst').value === l.inst) appendLine(l);
  });
  es.addEventListener('pos', (e) => {
    M.pos = JSON.parse(e.data);
    if (S.view === 'map') drawMap();
  });
  es.addEventListener('worlds', (e) => {
    if (!S.state) return;
    S.state.worlds = JSON.parse(e.data);
    renderWorldList();
  });
  es.addEventListener('chat', (e) => {
    const c = JSON.parse(e.data);
    S.chat.push(c);
    if (S.view === 'chat') appendChat(c);
  });
  es.onerror = () => setConn(false);
}
function setConn(on) {
  $('#connDot').className = 'dot ' + (on ? 'on' : 'off');
  $('#connText').textContent = on ? '接続中' : '再接続中…';
}
async function refreshState() {
  S.state = await api('GET', '/api/state');
  renderDash();
}

// ---------- dashboard ----------
function renderDash() {
  const st = S.state;
  if (!st) return;
  const m = st.instances.main, l = st.instances.limbo;
  const badge = (el, s) => {
    el.textContent = STATE_JA[s.state] || s.state;
    el.className = `badge ${s.state}`;
  };
  badge($('#mainBadge'), m);
  badge($('#limboBadge'), l);
  $('#mainPlayers').textContent = m.players.length;
  $('#mainTps').textContent = m.tps === null || m.tps === undefined ? '-' : m.tps.toFixed(1);
  $('#maintNotice').classList.toggle('hidden', !st.maintenance);
  $('#mainUptime').textContent = m.state === 'running' ? fmtDur(Date.now() - m.startedAt) : '-';
  $('#limboPlayers').textContent = l.players.length;
  $('#limboMode').textContent = LIMBO_JA[st.config.limbo.mode] || st.config.limbo.mode;
  $('#mainPort').textContent = st.ports?.main ? `${st.ports.main.port}/udp` : '-';
  const blk = $('#blocker');
  blk.classList.toggle('hidden', !st.seamlessBlocker);
  blk.textContent = st.seamlessBlocker ? `「参加したまま」系の操作は通常モードになります: ${st.seamlessBlocker}` : '';
  $('#noKit').classList.toggle('hidden', st.kitCore || !st.installed);
  const sys = st.system;
  $('#sysInfo').innerHTML = [
    ['ホスト', sys.hostname],
    ['メモリ', `${fmtBytes(sys.mem.total - sys.mem.free)} / ${fmtBytes(sys.mem.total)}`],
    ['ディスク空き', sys.disk ? `${fmtBytes(sys.disk.free)} / ${fmtBytes(sys.disk.total)}` : '-'],
    ['ロードアベレージ', sys.load.map((x) => x.toFixed(2)).join(' ')],
  ].map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
  const v = st.versions || {};
  $('#verInfo').innerHTML = Object.keys(v).length
    ? Object.entries(v).map(([k, val]) => `<span>${esc(k)}</span><span>${esc(val)}</span>`).join('')
    : '<span class="muted">versions.json なし</span><span></span>';
  const running = m.state === 'running';
  $('[data-act=start]').disabled = m.state !== 'stopped';
  $('[data-act=stop]').disabled = !running;
  $('[data-act=restart]').disabled = !running;
  $('[data-act=restartStd]').disabled = !running;
  $('[data-act=limboStart]').disabled = l.state !== 'stopped' || st.config.limbo.mode === 'disabled';
  $('[data-act=limboStop]').disabled = l.state === 'stopped';
  renderWorldList();
  renderJob();
}
function renderWorldList() {
  const ws = (S.state?.worlds || []).filter((w) => w.show !== false);
  $('#worldSum').textContent = ws.length ? `${ws.length} ワールド` : 'levikit-core から一覧が届いていません';
  $('#worldList').innerHTML = ws.map((w) => `<div class="wi"><div><b>${esc(w.display)}</b><div class="muted small">${esc(w.key)}${w.open === false ? ' · <span style="color:var(--danger)">閉鎖</span>' : ''}${w.epoch ? ` · 入れ替え${w.epoch}回` : ''}</div></div><span class="n">${w.players ?? 0}</span></div>`).join('');
}
function renderJob() {
  const j = S.state?.job;
  const b = $('#jobBadge');
  if (!j) {
    b.textContent = 'なし';
    b.className = 'badge';
    $('#jobResult').classList.add('hidden');
    $('#jobLog').textContent = (S.state?.history || []).slice(0, 8).map((h) => `${fmtDate(h.startedAt)}  ${h.title}  → ${h.status}${h.error ? ' (' + h.error + ')' : ''}`).join('\n') || 'ジョブ履歴はありません';
    return;
  }
  b.textContent = `${j.title} - ${j.status === 'running' ? '実行中' : j.status === 'done' ? '完了' : '失敗'}`;
  b.className = `badge ${j.status === 'running' ? 'job-running' : j.status}`;
  const jr = $('#jobResult');
  const dl = j.status === 'done' && j.result?.download;
  jr.classList.toggle('hidden', !dl);
  jr.innerHTML = dl ? `<a class="btn small primary" href="${esc(j.result.download)}">⬇ ${esc(j.result.file)} をダウンロード</a><span class="muted small">${fmtBytes(j.result.size)}・24時間で削除</span>` : '';
  const el = $('#jobLog');
  el.textContent = j.log.join('\n');
  el.scrollTop = el.scrollHeight;
}
const ACTIONS = {
  start: () => api('POST', '/api/main/start'),
  stop: () => confirm('メインサーバーを停止しますか？（予告後に停止）') && api('POST', '/api/main/stop'),
  restart: () => api('POST', '/api/main/restart', { standard: false }),
  restartStd: () => confirm('全員切断して再起動しますか？') && api('POST', '/api/main/restart', { standard: true }),
  kill: () => confirm('強制終了するとワールドが壊れる可能性があります。本当に実行しますか？') && api('POST', '/api/main/kill'),
  limboStart: () => api('POST', '/api/limbo/start'),
  limboStop: () => api('POST', '/api/limbo/stop'),
};
$$('[data-act]').forEach((b) => b.addEventListener('click', guard(async () => {
  const r = await ACTIONS[b.dataset.act]();
  if (r) toast('リクエストを送信しました');
})));

// ---------- console ----------
function lineClass(l) {
  if (l.kind === 'sys') return 'sys';
  if (l.kind === 'err' || /\bERROR\b|\bFATAL\b/.test(l.text)) return 'err';
  if (l.kind === 'cmd') return 'cmd';
  if (/\bWARN\b/.test(l.text)) return 'warnl';
  return '';
}
function appendLine(l) {
  const f = $('#conFilter').value.toLowerCase();
  if (f && !l.text.toLowerCase().includes(f)) return;
  const el = $('#conLog');
  const span = document.createElement('span');
  span.className = lineClass(l);
  span.textContent = l.text + '\n';
  el.appendChild(span);
  while (el.childNodes.length > 3000) el.removeChild(el.firstChild);
  if ($('#conAuto').checked) el.scrollTop = el.scrollHeight;
}
async function renderConsole(fetchLogs) {
  const inst = $('#conInst').value;
  if (fetchLogs) {
    try {
      S.logs[inst] = await api('GET', `/api/logs/${inst}`);
    } catch {
      /* ignore */
    }
  }
  $('#conLog').textContent = '';
  S.logs[inst].forEach(appendLine);
}
$('#conInst').addEventListener('change', () => renderConsole(true));
$('#conFilter').addEventListener('input', () => renderConsole(false));
$('#conForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const v = $('#conInput').value.trim();
  if (!v) return;
  S.conHist.unshift(v);
  S.conHistIdx = -1;
  $('#conInput').value = '';
  await api('POST', `/api/${$('#conInst').value}/command`, { command: v.replace(/^\//, '') });
}));
$('#conInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' && S.conHist.length) {
    S.conHistIdx = Math.min(S.conHistIdx + 1, S.conHist.length - 1);
    e.target.value = S.conHist[S.conHistIdx];
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    S.conHistIdx = Math.max(S.conHistIdx - 1, -1);
    e.target.value = S.conHistIdx < 0 ? '' : S.conHist[S.conHistIdx];
    e.preventDefault();
  }
});

// ---------- players ----------
function liveWorlds() {
  return S.state?.worlds || S.dims?.live || [];
}
function dimName(id, key) {
  const w = liveWorlds().find((x) => (key ? x.key === key : x.id === id));
  if (w) return w.display;
  const names = { 0: 'オーバーワールド', 1: 'ネザー', 2: 'ジ・エンド' };
  if (names[id]) return names[id];
  if (key) return key;
  return id === undefined || id === null ? '-' : `#${id}`;
}
function renderPlayers() {
  const ps = S.state?.instances.main.players || [];
  $('#plBody').innerHTML = ps.length
    ? ps.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.op ? ' <span class="badge">OP</span>' : ''}</td><td class="muted">${esc(p.xuid || '')}</td><td>${esc(dimName(p.dim, p.world))}</td><td class="muted">${esc(p.group || '-')}</td>
      <td class="muted">${p.pos ? p.pos.map((n) => Math.round(n)).join(', ') : '-'}</td><td class="muted">${p.since ? fmtDur(Date.now() - p.since) : '-'}</td>
      <td class="actions"><button class="btn small" data-pl="op" data-name="${esc(p.name)}">OP</button><button class="btn small" data-pl="deop" data-name="${esc(p.name)}">OP解除</button><button class="btn small warn" data-pl="kick" data-name="${esc(p.name)}">キック</button><button class="btn small danger" data-pl="ban" data-name="${esc(p.name)}" data-xuid="${esc(p.xuid || '')}">BAN</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">オンラインのプレイヤーはいません</td></tr>';
  loadHistory();
}
$('#plBody').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('[data-pl]');
  if (!b) return;
  if (b.dataset.pl === 'ban') return banPrompt(b.dataset.name, b.dataset.xuid);
  if (b.dataset.pl === 'kick' && !confirm(`${b.dataset.name} をキックしますか？`)) return;
  await api('POST', `/api/main/players/${b.dataset.pl}`, { name: b.dataset.name });
  toast('送信しました');
}));
$('#plRefresh').addEventListener('click', guard(async () => {
  await api('POST', '/api/main/players/refresh');
  await refreshState();
  renderPlayers();
}));

// ---------- worlds ----------
const GM_JA = { '': '変更しない', survival: 'サバイバル', creative: 'クリエイティブ', adventure: 'アドベンチャー', spectator: 'スペクテイター' };
const OPT_JA = {
  protections: { none: 'なし', all: 'ワールド全体', spawn: 'スポーン周辺だけ' },
  mobSpawning: { all: 'すべて', noHostile: '敵対モブなし', none: 'なし' },
  landings: { auto: '自動', surface: '地表に着地', platform: 'ガラスの足場を作る', fixed: '座標そのまま' },
  generators: { Overworld: 'オーバーワールド', Flat: 'フラット', Nether: 'ネザー', TheEnd: 'エンド', Void: '虚空' },
  gameModes: GM_JA,
};
// p: パス, t: 種類, l: ラベル, o: 選択肢キー, only: 'custom' | 'vanilla'
const F_BASIC = [
  { p: 'enabled', t: 'bool', l: '有効（オフにすると次の再起動で登録しない）', only: 'custom' },
  { p: 'show', t: 'bool', l: 'メニューに表示', only: 'vanilla' },
  { p: 'name', t: 'text', l: 'ID (namespace:name)', only: 'custom', ph: 'levikit:mine' },
  { p: 'displayName', t: 'text', l: '表示名' },
  { p: 'description', t: 'text', l: '説明（メニューの2行目）' },
  { p: 'icon', t: 'text', l: 'メニューのアイコン', list: 'iconList', ph: 'textures/blocks/grass_side_carried' },
  { p: 'generator', t: 'select', l: '生成タイプ', o: 'generators', only: 'custom' },
  { p: 'seed', t: 'number', l: 'シード', only: 'custom' },
  { p: 'spawn', t: 'xyz', l: '初回スポーン x / y / z' },
  { p: 'landing', t: 'select', l: '着地のしかた', o: 'landings' },
  { hint: '生成タイプとシードは作成時とリセット時に使われます（既存ワールドの地形は変わりません）', only: 'custom' },
];
const F_RULES = [
  { p: 'rules.gameMode', t: 'select', l: 'ゲームモード', o: 'gameModes' },
  { p: 'rules.inventoryGroup', t: 'text', l: '持ち物グループ', ph: 'default' },
  { p: 'rules.pvp', t: 'bool', l: 'PvP（プレイヤー同士のダメージ）' },
  { p: 'rules.keepInventory', t: 'bool', l: '死んでも持ち物を落とさない' },
  { p: 'rules.respawnInWorld', t: 'bool', l: '死んだらこのワールドで復活' },
  { p: 'rules.mobSpawning', t: 'select', l: 'モブの自然スポーン', o: 'mobSpawning' },
  { p: 'rules.timeLock', t: 'number', l: '時間固定（-1=なし / 6000=昼 / 18000=夜）' },
  { p: 'rules.protection', t: 'select', l: '建築保護', o: 'protections' },
  { p: 'rules.protectionRadius', t: 'number', l: '保護半径（スポーン周辺のとき）' },
  { p: 'rules.protectInteract', t: 'bool', l: '保護範囲ではチェスト・ドア等の操作も禁止' },
  { p: 'rules.builders', t: 'list', l: '保護範囲でも建築できる人（名前/XUID, 改行区切り。OP は常に可）' },
  { p: 'rules.borderRadius', t: 'number', l: 'ワールドボーダー半径（0=なし）' },
  { p: 'rules.borderCenterOnSpawn', t: 'bool', l: 'ボーダーの中心をスポーン地点にする' },
  { p: 'rules.borderCenterX', t: 'number', l: 'ボーダー中心 X' },
  { p: 'rules.borderCenterZ', t: 'number', l: 'ボーダー中心 Z' },
  { p: 'rules.netherLink', t: 'select', l: 'このワールド専用のネザー（ネザーゲートの行き先。プリセット「第2のネザー」で作ったワールドを選ぶ）', o: 'netherWorlds', only: 'custom' },
];
const F_ACCESS = [
  { p: 'rules.open', t: 'bool', l: '開放中（オフ=閉鎖。OP 以外は入れず、中の人は外へ）' },
  { p: 'rules.opOnly', t: 'bool', l: 'OP 専用' },
  { p: 'rules.maxPlayers', t: 'number', l: '人数上限（0=無制限）' },
  { p: 'rules.allowedPlayers', t: 'list', l: '入れる人を限定（名前/XUID, 改行区切り。空=全員）' },
];
const F_ENTER = [
  { p: 'rules.enterTitle', t: 'text', l: '入場時のタイトル', ph: '§6資源ワールド' },
  { p: 'rules.enterSubtitle', t: 'text', l: '入場時のサブタイトル' },
  { p: 'rules.enterCommands', t: 'list', l: '入場時に実行するコマンド（{player}=プレイヤー名, 1行1つ）', ph: 'give {player} bread 8' },
  { p: 'rules.leaveCommands', t: 'list', l: '退場時に実行するコマンド', ph: 'clear {player}' },
];
const TABS = [
  ['basic', '基本', F_BASIC],
  ['rules', 'ルール', F_RULES],
  ['access', '入場制限', F_ACCESS],
  ['enter', '入退場', F_ENTER],
];
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => {
  const ks = p.split('.');
  let t = o;
  while (ks.length > 1) {
    const k = ks.shift();
    t[k] = t[k] ?? {};
    t = t[k];
  }
  t[ks[0]] = v;
};
function fieldHtml(f, obj, kind) {
  if (f.only && f.only !== kind) return '';
  if (f.hint) return `<div class="hint">${esc(f.hint)}</div>`;
  const v = getP(obj, f.p);
  const id = `data-p="${f.p}" data-t="${f.t}"`;
  if (f.t === 'bool') return `<label class="chk"><input type="checkbox" ${id} ${v ? 'checked' : ''}> ${esc(f.l)}</label>`;
  let input;
  if (f.t === 'select') {
    let opts = S.dims.options[f.o] || [];
    let ja = OPT_JA[f.o] || {};
    if (f.o === 'netherWorlds') {
      // ネザー型のカスタムワールド（自分以外）
      const ds = S.dims.kit.dimensions.filter((d) => d.generator === 'Nether' && d.name !== obj.name);
      opts = ['', ...ds.map((d) => d.name)];
      ja = { '': '通常のネザー', ...Object.fromEntries(ds.map((d) => [d.name, `${d.displayName || d.name}（${d.name}）`])) };
    }
    input = `<select ${id}>${opts.map((o) => `<option value="${esc(o)}" ${o === (v ?? '') ? 'selected' : ''}>${esc(ja[o] ?? o)}</option>`).join('')}</select>`;
  } else if (f.t === 'xyz') {
    input = `<div class="xyz3">${['x', 'y', 'z'].map((k) => `<input type="number" step="0.5" data-p="${f.p}.${k}" data-t="number" value="${esc(v?.[k] ?? 0)}">`).join('')}</div>`;
  } else if (f.t === 'list') {
    input = `<textarea ${id} rows="3" placeholder="${esc(f.ph || '')}">${esc((v || []).join('\n'))}</textarea>`;
  } else {
    input = `<input ${id} type="${f.t === 'number' ? 'number' : 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '')}" ${f.list ? `list="${f.list}"` : ''}>`;
  }
  return `<label>${esc(f.l)}${input}</label>`;
}
function readInto(root, obj) {
  $$('[data-p]', root).forEach((el) => {
    const t = el.dataset.t;
    let v;
    if (t === 'bool') v = el.checked;
    else if (t === 'number') v = el.value === '' ? 0 : Number(el.value);
    else if (t === 'list') v = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    else v = el.value.trim();
    setP(obj, el.dataset.p, v);
  });
  return obj;
}
async function loadDims() {
  try {
    S.dims = await api('GET', '/api/dimensions');
  } catch (e) {
    return toast(e.message, true);
  }
  S.dimsOpen = S.dimsOpen || new Set();
  renderDims();
}
function worldEntries() {
  const k = S.dims.kit;
  return [
    { kind: 'vanilla', key: 'overworld', ref: 'overworld', obj: k.overworld },
    { kind: 'vanilla', key: 'nether', ref: 'nether', obj: k.nether },
    { kind: 'vanilla', key: 'the_end', ref: 'theEnd', obj: k.theEnd },
    ...k.dimensions.map((d, i) => ({ kind: 'custom', key: d.name, ref: i, obj: d })),
  ];
}
function worldCard(e) {
  const d = e.obj;
  const live = (S.dims.live || []).find((w) => w.key === e.key);
  const actual = S.dims.actual?.[e.key];
  const reset = S.dims.resets?.[e.key];
  const badges = [];
  badges.push(`<span class="badge">${esc(OPT_JA.generators[d.generator] || (e.kind === 'vanilla' ? 'バニラ' : d.generator))}</span>`);
  if (e.kind === 'custom' && !actual) badges.push('<span class="badge info">次の再起動で作成</span>');
  if (e.kind === 'custom' && !d.enabled) badges.push('<span class="badge off">無効</span>');
  if (!d.rules.open) badges.push('<span class="badge off">閉鎖</span>');
  if (d.rules.opOnly) badges.push('<span class="badge warn">OP専用</span>');
  if (d.rules.gameMode) badges.push(`<span class="badge">${esc(GM_JA[d.rules.gameMode])}</span>`);
  if (d.rules.inventoryGroup && d.rules.inventoryGroup !== 'default') badges.push(`<span class="badge info">持ち物:${esc(d.rules.inventoryGroup)}</span>`);
  if (d.rules.protection !== 'none') badges.push('<span class="badge">保護</span>');
  if (!d.rules.pvp) badges.push('<span class="badge">PvPなし</span>');
  if (d.rules.borderRadius > 0) badges.push(`<span class="badge">境界${d.rules.borderRadius}</span>`);
  if (live) badges.push(`<span class="badge running">${live.players}人</span>`);
  if (reset?.epoch) {
    const kindJa = { import: '取り込み/復元済み', clone: '複製で作成' }[reset.kind] || `リセット済み`;
    badges.push(`<span class="badge" title="中身の入れ替え ${reset.epoch} 回（最終: ${reset.resetAt ? fmtDate(reset.resetAt * 1000) : '?'}）">${kindJa}</span>`);
  }
  if (actual && e.kind === 'custom' && actual.seed !== null && actual.seed !== d.seed) badges.push(`<span class="badge warn" title="地形は作成時のシード ${actual.seed} のまま。リセットで反映">シード変更→リセットで反映</span>`);
  const acts = [];
  acts.push(`<button class="btn small" data-wact="${d.rules.open ? 'close' : 'open'}">${d.rules.open ? '閉鎖' : '開放'}</button>`);
  if (live) acts.push('<button class="btn small" data-wact="send">全員を送る</button>');
  if (actual || e.kind === 'vanilla') {
    acts.push('<button class="btn small" data-wact="export" title="このワールドだけを .mcworld に書き出す">書き出し</button>');
    acts.push('<button class="btn small" data-wact="clone" title="中身ごとコピーして新しいワールドにする">複製</button>');
    acts.push('<button class="btn small" data-wact="wrestore" title="このワールドだけをバックアップの状態に戻す">復元</button>');
  }
  if (e.kind === 'custom') {
    acts.push('<button class="btn small warn" data-wact="reset">リセット</button>');
    acts.push('<button class="btn small danger ghost" data-wact="del">削除</button>');
  }
  const st = S.dims.stats?.[e.key];
  const statLine = st
    ? `<div class="wstat"><span>累計滞在 <b>${fmtDur(st.totalMs)}</b></span><span>訪れた人 <b>${st.visitors}</b></span><span>移動回数 <b>${st.visits}</b></span>${st.top?.length ? `<span>よく来る人 <b>${st.top.slice(0, 3).map((t) => esc(t.name)).join('、')}</b></span>` : ''}</div>`
    : '';
  const open = S.dimsOpen.has(e.key) ? 'open' : '';
  const tab = S.dimsTab?.[e.key] || 'basic';
  return `<details class="wcard ${e.kind === 'custom' && !d.enabled ? 'disabled' : ''}" data-key="${esc(e.key)}" data-kind="${e.kind}" data-ref="${e.ref}" ${open}>
    <summary><span class="wname">${esc(d.displayName || e.key)}</span><span class="wkey">${esc(e.key)}${actual ? ` #${actual.dimId}` : ''}</span>${badges.join('')}<span class="wact">${acts.join('')}</span></summary>
    <div class="wbody">
      ${statLine}
      <div class="tabs">${TABS.map(([id, label]) => `<button type="button" data-tab="${id}" class="${id === tab ? 'on' : ''}">${label}</button>`).join('')}</div>
      ${TABS.map(([id, , fields]) => `<div class="tabpane ${id === tab ? 'on' : ''}" data-pane="${id}"><div class="fgrid">${fields.map((f) => fieldHtml(f, d, e.kind)).join('')}</div></div>`).join('')}
    </div></details>`;
}
function renderDims() {
  const k = S.dims.kit;
  $('#gChat').value = k.chatMode;
  $('#gDefGm').value = k.defaultGameMode;
  $('#gMenuItem').value = k.menuItem;
  $('#gHubMode').value = k.hub.mode;
  $('#gHubTarget').value = k.hub.target;
  $('#dimEveryone').checked = k.dimCommandForEveryone;
  $('#dimRemember').checked = k.rememberLastPosition;
  $('#dimSepInv').checked = k.separateInventories;
  $('#gTpa').checked = k.tpaEnabled;
  $('#gTpaCross').checked = k.tpaCrossWorld;
  $('#gTpaTimeout').value = k.tpaTimeoutSeconds;
  $('#gSpawn').checked = k.spawnCommand;
  $('#gBack').checked = k.backCommand;
  $('#presetSel').innerHTML = Object.entries(S.dims.presets).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join('');
  $('#worldCards').innerHTML = worldEntries().map(worldCard).join('');
  $('#targetList').innerHTML = [...worldEntries().map((e) => `world:${e.key}`), ...k.warps.map((w) => `warp:${w.name}`)].map((v) => `<option value="${esc(v)}">`).join('');
}
function collectDims() {
  const kit = structuredClone(S.dims.kit);
  $$('#worldCards .wcard').forEach((card) => {
    const kind = card.dataset.kind;
    const ref = card.dataset.ref;
    const target = kind === 'custom' ? kit.dimensions[+ref] : kit[ref];
    readInto(card, target);
  });
  kit.chatMode = $('#gChat').value;
  kit.defaultGameMode = $('#gDefGm').value;
  kit.menuItem = $('#gMenuItem').value.trim();
  kit.hub = { mode: $('#gHubMode').value, target: $('#gHubTarget').value.trim() };
  kit.dimCommandForEveryone = $('#dimEveryone').checked;
  kit.rememberLastPosition = $('#dimRemember').checked;
  kit.separateInventories = $('#dimSepInv').checked;
  kit.tpaEnabled = $('#gTpa').checked;
  kit.tpaCrossWorld = $('#gTpaCross').checked;
  kit.tpaTimeoutSeconds = Number($('#gTpaTimeout').value) || 60;
  kit.spawnCommand = $('#gSpawn').checked;
  kit.backCommand = $('#gBack').checked;
  return kit;
}
$('#worldCards').addEventListener('toggle', (e) => {
  const card = e.target.closest('.wcard');
  if (!card) return;
  if (card.open) S.dimsOpen.add(card.dataset.key);
  else S.dimsOpen.delete(card.dataset.key);
}, true);
$('#worldCards').addEventListener('click', guard(async (e) => {
  const tb = e.target.closest('[data-tab]');
  if (tb) {
    const card = tb.closest('.wcard');
    S.dimsTab = { ...(S.dimsTab || {}), [card.dataset.key]: tb.dataset.tab };
    $$('[data-tab]', card).forEach((b) => b.classList.toggle('on', b === tb));
    $$('[data-pane]', card).forEach((p) => p.classList.toggle('on', p.dataset.pane === tb.dataset.tab));
    return;
  }
  const b = e.target.closest('[data-wact]');
  if (!b) return;
  e.preventDefault();
  const card = b.closest('.wcard');
  const key = card.dataset.key;
  const act = b.dataset.wact;
  const d = card.dataset.kind === 'custom' ? S.dims.kit.dimensions[+card.dataset.ref] : S.dims.kit[card.dataset.ref];
  if (act === 'open' || act === 'close') {
    await api('POST', `/api/worlds/${act}`, { key });
    toast(act === 'open' ? `${d.displayName} を開放しました` : `${d.displayName} を閉鎖しました（中の人は移動されます）`);
    return loadDims();
  }
  if (act === 'send') {
    if (!confirm(`オンラインの全員を ${d.displayName} のスポーンへ送りますか？`)) return;
    await api('POST', '/api/worlds/send', { key });
    return toast('送りました');
  }
  if (act === 'del') {
    const r = await modal(`${d.displayName || key} を削除`, `
      <p>設定から外します。「保存して適用」で反映されます。</p>
      <div class="opt"><label class="chk"><input type="checkbox" id="delPurge" checked> ワールドのデータ（地形・建物）も消す</label></div>
      <p class="muted small">消さない場合、同じ ID で作り直すと前の地形と生成タイプが戻ってきます。必要なら先に「書き出し」で保存してください。</p>`, [
      { label: 'キャンセル', value: null },
      { label: '削除', cls: 'danger', value: 'ok' },
    ]);
    if (r.value !== 'ok') return;
    if ($('#delPurge', r.root).checked) S.dims.purge = [...new Set([...(S.dims.purge || []), key])];
    S.dims.kit = collectDims();
    S.dims.kit.dimensions.splice(+card.dataset.ref, 1);
    return renderDims();
  }
  if (act === 'reset') return resetDialog(d);
  if (act === 'export') return exportDialog(key, d);
  if (act === 'clone') return cloneDialog(key, d);
  if (act === 'wrestore') return worldRestoreDialog(key, d);
}));

async function backupChoices(withNow) {
  const list = (await api('GET', '/api/backups')).filter((b) => b.instance === 'main').sort((a, b) => b.createdAt - a.createdAt);
  const rows = list.slice(0, 60).map((b, i) => `<label><input type="radio" name="bk" value="${esc(b.id)}" ${!withNow && i === 0 ? 'checked' : ''}> ${fmtDate(b.createdAt)} <span class="badge">${esc(TYPE_JA[b.type] || b.type)}</span> <span class="muted">${esc(b.note || '')}</span></label>`);
  if (withNow) rows.unshift('<label><input type="radio" name="bk" value="" checked> <b>今の状態</b>（その場でバックアップを取って書き出す・参加したまま）</label>');
  return { html: `<div class="bklist">${rows.join('') || '<span class="muted">バックアップがありません</span>'}</div>`, count: list.length };
}

async function exportDialog(key, d) {
  const bk = await backupChoices(true);
  const r = await modal(`${d.displayName || key} を書き出す`, `
    <p>このワールドだけを、統合版でそのまま開ける <b>.mcworld</b> にします（ワールドの外側は何もない空間になります）。建築の配布や手元での保管に。</p>
    ${bk.html}`, [
    { label: 'キャンセル', value: null },
    { label: '書き出す', cls: 'primary', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  const backupId = $('input[name=bk]:checked', r.root)?.value || null;
  const job = await api('POST', '/api/worlds/export', { key, backupId });
  S.waitExport = job.id;
  toast('書き出しを開始しました。完了するとダウンロードできます');
}

async function cloneDialog(key, d) {
  const base = key.includes(':') ? key : `levikit:${key}`;
  let n = 2;
  const names = new Set(S.dims.kit.dimensions.map((x) => x.name));
  let suggestion = `${base}_copy`;
  while (names.has(suggestion)) suggestion = `${base}_copy${n++}`;
  const r = await modal(`${d.displayName || key} を複製`, `
    <p>地形・建物・チェストの中身・エンティティごとコピーして、新しいワールドを作ります。ルールもコピーされます（あとで変更できます）。</p>
    <div class="opt"><span class="lbl">新しい ID</span><input id="clTo" value="${esc(suggestion)}"></div>
    <div class="opt"><span class="lbl">表示名</span><input id="clName" value="${esc((d.displayName || key) + ' のコピー')}"></div>
    <div class="opt"><label class="chk"><input type="checkbox" id="clStd"> 待機サーバーを使わない（全員切断）</label></div>
    <div class="warnbox">参加したまま再起動して複製します（数秒〜数分）。元のワールドは変わりません。</div>`, [
    { label: 'キャンセル', value: null },
    { label: '複製する', cls: 'primary', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  await api('POST', '/api/worlds/clone', { from: key, to: $('#clTo', r.root).value.trim(), displayName: $('#clName', r.root).value.trim(), standard: $('#clStd', r.root).checked });
  toast('複製を開始しました（ダッシュボードのジョブに進捗が出ます）');
}

async function worldRestoreDialog(key, d) {
  const bk = await backupChoices(false);
  if (!bk.count) return toast('バックアップがありません', true);
  const r = await modal(`${d.displayName || key} だけを復元`, `
    <p>このワールドの地形・建物・エンティティだけを、選んだバックアップの時点に戻します。<b>ほかのワールド・プレイヤーの持ち物や位置はそのまま</b>です。</p>
    ${bk.html}
    <div class="opt"><label class="chk"><input type="checkbox" id="wrStd"> 待機サーバーを使わない（全員切断）</label></div>
    <div class="warnbox">復元の前に今の状態を自動でバックアップします。このワールドでログアウトしていた人は、次に入るとスポーンへ移動します。</div>`, [
    { label: 'キャンセル', value: null },
    { label: '復元する', cls: 'danger', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  const backupId = $('input[name=bk]:checked', r.root)?.value;
  if (!backupId) return;
  await api('POST', '/api/worlds/restore', { name: key, backupId, standard: $('#wrStd', r.root).checked });
  toast('ワールド単位の復元を開始しました');
}

function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('x-levikit', '1');
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let data = null;
      try {
        data = JSON.parse(x.responseText);
      } catch {
        /* ignore */
      }
      if (x.status >= 200 && x.status < 300) resolve(data);
      else reject(new Error(data?.error || `HTTP ${x.status}`));
    };
    x.onerror = () => reject(new Error('アップロードに失敗しました（接続が切れました）'));
    x.send(file);
  });
}

async function importDialog() {
  const names = new Set(S.dims.kit.dimensions.map((x) => x.name));
  let n = 1;
  while (names.has(`levikit:imported${n}`)) n++;
  const gens = { Void: '何もない空間（配布マップ・建築向け）', Overworld: 'オーバーワールド（元のシードで続きを生成）', Flat: 'フラット' };
  const r = await modal('.mcworld を取り込む', `
    <p>統合版のワールド（.mcworld / .zip）を、このサーバーの<b>新しいワールド</b>として追加します。配布マップ・別サーバーのワールド・シングルプレイのワールドを、参加したまま持ち込めます。</p>
    <div class="opt"><span class="lbl">ファイル</span><input id="imFile" type="file" accept=".mcworld,.zip"></div>
    <div class="opt"><span class="lbl">ID</span><input id="imName" value="levikit:imported${n}"></div>
    <div class="opt"><span class="lbl">表示名</span><input id="imDisp" placeholder="空ならワールド名"></div>
    <div class="opt"><span class="lbl">取り込む次元</span><select id="imSrc"><option value="0">オーバーワールド</option><option value="1">ネザー</option><option value="2">ジ・エンド</option></select></div>
    <div class="opt"><span class="lbl">範囲の外側</span><select id="imGen">${Object.entries(gens).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
    <div class="opt"><label class="chk"><input type="checkbox" id="imReplace"> 同じ ID のワールドがあれば中身を置き換える（先にバックアップ）</label></div>
    <div class="opt"><label class="chk"><input type="checkbox" id="imStd"> 待機サーバーを使わない（全員切断）</label></div>
    <div class="warnbox">エンティティ（動物・額縁など）の ID は自動で振り直すので、元のワールドのものとぶつかりません。プレイヤーの持ち物・位置は取り込みません。</div>`, [
    { label: 'キャンセル', value: null },
    { label: 'アップロードして取り込む', cls: 'primary', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  const file = $('#imFile', r.root).files[0];
  if (!file) return toast('ファイルを選んでください', true);
  const q = new URLSearchParams({
    file: file.name,
    name: $('#imName', r.root).value.trim(),
    displayName: $('#imDisp', r.root).value.trim() || file.name.replace(/\.(mcworld|zip)$/i, '').slice(0, 40),
    sourceDim: $('#imSrc', r.root).value,
    generator: $('#imGen', r.root).value,
    seedMode: 'keep',
    replace: $('#imReplace', r.root).checked ? '1' : '0',
    standard: $('#imStd', r.root).checked ? '1' : '0',
  });
  const bar = document.createElement('div');
  bar.className = 'toast';
  bar.innerHTML = `アップロード中… <span id="upPct">0%</span><div class="progress"><i id="upBar"></i></div>`;
  document.body.appendChild(bar);
  try {
    await uploadWithProgress(`/api/worlds/import?${q}`, file, (f) => {
      $('#upPct').textContent = `${Math.round(f * 100)}%`;
      $('#upBar').style.width = `${f * 100}%`;
    });
    toast('アップロード完了。解析と取り込みを開始しました（ダッシュボードのジョブに進捗が出ます）');
  } finally {
    bar.remove();
  }
}
$('#dimImport').addEventListener('click', guard(importDialog));
async function resetDialog(d) {
  const r = await modal(`${d.displayName} をリセット`, `
    <p>このワールドの<strong>地形・建物・チェストの中身・エンティティをすべて削除</strong>して作り直します。プレイヤーの持ち物は消えません。</p>
    <div class="opt"><label class="chk"><input type="radio" name="seed" value="keep" checked> 設定のシードで作り直す（${esc(d.seed)}）</label></div>
    <div class="opt"><label class="chk"><input type="radio" name="seed" value="random"> 新しいランダムなシード</label></div>
    <div class="opt"><label class="chk"><input type="radio" name="seed" value="custom"> シードを指定</label><input id="rsSeed" type="number" min="0" style="width:160px"></div>
    <div class="opt"><label class="chk"><input type="checkbox" id="rsBackup" checked> 先にバックアップを取る（推奨）</label></div>
    <div class="opt"><label class="chk"><input type="checkbox" id="rsStd"> 待機サーバーを使わない（全員切断）</label></div>
    <div class="warnbox">参加中の人は待機サーバーへ移動し、作り直しが終わると自動で戻ります。このワールドでログアウトしていた人は、次に入るとスポーン地点に移動します。</div>`, [
    { label: 'キャンセル', value: null },
    { label: 'リセットする', cls: 'danger', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  const mode = $('input[name=seed]:checked', r.root).value;
  const seed = mode === 'custom' ? $('#rsSeed', r.root).value : mode;
  await api('POST', '/api/dimensions/reset', { name: d.name, seed, backup: $('#rsBackup', r.root).checked, standard: $('#rsStd', r.root).checked });
  toast('リセットを開始しました（ダッシュボードのジョブに進捗が出ます）');
}
$('#dimAdd').addEventListener('click', () => {
  S.dims.kit = collectDims();
  const preset = S.dims.presets[$('#presetSel').value];
  let n = S.dims.kit.dimensions.length + 1;
  while (S.dims.kit.dimensions.some((d) => d.name === `levikit:world${n}`)) n++;
  const d = structuredClone(preset.dim);
  d.name = `levikit:world${n}`;
  d.displayName = preset.label.replace(/（.*$/, '') + n;
  d.seed = Math.floor(Math.random() * 4294967295);
  d.enabled = true;
  S.dims.kit.dimensions.push(d);
  S.dimsOpen.add(d.name);
  renderDims();
  toast('追加しました。ID と表示名を確認して「保存して適用」を押してください');
});
const saveDims = (apply) => guard(async () => {
  const r = await api('PUT', '/api/dimensions', { kit: collectDims(), apply, purge: S.dims.purge || [] });
  S.dims.purge = [];
  toast(apply === 'restart' ? '保存しました。参加したまま再起動で適用します' : apply === 'reload' ? '保存して反映しました' : '保存しました');
  if (!r.job) loadDims();
});
$('#dimSaveApply').addEventListener('click', saveDims('restart'));
$('#dimSaveReload').addEventListener('click', saveDims('reload'));
$('#dimSaveOnly').addEventListener('click', saveDims(null));

// ---------- modal ----------
function modal(title, html, buttons) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#mTitle').textContent = title;
    $('#mBody').innerHTML = html;
    $('#mBtns').innerHTML = buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-mi="${i}">${esc(b.label)}</button>`).join('');
    m.classList.remove('hidden');
    const done = (value) => {
      m.classList.add('hidden');
      m.onclick = null;
      resolve({ value, root: $('#mBody') });
    };
    m.onclick = (e) => {
      const b = e.target.closest('[data-mi]');
      if (b) done(buttons[+b.dataset.mi].value);
      else if (e.target === m) done(null);
    };
  });
}

// ---------- warps / portals ----------
async function loadWarps() {
  S.warps = await api('GET', '/api/warps');
  renderWarps();
}
const worldOpts = (v) => S.warps.worlds.map((w) => `<option ${w === v ? 'selected' : ''}>${esc(w)}</option>`).join('');
function renderWarps() {
  const { warps, portals } = S.warps;
  $('#warpBody').innerHTML = warps.map((w, i) => `<tr data-i="${i}">
    <td><input data-p="name" data-t="text" value="${esc(w.name)}" style="width:120px"></td>
    <td><select data-p="world" data-t="text">${worldOpts(w.world)}</select></td>
    <td><div class="xyz3">${['x', 'y', 'z'].map((k) => `<input type="number" step="0.5" data-p="${k}" data-t="number" value="${esc(w[k])}">`).join('')}</div></td>
    <td><input type="number" data-p="yaw" data-t="number" value="${esc(w.yaw)}" style="width:70px"></td>
    <td><input data-p="description" data-t="text" value="${esc(w.description)}"></td>
    <td><input type="checkbox" data-p="opOnly" data-t="bool" ${w.opOnly ? 'checked' : ''}></td>
    <td class="actions"><button class="btn small danger ghost" data-wdel="${i}">削除</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">ワープはありません</td></tr>';
  $('#portalBody').innerHTML = portals.map((p, i) => `<tr data-i="${i}">
    <td><input type="checkbox" data-p="enabled" data-t="bool" ${p.enabled ? 'checked' : ''}></td>
    <td><input data-p="name" data-t="text" value="${esc(p.name)}" style="width:110px"></td>
    <td><select data-p="world" data-t="text">${worldOpts(p.world)}</select></td>
    <td><div class="xyz3">${['x1', 'y1', 'z1'].map((k) => `<input type="number" data-p="${k}" data-t="number" value="${esc(p[k])}">`).join('')}</div></td>
    <td><div class="xyz3">${['x2', 'y2', 'z2'].map((k) => `<input type="number" data-p="${k}" data-t="number" value="${esc(p[k])}">`).join('')}</div></td>
    <td><input data-p="target" data-t="text" value="${esc(p.target)}" list="targetList2" placeholder="world:levikit:resource"></td>
    <td><input data-p="message" data-t="text" value="${esc(p.message)}"></td>
    <td class="actions"><button class="btn small danger ghost" data-pdel="${i}">削除</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">ポータルはありません</td></tr>';
  let dl = $('#targetList2');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'targetList2';
    document.body.appendChild(dl);
  }
  dl.innerHTML = [...S.warps.worlds.flatMap((w) => [`world:${w}`, `last:${w}`]), ...warps.map((w) => `warp:${w.name}`)].map((v) => `<option value="${esc(v)}">`).join('');
}
function collectWarps() {
  const warps = $$('#warpBody tr[data-i]').map((tr) => readInto(tr, structuredClone(S.warps.warps[+tr.dataset.i])));
  const portals = $$('#portalBody tr[data-i]').map((tr) => readInto(tr, structuredClone(S.warps.portals[+tr.dataset.i])));
  return { warps, portals };
}
$('#warpBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-wdel]');
  if (!b) return;
  Object.assign(S.warps, collectWarps());
  S.warps.warps.splice(+b.dataset.wdel, 1);
  renderWarps();
});
$('#portalBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pdel]');
  if (!b) return;
  Object.assign(S.warps, collectWarps());
  S.warps.portals.splice(+b.dataset.pdel, 1);
  renderWarps();
});
$('#warpAdd').addEventListener('click', () => {
  Object.assign(S.warps, collectWarps());
  S.warps.warps.push({ name: `warp${S.warps.warps.length + 1}`, world: 'overworld', x: 0.5, y: 100, z: 0.5, yaw: 0, description: '', opOnly: false });
  renderWarps();
});
$('#portalAdd').addEventListener('click', () => {
  Object.assign(S.warps, collectWarps());
  S.warps.portals.push({ name: `portal${S.warps.portals.length + 1}`, world: 'overworld', x1: 0, y1: 64, z1: 0, x2: 2, y2: 66, z2: 0, target: '', message: '', enabled: true });
  renderWarps();
});
$('#warpSave').addEventListener('click', guard(async () => {
  const r = await api('PUT', '/api/warps', collectWarps());
  S.warps.warps = r.warps;
  S.warps.portals = r.portals;
  renderWarps();
  toast('保存して反映しました');
}));

// ---------- backups ----------
async function loadBackups() {
  let list;
  try {
    list = await api('GET', '/api/backups');
  } catch (e) {
    return toast(e.message, true);
  }
  $('#bkBody').innerHTML = list.length
    ? list.map((b) => `<tr><td>${fmtDate(b.createdAt)}${b.pinned ? ' 📌' : ''}</td><td><span class="badge t-${esc(b.type)}">${esc(TYPE_JA[b.type] || b.type)}</span></td>
      <td>${esc(b.world)}</td><td>${fmtBytes(b.size)}${b.format === 'cas' ? ` <span class="muted small">/ +${fmtBytes(b.stored || 0)}</span>` : ''}</td><td class="muted">${b.players?.length ? esc(b.players.join(', ')) : '-'}</td><td class="desc" data-note="${esc(b.id)}" title="クリックで編集" style="cursor:pointer">${esc(b.note || '') || '<span class="muted">—</span>'}</td>
      <td class="actions">
        <button class="btn small primary" data-bk="restore" data-id="${esc(b.id)}">参加したまま復元</button>
        <button class="btn small" data-bk="restoreStd" data-id="${esc(b.id)}">通常復元</button>
        <a class="btn small ghost" href="/api/backups/${encodeURIComponent(b.id)}/download">DL</a>
        <button class="btn small ghost" data-bk="pin" data-pinned="${b.pinned ? 1 : 0}" data-id="${esc(b.id)}">${b.pinned ? 'ピン解除' : 'ピン'}</button>
        <button class="btn small danger ghost" data-bk="del" data-id="${esc(b.id)}">削除</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">バックアップはまだありません</td></tr>';
  api('GET', '/api/backups/stats').then((st) => {
    $('#bkStats').textContent = `ストア使用量 ${fmtBytes(st.storeBytes)} ・ 形式 ${st.format === 'cas' ? '重複排除' : 'tar'} (${st.compression})`;
  }).catch(() => {});
}
$('#bkBody').addEventListener('click', guard(async (e) => {
  const n = e.target.closest('[data-note]');
  if (n) {
    const v = prompt('メモ', n.textContent === '—' ? '' : n.textContent);
    if (v === null) return;
    await api('POST', `/api/backups/${n.dataset.note}/note`, { note: v });
    return loadBackups();
  }
  const b = e.target.closest('[data-bk]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.bk === 'restore') {
    if (!confirm(`このバックアップに戻しますか？\n${id}\n参加者は待機サーバーへ移動し、復元後に自動で戻ります。現在のワールドは退避されます。`)) return;
    await api('POST', `/api/backups/${id}/restore`, { standard: false });
  } else if (b.dataset.bk === 'restoreStd') {
    if (!confirm(`全員切断して復元しますか？\n${id}`)) return;
    await api('POST', `/api/backups/${id}/restore`, { standard: true });
  } else if (b.dataset.bk === 'pin') {
    await api('POST', `/api/backups/${id}/pin`, { pinned: b.dataset.pinned !== '1' });
    loadBackups();
  } else if (b.dataset.bk === 'del') {
    if (!confirm(`削除しますか？\n${id}`)) return;
    await api('DELETE', `/api/backups/${id}`);
    loadBackups();
  }
}));
$('#bkCreate').addEventListener('click', guard(async () => {
  await api('POST', '/api/backups', { note: $('#bkNote').value });
  $('#bkNote').value = '';
  toast('バックアップを開始しました（参加者はそのまま遊べます）');
}));
$('#bkUpload').addEventListener('change', guard(async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  toast(`アップロード中… ${f.name}`);
  await api('POST', `/api/backups/upload?name=${encodeURIComponent(f.name)}`, undefined, f);
  e.target.value = '';
  toast('アップロードしました');
  loadBackups();
}));

// ---------- properties ----------
let propsCache = [];
async function loadProps() {
  try {
    propsCache = await api('GET', '/api/properties');
  } catch (e) {
    return toast(e.message, true);
  }
  renderProps();
}
function renderProps() {
  const f = $('#propFilter').value.toLowerCase();
  $('#propBody').innerHTML = propsCache.filter((p) => !f || p.key.includes(f) || p.comment.toLowerCase().includes(f)).map((p) => {
    const isBool = p.value === 'true' || p.value === 'false';
    const input = isBool
      ? `<select data-key="${esc(p.key)}"><option ${p.value === 'true' ? 'selected' : ''}>true</option><option ${p.value === 'false' ? 'selected' : ''}>false</option></select>`
      : `<input data-key="${esc(p.key)}" value="${esc(p.value)}">`;
    return `<tr><td><code>${esc(p.key)}</code></td><td style="min-width:200px">${input}</td><td class="desc">${esc(p.comment)}</td></tr>`;
  }).join('');
}
$('#propFilter').addEventListener('input', renderProps);
async function saveProps() {
  const updates = {};
  $$('#propBody [data-key]').forEach((el) => {
    const old = propsCache.find((p) => p.key === el.dataset.key);
    if (old && old.value !== el.value) updates[el.dataset.key] = el.value;
  });
  if (!Object.keys(updates).length) {
    toast('変更はありません');
    return false;
  }
  await api('PUT', '/api/properties', { updates });
  toast(`${Object.keys(updates).length} 件保存しました`);
  await loadProps();
  return true;
}
$('#propSave').addEventListener('click', guard(saveProps));
$('#propSaveRestart').addEventListener('click', guard(async () => {
  await saveProps();
  await api('POST', '/api/main/restart', { standard: false });
}));

// ---------- mods ----------
async function loadMods() {
  try {
    const mods = await api('GET', '/api/mods');
    $('#modBody').innerHTML = mods.map((m) => `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.version)}</td><td class="muted">${esc(m.type)}</td><td class="desc">${esc(m.description)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">なし</td></tr>';
  } catch (e) {
    toast(e.message, true);
  }
}
async function lip(action, pkg) {
  if (!confirm(`lip ${action} ${pkg}\n起動中なら参加者を待機サーバーへ移してから実行します。よろしいですか？`)) return;
  await api('POST', '/api/lip', { action, package: pkg });
  toast('lip を実行しています（ダッシュボードのジョブに進捗が出ます）');
}
$$('[data-lip]').forEach((b) => b.addEventListener('click', guard(() => {
  const [action, pkg] = b.dataset.lip.split(' ');
  return lip(action, pkg);
})));
$('#lipForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  await lip($('#lipAction').value, $('#lipPkg').value.trim());
}));

// ---------- settings ----------
async function loadSettings() {
  const s = await api('GET', '/api/settings');
  $('#setHost').value = s.publicHost || '';
  $('#setInterval').value = s.backup.intervalMinutes;
  $('#setKeep').value = s.backup.keep;
  $('#setKeepDaily').value = s.backup.keepDaily;
  $('#setOnlyPlayers').checked = !!s.backup.onlyWhenPlayers;
  $('#setFormat').value = s.backup.format === 'tar' ? 'tar' : 'cas';
  $('#setOffRemote').value = s.backup.offsite?.remote || '';
  $('#setOffOn').checked = !!s.backup.offsite?.enabled;
  $('#setDaily').value = s.schedule.dailyRestart || '';
  $('#setWarn').value = s.schedule.restartWarnSeconds;
  $('#setLimbo').value = s.limbo.mode;
  $('#setAutoStart').checked = !!s.main.autoStart;
  $('#setAutoRestart').checked = s.main.autoRestart !== false;
}
$('#setForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  await api('PUT', '/api/settings', {
    publicHost: $('#setHost').value.trim(),
    backup: { intervalMinutes: $('#setInterval').value, keep: $('#setKeep').value, keepDaily: $('#setKeepDaily').value, onlyWhenPlayers: $('#setOnlyPlayers').checked, format: $('#setFormat').value, offsite: { enabled: $('#setOffOn').checked, remote: $('#setOffRemote').value.trim() } },
    schedule: { dailyRestart: $('#setDaily').value.trim(), restartWarnSeconds: $('#setWarn').value },
    limbo: { mode: $('#setLimbo').value },
    main: { autoStart: $('#setAutoStart').checked, autoRestart: $('#setAutoRestart').checked },
  });
  toast('保存しました');
  refreshState();
}));
$('#pwForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  await api('POST', '/api/password', { current: $('#pwCur').value, next: $('#pwNew').value });
  toast('変更しました。再ログインしてください');
  setTimeout(() => location.reload(), 1200);
}));

// ---------- metrics ----------
function spark(svg, pts, key, { max, fmt }) {
  const el = $(svg);
  const vals = pts.map((p) => p[key]).filter((v) => v !== null && v !== undefined);
  if (pts.length < 2 || !vals.length) {
    el.innerHTML = '<text x="150" y="45" text-anchor="middle" fill="#8b93a3" font-size="11">データなし</text>';
    return null;
  }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const top = max ?? (Math.max(...vals) * 1.15 || 1);
  const x = (t) => ((t - t0) / (t1 - t0 || 1)) * 300;
  const y = (v) => 78 - (Math.min(v, top) / top) * 74;
  let d = '';
  let started = false;
  for (const p of pts) {
    const v = p[key];
    if (v === null || v === undefined) { started = false; continue; }
    d += `${started ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(v).toFixed(1)} `;
    started = true;
  }
  const last = vals[vals.length - 1];
  el.innerHTML = `<line class="gd" x1="0" x2="300" y1="${y(top / 2)}" y2="${y(top / 2)}"/><path class="ln" d="${d}"/>`;
  return fmt(last);
}
async function loadMetrics() {
  if (!S.state) return;
  let m;
  try {
    m = await api('GET', `/api/metrics?range=${$('#mRange').value}`);
  } catch {
    return;
  }
  const pts = m.main;
  $('#cTpsV').textContent = spark('#cTps', pts, 'tps', { max: 20, fmt: (v) => v.toFixed(1) }) || '';
  $('#cMemV').textContent = spark('#cMem', pts, 'rss', { fmt: fmtBytes }) || '';
  $('#cCpuV').textContent = spark('#cCpu', pts, 'cpu', { max: 100, fmt: (v) => `${v.toFixed(0)}%` }) || '';
  $('#cPlV').textContent = spark('#cPl', pts, 'players', { fmt: (v) => `${v}人` }) || '';
}
$('#mRange').addEventListener('change', loadMetrics);

// ---------- chat ----------
function appendChat(c) {
  const el = $('#chatLog');
  const div = document.createElement('div');
  const web = c.name.startsWith('[Web]');
  div.innerHTML = `<span class="t">${new Date(c.t).toLocaleTimeString('ja-JP')}</span> ${c.world ? `<span class="t">[${esc(dimName(null, c.world))}]</span> ` : ''}<span class="${web ? 'web' : 'who'}">${esc(c.name)}</span>: ${esc(c.message)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}
async function loadChat() {
  S.chat = await api('GET', '/api/chat').catch(() => S.chat);
  $('#chatLog').innerHTML = '';
  S.chat.forEach(appendChat);
}
$('#chatForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (!v) return;
  await api('POST', '/api/chat', { message: v, from: $('#chatFrom').value.trim() || '管理者' });
  $('#chatInput').value = '';
}));

// ---------- player history ----------
let historyCache = [];
async function loadHistory() {
  historyCache = await api('GET', '/api/players/history').catch(() => historyCache);
  renderHistory();
}
function renderHistory() {
  const f = $('#phFilter').value.toLowerCase();
  $('#phBody').innerHTML = historyCache.filter((p) => !f || p.name.toLowerCase().includes(f) || (p.xuid || '').includes(f)).slice(0, 300).map((p) => `<tr>
    <td><b>${esc(p.name)}</b>${p.online ? ' <span class="badge running">オンライン</span>' : ''}${p.names?.length > 1 ? ` <span class="muted small">(旧: ${esc(p.names.filter((n) => n !== p.name).join(', '))})</span>` : ''}</td>
    <td class="muted">${esc(p.xuid)}</td><td class="muted">${fmtDate(p.firstSeen)}</td><td>${p.lastSeen ? fmtDate(p.lastSeen) : '-'}</td>
    <td>${fmtDur(p.totalMs)}</td><td>${p.sessions}</td>
    <td class="small">${favWorld(p)}</td>
    <td class="actions"><button class="btn small danger ghost" data-hban="${esc(p.name)}" data-xuid="${esc(p.xuid)}">BAN</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">まだ記録がありません</td></tr>';
}
function favWorld(p) {
  const ent = Object.entries(p.worldMs || {}).sort((a, b) => b[1] - a[1]);
  if (!ent.length) return '<span class="muted">-</span>';
  const total = ent.reduce((a, [, v]) => a + v, 0) || 1;
  return ent.slice(0, 2).map(([w, v]) => `${esc(dimName(null, w))} <span class="muted">${Math.round((v / total) * 100)}%</span>`).join('<br>');
}
$('#phFilter').addEventListener('input', renderHistory);
$('#phBody').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('[data-hban]');
  if (b) await banPrompt(b.dataset.hban, b.dataset.xuid);
}));
async function banPrompt(name, xuid) {
  const reason = prompt(`${name} を BAN します。理由:`, '');
  if (reason === null) return;
  const min = prompt('期間（分）。0 または空で無期限', '0');
  if (min === null) return;
  await api('POST', '/api/access/ban', { name, xuid, reason, minutes: parseInt(min, 10) || 0 });
  toast(`${name} を BAN しました`);
  if (S.view === 'access') loadAccess();
}

// ---------- access ----------
async function loadAccess() {
  const a = await api('GET', '/api/access');
  $('#acMaint').checked = a.maintenance;
  $('#acMaintMsg').value = a.maintenanceMessage;
  $('#acAllow').value = (a.maintenanceAllow || []).join('\n');
  $('#acWelcome').value = a.welcomeMessage;
  renderBans(a.bans || []);
  S.roles = a.roles || [];
  renderRoles();
}
function renderRoles() {
  $('#roleBody').innerHTML = S.roles.map((r, i) => `<tr data-ri="${i}"><td><input data-rk="name" value="${esc(r.name)}" placeholder="staff" size="14"></td>
    <td><textarea data-rk="members" rows="2" placeholder="Steve&#10;Alex">${esc((r.members || []).join('\n'))}</textarea></td>
    <td class="actions"><button class="btn small danger ghost" data-rdel="${i}">削除</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">グループはありません</td></tr>';
}
function collectRoles() {
  return $$('#roleBody tr[data-ri]').map((tr) => ({ name: $('[data-rk=name]', tr).value.trim(), members: $('[data-rk=members]', tr).value.split('\n').map((x) => x.trim()).filter(Boolean) }));
}
$('#roleAdd').addEventListener('click', () => {
  S.roles = [...collectRoles(), { name: '', members: [] }];
  renderRoles();
});
$('#roleBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rdel]');
  if (!b) return;
  S.roles = collectRoles();
  S.roles.splice(+b.dataset.rdel, 1);
  renderRoles();
});
$('#roleSave').addEventListener('click', guard(async () => {
  const r = await api('PUT', '/api/access', { roles: collectRoles() });
  S.roles = r.roles;
  renderRoles();
  toast('権限グループを保存しました');
}));
function renderBans(bans) {
  const now = Date.now() / 1000;
  $('#banBody').innerHTML = bans.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td class="muted">${esc(b.xuid)}</td><td class="desc">${esc(b.reason)}</td>
    <td>${b.until ? (b.until < now ? '<span class="muted">期限切れ</span>' : fmtDate(b.until * 1000)) : '無期限'}</td>
    <td class="actions"><button class="btn small" data-unban="${esc(b.name)}" data-xuid="${esc(b.xuid)}">解除</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">BAN はありません</td></tr>';
}
$('#acSave').addEventListener('click', guard(async () => {
  await api('PUT', '/api/access', { maintenance: $('#acMaint').checked, maintenanceMessage: $('#acMaintMsg').value, maintenanceAllow: $('#acAllow').value, welcomeMessage: $('#acWelcome').value });
  toast('保存して反映しました');
  refreshState();
}));
$('#banForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const r = await api('POST', '/api/access/ban', { name: $('#banName').value.trim(), xuid: $('#banXuid').value.trim(), reason: $('#banReason').value, minutes: $('#banMin').value });
  renderBans(r.bans);
  e.target.reset();
}));
$('#banBody').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('[data-unban]');
  if (!b) return;
  const r = await api('POST', '/api/access/unban', { name: b.dataset.unban, xuid: b.dataset.xuid });
  renderBans(r.bans);
}));
$('#maintOffQuick').addEventListener('click', guard(async () => {
  await api('POST', '/api/access/maintenance', { on: false });
  toast('メンテナンスを解除しました');
  refreshState();
}));

// ---------- tasks ----------
const KIND_JA = { command: 'コマンド', say: '告知 (tellraw)', title: 'タイトル表示', motd: 'MOTD ローテーション', backup: 'バックアップ', restart: '再起動', resetWorld: 'ワールドリセット' };
const KIND_HINT = { command: '1行1コマンド（/ 不要）', say: '1行ずつ全員に表示', title: '1行目=タイトル 2行目=サブタイトル', motd: '1行ずつ順番にサーバー一覧の表示名を切替', backup: 'メモ（任意）', restart: '空=参加したまま / standard=全員切断', resetWorld: '1行1ワールド（例: levikit:resource）。後ろに random で毎回新しいシード' };
const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
async function loadTasks() {
  const r = await api('GET', '/api/tasks');
  S.tasks = r.tasks;
  renderTasks();
}
function renderTasks() {
  $('#taskBody').innerHTML = S.tasks.map((t, i) => {
    const s = t.schedule;
    return `<div class="task" data-i="${i}">
      <input type="checkbox" data-k="enabled" ${t.enabled ? 'checked' : ''} title="有効">
      <input data-k="name" value="${esc(t.name)}" placeholder="名前">
      <select data-k="kind">${Object.keys(KIND_JA).map((k) => `<option value="${k}" ${k === t.kind ? 'selected' : ''}>${KIND_JA[k]}</option>`).join('')}</select>
      <div class="sch">
        <select data-k="stype"><option value="interval" ${s.type === 'interval' ? 'selected' : ''}>間隔</option><option value="daily" ${s.type === 'daily' ? 'selected' : ''}>毎日</option></select>
        ${s.type === 'interval' ? `<input type="number" min="1" data-k="minutes" value="${s.minutes}">分ごと` : `<input class="time" data-k="time" value="${esc(s.time)}" placeholder="HH:MM">
        <div class="days">${DAYS.map((d, n) => `<label>${d}<input type="checkbox" data-day="${n}" ${!s.days.length || s.days.includes(n) ? 'checked' : ''}></label>`).join('')}</div>`}
      </div>
      <textarea data-k="value" rows="2" placeholder="${esc(KIND_HINT[t.kind])}">${esc(t.value)}</textarea>
      <div class="btns" style="flex-direction:column"><button class="btn small" data-run="${esc(t.id)}">今すぐ</button><button class="btn small danger ghost" data-tdel="${i}">削除</button></div>
      <div class="meta"><label class="chk"><input type="checkbox" data-k="onlyWhenPlayers" ${t.onlyWhenPlayers ? 'checked' : ''}> 誰か居るときだけ</label><span>前回: ${t.lastRun ? fmtDate(t.lastRun) : '-'}</span></div>
    </div>`;
  }).join('') || '<p class="muted">タスクはありません。例: 30分ごとに「{online}人が遊んでいます」と告知、毎日4:50に再起動、MOTD を交互に切り替え など</p>';
}
function collectTasks() {
  return $$('#taskBody .task').map((el) => {
    const t = { ...S.tasks[+el.dataset.i] };
    const g = (k) => el.querySelector(`[data-k=${k}]`);
    t.enabled = g('enabled').checked;
    t.name = g('name').value;
    t.kind = g('kind').value;
    t.value = g('value').value;
    t.onlyWhenPlayers = g('onlyWhenPlayers').checked;
    const type = g('stype').value;
    if (type === 'interval') t.schedule = { type, minutes: g('minutes') ? +g('minutes').value : 30 };
    else {
      const days = $$('[data-day]', el).filter((c) => c.checked).map((c) => +c.dataset.day);
      t.schedule = { type, time: g('time') ? g('time').value : '05:00', days: days.length === 7 ? [] : days };
    }
    return t;
  });
}
$('#taskBody').addEventListener('change', (e) => {
  if (e.target.dataset.k === 'stype' || e.target.dataset.k === 'kind') {
    S.tasks = collectTasks();
    renderTasks();
  }
});
$('#taskBody').addEventListener('click', guard(async (e) => {
  const d = e.target.closest('[data-tdel]');
  if (d) {
    S.tasks = collectTasks();
    S.tasks.splice(+d.dataset.tdel, 1);
    return renderTasks();
  }
  const r = e.target.closest('[data-run]');
  if (r) {
    await api('POST', `/api/tasks/${r.dataset.run}/run`);
    toast('実行しました');
  }
}));
$('#taskAdd').addEventListener('click', () => {
  S.tasks = collectTasks();
  S.tasks.push({ name: '定期告知', enabled: true, kind: 'say', value: '§a現在 {online} 人がプレイ中！ §7/dim でワールド切替', onlyWhenPlayers: true, schedule: { type: 'interval', minutes: 30 } });
  renderTasks();
});
$('#taskSave').addEventListener('click', guard(async () => {
  const r = await api('PUT', '/api/tasks', { tasks: collectTasks() });
  S.tasks = r.tasks;
  renderTasks();
  toast('保存しました');
}));

// ---------- files ----------
async function loadFiles(p) {
  const r = await api('GET', `/api/files?path=${encodeURIComponent(p)}`);
  S.filePath = r.path;
  $('#fPath').textContent = '/' + r.path;
  const up = r.path ? `<div class="fi" data-dir="${esc(r.path.split('/').slice(0, -1).join('/'))}">📁 ..</div>` : '';
  $('#fList').innerHTML = up + r.entries.map((e) => {
    const full = r.path ? `${r.path}/${e.name}` : e.name;
    return e.dir ? `<div class="fi" data-dir="${esc(full)}">📁 ${esc(e.name)}</div>`
      : `<div class="fi ${e.editable ? '' : 'dis'}" ${e.editable ? `data-file="${esc(full)}"` : ''}>📄 ${esc(e.name)} <small>${fmtBytes(e.size)}</small></div>`;
  }).join('');
}
$('#fList').addEventListener('click', guard(async (e) => {
  const d = e.target.closest('[data-dir]');
  if (d) return loadFiles(d.dataset.dir);
  const f = e.target.closest('[data-file]');
  if (!f) return;
  const r = await api('GET', `/api/file?path=${encodeURIComponent(f.dataset.file)}`);
  S.file = { path: f.dataset.file, mtime: r.mtime };
  $('#fName').textContent = f.dataset.file;
  $('#fText').value = r.content;
  $('#fText').disabled = false;
  $('#fSave').disabled = false;
}));
$('#fSave').addEventListener('click', guard(async () => {
  if (!S.file) return;
  const r = await api('PUT', '/api/file', { path: S.file.path, content: $('#fText').value, mtime: S.file.mtime });
  S.file.mtime = r.mtime;
  toast('保存しました（多くの Mod は再起動で反映）');
}));

// ---------- audit ----------
async function loadAudit() {
  const list = await api('GET', '/api/audit');
  $('#auBody').innerHTML = list.map((a) => `<tr><td>${fmtDate(a.t)}</td><td class="muted">${esc(a.ip)}</td><td><code>${esc(a.action)}</code></td><td class="desc">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">記録なし</td></tr>';
}

// ---------- boot ----------
async function boot() {
  try {
    await api('GET', '/api/me');
  } catch {
    return showLogin();
  }
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  connect();
  setInterval(() => S.state && renderDash(), 5000);
  loadMetrics();
  setInterval(() => S.view === 'dash' && loadMetrics(), 30000);
  api('GET', '/api/dimensions').then((d) => (S.dims = d)).catch(() => {});
}
boot();

// ---------- マップ / タイムマシン ----------
const M = { maps: [], img: null, meta: null, diff: null, sel: null, pos: { players: [] }, view: { s: 1, x: 0, y: 0 }, drag: null };
TYPE_JA.snapshot = 'マップ用';

async function loadPapyrus() {
  try {
    const p = await api('GET', '/api/papyrus');
    $('#papRender').disabled = !p.installed;
    $('#papList').innerHTML = !p.installed
      ? 'PapyrusCS は入っていません。GitHub Actions でビルドした papyruscs-linux-x64.zip を <code>install.sh --papyrus-zip</code> で導入すると使えます。'
      : p.maps.map((m) => `<div>🗺 <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(dimName(null, m.world))}</a> <span class="muted">${fmtDate(m.createdAt)} の状態</span></div>`).join('') || 'まだ描いていません';
  } catch {
    /* ignore */
  }
}
$('#papRender').addEventListener('click', guard(async () => {
  await api('POST', '/api/papyrus/render', { world: $('#mapWorld').value });
  toast('PapyrusCS で描画を開始しました（大きなワールドは時間がかかります）');
}));

async function loadMapView(result) {
  loadPapyrus();
  const [maps, bks, dims] = await Promise.all([api('GET', '/api/maps'), api('GET', '/api/backups'), api('GET', '/api/dimensions')]);
  M.maps = maps;
  M.backups = bks.filter((b) => b.instance === 'main').sort((a, b) => b.createdAt - a.createdAt);
  const worlds = [['overworld', 'オーバーワールド'], ['nether', 'ネザー'], ['the_end', 'ジ・エンド'], ...dims.kit.dimensions.map((d) => [d.name, d.displayName || d.name])];
  const cur = result?.world || $('#mapWorld').value || 'overworld';
  $('#mapWorld').innerHTML = worlds.map(([k, n]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  fillMapTimes(result?.backupId);
}

function fillMapTimes(selectId) {
  const w = $('#mapWorld').value;
  const drawn = new Set(M.maps.filter((m) => m.world === w).map((m) => m.backupId));
  const opt = (b, sel) => `<option value="${esc(b.id)}" ${sel ? 'selected' : ''}>${fmtDate(b.createdAt)} ${drawn.has(b.id) ? '🗺' : ''} ${esc(TYPE_JA[b.type] || b.type)}${b.note ? ' · ' + esc(b.note.slice(0, 24)) : ''}</option>`;
  const prev = selectId || $('#mapAt').value || M.maps.find((m) => m.world === w)?.backupId;
  $('#mapAt').innerHTML = M.backups.map((b) => opt(b, b.id === prev)).join('') || '<option value="">（バックアップなし）</option>';
  $('#mapCmp').innerHTML = '<option value="">（比べない）</option>' + M.backups.filter((b) => drawn.has(b.id)).map((b) => opt(b, false)).join('');
  $('#mapRbFrom').innerHTML = M.backups.map((b) => opt(b, false)).join('');
  showMap();
}

async function showMap() {
  const w = $('#mapWorld').value;
  const id = $('#mapAt').value;
  const has = M.maps.some((m) => m.world === w && m.backupId === id);
  $('#mapEmpty').style.display = has ? 'none' : 'flex';
  $('#mapEmpty').textContent = has ? '' : id ? 'この時点の地図はまだありません。「この時点を描く」を押してください。' : '「📷 今の状態を撮る」を押してください。';
  M.img = null;
  M.meta = null;
  M.diff = null;
  if (!has) return drawMap();
  const file = `${id}/${w.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  M.meta = await api('GET', `/api/maps/${file}.json`);
  const img = new Image();
  img.src = `/api/maps/${file}.png`;
  await img.decode().catch(() => {});
  M.img = img;
  fitMap();
  await loadDiff();
}

async function loadDiff() {
  const cmp = $('#mapCmp').value;
  M.diff = null;
  if (cmp && M.meta) {
    try {
      M.diff = await api('GET', `/api/maps/diff?world=${encodeURIComponent($('#mapWorld').value)}&a=${encodeURIComponent(cmp)}&b=${encodeURIComponent($('#mapAt').value)}`);
    } catch (e) {
      toast(e.message, true);
    }
  }
  const d = M.diff;
  $('#mapLegend').innerHTML = d ? `<span style="color:#ff5a5a">■</span> 変わったチャンク ${d.changed.length}　<span style="color:#4fd1ff">■</span> 新しく生成 ${d.added.length}　<span style="color:#aaa">■</span> 消えた ${d.removed.length}` : '';
  drawMap();
}

function fitMap() {
  const c = $('#mapCanvas');
  if (!M.img) return;
  const s = Math.min(c.clientWidth / M.img.width, c.clientHeight / M.img.height) || 1;
  M.view = { s, x: (c.clientWidth - M.img.width * s) / 2, y: (c.clientHeight - M.img.height * s) / 2 };
}

// 画面座標 ⇔ ブロック座標
const toBlock = (px, py) => ({ x: (px - M.view.x) / M.view.s + M.meta.minCX * 16, z: (py - M.view.y) / M.view.s + M.meta.minCZ * 16 });
const toScreen = (bx, bz) => ({ x: (bx - M.meta.minCX * 16) * M.view.s + M.view.x, y: (bz - M.meta.minCZ * 16) * M.view.s + M.view.y });

function drawMap() {
  const c = $('#mapCanvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, c.clientWidth, c.clientHeight);
  if (!M.img || !M.meta) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(M.img, M.view.x, M.view.y, M.img.width * M.view.s, M.img.height * M.view.s);
  const cs = 16 * M.view.s;
  const rect = (id, color) => {
    const [x, z] = id.split(',').map(Number);
    const p = toScreen(x * 16, z * 16);
    g.fillStyle = color;
    g.fillRect(p.x, p.y, cs, cs);
  };
  if (M.diff) {
    M.diff.changed.forEach((id) => rect(id, 'rgba(255,70,70,.45)'));
    M.diff.added.forEach((id) => rect(id, 'rgba(60,200,255,.35)'));
    M.diff.removed.forEach((id) => rect(id, 'rgba(170,170,170,.45)'));
  }
  if (cs >= 10) {
    // チャンクの格子
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    for (let i = 0; i <= M.meta.widthChunks; i++) {
      const x = M.view.x + i * cs;
      g.moveTo(x, M.view.y);
      g.lineTo(x, M.view.y + M.meta.heightChunks * cs);
    }
    for (let i = 0; i <= M.meta.heightChunks; i++) {
      const y = M.view.y + i * cs;
      g.moveTo(M.view.x, y);
      g.lineTo(M.view.x + M.meta.widthChunks * cs, y);
    }
    g.stroke();
  }
  if (M.sel) {
    const a = toScreen(M.sel.x1 * 16, M.sel.z1 * 16);
    const b = toScreen((M.sel.x2 + 1) * 16, (M.sel.z2 + 1) * 16);
    g.fillStyle = 'rgba(255,220,60,.18)';
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.strokeStyle = '#ffd23c';
    g.lineWidth = 2;
    g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.lineWidth = 1;
  }
  if ($('#mapLive').checked) {
    const w = $('#mapWorld').value;
    g.font = '12px sans-serif';
    for (const p of M.pos.players || []) {
      if (p.w !== w) continue;
      const s = toScreen(p.x, p.z);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s.x, s.y, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3ddc84';
      g.beginPath();
      g.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(p.n, s.x + 8, s.y + 4);
    }
  }
  const n = M.sel ? (M.sel.x2 - M.sel.x1 + 1) * (M.sel.z2 - M.sel.z1 + 1) : 0;
  $('#mapSel').textContent = n ? `選択: ${n} チャンク（X ${M.sel.x1 * 16}〜${M.sel.x2 * 16 + 15} / Z ${M.sel.z1 * 16}〜${M.sel.z2 * 16 + 15}）` : '';
}

(() => {
  const c = $('#mapCanvas');
  const pt = (e) => {
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  c.addEventListener('mousedown', (e) => {
    if (!M.meta) return;
    const p = pt(e);
    if (e.shiftKey) {
      const b = toBlock(p.x, p.y);
      const cx = Math.floor(b.x / 16);
      const cz = Math.floor(b.z / 16);
      M.drag = { mode: 'sel', cx, cz };
      M.sel = { x1: cx, z1: cz, x2: cx, z2: cz };
    } else M.drag = { mode: 'pan', x: p.x, y: p.y, vx: M.view.x, vy: M.view.y };
    drawMap();
  });
  window.addEventListener('mousemove', (e) => {
    if (!M.meta) return;
    const p = pt(e);
    const b = toBlock(p.x, p.y);
    if (p.x >= 0 && p.y >= 0 && p.x <= c.clientWidth && p.y <= c.clientHeight) $('#mapInfo').textContent = `X ${Math.floor(b.x)} / Z ${Math.floor(b.z)}（チャンク ${Math.floor(b.x / 16)}, ${Math.floor(b.z / 16)}）　ドラッグで移動・ホイールで拡大・Shift+ドラッグで範囲選択`;
    if (!M.drag) return;
    if (M.drag.mode === 'pan') {
      M.view.x = M.drag.vx + p.x - M.drag.x;
      M.view.y = M.drag.vy + p.y - M.drag.y;
    } else {
      const cx = Math.floor(b.x / 16);
      const cz = Math.floor(b.z / 16);
      M.sel = { x1: Math.min(M.drag.cx, cx), z1: Math.min(M.drag.cz, cz), x2: Math.max(M.drag.cx, cx), z2: Math.max(M.drag.cz, cz) };
    }
    drawMap();
  });
  window.addEventListener('mouseup', () => (M.drag = null));
  c.addEventListener('wheel', (e) => {
    if (!M.meta) return;
    e.preventDefault();
    const p = pt(e);
    const f = e.deltaY < 0 ? 1.25 : 0.8;
    const ns = Math.min(32, Math.max(0.05, M.view.s * f));
    M.view.x = p.x - ((p.x - M.view.x) * ns) / M.view.s;
    M.view.y = p.y - ((p.y - M.view.y) * ns) / M.view.s;
    M.view.s = ns;
    drawMap();
  }, { passive: false });
  window.addEventListener('resize', () => S.view === 'map' && drawMap());
})();

$('#mapWorld').addEventListener('change', () => fillMapTimes());
$('#mapAt').addEventListener('change', showMap);
$('#mapCmp').addEventListener('change', loadDiff);
$('#mapLive').addEventListener('change', drawMap);
$('#mapClear').addEventListener('click', () => {
  M.sel = null;
  drawMap();
});
$('#mapShoot').addEventListener('click', guard(async () => {
  await api('POST', '/api/maps/render', { world: $('#mapWorld').value });
  toast('スナップショットを撮って描画しています（参加したまま）');
}));
$('#mapRender').addEventListener('click', guard(async () => {
  const id = $('#mapAt').value;
  if (!id) return toast('時点を選んでください', true);
  await api('POST', '/api/maps/render', { world: $('#mapWorld').value, backupId: id });
  toast('描画を開始しました');
}));
$('#mapRollback').addEventListener('click', guard(async () => {
  if (!M.sel) return toast('Shift+ドラッグで範囲を選んでください', true);
  const from = $('#mapRbFrom').value;
  const b = M.backups.find((x) => x.id === from);
  if (!b) return toast('戻す時点を選んでください', true);
  const chunks = [];
  for (let x = M.sel.x1; x <= M.sel.x2; x++) for (let z = M.sel.z1; z <= M.sel.z2; z++) chunks.push([x, z]);
  const r = await modal('選択範囲を過去に戻す', `
    <p><b>${chunks.length} チャンク</b>（X ${M.sel.x1 * 16}〜${M.sel.x2 * 16 + 15} / Z ${M.sel.z1 * 16}〜${M.sel.z2 * 16 + 15}）を、<b>${fmtDate(b.createdAt)}</b> の状態に戻します。</p>
    <p>地形・建物・チェストの中身・そこにいた動物などが当時の状態になります。<b>範囲の外・他のワールド・プレイヤーの持ち物はそのまま</b>です。</p>
    <div class="opt"><label class="chk"><input type="checkbox" id="rbStd"> 待機サーバーを使わない（全員切断）</label></div>
    <div class="warnbox">先に今の状態を自動でバックアップします。参加者は待機サーバーへ移動し、数十秒で自動で戻ります。</div>`, [
    { label: 'キャンセル', value: null },
    { label: '戻す', cls: 'danger', value: 'ok' },
  ]);
  if (r.value !== 'ok') return;
  await api('POST', '/api/maps/rollback', { world: $('#mapWorld').value, backupId: from, chunks, standard: $('#rbStd', r.root).checked });
  toast('範囲ロールバックを開始しました');
}));

$('#map3d').addEventListener('click', () => {
  if (!M.meta) return toast('先に地図を描いてください', true);
  let bx, bz;
  if (M.sel) {
    bx = ((M.sel.x1 + M.sel.x2 + 1) / 2) * 16;
    bz = ((M.sel.z1 + M.sel.z2 + 1) / 2) * 16;
  } else {
    const c = $('#mapCanvas');
    const b = toBlock(c.clientWidth / 2, c.clientHeight / 2);
    bx = b.x;
    bz = b.z;
  }
  window.open(`/viewer.html?w=${encodeURIComponent($('#mapWorld').value)}&x=${Math.floor(bx)}&z=${Math.floor(bz)}`, '_blank', 'noopener');
});

// ---------- アドオン / スクリプト ----------
const A = { data: null, exp: {} };
async function loadAddons() {
  A.data = await api('GET', '/api/addons');
  A.exp = { ...A.data.experiments };
  $('#adLevel').textContent = `ワールド: ${A.data.level}`;
  renderPacks();
  renderExp();
  $('#adMods').innerHTML = [...new Set([...Object.keys(A.data.scriptModules), ...A.data.permissions])]
    .map((m) => `<label class="chk"><input type="checkbox" data-mod="${esc(m)}" ${A.data.permissions.includes(m) ? 'checked' : ''}> <span><code>${esc(m)}</code> ${esc(A.data.scriptModules[m] || '')}</span></label>`)
    .join('');
  $('#adTexReq').checked = A.data.texturepackRequired;
}
function renderPacks() {
  for (const [t, el] of [['behavior', '#adBeh'], ['resource', '#adRes']]) {
    const list = A.data.packs.filter((p) => p.type === t).sort((a, b) => (a.enabled === b.enabled ? (a.enabled ? a.order - b.order : a.name.localeCompare(b.name)) : a.enabled ? -1 : 1));
    $(el).innerHTML = list.map((p) => `<tr data-uuid="${esc(p.uuid)}" data-type="${t}">
      <td><input type="checkbox" data-en ${p.enabled ? 'checked' : ''}></td>
      <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.description.slice(0, 120))}</div></td>
      <td class="small">${p.scripts ? `スクリプト<div class="muted">${esc(p.scriptModules.join(', '))}</div>` : t === 'resource' ? 'リソース' : 'データ'}</td>
      <td class="small">${esc(Array.isArray(p.version) ? p.version.join('.') : p.version)}</td>
      <td class="small">${p.builtin ? '<span class="badge">標準</span>' : p.where === 'world' ? 'ワールド内' : 'サーバー'}</td>
      <td class="actions">${p.enabled ? '<button class="btn small" data-up>↑</button><button class="btn small" data-down>↓</button>' : ''}${p.builtin || p.where === 'world' ? '' : `<button class="btn small danger ghost" data-rm="${esc(p.dir)}">削除</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">ありません</td></tr>';
  }
}
function renderExp() {
  const keys = [...new Set([...Object.keys(A.data.knownExperiments), ...Object.keys(A.exp)])].filter((k) => !['experiments_ever_used', 'saved_with_toggled_experiments'].includes(k));
  $('#adExp').innerHTML = keys.map((k) => `<label class="chk"><input type="checkbox" data-exp="${esc(k)}" ${A.exp[k] ? 'checked' : ''}> <span><code>${esc(k)}</code> ${esc(A.data.knownExperiments[k] || '')}</span></label>`).join('');
}
function enabledList(t) {
  return $$(`${t === 'behavior' ? '#adBeh' : '#adRes'} tr[data-uuid]`)
    .filter((tr) => $('[data-en]', tr).checked)
    .map((tr) => {
      const p = A.data.packs.find((x) => x.uuid === tr.dataset.uuid && x.type === t);
      return { uuid: p.uuid, version: p.version };
    });
}
for (const el of ['#adBeh', '#adRes']) {
  $(el).addEventListener('click', guard(async (e) => {
    const tr = e.target.closest('tr[data-uuid]');
    if (!tr) return;
    if (e.target.matches('[data-up],[data-down]')) {
      const sib = e.target.matches('[data-up]') ? tr.previousElementSibling : tr.nextElementSibling;
      if (sib && $('[data-en]', sib)?.checked) e.target.matches('[data-up]') ? sib.before(tr) : sib.after(tr);
    }
    if (e.target.matches('[data-rm]')) {
      if (!confirm('このパックをサーバーから削除しますか？')) return;
      await api('POST', '/api/addons/remove', { type: tr.dataset.type, dir: e.target.dataset.rm });
      toast('削除しました（「反映」で再起動）');
      loadAddons();
    }
  }));
}
$('#adExp').addEventListener('change', (e) => {
  if (e.target.dataset.exp) A.exp[e.target.dataset.exp] = e.target.checked;
});
$('#adExpAdd').addEventListener('click', () => {
  const k = $('#adExpNew').value.trim();
  if (!/^[a-z0-9_]{1,64}$/.test(k)) return toast('英小文字・数字・_ で入力してください', true);
  A.exp[k] = true;
  $('#adExpNew').value = '';
  renderExp();
});
$('#adUpload').addEventListener('click', guard(async () => {
  const f = $('#adFile').files[0];
  if (!f) return toast('ファイルを選んでください', true);
  const r = await uploadWithProgress(`/api/addons/upload?enable=${$('#adEnable').checked ? 1 : 0}`, f, () => {});
  toast(`取り込みました: ${r.installed.map((p) => p.name).join(', ')}（「保存して反映」で再起動）`);
  $('#adFile').value = '';
  loadAddons();
}));
$('#adApply').addEventListener('click', guard(async () => {
  for (const t of ['behavior', 'resource']) await api('PUT', '/api/addons/enabled', { type: t, list: enabledList(t) });
  await api('PUT', '/api/addons/permissions', { modules: $$('#adMods [data-mod]').filter((x) => x.checked).map((x) => x.dataset.mod) });
  const changed = Object.fromEntries(Object.entries(A.exp).filter(([k, v]) => !!A.data.experiments[k] !== !!v));
  await api('POST', '/api/addons/apply', { experiments: changed, texturepackRequired: $('#adTexReq').checked, standard: $('#adStd').checked });
  toast('反映を開始しました（ダッシュボードのジョブに進捗が出ます）');
}));
$('#adReload').addEventListener('click', guard(async () => {
  await api('POST', '/api/main/command', { command: 'reload' });
  toast('/reload を送りました（コンソールで結果を確認）');
}));
$('#adReloadAll').addEventListener('click', guard(async () => {
  await api('POST', '/api/main/command', { command: 'reload all' });
  toast('/reload all を送りました');
}));

// ---------- コンソールの補完（BDS のコマンド + LeviLamina / LeviKit） ----------
const BDS_COMMANDS = 'aimassist allowlist alwaysday ability camera camerashake changesetting clear clearspawnpoint clone connect controlscheme damage daylock deop dialogue difficulty effect enchant event execute fill fog function gamemode gamerule gametest give help hud inputpermission kick kill list locate loot me mobevent msg music op particle permission place playanimation playsound recipe reload reloadconfig replaceitem ride save say schedule scoreboard script scriptevent sendshowstoreoffer setblock setmaxplayers setworldspawn spawnpoint spreadplayers stop stopsound structure summon tag teleport tell tellraw testfor testforblock testforblocks tickingarea time title titleraw toggledownfall tp transfer volumearea w weather wsserver xp'.split(' ');
const KIT_COMMANDS = ['tpdim', 'levikit players', 'levikit dims', 'levikit save', 'levikit reload', 'levikit stats', 'save hold', 'save query', 'save resume', 'reload all', 'script debugger listen 19144', 'script profiler start', 'script profiler stop', 'allowlist add ', 'permission list'];
$('#cmdList').innerHTML = [...BDS_COMMANDS, ...KIT_COMMANDS].map((c) => `<option value="${esc(c)}">`).join('');

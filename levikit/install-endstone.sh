#!/usr/bin/env bash
# LeviKit（Endstone 版）インストーラー: Wine も C++ のビルドも要りません。
#   Endstone（Linux でそのまま動く BDS のプラグインローダー）+ endstone-levikit プラグイン + 同じ管理パネル。
#   LeviLamina 版との違い: ワールドはオーバーワールド・ネザー・ジ・エンドの 3 つ（追加ワールド・リセット・取り込み・複製・
#   マルチプロトコルはありません）。参加したままのバックアップ／復元／再起動、ワールドごとのルール、ワープ、/tpa、BAN、
#   メンテナンス、スケジュール、地図は同じです。
#
#   sudo ./install-endstone.sh --accept-eula --public-host 203.0.113.10
#   ./install-endstone.sh --accept-eula --root /tmp/levikit --no-service   # root なし・systemd なし（コンテナや試験用）
set -euo pipefail

ROOT=/opt/levikit
PUBLIC_HOST=""
PANEL_PORT=8080
PANEL_HOST=0.0.0.0
SERVER_NAME="LeviKit Server"
ACCEPT_EULA=0
SERVICE=1
ENDSTONE_SPEC="${ENDSTONE_SPEC:-endstone}"
SVC_USER=levikit

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --accept-eula) ACCEPT_EULA=1 ;;
    --public-host) PUBLIC_HOST="$2"; shift ;;
    --panel-port) PANEL_PORT="$2"; shift ;;
    --panel-host) PANEL_HOST="$2"; shift ;;
    --server-name) SERVER_NAME="$2"; shift ;;
    --root) ROOT="$2"; shift ;;
    --no-service) SERVICE=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; usage; exit 1 ;;
  esac
  shift
done
step() { echo; echo "==> $*"; }
die() { echo "[x] $*" >&2; exit 1; }

[[ $ACCEPT_EULA == 1 ]] || die "--accept-eula が必要です（Minecraft EULA https://www.minecraft.net/eula とプライバシーポリシーへの同意）"
[[ "$(uname -m)" == x86_64 ]] || die "x86_64 の Linux が必要です"
if [[ $SERVICE == 1 ]]; then
  [[ $EUID == 0 ]] || die "root で実行してください（sudo）。systemd を使わないなら --no-service"
  command -v systemctl >/dev/null || die "systemd がありません。--no-service を付けてください"
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || die "Node.js 20 以上が必要です（https://nodejs.org）"
PY="$(command -v python3 || true)"
[[ -n "$PY" ]] || die "python3（3.10 以上）と python3-venv が必要です"
command -v rsync >/dev/null || echo "[!] rsync がありません: 参加したままの再起動・復元（待機サーバー）に必要です（apt install rsync）"

step "フォルダーと Python の環境"
mkdir -p "$ROOT"/{instances/main,instances/limbo,backups,.tmp}
[[ -x "$ROOT/venv/bin/python" ]] || "$PY" -m venv "$ROOT/venv"
"$ROOT/venv/bin/pip" install --quiet --upgrade pip
"$ROOT/venv/bin/pip" install --quiet "$ENDSTONE_SPEC" build
ENDSTONE_VERSION="$("$ROOT/venv/bin/pip" show endstone | sed -n 's/^Version: //p')"
echo "Endstone $ENDSTONE_VERSION"

step "endstone-levikit プラグインをビルド"
rm -rf "$ROOT/.tmp/wheel"
"$ROOT/venv/bin/python" -m build --wheel --outdir "$ROOT/.tmp/wheel" "$HERE/endstone" >/dev/null
WHL="$(ls "$ROOT"/.tmp/wheel/endstone_levikit-*.whl)"

MAIN="$ROOT/instances/main"
mkdir -p "$MAIN/plugins"
rm -f "$MAIN"/plugins/endstone_levikit-*.whl
cp "$WHL" "$MAIN/plugins/"

step "初回起動（Endstone が対応する BDS を取得し、設定ファイルとワールドを作ります）"
if [[ ! -x "$MAIN/bedrock_server" || ! -f "$MAIN/server.properties" ]]; then
  ( cd "$MAIN" && ENDSTONE_USE_INTERACTIVE_CONSOLE=0 PYTHONUNBUFFERED=1 "$ROOT/venv/bin/endstone" --server-folder "$MAIN" --no-confirm --no-interactive > "$ROOT/.tmp/first-boot.log" 2>&1 ) &
  BOOT=$!
  for _ in $(seq 1 300); do
    grep -q "Server started\." "$ROOT/.tmp/first-boot.log" 2>/dev/null && break
    kill -0 $BOOT 2>/dev/null || { tail -20 "$ROOT/.tmp/first-boot.log"; die "初回起動に失敗しました（$ROOT/.tmp/first-boot.log）"; }
    sleep 2
  done
  grep -q "Server started\." "$ROOT/.tmp/first-boot.log" || { kill $BOOT 2>/dev/null || true; die "初回起動が終わりません（$ROOT/.tmp/first-boot.log）"; }
  grep -q "@@LEVIKIT READY" "$ROOT/.tmp/first-boot.log" || { kill $BOOT 2>/dev/null || true; die "endstone-levikit が読み込まれていません（$ROOT/.tmp/first-boot.log）"; }
  # 止める: Endstone と、その子の bedrock_server（終わるまで待つ。残っていれば強制終了）
  pkill -TERM -P $BOOT 2>/dev/null || true; kill -TERM $BOOT 2>/dev/null || true
  pkill -TERM -f "$MAIN/bedrock_server" 2>/dev/null || true
  for _ in $(seq 1 30); do pgrep -f "$MAIN/bedrock_server" >/dev/null || break; sleep 1; done
  pkill -KILL -f "$MAIN/bedrock_server" 2>/dev/null || true
  wait $BOOT 2>/dev/null || true
fi
setprop() { if grep -q "^$1=" "$MAIN/server.properties"; then sed -i "s|^$1=.*|$1=$2|" "$MAIN/server.properties"; else echo "$1=$2" >> "$MAIN/server.properties"; fi; }
setprop server-name "$SERVER_NAME"
setprop server-port 19132
setprop server-portv6 19133
echo '{"v":1}' > "$MAIN/.levikit-stamp"

step "管理パネル"
rm -rf "$ROOT/panel" && cp -r "$HERE/panel" "$ROOT/panel"
CFG="$ROOT/levikit.json"
if [[ ! -f "$CFG" ]]; then
  cat > "$CFG" <<EOF
{
  "root": "$ROOT",
  "engine": "endstone",
  "endstone": { "bin": "$ROOT/venv/bin/endstone" },
  "publicHost": "$PUBLIC_HOST",
  "panel": { "host": "$PANEL_HOST", "port": $PANEL_PORT },
  "instances": {
    "main": { "dir": "$MAIN", "autoStart": true, "autoRestart": true },
    "limbo": { "dir": "$ROOT/instances/limbo", "mode": "ondemand", "port": 19134, "portv6": 19135, "autoRestart": false }
  },
  "backup": { "dir": "$ROOT/backups", "intervalMinutes": 60, "keep": 48, "keepDaily": 14, "compression": "gzip", "onlyWhenPlayers": false }
}
EOF
  chmod 600 "$CFG"
fi
echo "{\"engine\":\"endstone\",\"endstone\":\"$ENDSTONE_VERSION\"}" > "$ROOT/versions.json"

if [[ $SERVICE == 0 ]]; then
  PW_OUT="$(LEVIKIT_CONFIG="$CFG" "$NODE_BIN" "$ROOT/panel/bin/passwd.js")"
  echo
  echo "================ LeviKit（Endstone 版）の用意ができました ================"
  echo " 起動       : LEVIKIT_CONFIG=$CFG $NODE_BIN $ROOT/panel/server.js"
  echo " 管理パネル : http://${PUBLIC_HOST:-127.0.0.1}:${PANEL_PORT}/"
  echo " $(echo "$PW_OUT" | grep '新しいパスワード' || echo 'パスワード : 既存の設定のまま')"
  exit 0
fi

id "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$SVC_USER"
chown -R "$SVC_USER:$SVC_USER" "$ROOT"
PW_OUT="$(runuser -u "$SVC_USER" -- env LEVIKIT_CONFIG="$CFG" "$NODE_BIN" "$ROOT/panel/bin/passwd.js")"
cat > /usr/local/bin/levikit-passwd <<EOF
#!/usr/bin/env sh
exec runuser -u $SVC_USER -- env LEVIKIT_CONFIG=$CFG $NODE_BIN $ROOT/panel/bin/passwd.js "\$@"
EOF
chmod 755 /usr/local/bin/levikit-passwd
cat > /etc/systemd/system/levikit-panel.service <<EOF
[Unit]
Description=LeviKit panel (Endstone BDS supervisor)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$ROOT
Environment=LEVIKIT_CONFIG=$CFG
Environment=HOME=$ROOT
ExecStart=$NODE_BIN $ROOT/panel/server.js
KillMode=mixed
TimeoutStopSec=240
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now levikit-panel.service
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 19132/udp; ufw allow 19133/udp; ufw allow 19134/udp; ufw allow 19135/udp
  [[ "$PANEL_HOST" != "127.0.0.1" ]] && ufw allow "${PANEL_PORT}/tcp"
fi
cat <<EOF

================ LeviKit（Endstone 版）インストール完了 ================
 管理パネル : http://${PUBLIC_HOST:-<VPSのIP>}:${PANEL_PORT}/
 $(echo "$PW_OUT" | grep '新しいパスワード' || echo 'パスワード : 既存の設定のまま（再発行: sudo levikit-passwd）')
 サーバー   : ${PUBLIC_HOST:-<VPSのIP>}  ポート 19132/udp（待機サーバー 19134/udp）
 ・VPS 事業者側のファイアウォールでも UDP 19132-19135 と TCP ${PANEL_PORT} を開けてください
 ・状態: systemctl status levikit-panel / ログ: journalctl -u levikit-panel -f
 ・Endstone ${ENDSTONE_VERSION}
EOF

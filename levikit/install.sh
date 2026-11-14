#!/usr/bin/env bash
# LeviKit installer
#   LeviLamina 26.51.9 (BDS 1.26.51, Wine) + MoreDimensions + Glacie(マルチプロトコル) + 管理パネル
#   対応: Ubuntu 22.04 / 24.04, Debian 12 / 13 (x86_64)
#
#   sudo ./install.sh --accept-eula --public-host <VPSのIPかドメイン> [--kitcore-zip ./levikit-core-windows-x64.zip]
#
set -Eeuo pipefail

# ---------------- versions (ここを変えると別バージョンを入れられる) ----------------
LL_VERSION="26.51.9"            # MoreDimensions 0.15.0 が >=26.51.7 <26.60 を要求
MOREDIM_VERSION="0.15.0"
GLACIE_VERSION="3.10.2"         # LeviLamina 26.51.x 用 (ProtocolLib は最新安定版が入る)
LIP_VERSION="0.37.0"
WINETRICKS_COMMIT="b792287f5bec9086916aa9b81788e0ea38f02c24"  # 公式 docker イメージと同じ
NODE_MAJOR="22"

# ---------------- options ----------------
ROOT="/opt/levikit"
SVC_USER="levikit"
ACCEPT_EULA=0
PUBLIC_HOST=""
KITCORE_ZIP=""
KITCORE_URL=""
PANEL_PORT="8080"
PANEL_HOST="0.0.0.0"
INSTALL_GLACIE=1
SERVER_NAME=""
SKIP_WINE=0
GITHUB_PROXY=""
PAPYRUS_ZIP=""
PAPYRUS_URL=""
INSTALL_ASSETS=1

usage() {
  cat <<EOF
使い方: sudo ./install.sh --accept-eula [options]

  --accept-eula            Minecraft EULA (https://www.minecraft.net/eula) と
                           プライバシーポリシーに同意する（必須）
  --public-host HOST       プレイヤーが接続する IP/ドメイン（参加したまま再起動/復元に必要）
  --kitcore-zip PATH       levikit-core のビルド済み zip（GitHub Actions の成果物）
  --kitcore-url URL        同上を URL から取得
  --panel-port PORT        管理パネルのポート (既定 8080)
  --panel-host ADDR        パネルの待受アドレス (既定 0.0.0.0, SSH トンネルのみなら 127.0.0.1)
  --server-name NAME       server.properties の server-name
  --no-glacie              マルチプロトコル (Glacie) を入れない
  --root DIR               インストール先 (既定 /opt/levikit)
  --github-proxy URL       lip の GitHub ミラー
  --skip-wine              Wine 導入をスキップ（導入済みの場合）
  --papyrus-zip PATH       PapyrusCS（高品質マップ）の Linux ビルド zip（GitHub Actions の成果物）
  --papyrus-url URL        同上を URL から取得
  --no-assets              バニラのテクスチャ（Mojang/bedrock-samples）を取得しない
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --accept-eula) ACCEPT_EULA=1 ;;
    --public-host) PUBLIC_HOST="$2"; shift ;;
    --kitcore-zip) KITCORE_ZIP="$2"; shift ;;
    --kitcore-url) KITCORE_URL="$2"; shift ;;
    --panel-port) PANEL_PORT="$2"; shift ;;
    --panel-host) PANEL_HOST="$2"; shift ;;
    --server-name) SERVER_NAME="$2"; shift ;;
    --no-glacie) INSTALL_GLACIE=0 ;;
    --root) ROOT="$2"; shift ;;
    --github-proxy) GITHUB_PROXY="$2"; shift ;;
    --skip-wine) SKIP_WINE=1 ;;
    --papyrus-zip) PAPYRUS_ZIP="$2"; shift ;;
    --papyrus-url) PAPYRUS_URL="$2"; shift ;;
    --no-assets) INSTALL_ASSETS=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明なオプション: $1"; usage; exit 1 ;;
  esac
  shift
done

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$ROOT/instances/main"
WINEPREFIX_DIR="$ROOT/.wine"
LOG_FILE="/var/log/levikit-install.log"

c_g=$'\e[32m'; c_y=$'\e[33m'; c_r=$'\e[31m'; c_0=$'\e[0m'
step() { echo; echo "${c_g}==>${c_0} $*"; }
warn() { echo "${c_y}[!]${c_0} $*"; }
die()  { echo "${c_r}[x]${c_0} $*" >&2; exit 1; }
trap 'die "失敗しました (行 $LINENO)。ログ: $LOG_FILE"' ERR

# ---------------- preflight ----------------
[[ $EUID -eq 0 ]] || die "root で実行してください (sudo ./install.sh ...)"
exec > >(tee -a "$LOG_FILE") 2>&1
[[ "$(uname -m)" == "x86_64" ]] || die "x86_64 のみ対応です（LeviLamina は Windows x64 版を Wine で動かします）"
[[ -r /etc/os-release ]] || die "/etc/os-release がありません"
# shellcheck disable=SC1091
. /etc/os-release
DISTRO="${ID:-}"
CODENAME="${VERSION_CODENAME:-}"
case "$DISTRO" in
  ubuntu|debian) ;;
  *) warn "未検証のディストリビューションです: $DISTRO（Debian 系として続行）"; DISTRO="debian" ;;
esac
[[ -n "$CODENAME" ]] || die "VERSION_CODENAME が取得できません"

if [[ $ACCEPT_EULA -ne 1 ]]; then
  echo "Minecraft のサーバーソフトを導入するには EULA への同意が必要です:"
  echo "  https://www.minecraft.net/eula"
  echo "  https://go.microsoft.com/fwlink/?LinkId=521839"
  read -r -p "同意しますか？ [y/N] " ans
  [[ "$ans" =~ ^[yY] ]] || die "EULA に同意しないため中止しました"
fi

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if (( MEM_MB < 3500 )); then
  warn "メモリ ${MEM_MB}MB: BDS(Wine) + 待機サーバーには 4GB 以上を推奨します（swap を用意してください）"
fi

if [[ -z "$PUBLIC_HOST" ]]; then
  PUBLIC_HOST="$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [[ -n "$PUBLIC_HOST" ]] && warn "--public-host 未指定のため検出した IP を使います: $PUBLIC_HOST（パネルの設定で変更可）"
fi

as_user() {
  runuser -u "$SVC_USER" -- env HOME="$ROOT" WINEPREFIX="$WINEPREFIX_DIR" WINEDEBUG=-all \
    WINEDLLOVERRIDES="mscoree,mshtml=" XDG_RUNTIME_DIR="$ROOT/.tmp" "$@"
}

# ---------------- packages ----------------
step "基本パッケージ"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl wget git zip unzip tar zstd rsync jq gnupg \
  xvfb xauth cabextract procps locales
apt-get install -y --no-install-recommends rclone || warn "rclone を入れられませんでした（外部同期を使う場合は手動で導入）"

if [[ $SKIP_WINE -eq 0 ]]; then
  step "Wine (WineHQ stable)"
  dpkg --add-architecture i386
  mkdir -pm755 /etc/apt/keyrings
  wget -qO /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key
  SRC_URL="https://dl.winehq.org/wine-builds/${DISTRO}/dists/${CODENAME}/winehq-${CODENAME}.sources"
  if wget -q --spider "$SRC_URL"; then
    wget -qNP /etc/apt/sources.list.d/ "$SRC_URL"
    if [[ "$DISTRO" == "debian" && -f /etc/apt/sources.list.d/debian.sources ]]; then
      grep -q "contrib" /etc/apt/sources.list.d/debian.sources || sed -i -e 's/ main$/ main contrib/' /etc/apt/sources.list.d/debian.sources
    fi
    apt-get update -y
    apt-get install -y --install-recommends winehq-stable
  else
    warn "WineHQ に ${DISTRO}/${CODENAME} 用リポジトリがありません。ディストリ標準の wine を使います"
    apt-get update -y
    apt-get install -y --install-recommends wine wine64 wine32:i386 || apt-get install -y wine
  fi
fi
command -v wine >/dev/null || die "wine が見つかりません"
echo "wine: $(wine --version)"

step "winetricks (固定コミット)"
wget -qO /usr/local/bin/winetricks "https://github.com/Winetricks/winetricks/raw/${WINETRICKS_COMMIT}/src/winetricks"
chmod +x /usr/local/bin/winetricks

step "Node.js"
NODE_BIN="$(command -v node || true)"
if [[ -n "$NODE_BIN" ]] && [[ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -ge 20 ]]; then
  echo "既存の Node.js を使用: $("$NODE_BIN" --version)"
else
  mkdir -p "$ROOT/node"
  # (ダウンロードした本体を、nodejs.org が公開している SHA-256 と照合してから展開する)
  NODE_SUMS="$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt")"
  NODE_TAR="$(awk '/linux-x64.tar.xz$/ {print $2; exit}' <<<"$NODE_SUMS")"
  NODE_SHA="$(awk '/linux-x64.tar.xz$/ {print $1; exit}' <<<"$NODE_SUMS")"
  [[ -n "$NODE_TAR" && "$NODE_SHA" =~ ^[0-9a-f]{64}$ ]] || die "Node.js のダウンロード先が取得できません"
  NODE_TMP="$(mktemp)"
  curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/${NODE_TAR}" -o "$NODE_TMP"
  [[ "$(sha256sum "$NODE_TMP" | cut -d' ' -f1)" == "$NODE_SHA" ]] || { rm -f "$NODE_TMP"; die "Node.js のチェックサムが一致しません（ダウンロードが壊れたか、書き換えられています）"; }
  tar -xJf "$NODE_TMP" -C "$ROOT/node" --strip-components=1
  rm -f "$NODE_TMP"
  NODE_BIN="$ROOT/node/bin/node"
  echo "Node.js: $("$NODE_BIN" --version)"
fi

# ---------------- user / dirs ----------------
step "サービスユーザー $SVC_USER と $ROOT"
if ! id "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --shell /bin/bash "$SVC_USER"
fi
mkdir -p "$ROOT"/{instances,backups,lip,.tmp} "$MAIN_DIR"
chown -R "$SVC_USER:$SVC_USER" "$ROOT"
chmod 750 "$ROOT"

# ---------------- wine prefix ----------------
step "Wine プレフィックス初期化 (VC++ ランタイム / .NET 10 は lip に必要)"
if [[ ! -f "$WINEPREFIX_DIR/system.reg" ]]; then
  as_user xvfb-run -a wineboot --init
  as_user wineserver -w || true
fi
if [[ ! -f "$ROOT/.vcrun-installed" ]]; then
  as_user xvfb-run -a winetricks -q vcrun2026 || as_user xvfb-run -a winetricks -q vcrun2022
  touch "$ROOT/.vcrun-installed"; chown "$SVC_USER:" "$ROOT/.vcrun-installed"
fi
if [[ ! -d "$WINEPREFIX_DIR/drive_c/Program Files/dotnet" ]]; then
  as_user xvfb-run -a winetricks -q dotnet10
fi
as_user wineserver -w || true

# ---------------- lip ----------------
step "lip ${LIP_VERSION} (Windows 版を Wine で実行)"
if [[ ! -f "$ROOT/lip/lip.exe" ]] || [[ "$(cat "$ROOT/lip/.version" 2>/dev/null)" != "$LIP_VERSION" ]]; then
  tmpzip="$(mktemp --suffix=.zip)"
  wget -qO "$tmpzip" "https://github.com/LiteLDev/lip/releases/download/v${LIP_VERSION}/lip-${LIP_VERSION}-win-x64.zip"
  rm -rf "$ROOT/lip"; mkdir -p "$ROOT/lip"
  unzip -q "$tmpzip" -d "$ROOT/lip"
  rm -f "$tmpzip"
  LIP_EXE="$(find "$ROOT/lip" -iname lip.exe | head -n1)"
  [[ -n "$LIP_EXE" ]] || die "lip.exe が zip に見つかりません"
  [[ "$LIP_EXE" == "$ROOT/lip/lip.exe" ]] || cp -a "$(dirname "$LIP_EXE")/." "$ROOT/lip/"
  echo "$LIP_VERSION" > "$ROOT/lip/.version"
  chown -R "$SVC_USER:$SVC_USER" "$ROOT/lip"
fi
cat > /usr/local/bin/levikit-lip <<EOF
#!/usr/bin/env sh
# lip をサービスユーザー/Wine プレフィックスで実行する。カレントディレクトリがサーバーフォルダ。
if [ "\$(id -u)" = "0" ]; then
  exec runuser -u $SVC_USER -- env HOME=$ROOT WINEPREFIX=$WINEPREFIX_DIR WINEDEBUG=-all wine $ROOT/lip/lip.exe "\$@"
fi
exec env WINEPREFIX=$WINEPREFIX_DIR WINEDEBUG=-all wine $ROOT/lip/lip.exe "\$@"
EOF
chmod 755 /usr/local/bin/levikit-lip

lip_in() { # dir args...
  local dir="$1"; shift
  (cd "$dir" && as_user wine "$ROOT/lip/lip.exe" "$@")
}

if [[ -n "$GITHUB_PROXY" ]]; then
  lip_in "$MAIN_DIR" config set github_proxy "$GITHUB_PROXY"
fi

# ---------------- LeviLamina + mods ----------------
step "LeviLamina ${LL_VERSION} + BDS (初回は数分かかります)"
if [[ ! -f "$MAIN_DIR/bedrock_server_mod.exe" ]]; then
  lip_in "$MAIN_DIR" install "github.com/LiteLDev/LeviLamina@${LL_VERSION}"
fi
[[ -f "$MAIN_DIR/bedrock_server_mod.exe" ]] || die "bedrock_server_mod.exe が生成されませんでした（lip のログを確認）"

step "MoreDimensions ${MOREDIM_VERSION}"
[[ -d "$MAIN_DIR/plugins/more-dimensions" ]] || lip_in "$MAIN_DIR" install "github.com/LiteLDev/MoreDimensions@${MOREDIM_VERSION}"

if [[ $INSTALL_GLACIE -eq 1 ]]; then
  step "Glacie ${GLACIE_VERSION} + ProtocolLib（マルチプロトコル）"
  [[ -d "$MAIN_DIR/plugins/Glacie" ]] || lip_in "$MAIN_DIR" install "github.com/GlacieTeam/Glacie@${GLACIE_VERSION}"
fi

step "levikit-core (ディメンション切替 / 転送)"
if [[ -n "$KITCORE_URL" ]]; then
  KITCORE_ZIP="$(mktemp --suffix=.zip)"
  wget -qO "$KITCORE_ZIP" "$KITCORE_URL"
fi
if [[ -n "$KITCORE_ZIP" ]]; then
  [[ -f "$KITCORE_ZIP" ]] || die "zip がありません: $KITCORE_ZIP"
  tmpd="$(mktemp -d)"
  unzip -q -o "$KITCORE_ZIP" -d "$tmpd"
  # 中身が levikit-core/ でも、その下の bin/levikit-core/ でも、artifact の二重 zip でも受け付ける
  inner="$(find "$tmpd" -maxdepth 2 -name '*.zip' | head -n1 || true)"
  if [[ -n "$inner" ]]; then unzip -q -o "$inner" -d "$tmpd"; fi
  man="$(find "$tmpd" -path '*levikit-core/manifest.json' | head -n1 || true)"
  [[ -n "$man" ]] || die "zip に levikit-core/manifest.json がありません"
  mkdir -p "$MAIN_DIR/plugins/levikit-core"
  rsync -a "$(dirname "$man")/" "$MAIN_DIR/plugins/levikit-core/" --exclude config/ --exclude data/
  rm -rf "$tmpd"
  echo "levikit-core を導入しました"
else
  warn "levikit-core が未指定です。/dim と『参加したまま』系は使えません（README の手順でビルドし --kitcore-zip で再実行）"
fi

# ---------------- バニラのテクスチャ（地図・3D 観察ビュー用） ----------------
if [[ "$INSTALL_ASSETS" == 1 ]]; then
  step "バニラのテクスチャを取得（Mojang/bedrock-samples の resource_pack/textures・blocks.json）"
  ASSETS="$ROOT/assets"
  if [[ -d "$ASSETS/bedrock-samples/.git" ]]; then
    git -C "$ASSETS/bedrock-samples" pull -q --depth 1 || warn "テクスチャの更新に失敗（前のものを使います）"
  else
    mkdir -p "$ASSETS"
    if git clone -q --depth 1 --filter=blob:none --sparse https://github.com/Mojang/bedrock-samples.git "$ASSETS/bedrock-samples"; then
      git -C "$ASSETS/bedrock-samples" sparse-checkout set --no-cone /resource_pack/blocks.json /resource_pack/textures/terrain_texture.json /resource_pack/textures/blocks/
    else
      warn "テクスチャを取得できませんでした（地図は近似色・3D は白いブロックになります）"
    fi
  fi
  [[ -d "$ASSETS/bedrock-samples/resource_pack" ]] && ln -sfn "$ASSETS/bedrock-samples/resource_pack" "$ASSETS/resource_pack"
fi

# ---------------- PapyrusCS（任意） ----------------
if [[ -n "$PAPYRUS_URL" && -z "$PAPYRUS_ZIP" ]]; then
  PAPYRUS_ZIP="$(mktemp --suffix=.zip)"
  wget -qO "$PAPYRUS_ZIP" "$PAPYRUS_URL"
fi
if [[ -n "$PAPYRUS_ZIP" ]]; then
  step "PapyrusCS を導入"
  apt-get install -y -qq libgdiplus libc6-dev >/dev/null || warn "libgdiplus を入れられませんでした"
  tmpd="$(mktemp -d)"
  unzip -q -o "$PAPYRUS_ZIP" -d "$tmpd"
  inner="$(find "$tmpd" -maxdepth 2 -name 'papyruscs-*.zip' | head -n1 || true)"
  if [[ -n "$inner" ]]; then unzip -q -o "$inner" -d "$tmpd/x"; tmpd="$tmpd/x"; fi
  bin="$(find "$tmpd" -maxdepth 3 -name PapyrusCs -type f | head -n1 || true)"
  [[ -n "$bin" ]] || die "zip に PapyrusCs がありません"
  rm -rf "$ROOT/papyrus-bin" && mkdir -p "$ROOT/papyrus-bin"
  cp -a "$(dirname "$bin")/." "$ROOT/papyrus-bin/"
  chmod +x "$ROOT/papyrus-bin/PapyrusCs"
  echo "PapyrusCS を $ROOT/papyrus-bin に導入しました"
fi

# ---------------- first boot (設定ファイル・ワールド生成) ----------------
step "初回起動テスト（設定ファイル生成）"
first_boot() {
  local fifo log pid i
  fifo="$(mktemp -u)"; log="$ROOT/.tmp/first-boot.log"
  mkfifo "$fifo"; chown "$SVC_USER:" "$fifo"
  ( cd "$MAIN_DIR" && as_user wine bedrock_server_mod.exe < "$fifo" > "$log" 2>&1 ) &
  pid=$!
  exec 3>"$fifo"
  for i in $(seq 1 360); do
    grep -q "Server started" "$log" 2>/dev/null && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if grep -q "Server started" "$log" 2>/dev/null; then
    echo "初回起動 OK（${i}秒）"
  else
    warn "初回起動で 'Server started' を確認できませんでした。ログ: $log"
    tail -n 30 "$log" || true
  fi
  echo stop >&3 || true
  for i in $(seq 1 120); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -0 "$pid" 2>/dev/null && { warn "停止しないため強制終了"; pkill -KILL -u "$SVC_USER" -f bedrock_server_mod.exe || true; }
  exec 3>&-
  rm -f "$fifo"
  wait "$pid" 2>/dev/null || true
}
if [[ ! -f "$MAIN_DIR/server.properties" ]] || [[ ! -d "$MAIN_DIR/worlds" ]]; then
  first_boot
fi
[[ -f "$MAIN_DIR/server.properties" ]] || die "server.properties が生成されませんでした"

setprop() { # key value
  local f="$MAIN_DIR/server.properties"
  if grep -qE "^$1=" "$f"; then sed -i -E "s|^$1=.*|$1=$2|" "$f"; else echo "$1=$2" >> "$f"; fi
}
setprop server-port 19132
setprop server-portv6 19133
setprop enable-lan-visibility false
[[ -n "$SERVER_NAME" ]] && setprop server-name "$SERVER_NAME"
chown -R "$SVC_USER:$SVC_USER" "$ROOT"

# ---------------- panel ----------------
step "管理パネル"
rsync -a --delete "$SRC_DIR/panel/" "$ROOT/panel/"
chown -R "$SVC_USER:$SVC_USER" "$ROOT/panel"
CFG="$ROOT/levikit.json"
if [[ ! -f "$CFG" ]]; then
  cat > "$CFG" <<EOF
{
  "root": "$ROOT",
  "publicHost": "$PUBLIC_HOST",
  "panel": { "host": "$PANEL_HOST", "port": $PANEL_PORT, "passwordHash": "", "trustProxy": false },
  "wine": { "bin": "$(command -v wine)", "prefix": "$WINEPREFIX_DIR" },
  "lipExe": "$ROOT/lip/lip.exe",
  "instances": {
    "main":  { "dir": "$MAIN_DIR", "autoStart": true, "autoRestart": true },
    "limbo": { "dir": "$ROOT/instances/limbo", "mode": "ondemand", "port": 19134, "portv6": 19135, "autoRestart": false }
  },
  "backup": { "dir": "$ROOT/backups", "intervalMinutes": 60, "keep": 48, "keepDaily": 14, "compression": "zstd", "onlyWhenPlayers": false },
  "schedule": { "dailyRestart": "", "restartWarnSeconds": 30 }
}
EOF
fi
cat > "$ROOT/versions.json" <<EOF
{
  "LeviLamina": "$LL_VERSION",
  "BDS": "1.26.51",
  "MoreDimensions": "$MOREDIM_VERSION",
  "Glacie": "$([[ $INSTALL_GLACIE -eq 1 ]] && echo "$GLACIE_VERSION" || echo "-")",
  "levikit-core": "$([[ -d "$MAIN_DIR/plugins/levikit-core" ]] && echo installed || echo "未導入")",
  "lip": "$LIP_VERSION",
  "installedAt": "$(date -Is)"
}
EOF
chown "$SVC_USER:$SVC_USER" "$CFG" "$ROOT/versions.json"
chmod 600 "$CFG"

PW_OUT="$(runuser -u "$SVC_USER" -- env LEVIKIT_CONFIG="$CFG" "$NODE_BIN" "$ROOT/panel/bin/passwd.js")"
PANEL_PW="$(echo "$PW_OUT" | sed -n 's/^新しいパスワード: //p')"

cat > /usr/local/bin/levikit-passwd <<EOF
#!/usr/bin/env sh
exec runuser -u $SVC_USER -- env LEVIKIT_CONFIG=$CFG $NODE_BIN $ROOT/panel/bin/passwd.js "\$@"
EOF
chmod 755 /usr/local/bin/levikit-passwd

cat > /etc/systemd/system/levikit-panel.service <<EOF
[Unit]
Description=LeviKit panel (LeviLamina BDS supervisor)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$ROOT
Environment=LEVIKIT_CONFIG=$CFG
Environment=HOME=$ROOT
Environment=WINEPREFIX=$WINEPREFIX_DIR
Environment=WINEDEBUG=-all
Environment=XDG_RUNTIME_DIR=$ROOT/.tmp
ExecStart=$NODE_BIN $ROOT/panel/server.js
# SIGTERM はパネルだけに送り、パネルが BDS を stop で正常終了させる
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

# ---------------- firewall ----------------
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  step "ufw にポートを追加"
  ufw allow 19132/udp; ufw allow 19133/udp; ufw allow 19134/udp; ufw allow 19135/udp
  [[ "$PANEL_HOST" != "127.0.0.1" ]] && ufw allow "${PANEL_PORT}/tcp"
fi

IP_SHOW="${PUBLIC_HOST:-<VPSのIP>}"
cat <<EOF

${c_g}================ LeviKit インストール完了 ================${c_0}
 管理パネル : http://${IP_SHOW}:${PANEL_PORT}/
 パスワード : ${PANEL_PW:-（既存設定を維持。再発行: sudo levikit-passwd）}
 サーバー   : ${IP_SHOW}  ポート 19132/udp  (待機サーバー 19134/udp)

 ・VPS 事業者側のファイアウォールでも UDP 19132-19135 と TCP ${PANEL_PORT} を開けてください
 ・パネルは HTTP です。外部公開する場合は HTTPS リバースプロキシか
   SSH トンネル (ssh -L ${PANEL_PORT}:127.0.0.1:${PANEL_PORT} ...) を推奨
 ・状態: systemctl status levikit-panel / ログ: journalctl -u levikit-panel -f
 ・LeviLamina ${LL_VERSION} / MoreDimensions ${MOREDIM_VERSION} / Glacie ${GLACIE_VERSION}
${c_g}==========================================================${c_0}
EOF

#!/usr/bin/env bash
# 引き継ぎパッケージ作成.sh [作業フォルダ] [出力先フォルダ]
# 別のAIが完全に続きをできる引き継ぎパッケージ（zip）を作る。何度実行してもよい。
#   中身: HANDOFF.md / RESUME.md / 追跡ファイル一式 / 未コミット差分 / 新規ファイル / git bundle（全履歴）/ ログ末尾 / 環境情報
#   秘密情報らしいファイル（.env, *.key, *.pem, id_*, *token*, *secret*, *webhook* など）は入れない
set -u
SRC="$(cd "${1:-.}" && pwd)"
OUT="$(mkdir -p "${2:-$SRC/引き継ぎ}" && cd "${2:-$SRC/引き継ぎ}" && pwd)"
STAMP="$(date +%Y-%m-%d_%H%M)"
NAME="引き継ぎ_$(basename "$SRC")_$STAMP"   # (人が付けたような、読んで分かる名前)
TMP="$(mktemp -d)"; PKG="$TMP/$NAME"; mkdir -p "$PKG/meta"
SECRET='(^|/)(\.env[^/]*|.*\.(key|pem|p12|pfx)|id_(rsa|ed25519|ecdsa)[^/]*|.*(token|secret|password|credential|webhook)[^/]*)$'
MAXSIZE=$((20 * 1024 * 1024))   # 1ファイル20MBまで（大きいものは meta/skipped.txt に名前だけ残す）

cd "$SRC"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # 全履歴: git clone <bundle> で復元できる
  # 全履歴。浅いクローン（shallow）では bundle が不完全になるので、.git ごと固める（数十MBまで）
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ] || ! git bundle create "$PKG/repo.bundle" --all >/dev/null 2>&1; then
    rm -f "$PKG/repo.bundle"; G="$TMP/gitcopy"; mkdir -p "$G"; cp -a .git "$G/.git"
    # (remote の URL に埋まったトークンは消す)
    sed -i.bak -E 's#(url = https?://)[^@/]*@#\1#' "$G/.git/config" 2>/dev/null; rm -f "$G/.git/config.bak"
    tar -C "$G" -czf "$PKG/git-dir.tgz" .git 2>/dev/null; rm -rf "$G"
  fi
  git status --short > "$PKG/meta/git-status.txt" 2>&1
  git log --oneline -40 > "$PKG/meta/git-log.txt" 2>&1
  git branch -vv > "$PKG/meta/git-branches.txt" 2>&1
  git remote -v | sed -E 's#https://[^@/]*@#https://#' > "$PKG/meta/git-remotes.txt" 2>&1
  git diff HEAD > "$PKG/uncommitted.patch" 2>/dev/null
  TRACKED="$(git -c core.quotepath=off ls-files)"
  LIST="$( (git -c core.quotepath=off ls-files; git -c core.quotepath=off ls-files --others --exclude-standard) | sort -u)"
else
  LIST="$(find . -type f -not -path './handoff-out/*' -not -path './引き継ぎ/*' -not -path './.git/*' -not -path '*/node_modules/*' | sed 's#^\./##')"
fi

mkdir -p "$PKG/files"
: > "$PKG/meta/skipped.txt"
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # 秘密情報らしい名前は、git に入っていない（＝ここで初めて外へ出る）ものだけ除外する
  if echo "$f" | grep -Eiq "$SECRET" && ! grep -Fxq "$f" <<< "${TRACKED:-}"; then echo "secret?  $f" >> "$PKG/meta/skipped.txt"; continue; fi
  sz=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
  if [ "$sz" -gt "$MAXSIZE" ]; then echo "large    $f ($sz bytes)" >> "$PKG/meta/skipped.txt"; continue; fi
  mkdir -p "$PKG/files/$(dirname "$f")"; cp -p "$f" "$PKG/files/$f"
done <<< "$LIST"

# HANDOFF.md（なければ雛形）
if [ -f HANDOFF.md ]; then cp HANDOFF.md "$PKG/HANDOFF.md"; else
cat > "$PKG/HANDOFF.md" <<'EOF'
# HANDOFF（雛形: 作業中のエージェントが書いていない。meta/ と files/ から状況を読み取ること）
## 1. 依頼  ## 2. 完了条件  ## 3. 制約  ## 4. 現在の状態  ## 5. 試したこと  ## 6. 分かった事実  ## 7. 次の一手  ## 8. 再現手順  ## 9. 未解決
EOF
fi

# ログの末尾（よくある場所。中身に秘密が混ざりやすいので URL のクエリとトークンらしき文字列は伏せる）
mkdir -p "$PKG/meta/logs"
for l in $(find . -maxdepth 4 -type f \( -name '*.log' -o -name 'out.log' -o -name '*.jsonl' \) -not -path './handoff-out/*' -not -path '*/node_modules/*' 2>/dev/null | head -30); do
  tail -n 300 "$l" | sed -E 's#(https?://[^ ?]+)\?[^ ]*#\1?…#g; s#[A-Za-z0-9_-]{32,}#…#g' > "$PKG/meta/logs/$(echo "$l" | sed 's#^\./##; s#/#__#g')"
done

# 環境と実行中のもの
{ echo "date: $(date -Iseconds)"; echo "host: $(uname -a)"; echo "cwd: $SRC"
  for c in node python3 git java go cargo; do command -v $c >/dev/null && echo "$c: $($c --version 2>&1 | head -1)"; done
  echo; echo "--- processes (this user) ---"; ps -u "$(id -u)" -o pid,etime,args 2>/dev/null | grep -v -E 'ps -u|handoff.sh' | head -60
} > "$PKG/meta/env.txt"

cat > "$PKG/RESUME.md" <<EOF
# RESUME — これを最初に読む（作成: $(date '+%Y-%m-%d %H:%M %Z')）

1. **HANDOFF.md を全部読む。** 依頼・制約・現在の状態・次の一手が書いてある。
2. コードを復元する：
   - repo.bundle がある: \`git clone repo.bundle work && cd work && git checkout <HANDOFF.mdのブランチ>\`
   - git-dir.tgz がある: \`mkdir work && cp -a files/. work/ && tar -C work -xzf git-dir.tgz && cd work && git status\`（この場合は差分も含めてそのまま元通り）
     その後、未コミットの変更を \`git apply ../uncommitted.patch\` で戻す（新規ファイルは files/ にある）
   - bundle なし: files/ をそのまま作業フォルダにする
3. meta/ を見る：git-status.txt（未保存の変更）、logs/（最後の出力）、env.txt（使っていた道具と実行中だったプロセス）、skipped.txt（入れなかったファイル。秘密情報はユーザーに頼む）
4. HANDOFF.md の「次の一手」から再開する。最初に「長時間タスク用エージェント規約.md」（あれば）に従って自分用の HANDOFF 更新と再開予約を設定する。
EOF
for r in "$SRC/長時間タスク用エージェント規約.md" "$SRC/AGENT_RULES.md"; do [ -f "$r" ] && cp "$r" "$PKG/"; done

(cd "$TMP" && zip -qr "$OUT/$NAME.zip" "$NAME")
rm -rf "$TMP"
ln -sf "$NAME.zip" "$OUT/引き継ぎ_最新.zip" 2>/dev/null
echo "$OUT/$NAME.zip ($(du -h "$OUT/$NAME.zip" | cut -f1))"

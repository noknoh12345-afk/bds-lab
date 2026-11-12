#!/bin/sh
# One command for an agent's setup phase (Codex cloud "setup script", Jules, Devin, CI, a fresh VM):
# Node 22 if missing, the OS packages it can install (when root or passwordless sudo), then the server and tools.
# Safe to run again. Afterwards the lab works without network.
cd "$(dirname "$0")" || exit 1
if [ "$(id -u)" = 0 ]; then S=""; elif sudo -n true 2>/dev/null; then S="sudo"; else S="none"; fi
if [ "$S" != none ] && command -v apt-get >/dev/null 2>&1; then
  $S apt-get update -qq || true
  $S apt-get install -y -qq --no-install-recommends gcc libc6-dev unzip ca-certificates curl >/dev/null 2>&1 || true
fi
./lab.sh doctor
./lab.sh setup all

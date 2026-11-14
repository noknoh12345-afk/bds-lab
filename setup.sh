#!/bin/sh
# One command for an agent's setup phase (Codex cloud "setup script", Jules, Devin, CI, a fresh VM):
# Node 22 if missing, the OS packages it can install (when root or passwordless sudo), then the server and tools.
# Safe to run again. Afterwards the lab works without network.
# (A machine that does not have the lab yet: install.sh / install.ps1 get it and then do this, and prove it with selftest.)
cd "$(dirname "$0")" || exit 1
if [ "$(id -u)" = 0 ]; then S=""; elif sudo -n true 2>/dev/null; then S="sudo"; else S="none"; fi
if [ "$S" != none ]; then
  if command -v apt-get >/dev/null 2>&1; then
    $S apt-get update -qq || true
    $S apt-get install -y -qq --no-install-recommends gcc libc6-dev unzip ca-certificates curl >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then $S dnf install -y -q gcc glibc-devel unzip ca-certificates curl tar gzip >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then $S yum install -y -q gcc glibc-devel unzip ca-certificates curl tar gzip >/dev/null 2>&1 || true
  elif command -v zypper >/dev/null 2>&1; then $S zypper --non-interactive --quiet install gcc glibc-devel unzip ca-certificates curl tar gzip >/dev/null 2>&1 || true
  elif command -v pacman >/dev/null 2>&1; then $S pacman -Sy --noconfirm --needed gcc unzip ca-certificates curl tar gzip >/dev/null 2>&1 || true
  fi
fi
./lab.sh doctor
./lab.sh setup all

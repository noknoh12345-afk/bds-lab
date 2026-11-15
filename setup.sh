#!/bin/sh
# One command for an agent's setup phase (Codex cloud "setup script", Jules, Devin, CI, a fresh VM):
# Node 22 if missing, the OS packages it can install (when root or passwordless sudo), then every lab's server and tools.
# Safe to run again. Afterwards the lab works without network.
cd "$(dirname "$0")" || exit 1
if [ "$(id -u)" = 0 ]; then S=""; elif sudo -n true 2>/dev/null; then S="sudo"; else S="none"; fi
# (A machine that does not have the lab yet: install.sh / install.ps1 get it and then do this, and prove it with selftest.)
# Python (the Endstone lab; setup fetches a portable one when this cannot install it) and Wine (the LeviLamina lab; LAB_SKIP_WINE=1
# leaves it out) where the system's own package manager has them: apt, dnf, yum, zypper or pacman
if [ "$S" != none ]; then
  if command -v apt-get >/dev/null 2>&1; then
    $S apt-get update -qq || true
    $S apt-get install -y -qq --no-install-recommends python3 python3-venv gcc libc6-dev unzip ca-certificates curl >/dev/null 2>&1 || true
    # ll: Wine (64-bit is enough; a Wine older than 10 is replaced by a portable one in the cache) + winetricks for the VC++ runtime
    if [ -z "$LAB_SKIP_WINE" ]; then $S apt-get install -y -qq --no-install-recommends wine winetricks cabextract >/dev/null 2>&1 || echo "W wine not installed (ll lab only)"; fi
  elif command -v dnf >/dev/null 2>&1; then $S dnf install -y -q gcc glibc-devel unzip ca-certificates curl tar gzip python3 >/dev/null 2>&1 || true
    if [ -z "$LAB_SKIP_WINE" ]; then $S dnf install -y -q wine >/dev/null 2>&1 || echo "W wine not installed (ll lab only)"; fi
  elif command -v yum >/dev/null 2>&1; then $S yum install -y -q gcc glibc-devel unzip ca-certificates curl tar gzip python3 >/dev/null 2>&1 || true
  elif command -v zypper >/dev/null 2>&1; then $S zypper --non-interactive --quiet install gcc glibc-devel unzip ca-certificates curl tar gzip python3 >/dev/null 2>&1 || true
    if [ -z "$LAB_SKIP_WINE" ]; then $S zypper --non-interactive --quiet install wine >/dev/null 2>&1 || echo "W wine not installed (ll lab only)"; fi
  elif command -v pacman >/dev/null 2>&1; then $S pacman -Sy --noconfirm --needed gcc unzip ca-certificates curl tar gzip python >/dev/null 2>&1 || true
    if [ -z "$LAB_SKIP_WINE" ]; then $S pacman -S --noconfirm --needed wine >/dev/null 2>&1 || echo "W wine not installed (ll lab only)"; fi
  fi
fi
./lab.sh doctor
./lab.sh setup all

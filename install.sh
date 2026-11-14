#!/bin/sh
# bds-lab in one command, on a machine that has nothing yet (Linux, macOS, WSL):
#
#   curl -fsSL https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.sh | sh
#
# It gets the lab (git when there is one, a tarball when not), the few OS packages it can install (root, or sudo), Node.js 22
# (lab.sh fetches it into the lab's own folder: no root), the server, and then proves the whole thing on a real server
# (selftest, 2-3 minutes). Safe to run again: the same command updates the lab and repairs a half-made one.
# Windows: install.ps1 (PowerShell).
#
#   BDS_LAB_DIR=<folder>      where (default ~/bds-lab)
#   BDS_LAB_REF=<branch|tag|commit>   which version (default main)
#   BDS_LAB_REPO=<owner/repo> a fork (default noknoh12345-afk/bds-lab)
#   BDS_LAB_STAGE=code|doctor|setup|selftest   stop after that step (default selftest: everything)
#   BDS_LAB_NO_GIT=1          take the tarball even when git is here
#   BDS_LAB_NO_PACKAGES=1     install no OS packages (say what is missing instead)
set -eu

main() {
  REPO="${BDS_LAB_REPO:-noknoh12345-afk/bds-lab}"
  REF="${BDS_LAB_REF:-main}"
  DIR="${BDS_LAB_DIR:-${HOME:-.}/bds-lab}"
  STAGE="${BDS_LAB_STAGE:-selftest}"
  case "$STAGE" in code|doctor|setup|selftest) ;; *) die "BDS_LAB_STAGE=$STAGE: one of code doctor setup selftest" ;; esac

  # ---- 1. which machine ----
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    MINGW*|MSYS*|CYGWIN*) die "this is Windows: in PowerShell run   irm https://raw.githubusercontent.com/$REPO/$REF/install.ps1 | iex" ;;
    *) die "no bds-lab for $(uname -s): Linux, macOS or Windows (a Linux VM or container works anywhere)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "no Node.js 22 and no Bedrock server for a $(uname -m) CPU: a 64-bit x86 or ARM machine is needed" ;;
  esac
  if [ "$os" = linux ] && is_musl; then
    die "this Linux uses musl libc (Alpine): the Bedrock server and nodejs.org's Node.js are built for glibc.
    Use a glibc system (Debian, Ubuntu, Fedora, Arch, openSUSE ...), for example in a container:
      docker run -it --rm -v \"\$PWD:/w\" -w /w ubuntu:24.04 sh -c 'apt-get update && apt-get install -y curl ca-certificates && curl -fsSL https://raw.githubusercontent.com/$REPO/$REF/install.sh | sh'"
  fi
  say "bds-lab: $os-$arch -> $DIR ($REPO@$REF)"

  # ---- 2. the few tools this script and the lab need ----
  priv_init
  need=""
  have curl || have wget || need="$need curl"
  have tar || need="$need tar"
  have gzip || need="$need gzip"
  have unzip || need="$need unzip"
  [ "$os" = darwin ] || [ -e /etc/ssl/certs/ca-certificates.crt ] || [ -e /etc/pki/tls/certs/ca-bundle.crt ] || [ -e /etc/ssl/ca-bundle.pem ] || [ -d /etc/ssl/certs ] || need="$need ca-certificates"
  # (a kernel without IPv6, as in many containers, gets the lab's shim, which needs a C compiler; with IPv6 none is needed)
  if [ "$os" = linux ] && ! { [ -s /proc/net/if_inet6 ]; } && ! have cc && ! have gcc; then need="$need gcc"; fi
  if [ -n "$need" ]; then pkg_install $need; fi
  have curl || have wget || die "curl (or wget) is needed to download the lab"
  have tar || die "tar is needed to unpack the lab"

  # ---- 3. the lab's files ----
  if [ -d "$DIR/.git" ] && have git; then
    say "updating $DIR (git pull)"
    git -C "$DIR" pull --ff-only --autostash </dev/null >&2 || say "W git pull did not go through (local changes, or another branch): the lab stays as it is; update by hand later"
  elif [ -e "$DIR/lab.mjs" ]; then
    say "updating $DIR (tarball over it: your addons and the caches stay)"
    get_tarball
  else
    if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then die "$DIR exists and is not a bds-lab: choose another folder with BDS_LAB_DIR=<folder>"; fi
    if have git && [ -z "${BDS_LAB_NO_GIT:-}" ] && ! is_commit "$REF"; then
      say "getting the lab (git clone)"
      git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$DIR" </dev/null >&2 || { say "W git clone failed: taking the tarball instead"; rm -rf "$DIR"; get_tarball; }
    else
      say "getting the lab (tarball)"
      get_tarball
    fi
  fi
  [ -e "$DIR/lab.mjs" ] || die "$DIR has no lab.mjs after the download: is $REPO@$REF a bds-lab?"
  cd "$DIR"
  chmod +x lab.sh setup.sh 2>/dev/null || true
  [ "$STAGE" = code ] && { done_msg "the lab's files are in place (no server yet)"; return 0; }

  # ---- 4. where the server will run ----
  if [ "$STAGE" != doctor ] && { [ "$os" = darwin ] || [ "$arch" != x64 ]; }; then
    # the Bedrock server exists for x86-64 Linux and Windows only: here it runs in a Linux container
    if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
      say ""
      say "The Bedrock server is an x86-64 Linux program: on this machine ($os-$arch) the lab runs it in a container, and docker is not answering."
      if [ "$os" = darwin ]; then
        say "  pick one, then run this command again:"
        say "    - Docker Desktop (Settings -> General -> \"Use Rosetta for x86_64/amd64 emulation\")"
        say "    - OrbStack"
        say "    - brew install colima docker && colima start --vm-type vz --vz-rosetta"
      else
        say "  install docker (https://docs.docker.com/engine/install/), let this user use it, and let it run x86-64 programs:"
        say "    docker run --privileged --rm tonistiigi/binfmt --install amd64"
        say "  then run this command again. (An emulated server is slow: an x86-64 machine is the better place.)"
      fi
      exit 2
    fi
  fi
  # ---- 5. what this machine can do, in the lab's own words ----
  # (the first lab.sh run fetches Node.js 22 into .lab-node/ when the machine has none)
  ./lab.sh doctor </dev/null || die "doctor found something this machine lacks: each MISSING line above has its fix (-> ...). Then run this command again."
  [ "$STAGE" = doctor ] && { done_msg "doctor is clean (no server yet)"; return 0; }

  # ---- 6. the server and the tools ----
  ./lab.sh setup all </dev/null || die "setup did not finish: the lines above say why (a BLOCKED line is the network: a proxy or firewall). Then run this command again."
  [ "$STAGE" = setup ] && { done_msg "the server is set up (not yet proven: node lab.mjs selftest)"; return 0; }

  # ---- 7. proof: a real server, real clients, the kit ----
  say "selftest: starting a real server and joining it (2-3 minutes)..."
  ./lab.sh selftest </dev/null || die "selftest failed on this machine: the report is $DIR/.lab/selftest.txt (bds/.lab/selftest.txt). The lab is installed; please open an issue with that file: https://github.com/$REPO/issues"
  done_msg "installed and proven on a real server"
}

say() { printf '%s\n' "$*" >&2; }
die() { say ""; say "ERR $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
is_commit() { case "$1" in *[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -ge 7 ]; }
is_musl() {
  ls /lib/ld-musl-* >/dev/null 2>&1 && return 0
  have ldd && ldd --version 2>&1 | grep -qi musl && return 0
  return 1
}

# root, passwordless sudo, or a sudo that can ask on the terminal (sudo reads the password from the tty, not from the pipe)
priv_init() {
  if [ "$(id -u)" = 0 ]; then SUDO=""
  elif have sudo && sudo -n true 2>/dev/null; then SUDO="sudo"
  elif have sudo && [ -t 2 ] && [ -r /dev/tty ]; then SUDO="sudo"
  else SUDO="none"; fi
}

# pkg_install <generic names>: the system's package manager, with its own names for them
pkg_install() {
  list="$*"
  if [ "$os" = darwin ]; then
    # macOS ships curl, tar, gzip, unzip and (with the command line tools) cc
    say "W missing on this Mac: $list (xcode-select --install brings the command line tools)"; return 0
  fi
  if have apt-get; then pm=apt; elif have dnf; then pm=dnf; elif have yum; then pm=yum; elif have zypper; then pm=zypper; elif have pacman; then pm=pacman; else pm=""; fi
  pk=""
  for p in $list; do
    case "$pm:$p" in
      apt:gcc) pk="$pk gcc libc6-dev" ;;
      dnf:gcc|yum:gcc|zypper:gcc) pk="$pk gcc glibc-devel" ;;
      *) pk="$pk $p" ;;
    esac
  done
  case "$pm" in
    apt) cmd="apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends$pk" ;;
    dnf) cmd="dnf install -y -q$pk" ;;
    yum) cmd="yum install -y -q$pk" ;;
    zypper) cmd="zypper --non-interactive --quiet install$pk" ;;
    pacman) cmd="pacman -Sy --noconfirm --needed$pk" ;;
    *) say "W missing:$list, and no package manager this script knows (apt dnf yum zypper pacman): install them by hand"; return 0 ;;
  esac
  if [ -n "${BDS_LAB_NO_PACKAGES:-}" ] || [ "$SUDO" = none ]; then
    say "W missing:$list: as root run:   $cmd"; return 0
  fi
  say "installing:$pk"
  if [ -n "$SUDO" ]; then $SUDO sh -c "$cmd" </dev/null >&2 || say "W the package install failed: as root run:   $cmd"
  else sh -c "$cmd" </dev/null >&2 || say "W the package install failed:   $cmd"; fi
}

fetch() {   # fetch <url> <file>
  if have curl; then curl -fsSL --retry 3 --retry-delay 2 "$1" -o "$2"; else wget -q --tries=3 "$1" -O "$2"; fi
}

# the lab as a tarball, unpacked over $DIR (GitHub's archive has one top folder: stripped)
get_tarball() {
  mkdir -p "$DIR"
  tmp="$DIR/.lab-install.tgz"
  fetch "https://github.com/$REPO/archive/$REF.tar.gz" "$tmp" || { rm -f "$tmp"; die "cannot download https://github.com/$REPO/archive/$REF.tar.gz (no network to github.com, or no such branch/tag: $REF)"; }
  tar -xzf "$tmp" -C "$DIR" --strip-components=1 || { rm -f "$tmp"; die "the download did not unpack (a cut-off transfer?): run this command again"; }
  rm -f "$tmp"
}

done_msg() {
  say ""
  say "OK $1"
  say "   folder:  $DIR"
  say "   next:    cd \"$DIR\" && ./lab.sh status"
  say "   then open this folder with your AI (Claude Code, Codex ...) and ask for the addon you want: it reads AGENTS.md."
}

main "$@"

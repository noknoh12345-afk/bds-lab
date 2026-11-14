#!/bin/sh
# Make this Linux server (a VPS) a GitHub Actions runner for the lab: afterwards the `vps` workflow runs the lab on it,
# started from GitHub (Actions -> vps -> Run workflow, or `gh workflow run vps -f args="go -a coins"`). No SSH, no open port:
# the runner calls out to GitHub over HTTPS.
#
#   curl -fsSL https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/vps/runner-setup.sh -o runner-setup.sh
#   sudo sh runner-setup.sh            # asks for the registration token (hidden), then installs and starts the runner
#   sudo sh runner-setup.sh status     # is it running
#   sudo sh runner-setup.sh remove     # unregister and delete it (asks for a removal token)
#
# The token: the repository's Settings -> Actions -> Runners -> New self-hosted runner shows it in the `./config.sh --token`
# line (valid one hour; it only registers a runner). It is read from the terminal, never stored.
#
#   RUNNER_REPO=<owner/repo>   which repository (default noknoh12345-afk/bds-lab)
#   RUNNER_LABELS=<a,b>        its labels (default bds-vps: what vps.yml asks for)
#   RUNNER_NAME=<name>         its name on GitHub (default this host's name)
#   RUNNER_USER=<user>         the user it runs as: made if missing, never root, no sudo (default ghrunner)
#   RUNNER_DIR=<folder>        where it lives (default /opt/actions-runner)
#   RUNNER_TOKEN=<token>       instead of the prompt (for a script; it shows in this shell's environment)
#
# Safety, read once: a self-hosted runner runs whatever a workflow of this repository tells it to. This repository is public,
# so set Settings -> Actions -> General -> "Require approval for all external contributors" and never approve a run of a pull
# request from a fork you have not read: otherwise a stranger's pull request could run commands on this server. The runner's
# user has no sudo and owns only its own folders; keep nothing secret readable by it.
set -eu

REPO="${RUNNER_REPO:-noknoh12345-afk/bds-lab}"
LABELS="${RUNNER_LABELS:-bds-vps}"
NAME="${RUNNER_NAME:-$(hostname 2>/dev/null || echo vps)}"
USER_="${RUNNER_USER:-ghrunner}"
DIR="${RUNNER_DIR:-/opt/actions-runner}"

say() { printf '%s\n' "$*" >&2; }
die() { say ""; say "ERR $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
as_user() { if have runuser; then runuser -u "$USER_" -- "$@"; else su -s /bin/sh "$USER_" -c "$(printf '%s ' "$@")"; fi; }

ask_token() {   # ask_token <what for> -> TOKEN
  TOKEN="${RUNNER_TOKEN:-}"
  [ -n "$TOKEN" ] && return 0
  [ -r /dev/tty ] || die "no terminal to ask for the token: run this in an SSH session, or set RUNNER_TOKEN"
  say ""
  say "$1"
  say "  https://github.com/$REPO/settings/actions/runners/new   (the value after --token; valid for one hour)"
  printf 'token (not shown): ' >&2
  stty -echo </dev/tty 2>/dev/null || true
  IFS= read -r TOKEN </dev/tty || true
  stty echo </dev/tty 2>/dev/null || true
  say ""
  TOKEN=$(printf '%s' "$TOKEN" | tr -d ' \r\n')
  [ -n "$TOKEN" ] || die "no token given"
}

[ "$(uname -s)" = Linux ] || die "this script is for a Linux server (a Windows or macOS machine: GitHub's own instructions on the Runners page)"
[ "$(id -u)" = 0 ] || die "run it as root:   sudo sh $0 ${1:-}"
case "$USER_" in root) die "RUNNER_USER=root: the runner must not run as root" ;; esac

case "${1:-install}" in
status)
  [ -x "$DIR/svc.sh" ] || die "no runner in $DIR"
  cd "$DIR" && ./svc.sh status
  exit 0 ;;
remove)
  [ -x "$DIR/config.sh" ] || die "no runner in $DIR"
  cd "$DIR"
  ./svc.sh stop >/dev/null 2>&1 || true
  ./svc.sh uninstall >/dev/null 2>&1 || true
  ask_token "A removal token for $REPO (the Runners page -> this runner -> Remove shows it):"
  as_user ./config.sh remove --token "$TOKEN" || say "W could not unregister it on GitHub: remove it on the Runners page"
  cd / && rm -rf "$DIR"
  say "OK removed (the user $USER_ and its home stay: userdel -r $USER_ deletes them, with the lab's caches)"
  exit 0 ;;
install) ;;
*) die "usage: sh $0 [install|status|remove]" ;;
esac

# ---- 1. the machine ----
case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) die "no GitHub runner for a $(uname -m) CPU" ;; esac
have systemctl && [ -d /run/systemd/system ] || die "no systemd here: the runner's service needs it (a container-type VPS without systemd cannot keep a runner)"
if ls /lib/ld-musl-* >/dev/null 2>&1; then die "this Linux uses musl libc (Alpine): the runner and the Bedrock server need glibc (Debian, Ubuntu, Fedora ...)"; fi
[ "$arch" = x64 ] || say "W this server's CPU is ARM: the Bedrock server is an x86-64 program and would run emulated in docker (slow). An x86-64 VPS is the better place."
mem=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
[ "$mem" -ge 1800 ] || say "W only ${mem} MB of memory: the server plus the lab want about 2 GB (add swap, or expect out-of-memory stops)"
say "runner for $REPO on $(hostname) (linux-$arch, ${mem} MB): user $USER_, folder $DIR, labels self-hosted,$LABELS"

# ---- 2. packages: what this script, the runner and the lab need ----
if have apt-get; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates tar gzip unzip git gcc libc6-dev >&2
elif have dnf; then dnf install -y -q curl ca-certificates tar gzip unzip git gcc glibc-devel >&2
elif have yum; then yum install -y -q curl ca-certificates tar gzip unzip git gcc glibc-devel >&2
elif have zypper; then zypper --non-interactive --quiet install curl ca-certificates tar gzip unzip git gcc glibc-devel >&2
elif have pacman; then pacman -Sy --noconfirm --needed curl ca-certificates tar gzip unzip git gcc >&2
else say "W no package manager this script knows: curl tar gzip unzip git and a C compiler must already be here"; fi
have curl || die "curl is needed"

# ---- 3. the runner's own user: no sudo, no root ----
if ! id "$USER_" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$USER_" || die "could not create the user $USER_"
  say "made the user $USER_ (no sudo)"
fi

# ---- 4. the runner program, checked against the hash GitHub publishes for it ----
if [ -x "$DIR/config.sh" ] && [ -e "$DIR/.runner" ]; then
  say "a runner is already configured in $DIR: restarting its service (to register it again: sh $0 remove, then install)"
  cd "$DIR" && { ./svc.sh install "$USER_" >/dev/null 2>&1 || true; ./svc.sh start >/dev/null 2>&1 || true; ./svc.sh status || true; }
  exit 0
fi
rel=$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' https://api.github.com/repos/actions/runner/releases/latest) || die "cannot ask api.github.com for the runner's latest release (network, or the hourly limit for this address: try again later)"
ver=$(printf '%s' "$rel" | grep -o '"tag_name": *"v[0-9.]*"' | head -1 | grep -o '[0-9][0-9.]*')
[ -n "$ver" ] || die "could not read the runner's version from GitHub's answer"
file="actions-runner-linux-$arch-$ver.tar.gz"
# (the release notes list each file's SHA-256: "<file> <!-- BEGIN SHA linux-x64 --><hash>", or plainly "<file> <hash>")
want=$(printf '%s' "$rel" | grep -o "BEGIN SHA linux-$arch -->[0-9a-f]\{64\}" | grep -o '[0-9a-f]\{64\}' | head -1)
[ -n "$want" ] || want=$(printf '%s' "$rel" | grep -o "$file \{1,3\}[0-9a-f]\{64\}" | grep -o '[0-9a-f]\{64\}$' | head -1)
[ -n "$want" ] || die "GitHub's release notes for the runner $ver carry no SHA-256 for linux-$arch: not installing an unchecked program (see https://github.com/actions/runner/releases)"
tmp=$(mktemp -d)
say "downloading the runner $ver ..."
curl -fsSL --retry 3 "https://github.com/actions/runner/releases/download/v$ver/$file" -o "$tmp/$file" || die "cannot download the runner"
got=$(sha256sum "$tmp/$file" | cut -d' ' -f1)
[ "$want" = "$got" ] || { rm -rf "$tmp"; die "the runner's checksum does not match (wanted $want, got $got): not installing it"; }
mkdir -p "$DIR"
tar -xzf "$tmp/$file" -C "$DIR"
rm -rf "$tmp"
"$DIR/bin/installdependencies.sh" >&2 || say "W the runner's installdependencies.sh reported a problem: if the runner does not start, its message names the library"
chown -R "$USER_:" "$DIR"

# ---- 5. register it with the repository, start it as a service ----
ask_token "A registration token for $REPO:"
cd "$DIR"
as_user ./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" --name "$NAME" --labels "$LABELS" --work _work --replace \
  || die "GitHub did not take the registration (a token older than an hour, or one from another repository's page?)"
TOKEN=""
./svc.sh install "$USER_" >&2
./svc.sh start >&2
sleep 3
./svc.sh status >&2 || true

say ""
say "OK the runner \"$NAME\" is registered for $REPO and runs as a service (it starts again after a reboot)."
say "   check:  https://github.com/$REPO/settings/actions/runners   (it should say Idle)"
say "   use:    GitHub -> Actions -> vps -> Run workflow   (args: status | selftest | go -a <addon> ...)"
say "   once:   Settings -> Actions -> General -> \"Require approval for all external contributors\"   (see the top of this file)"

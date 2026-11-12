#!/bin/bash
# Runs every host test against the normal and the drifted mock.
cd "$(dirname "$0")/../build-host" || exit 1
LOGS=${LOGS:-${TMPDIR:-/tmp}/scripteval-test-logs}
mkdir -p "$LOGS"
fail=0
run() {
    local name=$1; shift
    "$@" > "$LOGS/$name.out" 2>&1
    local rc=$?
    local n=$(grep -c 'EXPECTATION FAILED' "$LOGS/$name.out")
    echo "$name: exit=$rc failures=$n"
    [ $rc -ne 0 ] && fail=1
}
run basic timeout 300 ./scripteval_test ../test/basic.txt
run api timeout 300 ./scripteval_test ../test/api.txt
run events timeout 300 ./scripteval_test ../test/events.txt
run ui env FAKE_LAUNCHER=1 timeout 300 ./scripteval_test ../test/ui.txt
run alt_api env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/api.txt
run alt_events env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/events.txt
run lifecycle timeout 300 ./scripteval_test ../test/lifecycle.txt
run alt_lifecycle env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/lifecycle.txt
run dbgscan timeout 300 ./scripteval_test ../test/dbgscan.txt
run alt_dbgscan env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/dbgscan.txt
run forms env FAKE_LAUNCHER=1 timeout 300 ./scripteval_test ../test/forms.txt
run scoreboard timeout 300 ./scripteval_test ../test/scoreboard.txt
run alt_scoreboard env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/scoreboard.txt
run modules timeout 300 ./scripteval_test ../test/modules.txt
run alt_modules env MOCK_GAME_LIB=./alt/libminecraftpe.so timeout 300 ./scripteval_test ../test/modules.txt
mkdir -p /tmp/scripteval-test && touch /tmp/scripteval-test/running.marker
run safemode env KEEP_MARKER=1 SAFE_MODE=auto timeout 300 ./scripteval_test ../test/safemode.txt
# Studio's ZIP reader / pack finder (Node) against archives written by Python's zipfile
run zip python3 ../test/zip_test.py
# Studio server (HTTP / WebSocket / MCP / REPL auth / resource packs); add the UI with: STUDIO_UI=1
run studio timeout 900 python3 ../test/studio_test.py ${STUDIO_UI:+--ui}
echo "logs: $LOGS"
exit $fail

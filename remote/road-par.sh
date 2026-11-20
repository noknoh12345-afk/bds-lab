# road-par.sh <worker n> <scenario> [note]: one road scenario (remote/labtest.mjs road_*) in /home/claude/bds-lab$n (n=1 → bds-lab), with
# its own port and run folder (apart from the dragon's par.sh workers). Result line → /tmp/road.txt; the scenario's output →
# /tmp/road<n>-<time>.log; the bot's log → /tmp/roadbot<n>/run/out.log, kept afterwards as /tmp/rout<n>-<time>.log. Env passes through.
n=$1; sc=$2; d=/home/claude/bds-lab; [ "$n" != 1 ] && d=/home/claude/bds-lab$n
cd $d || exit 1
[ "$n" != 1 ] && cp -a /home/claude/bds-lab/remote/*.cjs /home/claude/bds-lab/remote/*.mjs $d/remote/ && cp -a /home/claude/bds-lab/common/*.cjs $d/common/
t=$(date +%m%d_%H%M)
echo "--- r$n $sc start $(date +%H:%M) $(git -C /home/claude/bds-lab log --oneline -1 | cut -c1-7) ${3:-}" >> /tmp/road.txt
LAB_PORT=$((19170 + n * 4)) LABTEST_RUN=/tmp/roadbot$n/run timeout ${ROAD_TIMEOUT:-36000} node remote/labtest.mjs $sc > /tmp/road$n-$t.log 2>&1
cp /tmp/roadbot$n/run/out.log /tmp/rout$n-$t.log 2>/dev/null
echo "r$n $sc $(date +%H:%M): $(grep -E '^(PASS|FAIL) ' /tmp/road$n-$t.log | head -1 | cut -c1-500)" >> /tmp/road.txt

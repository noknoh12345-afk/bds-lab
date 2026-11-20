# road-stop.sh <worker n>: stop a road worker (its scenario, its bot, its lab server). Matches each process by its environment
# (LABTEST_RUN / BOT_RUN) or its exact argv, never a pattern in some other command line (a pkill -f once took the calling shell).
n=$1; d=/home/claude/bds-lab; [ "$n" != 1 ] && d=/home/claude/bds-lab$n
for p in $(pgrep -x bash); do [ "$p" = "$$" ] && continue; tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -q "^bash /tmp/road-par.sh $n " && kill $p; done
for p in $(pgrep -f "labtest.mjs"); do grep -qz "LABTEST_RUN=/tmp/roadbot$n/run" /proc/$p/environ 2>/dev/null && kill $p; done
for p in $(pgrep -f "remote/bot.cjs"); do grep -qz "BOT_RUN=/tmp/roadbot$n/run" /proc/$p/environ 2>/dev/null && kill $p; done
(cd $d && LAB_PORT=$((19170 + n * 4)) node lab.mjs down >/dev/null 2>&1)
echo "worker $n stopped"

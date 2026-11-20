# road-stop.sh <worker n>: stop a road worker (its scenario, its bot, its lab server)
n=$1; d=/home/claude/bds-lab; [ "$n" != 1 ] && d=/home/claude/bds-lab$n
pkill -f "road-par.sh $n " ; pkill -f "LABTEST_RUN=/tmp/roadbot$n/run" 
for p in $(pgrep -f "node remote/labtest.mjs"); do grep -qz "LABTEST_RUN=/tmp/roadbot$n/run" /proc/$p/environ 2>/dev/null && kill $p; done
for p in $(pgrep -f "remote/bot.cjs"); do grep -qz "BOT_RUN=/tmp/roadbot$n/run" /proc/$p/environ 2>/dev/null && kill $p; done
(cd $d && LAB_PORT=$((19170 + n * 4)) node lab.mjs down >/dev/null 2>&1)
echo "worker $n stopped"

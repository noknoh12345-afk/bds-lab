# par.sh <worker n> <runs> : dragon runs in /home/claude/bds-lab$n (n=1 → bds-lab), its own port and run folder
n=$1; runs=$2; d=/home/claude/bds-lab; [ "$n" != 1 ] && d=/home/claude/bds-lab$n
cd $d; [ "$n" != 1 ] && cp -a /home/claude/bds-lab/remote/*.cjs /home/claude/bds-lab/remote/*.mjs $d/remote/ && cp -a /home/claude/bds-lab/common/*.cjs $d/common/
for i in $(seq 1 $runs); do
  LAB_PORT=$((19140 + n * 4)) LABTEST_RUN=/tmp/labbot$n/run LABTEST_BEDS=${LABTEST_BEDS:-16} DRAGON_MS=${DRAGON_MS:-1200000} timeout ${PAR_TIMEOUT:-3000} node remote/labtest.mjs dragon > /tmp/par$n-$i.log 2>&1
  o=/tmp/labbot$n/run/out.log; cp $o /tmp/pout$n-$i.log 2>/dev/null
  echo "w$n.$i: $(grep -c 'blown' $o) beds; $(grep 'its health' $o | tail -1 | sed 's/^\([0-9:]*\) dragon: \([0-9]* s\).*its health \([0-9]*\) of 200.*/\2 dragon \3/'); $(grep -o 'died ([^)]*)\|dragon: the exit portal is open' $o | tail -1)" >> /tmp/par.txt
done

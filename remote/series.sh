# series.sh <n> : worker n runs the dragon again and again (waits for a run already going)
n=$1
while pgrep -f "/tmp/par.sh $n 1" >/dev/null; do sleep 20; done
while true; do
  [ "$n" != 1 ] && cp -a /home/claude/bds-lab/remote/*.cjs /home/claude/bds-lab/remote/*.mjs /home/claude/bds-lab$n/remote/ && cp -a /home/claude/bds-lab/common/*.cjs /home/claude/bds-lab$n/common/
  [ -f /tmp/pout$n-1.log ] && mv /tmp/pout$n-1.log /tmp/pout$n-$(date +%m%d_%H%M).log
  echo "--- w$n start $(date +%H:%M) $(git -C /home/claude/bds-lab log --oneline -1 | cut -c1-7)" >> /tmp/par.txt
  bash /tmp/par.sh $n 1
  sleep 5
done

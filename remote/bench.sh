# bench.sh <workers> [runs each] : the dragon in parallel, one lab per worker; results in /tmp/par.txt (never two at once)
if pgrep -f "par.sh" >/dev/null; then echo "a bench is still running: not starting another"; exit 1; fi
echo "--- bench $(date +%H:%M) $1 workers" >> /tmp/par.txt
for n in $(seq 1 $1); do nohup bash /tmp/par.sh $n ${2:-1} >/dev/null 2>&1 & sleep 3; done

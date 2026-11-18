# bench.sh <workers> [runs each] : the dragon in parallel, one lab per worker; results in /tmp/par.txt
rm -f /tmp/par.txt
for n in $(seq 1 $1); do nohup bash /tmp/par.sh $n ${2:-1} >/dev/null 2>&1 & sleep 3; done

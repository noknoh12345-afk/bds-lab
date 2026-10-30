#!/bin/bash
# the experiments the 2026-10-31 session did not finish (13 songs): residual voiced/fit with the drums off / as noise attacks,
# command budgets, and the 11-band noise layout. Run from tools/exp; results in results/next.jsonl
cd "$(dirname "$0")"
U=$(cd ../.. && pwd)
node build_exp.mjs "$U/src/main.ts" "$U/corpus/renders/exp/bundles/real.js"
SPEC='{"oneshot_latency_ms":-45}'
P='"mode":"quality","voices":24,"bundle":"real"'
V=()
V+=("{\"name\":\"shipped\",\"conv\":{},\"play\":{$P,\"cmds\":[\"spectral:drums ahead\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"voiced_off\",\"conv\":{\"residual\":\"voiced\"},\"play\":{$P,\"cmds\":[\"spectral:drums off\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"fit_off\",\"conv\":{\"residual\":\"fit\"},\"play\":{$P,\"cmds\":[\"spectral:drums off\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"voiced_noise\",\"conv\":{\"residual\":\"voiced\"},\"play\":{$P,\"cmds\":[\"spectral:drums noise\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"voiced_behind\",\"conv\":{\"residual\":\"voiced\"},\"play\":{$P,\"cmds\":[\"spectral:drums behind\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"voiced_off_b24\",\"conv\":{\"residual\":\"voiced\"},\"play\":{$P,\"cmds\":[\"spectral:drums off\",\"spectral:engine 0 false 0 24\"]},\"spec\":$SPEC}")
V+=("{\"name\":\"voiced_light\",\"conv\":{\"residual\":\"voiced\"},\"play\":{\"mode\":\"light\",\"bundle\":\"real\"},\"spec\":$SPEC}")
python3 run_exp.py results/next.jsonl "${V[@]}" 2>&1 | grep --line-buffered -v Warn

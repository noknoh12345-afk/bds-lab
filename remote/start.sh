#!/bin/bash
# bdslab remote bot: installs what it needs once (Node 22 if missing, bedrock-protocol, node-datachannel), then stays in the server.
# ./remote/start.sh            (edit remote/config.json first: host, port, webhook)
set -e
cd "$(dirname "$0")"
NODE=node
ver() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0; }
if [ "$(ver node)" -lt 22 ] 2>/dev/null; then
  if [ ! -x .node/bin/node ]; then
    os=$(uname -s | tr A-Z a-z); arch=$(uname -m); [ "$arch" = x86_64 ] && arch=x64; [ "$arch" = aarch64 ] && arch=arm64
    v=v22.12.0; echo "Node 22 is not here: fetching $v ($os-$arch) into remote/.node"
    curl -fsSL "https://nodejs.org/dist/$v/node-$v-$os-$arch.tar.gz" | tar xz && rm -rf .node && mv "node-$v-$os-$arch" .node
  fi
  NODE="$PWD/.node/bin/node"; export PATH="$PWD/.node/bin:$PATH"
fi
if [ ! -d .deps/node_modules/bedrock-protocol ] || [ ! -d .deps/node_modules/node-datachannel ]; then
  # bedrock-protocol lists prismarine-xbox-services as a GitHub dependency (newer npm refuses those); it is only used to join
  # friends' worlds through Xbox sessions, never for a direct join to a server: a placeholder takes its place
  mkdir -p .deps/stub/prismarine-xbox-services && cd .deps
  echo '{"name":"prismarine-xbox-services","version":"0.0.0","main":"index.js"}' > stub/prismarine-xbox-services/package.json
  echo 'module.exports = { XboxClient: class { constructor () { throw new Error("bdslab remote: Xbox sessions (friends worlds) are not used") } } }' > stub/prismarine-xbox-services/index.js
  # (an absolute path: npm resolves a relative file: override against the dependent, bedrock-protocol, and links nothing)
  echo "{\"private\":true,\"overrides\":{\"prismarine-xbox-services\":\"file:$PWD/stub/prismarine-xbox-services\"}}" > package.json
  echo "installing bedrock-protocol and node-datachannel (once)"
  npm i bedrock-protocol@latest --ignore-scripts --no-audit --no-fund --loglevel=error
  npm i node-datachannel@latest --no-audit --no-fund --loglevel=error
  cd ..
fi
# exit 75 = `restart` (asked for): fetch the newest and start again. Anything else (quit, Ctrl+C, a crash) ends it: no leave/join
# that nobody asked for
while true; do
  set +e; "$NODE" bot.cjs "$@"; code=$?; set -e
  [ $code -eq 75 ] || exit $code
  b=$(git -C .. rev-parse --abbrev-ref HEAD)
  git -C .. fetch -q --depth 1 origin "$b" && git -C .. checkout -q -B "$b" FETCH_HEAD || echo "update failed: starting the same version"
done

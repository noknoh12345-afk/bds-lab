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
  mkdir -p .deps && cd .deps && [ -f package.json ] || echo '{"private":true}' > package.json
  echo "installing bedrock-protocol and node-datachannel (once)"
  npm i bedrock-protocol@latest --ignore-scripts --no-audit --no-fund --loglevel=error
  npm i node-datachannel@latest --no-audit --no-fund --loglevel=error
  cd ..
fi
exec "$NODE" bot.cjs "$@"

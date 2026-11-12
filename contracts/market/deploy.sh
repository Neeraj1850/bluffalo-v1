#!/bin/sh
# Build and deploy the market contract to NEAR testnet.
#   ./deploy.sh          redeploy code (keeps state)
#   ./deploy.sh init     first deploy: also calls new(operator)
# Keys are read from ~/.near-credentials (near CLI legacy keychain), never from this repo.
set -eu
CONTRACT=${CONTRACT:-bluffalo-market.testnet}
OPERATOR=${OPERATOR:-npoker-op-43b602.testnet}
cd "$(dirname "$0")"

cargo near build non-reproducible-wasm

if [ "${1:-}" = "init" ]; then
  near contract deploy "$CONTRACT" use-file target/near/market.wasm \
    with-init-call new json-args "{\"operator\":\"$OPERATOR\"}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
    network-config testnet sign-with-legacy-keychain send
else
  near contract deploy "$CONTRACT" use-file target/near/market.wasm \
    without-init-call network-config testnet sign-with-legacy-keychain send
fi

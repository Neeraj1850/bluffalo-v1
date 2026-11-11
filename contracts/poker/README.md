# poker contract

Escrow and on-chain deal commitments for Bluffalo (Rust, near-sdk 5). See the root README for how a hand flows.

## Testnet

| | Account |
| --- | --- |
| Contract | [`npk-63o824.testnet`](https://testnet.nearblocks.io/address/npk-63o824.testnet) |
| Operator (commits and settles hands, funds the house) | [`npoker-op-43b602.testnet`](https://testnet.nearblocks.io/address/npoker-op-43b602.testnet) |

Keys live in `~/.near-credentials/testnet/` on the machine that created them — never in this repo.

## Build, test, deploy

```bash
cargo test                         # unit tests
./deploy.sh                        # redeploy code (needs cargo-near + near CLI)
./deploy.sh init                   # first deploy to a fresh account

# Read any hand: seeds, stakes, payout
near contract call-function as-read-only npk-63o824.testnet get_hand json-args '{"hand_id":"0123abcd"}' network-config testnet now
```

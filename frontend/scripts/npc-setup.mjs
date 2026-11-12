// Create the market's three NPC accounts (scout/bookie/tilt.<operator>), each with
// a fresh full-access key and 0.5 testnet NEAR from the operator, then print the
// env lines to paste into .env.local / Railway. Testnet only. Skips accounts that exist.
//
//   node --env-file=.env.local scripts/npc-setup.mjs
import { Account, actions, JsonRpcProvider, KeyPair } from "near-api-js";

const FUNDING = 5n * 10n ** 23n; // 0.5 NEAR
const { NEAR_RPC_URL: rpc = "https://test.rpc.fastnear.com", NEAR_OPERATOR_ID: operator, NEAR_OPERATOR_KEY: opKey } = process.env;
if (!operator || !opKey) throw new Error("Set NEAR_OPERATOR_ID and NEAR_OPERATOR_KEY (run with --env-file=.env.local)");
if (!rpc.includes("test")) throw new Error("Refusing to run against a non-testnet RPC");
const provider = new JsonRpcProvider({ url: rpc });
const op = new Account(operator, provider, opKey);

for (const name of ["scout", "bookie", "tilt"]) {
  const id = `${name}.${operator}`;
  if (await provider.viewAccount({ accountId: id }).then(() => true, () => false)) {
    console.error(`${id} already exists, skipped (its key is in your env already)`);
    continue;
  }
  const key = KeyPair.fromRandom("ed25519");
  const res = await op.signAndSendTransaction({
    receiverId: id,
    actions: [actions.createAccount(), actions.transfer(FUNDING), actions.addFullAccessKey(key.getPublicKey())],
    waitUntil: "FINAL",
  });
  console.error(`created ${id} (${res.transaction.hash})`);
  console.log(`NPC_${name.toUpperCase()}=${id}:${key.toString()}`);
}

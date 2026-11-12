// Deploy the poker contract to a fresh testnet account (funded by the public faucet),
// initialise it, then delete its only full-access key so the code can never change.
//   node --env-file=.env.local scripts/deploy-contract.mjs   (build first: cargo near build)
import { Account, actions, JsonRpcProvider, KeyPair } from "near-api-js";
import fs from "fs";
const rpc = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL });
const key = KeyPair.fromRandom("ed25519");
const id = `bluffalo-poker-${Date.now().toString(36)}.testnet`;
const r = await fetch("https://helper.nearprotocol.com/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }) });
if (!r.ok) throw new Error("faucet " + r.status);
for (let i = 0; i < 20; i++) { try { await rpc.viewAccount({ accountId: id }); break; } catch { await new Promise(s => setTimeout(s, 1500)); } }
const acct = new Account(id, rpc, key.toString());
const wasm = fs.readFileSync("../contracts/poker/target/near/poker.wasm");
const dep = await acct.signAndSendTransaction({ receiverId: id, waitUntil: "FINAL", actions: [
  actions.deployContract(wasm),
  actions.functionCall("new", { operator: process.env.NEAR_OPERATOR_ID }, 30_000_000_000_000n, 0n),
]});
console.log("contract", id, "deploy+init tx", dep.transaction.hash);
const del = await acct.signAndSendTransaction({ receiverId: id, waitUntil: "FINAL", actions: [actions.deleteKey(key.getPublicKey())] });
console.log("full-access key deleted tx", del.transaction.hash);
const keys = await rpc.query({ request_type: "view_access_key_list", finality: "final", account_id: id });
const st = await rpc.viewAccount({ accountId: id });
console.log("remaining keys:", keys.keys.length, "code_hash:", st.code_hash);
console.log("operator():", await rpc.callFunction({ contractId: id, method: "operator", args: {} }));

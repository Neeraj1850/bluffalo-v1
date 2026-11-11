// Top up the house bankroll from the public NEAR testnet faucet.
//
// Each round: the faucet service creates a fresh account with 10 testnet NEAR,
// that account deletes itself with the operator as beneficiary (moving the whole
// balance), and the operator pays it into the contract's operator-only
// `fund_house`. Testnet only.
//
//   node --env-file=.env.local scripts/house-topup.mjs [rounds=3]   (max 5)
//
// Be a good citizen: the faucet is shared by every NEAR developer. Run it when
// the house is actually low, not on a loop.
import { Account, actions, JsonRpcProvider, KeyPair } from "near-api-js";

const FAUCET = "https://helper.nearprotocol.com/account";
const MAX_ROUNDS = 5;
const GAS = 30_000_000_000_000n;
const yocto = (n) => Number(n / 10n ** 20n) / 1e4;

const { NEAR_RPC_URL: rpc = "https://test.rpc.fastnear.com", NEAR_CONTRACT_ID: contract, NEAR_OPERATOR_ID: operator, NEAR_OPERATOR_KEY: opKey } = process.env;
if (!contract || !operator || !opKey) throw new Error("Set NEAR_CONTRACT_ID, NEAR_OPERATOR_ID and NEAR_OPERATOR_KEY (run with --env-file=.env.local)");
if (!rpc.includes("test")) throw new Error("Refusing to run against a non-testnet RPC");
const rounds = Math.min(MAX_ROUNDS, Math.max(1, Number(process.argv[2] ?? 3)));
const provider = new JsonRpcProvider({ url: rpc });
const op = new Account(operator, provider, opKey);
const GAS_MARGIN = 5n * 10n ** 21n; // 0.005 NEAR: gas for deleting the account

const houseBalance = async () =>
  BigInt(await provider.callFunction({ contractId: contract, method: "house_balance", args: {} }));

console.log(`house before: ${yocto(await houseBalance())} NEAR`);
for (let i = 1; i <= rounds; i++) {
  const key = KeyPair.fromRandom("ed25519");
  const id = `bluffalo-faucet-${Date.now().toString(36)}.testnet`;
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!res.ok) {
    console.error(`round ${i}: faucet refused (${res.status} ${(await res.text()).slice(0, 120)}). Stopping.`);
    break;
  }
  let balance = 0n;
  for (let t = 0; t < 20 && balance === 0n; t++) {
    await new Promise((r) => setTimeout(r, 1500));
    balance = await provider.viewAccount({ accountId: id }).then((v) => BigInt(v.amount)).catch(() => 0n);
  }
  if (balance === 0n) {
    console.error(`round ${i}: ${id} never received funds. Stopping.`);
    break;
  }
  const acct = new Account(id, provider, key.toString());
  const del = await acct.signAndSendTransaction({ receiverId: id, actions: [actions.deleteAccount(operator)], waitUntil: "FINAL" });
  const deposit = balance - GAS_MARGIN;
  const fund = await op.callFunctionRaw({ contractId: contract, methodName: "fund_house", args: {}, deposit, gas: GAS, waitUntil: "FINAL" });
  console.log(`round ${i}: +${yocto(deposit)} NEAR via ${id}  delete ${del.transaction.hash}  fund_house ${fund.transaction.hash}`);
}
console.log(`house after:  ${yocto(await houseBalance())} NEAR`);

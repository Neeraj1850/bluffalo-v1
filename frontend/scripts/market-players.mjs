// Fill the testnet market with player activity: five demo players (own NEAR accounts)
// each publish a strategy at a low ask, then buy from each other and resell a few seats.
// Testnet only. Writes the strategies + events to BACKEND_URL; prints rows for
// POST /api/market/import on another deployment. Re-running reuses existing accounts
// (keys saved to scripts/.market-players.json, gitignored) and skips taken names.
//
//   node --env-file=.env.local scripts/market-players.mjs
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Account, actions, JsonRpcProvider, KeyPair } from "near-api-js";

const env = process.env;
const rpc = env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
if (!rpc.includes("test")) throw new Error("Refusing to run against a non-testnet RPC");
for (const k of ["NEAR_OPERATOR_ID", "NEAR_OPERATOR_KEY", "NEAR_MARKET_ID", "BACKEND_URL", "BACKEND_TOKEN"])
  if (!env[k]) throw new Error(`Set ${k} (run with --env-file=.env.local)`);

const GNEAR = 10n ** 21n; // 1 GNEAR = 0.001 NEAR
const FUND = 8n * 10n ** 22n; // 0.08 NEAR each: gas + a few seats
const TGAS = 10n ** 12n;
const market = env.NEAR_MARKET_ID;
const KEYS = new URL("./.market-players.json", import.meta.url);

// name, strategy title, params (same keys/order as lib/data/strategy.ts PARAMS), seats, ask (GNEAR)
const PLAYERS = [
  ["ava", "Ava's Trap", { aggression: 40, bluff: 55, position: 70, sizing: 45 }, 10, 3.5],
  ["ben", "Ben Nit", { aggression: 15, bluff: 5, position: 50, sizing: 30 }, 10, 2.5],
  ["cleo", "Cleo Barrel", { aggression: 80, bluff: 45, position: 75, sizing: 85 }, 10, 5],
  ["dev", "Dev Button", { aggression: 55, bluff: 25, position: 95, sizing: 55 }, 10, 4],
  ["eli", "Eli Chaos", { aggression: 95, bluff: 85, position: 20, sizing: 95 }, 10, 3],
];
// buyer, seller, token owner name — first sales, then resales.
const BUYS = [["ben", "ava"], ["cleo", "ava"], ["dev", "cleo"], ["eli", "dev"], ["ava", "dev"], ["cleo", "ben"]];
const RESALES = [["ben", "ava", 4.5], ["dev", "cleo", 6.5]]; // holder relists a seat bought above, higher
const RESALE_BUYS = [["eli", "ben", "ava"]]; // eli buys ava's strategy from ben

const provider = new JsonRpcProvider({ url: rpc });
const op = new Account(env.NEAR_OPERATOR_ID, provider, env.NEAR_OPERATOR_KEY);
const saved = existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, "utf8")) : {};
const api = async (path, body) => {
  const res = await fetch(env.BACKEND_URL + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.BACKEND_TOKEN}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const call = (acct, methodName, args, deposit = 1n, gas = 30n * TGAS) =>
  acct.callFunctionRaw({ contractId: market, methodName, args, deposit, gas }).then((r) => r.transaction.hash);

// 1. Accounts (named sub-accounts of the operator), funded once.
const who = {};
for (const [name] of PLAYERS) {
  const id = `${name}.${env.NEAR_OPERATOR_ID}`;
  if (!saved[id]) {
    const key = KeyPair.fromRandom("ed25519");
    await op.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.transfer(FUND), actions.addFullAccessKey(key.getPublicKey())], waitUntil: "FINAL" });
    saved[id] = key.toString();
    writeFileSync(KEYS, JSON.stringify(saved, null, 2));
    console.error(`created ${id}`);
  }
  const { id: sid } = await api("/sessions", {});
  const session = await api(`/sessions/${sid}/user`, { user_id: `demo:${name}` });
  who[name] = { id, acct: new Account(id, provider, saved[id]), session: session.id };
}

// 2. Each publishes: operator mints seats to the player, the player lists them.
const { strategies } = await api("/strategies");
const token = {};
const rows = [];
for (const [name, title, params, seats, ask] of PLAYERS) {
  const existing = strategies.find((s) => s.name === title);
  if (existing) { token[name] = existing.id; continue; }
  const id = "s" + randomBytes(4).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const paramsHash = createHash("sha256").update(JSON.stringify(params) + salt).digest("hex");
  const mintTx = await call(op, "mint", { token_id: id, owner_id: who[name].id, amount: String(seats), title, params_hash: paramsHash, royalty_bps: 1000, max_supply: seats }, 10n ** 22n, 50n * TGAS);
  const price = BigInt(Math.round(ask * 1000)) * (GNEAR / 1000n);
  const listTx = await call(who[name].acct, "list", { token_id: id, amount: String(seats), price_each: price.toString(), memo: "" });
  const row = { id, name: title, params, salt, params_hash: paramsHash, mint_tx: mintTx };
  rows.push({ ...row, creator: name });
  await api("/strategies", { ...row, creator_session_id: who[name].session, creator_account: who[name].id, contract_id: market });
  await api("/market/events", { strategy_id: id, kind: "mint", account: who[name].id, amount: seats, tx: mintTx });
  await api("/market/events", { strategy_id: id, kind: "list", account: who[name].id, amount: seats, price_yocto: price.toString(), tx: listTx });
  token[name] = id;
  console.error(`${title}: ${id} listed ${seats} @ ${ask}`);
}

const listingOf = async (tokenId, seller) => {
  const ls = await provider.callFunction({ contractId: market, method: "listings", args: { from_index: 0, limit: 100 } });
  return ls.find((l) => l.token_id === tokenId && l.seller_id === seller);
};
const buy = async (buyer, seller, owner) => {
  const l = await listingOf(token[owner], who[seller].id);
  if (!l) return console.error(`no listing ${owner} from ${seller}, skipped`);
  const tx = await call(who[buyer].acct, "buy", { token_id: token[owner], seller_id: who[seller].id, amount: "1" }, BigInt(l.price_each), 50n * TGAS);
  await api("/market/events", { strategy_id: token[owner], kind: "sale", account: who[buyer].id, counterparty: who[seller].id, amount: 1, price_yocto: l.price_each, tx });
  console.error(`${buyer} bought ${owner}'s strategy from ${seller}`);
};

// 3. Trades: first sales, a couple of relists at a markup, one resale.
for (const [buyer, owner] of BUYS) await buy(buyer, owner, owner);
for (const [holder, owner, ask] of RESALES) {
  const price = BigInt(Math.round(ask * 1000)) * (GNEAR / 1000n);
  const tx = await call(who[holder].acct, "list", { token_id: token[owner], amount: "1", price_each: price.toString(), memo: "resale" });
  await api("/market/events", { strategy_id: token[owner], kind: "list", account: who[holder].id, amount: 1, price_yocto: price.toString(), tx, reason: "Resale" });
  console.error(`${holder} relisted ${owner}'s strategy @ ${ask}`);
}
for (const [buyer, seller, owner] of RESALE_BUYS) await buy(buyer, seller, owner);

if (rows.length) console.log(JSON.stringify({ rows }));

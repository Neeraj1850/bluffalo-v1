// Seed the market with the three house "Library" strategies (Rock, Shark, Maniac), minted to
// Bookie (the house broker) and listed at the base price, so the market is never empty.
// Testnet only; idempotent by name (skips a preset already in the backend).
//
//   node --env-file=.env.local scripts/market-seed.mjs
import { createHash, randomBytes } from "node:crypto";
import { Account, JsonRpcProvider } from "near-api-js";

const env = process.env;
const rpc = env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
if (!rpc.includes("test")) throw new Error("Refusing to run against a non-testnet RPC");
for (const k of ["NEAR_OPERATOR_ID", "NEAR_OPERATOR_KEY", "NEAR_MARKET_ID", "NPC_BOOKIE", "BACKEND_URL", "BACKEND_TOKEN"])
  if (!env[k]) throw new Error(`Set ${k} (run with --env-file=.env.local)`);

const SEATS = 25;
const PRICE_GNEAR = 10n; // rules.ts BASE_PRICE
const GNEAR = 10n ** 21n; // 1 GNEAR = 0.001 NEAR
// Same keys and order as PARAMS in lib/data/strategy.ts (the publish route hashes this canonical form).
const LIBRARY = [
  ["House Rock", { aggression: 20, bluff: 5, position: 60, sizing: 35 }],
  ["House Shark", { aggression: 65, bluff: 30, position: 85, sizing: 60 }],
  ["House Maniac", { aggression: 92, bluff: 70, position: 40, sizing: 90 }],
];

const provider = new JsonRpcProvider({ url: rpc });
const op = new Account(env.NEAR_OPERATOR_ID, provider, env.NEAR_OPERATOR_KEY);
const [bookieId, ...rest] = env.NPC_BOOKIE.split(":");
const bookie = new Account(bookieId, provider, rest.join(":"));
const market = env.NEAR_MARKET_ID;

const api = async (path, body) => {
  const res = await fetch(env.BACKEND_URL + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.BACKEND_TOKEN}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

const { strategies } = await api("/strategies");
const { id: sessionId } = await api("/sessions", {});
await api(`/sessions/${sessionId}/user`, { user_id: "npc:bookie" });

for (const [name, params] of LIBRARY) {
  if (strategies.some((s) => s.name === name)) {
    console.error(`${name} already seeded, skipped`);
    continue;
  }
  const tokenId = "s" + randomBytes(4).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const paramsHash = createHash("sha256").update(JSON.stringify(params) + salt).digest("hex");
  const minted = await op.callFunctionRaw({
    contractId: market,
    methodName: "mint",
    args: { token_id: tokenId, owner_id: bookieId, amount: String(SEATS), title: name, params_hash: paramsHash, royalty_bps: 1000, max_supply: SEATS },
    deposit: 10n ** 22n, // 0.01 NEAR storage, excess refunded
    gas: 50n * 10n ** 12n,
  });
  const mintTx = minted.transaction.hash;
  await api("/strategies", { id: tokenId, creator_session_id: sessionId, creator_account: bookieId, name, params, salt, params_hash: paramsHash, contract_id: market, mint_tx: mintTx });
  const listed = await bookie.callFunctionRaw({
    contractId: market,
    methodName: "list",
    args: { token_id: tokenId, amount: String(SEATS), price_each: (PRICE_GNEAR * GNEAR).toString(), memo: "House library line, listed at the base price" },
    deposit: 1n,
    gas: 30n * 10n ** 12n,
  });
  await api("/market/events", { strategy_id: tokenId, kind: "mint", account: bookieId, amount: SEATS, tx: mintTx, reason: "House library strategy" });
  await api("/market/events", { strategy_id: tokenId, kind: "list", account: bookieId, amount: SEATS, price_yocto: (PRICE_GNEAR * GNEAR).toString(), tx: listed.transaction.hash, reason: "Listed at the base price" });
  console.error(`${name}: ${tokenId} minted ${mintTx}, listed ${listed.transaction.hash}`);
}

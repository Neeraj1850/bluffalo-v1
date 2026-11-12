import { explain, fairValue, isClosed, priceChange, quote, type MarketStats } from "@/lib/market/rules";
import type { LiveHand } from "@/lib/poker/record";
import type { MarketEvent, MarketListing, MarketStrategy, Npc } from "@/lib/market/types";
import { backend } from "./backend";
import { callAs, fromYocto, send, toYocto, view, walletBalanceYocto } from "./near";
import { hasNearAiKey } from "./nearai";

/**
 * The strategy market contract (contracts/market) plus the server's pricing.
 * Server-only: signs with the operator (mint) and with custodial / NPC keys.
 * Amounts the UI sees are GNEAR; on-chain they are yocto via toYocto/fromYocto.
 */

export function marketId(): string {
  const id = process.env.NEAR_MARKET_ID;
  if (!id) throw new Error("NEAR_MARKET_ID is not set");
  return id;
}

/** Storage for a new token's state, paid by the operator; the contract refunds the excess. */
const MINT_STORAGE = 10n ** 22n; // 0.01 NEAR
/** buy = 3 plain transfers + state writes; 15 Tgas has headroom. */
export const BUY_GAS = 15_000_000_000_000n;
/** list / delist / use_license touch only contract state. */
export const CALL_GAS = 10_000_000_000_000n;
/**
 * What NEAR checks the signer's balance against for `gas` prepaid gas: it prices it
 * pessimistically at ~1e9 yocto/gas (observed: 100 Tgas reserved 0.1 NEAR), far above what burns.
 */
export const gasReserveYocto = (gas: bigint) => gas * 1_000_000_000n;
const ROYALTY_BPS = 1000;
const DAY = 24 * 60 * 60 * 1000;

export type ChainStrategy = {
  token_id: string;
  creator_id: string;
  title: string;
  params_hash: string;
  royalty_bps: number;
  max_supply: number;
  minted: string;
  supply: string;
};
export type ChainListing = { token_id: string; seller_id: string; amount: number; price_each: string; memo: string };
export type Signer = { account: string; key: string };

// ---- 15 s view cache (cleared after every write) ----

const g = globalThis as typeof globalThis & { __npMarketCache?: Map<string, { at: number; value: Promise<unknown> }> };
const cache = (g.__npMarketCache ??= new Map());
const TTL = 15_000;

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>;
  const value = fn();
  value.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), value });
  return value;
}
export const clearMarketCache = () => cache.clear();

// ---- Views ----

export const chainStrategies = () =>
  cached("strategies", () => view<ChainStrategy[]>("strategies", { limit: 200 }, marketId()));

/** Seats `account` holds of each token (same order). */
export const balances = (account: string, tokenIds: string[]) =>
  tokenIds.length
    ? cached(`bal:${account}:${tokenIds.join(",")}`, async () =>
        (await view<string[]>("mt_batch_balance_of", { account_id: account, token_ids: tokenIds }, marketId())).map(Number),
      )
    : Promise.resolve([] as number[]);

export const strategyOf = (agentId: string) => view<string | null>("strategy_of", { agent_id: agentId }, marketId());

/** Listings whose seller still holds the seats (the contract keeps stale ones until buy fails). */
export const liveListings = () =>
  cached("listings", async () => {
    const all = await view<ChainListing[]>("listings", { limit: 200 }, marketId());
    const sellers = [...new Set(all.map((l) => l.seller_id))];
    const held = new Map<string, number>();
    await Promise.all(
      sellers.map(async (s) => {
        const mine = all.filter((l) => l.seller_id === s);
        const bal = await balances(s, mine.map((l) => l.token_id));
        mine.forEach((l, i) => held.set(`${s}/${l.token_id}`, bal[i]));
      }),
    );
    return all.filter((l) => (held.get(`${l.seller_id}/${l.token_id}`) ?? 0) >= l.amount);
  });

// ---- Writes ----

async function done(tx: Promise<string>) {
  const hash = await tx;
  clearMarketCache();
  return hash;
}

/** Operator mints all `seats` to the creator: max supply = seats, 10% resale royalty. */
export const mint = (tokenId: string, owner: string, seats: number, title: string, paramsHash: string) =>
  done(
    send(
      "mint",
      { token_id: tokenId, owner_id: owner, amount: String(seats), title, params_hash: paramsHash, royalty_bps: ROYALTY_BPS, max_supply: seats },
      MINT_STORAGE,
      marketId(),
    ),
  );

/** List (or replace the listing of) `amount` seats at `price` GNEAR each. */
export const list = (s: Signer, tokenId: string, amount: number, price: number, memo = "") =>
  done(callAs(s.account, s.key, marketId(), "list", { token_id: tokenId, amount: String(amount), price_each: toYocto(price).toString(), memo }, 1n, CALL_GAS));

export const delist = (s: Signer, tokenId: string) =>
  done(callAs(s.account, s.key, marketId(), "delist", { token_id: tokenId }, 1n, CALL_GAS));

/** Buy one seat; deposit is the listing's own price (the contract refunds any excess). */
export const buy = (s: Signer, tokenId: string, seller: string, priceEachYocto: bigint) =>
  done(callAs(s.account, s.key, marketId(), "buy", { token_id: tokenId, seller_id: seller, amount: "1" }, priceEachYocto, BUY_GAS));

/** Burn one seat and bind the strategy to `agentId` (must be a sub-account of the operator). */
export const applyLicense = (s: Signer, tokenId: string, agentId: string) =>
  done(callAs(s.account, s.key, marketId(), "use_license", { token_id: tokenId, agent_id: agentId }, 1n, CALL_GAS));

export type EventIn = {
  strategy_id: string | null;
  kind: "mint" | "list" | "delist" | "sale" | "use" | "price" | "npc";
  account: string;
  counterparty?: string;
  price_yocto?: string;
  amount?: number;
  reason?: string;
  chat_id?: string;
  tx?: string;
};

/** Best effort: the chain is the truth, the feed is a convenience. */
export async function recordEvent(e: EventIn) {
  await backend("/market/events", { method: "POST", body: e }).catch((err) => console.error("[market] event", e.kind, err));
  cache.delete("events");
}

// ---- NPCs ----

export type NpcKey = Npc["key"];
export const NPC_NAMES: Record<NpcKey, string> = { scout: "Scout", bookie: "Bookie", tilt: "Tilt" };

/** NPCs configured as NPC_SCOUT / NPC_BOOKIE / NPC_TILT = "account:ed25519:key". */
export function npcSigners(): (Signer & { npc: NpcKey; name: string })[] {
  return (Object.keys(NPC_NAMES) as NpcKey[]).flatMap((npc) => {
    const raw = process.env[`NPC_${npc.toUpperCase()}`];
    const i = raw?.indexOf(":") ?? -1;
    if (!raw || i < 1) return [];
    return [{ npc, name: NPC_NAMES[npc], account: raw.slice(0, i), key: raw.slice(i + 1) }];
  });
}

export const cashOf = (account: string) => cached(`cash:${account}`, async () => fromYocto(await walletBalanceYocto(account)));

// ---- Pricing ----

export type BackendEvent = {
  id: number;
  strategy_id: string | null;
  kind: string;
  account: string;
  counterparty: string | null;
  price_yocto: string | null;
  amount: number | null;
  reason: string | null;
  chat_id: string | null;
  tx: string | null;
  created_at: string;
};
type Stat = { strategy_id: string; hands: number; stake: number; net: number; wins: number };

// ponytail: one window of the newest 200 events feeds demand, sparks and the feed; per-token queries if it gets busy
const recentEvents = () =>
  cached("events", async () => (await backend<{ events: BackendEvent[] }>("/market/events?limit=200"))?.events ?? []);
const stats = () =>
  cached("stats", async () => (await backend<{ stats: Stat[] }>("/strategies/stats"))?.stats ?? []);

export const gnear = (yocto: string | null) => (yocto ? fromYocto(yocto) : 0);

/** Quote every strategy from its record, its listed seats and 24 h demand. */
export async function priced(events?: BackendEvent[]) {
  const [strategies, listings, st, recent] = await Promise.all([chainStrategies(), liveListings(), stats(), recentEvents()]);
  const ev = events ?? recent;
  const since = Date.now() - DAY;
  return strategies.map((s) => {
    const mine = ev.filter((e) => e.strategy_id === s.token_id);
    const day = mine.filter((e) => Date.parse(e.created_at) >= since);
    const prices = mine.filter((e) => e.kind === "price").map((e) => gnear(e.price_yocto));
    const stat = st.find((x) => x.strategy_id === s.token_id);
    const asks = listings.filter((l) => l.token_id === s.token_id);
    const ms: MarketStats = {
      n: stat?.hands ?? 0,
      sumStake: stat?.stake ?? 0,
      sumNet: stat?.net ?? 0,
      listed: asks.reduce((n, l) => n + l.amount, 0),
      buyers24h: new Set(day.filter((e) => e.kind === "sale" && e.account !== s.creator_id).map((e) => e.account)).size,
      uses24h: day.filter((e) => e.kind === "use").length,
    };
    const prev = prices[0] ?? 0;
    const fair = fairValue(ms);
    return { s, stat, ms, prev, fair, price: quote(prev, fair), spark: prices.slice(0, 20).reverse(), asks };
  });
}

/** Persist this tick's quote per strategy (feeds `prev` and the sparkline). */
export async function recordPrices() {
  const rows = await priced();
  await Promise.all(
    rows.map((r) => recordEvent({ strategy_id: r.s.token_id, kind: "price", account: marketId(), price_yocto: toYocto(r.price).toString() })),
  );
  return rows;
}

// ---- What the routes return ----

const short = (a: string) => (/^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a.length > 24 ? `${a.slice(0, 12)}…${a.slice(-8)}` : a);

export function namer(caller: string | null) {
  const npcs = new Map(npcSigners().map((n) => [n.account, n.name]));
  return {
    kind: (a: string): MarketListing["sellerKind"] => (a === caller ? "you" : npcs.has(a) ? "npc" : "player"),
    // Named sub-accounts of the operator ("ava.<operator>") read as their first label.
    name: (a: string) =>
      a === caller ? "you" : (npcs.get(a) ?? (a.endsWith(`.${process.env.NEAR_OPERATOR_ID}`) ? a.split(".")[0] : short(a))),
  };
}

export function toListing(l: ChainListing, caller: string | null): MarketListing {
  const n = namer(caller);
  return {
    tokenId: l.token_id,
    seller: l.seller_id,
    sellerName: n.name(l.seller_id),
    sellerKind: n.kind(l.seller_id),
    amount: l.amount,
    priceEach: gnear(l.price_each),
    memo: l.memo,
  };
}

export function toEvent(e: BackendEvent, titles: Map<string, string>, caller: string | null): MarketEvent {
  const title = e.strategy_id ? (titles.get(e.strategy_id) ?? e.strategy_id) : null;
  const p = gnear(e.price_yocto).toFixed(1);
  const n = e.amount ?? 1;
  const action =
    {
      sale: `BUY ${n} × ${title} @ ${p}`,
      list: `LIST ${n} × ${title} @ ${p}`,
      delist: `DELIST ${title}`,
      mint: `MINT ${n} × ${title}`,
      use: `USE ${title}`,
      price: `PRICE ${title} ${p}`,
    }[e.kind] ?? "NOTE";
  return {
    id: e.id,
    at: e.created_at,
    actor: namer(caller).name(e.account),
    kind: e.kind,
    tokenId: e.strategy_id,
    title,
    action,
    reason: e.reason,
    chatId: e.chat_id,
    tx: e.tx,
  };
}

/** Strategies, listings and feed for `caller` (their custodial wallet, or null when signed out). */
export async function snapshot(caller: string | null, events?: BackendEvent[]) {
  const rows = await priced(events);
  const listings = await liveListings();
  const owned = caller ? await balances(caller, rows.map((r) => r.s.token_id)) : [];
  const names = namer(caller);
  const strategies: MarketStrategy[] = rows.map((r, i) => {
    const hands = r.stat?.hands ?? 0;
    const net = r.stat?.net ?? 0;
    return {
      tokenId: r.s.token_id,
      title: r.s.title,
      creator: r.s.creator_id,
      creatorName: names.name(r.s.creator_id),
      you: r.s.creator_id === caller,
      supply: Number(r.s.supply),
      maxSupply: r.s.max_supply,
      hands,
      net,
      roi: r.ms.sumStake > 0 ? net / r.ms.sumStake : 0,
      wins: r.stat?.wins ?? 0,
      rated: hands >= 100,
      price: r.price,
      prev: r.prev > 0 ? r.prev : r.price,
      fair: Math.round(r.fair * 100) / 100,
      change: priceChange(r.price, r.prev),
      why: explain(r.ms, r.prev),
      spark: r.spark,
      lowestAsk: r.asks.length ? Math.min(...r.asks.map((l) => gnear(l.price_each))) : null,
      owned: owned[i] ?? 0,
    };
  });
  const titles = new Map(rows.map((r) => [r.s.token_id, r.s.title]));
  const feed = (events ?? (await recentEvents())).filter((e) => e.kind !== "price");
  return { strategies, listings: listings.map((l) => toListing(l, caller)), feed: feed.map((e) => toEvent(e, titles, caller)) };
}

export async function npcRows(): Promise<Npc[]> {
  return Promise.all(
    npcSigners().map(async (n) => {
      const cash = await cashOf(n.account).catch(() => 0);
      return {
        key: n.npc,
        name: n.name,
        account: n.account,
        cash,
        closed: isClosed(cash),
        ...(n.npc === "scout" ? { offline: !hasNearAiKey() } : {}),
      };
    }),
  );
}

export const TOKEN_ID = /^[a-z0-9]{1,16}$/;

/** Real-money hands played under a strategy (backend /strategies/{id}/hands; none if it has no such route). */
export const strategyHands = async (id: string) =>
  (await backend<{ hands: LiveHand[] }>(`/strategies/${id}/hands`))?.hands ?? [];

/** Events for one strategy, newest first. */
export const strategyEvents = async (id: string) =>
  (await backend<{ events: BackendEvent[] }>(`/market/events?strategy_id=${id}&limit=200`))?.events ?? [];

// ---- In-memory daily caps and per-wallet locks ----

// ponytail: per-process memory, resets on redeploy; move to the backend if it runs on several instances
const hits = new Map<string, number[]>();
/** Count one use of `key`; false when it already reached `limit` in the last 24 h. */
export function underCap(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < DAY);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}
export const busyWallets = new Set<string>();

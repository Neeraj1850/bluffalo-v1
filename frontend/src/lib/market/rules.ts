/**
 * Bluffalo strategy market: the pricing rules, in one file.
 *
 * Pure functions, no I/O. The server tick and the in-browser simulation both
 * use exactly this code, so what you read here is what sets prices.
 * All amounts are GNEAR (1 testnet NEAR = 1000 GNEAR).
 *
 *   r      = Σ(payout − stake) / Σ stake          over n verified hands (ROI)
 *   r̂      = r · n / (n + 30)                      small samples are shrunk toward 0
 *   P      = clamp(exp(10 · r̂), 0.5, 3)            performance multiplier
 *   S      = clamp(1 − 0.06 · (listed − 4), 0.7, 1.4)   more seats for sale = cheaper
 *   D      = clamp(1 + 0.1 · (buyers24h + uses24h), 1, 2)  recent demand
 *   fair   = 10 GNEAR · P · S · D
 *   quoted = prev · clamp(fair / prev, 0.85, 1.15)  at most ±15% per tick, then [1, 500]
 *   broker ask = quoted · askMult, bid = quoted · bidMult
 *   a broker with less than 20 GNEAR cash is closed
 */

// ---- Constants (tune here, nowhere else) ----

/** Price of an average strategy with no record, normal stock and no demand. */
export const BASE_PRICE = 10;
/** Hands of "prior" pulling a small sample's ROI toward zero. */
export const SHRINK_HANDS = 30;
/** How strongly ROI moves the price: P = exp(ROI_WEIGHT · r̂). */
export const ROI_WEIGHT = 10;
export const PERF_MIN = 0.5;
export const PERF_MAX = 3;
/** Seats listed at which stock is "normal" (S = 1). */
export const NORMAL_STOCK = 4;
/** Each extra listed seat lowers the price by this fraction. */
export const STOCK_STEP = 0.06;
export const STOCK_MIN = 0.7;
export const STOCK_MAX = 1.4;
/** Each distinct buyer or license use in the last 24 h adds this fraction. */
export const DEMAND_STEP = 0.1;
export const DEMAND_MAX = 2;
/** Largest move of the quoted price in one tick (15%). */
export const MAX_MOVE = 0.15;
export const PRICE_MIN = 1;
export const PRICE_MAX = 500;
/** A broker below this cash cannot trade: it shows as closed. */
export const CLOSED_BELOW = 20;
/** Brokers reprice a listing only when it is off by more than this (5%). */
export const REPRICE_GAP = 0.05;

export type BrokerKey = "bookie" | "tilt";
/**
 * The rule-based brokers. Bookie trades on value only. Tilt chases trends:
 * `trend` scales how much the last price move bends its idea of fair value.
 */
export const BROKERS: Record<BrokerKey, { name: string; askMult: number; bidMult: number; trend: number }> = {
  bookie: { name: "Bookie", askMult: 1.08, bidMult: 0.88, trend: 0 },
  tilt: { name: "Tilt", askMult: 1.12, bidMult: 0.85, trend: 2 },
};

// ---- Pricing ----

export type MarketStats = {
  /** Verified hands. */
  n: number;
  /** Total staked over those hands (GNEAR). */
  sumStake: number;
  /** Total payout − stake (GNEAR). */
  sumNet: number;
  /** Seats currently listed for sale. */
  listed: number;
  /** Distinct buyers in the last 24 h (creator excluded). */
  buyers24h: number;
  /** License uses in the last 24 h. */
  uses24h: number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The pieces of the formula, exposed for explain(). */
export function factors(s: MarketStats) {
  const roi = s.sumStake > 0 ? s.sumNet / s.sumStake : 0;
  const shrunk = (roi * s.n) / (s.n + SHRINK_HANDS);
  const P = clamp(Math.exp(ROI_WEIGHT * shrunk), PERF_MIN, PERF_MAX);
  const S = clamp(1 - STOCK_STEP * (s.listed - NORMAL_STOCK), STOCK_MIN, STOCK_MAX);
  const D = clamp(1 + DEMAND_STEP * (s.buyers24h + s.uses24h), 1, DEMAND_MAX);
  return { roi, shrunk, P, S, D };
}

/** What the rules think a seat is worth right now (GNEAR). */
export function fairValue(s: MarketStats): number {
  const { P, S, D } = factors(s);
  return BASE_PRICE * P * S * D;
}

/** Next quoted price: move toward fair value by at most ±15%, kept within [1, 500]. */
export function quote(prev: number, fair: number): number {
  if (!(prev > 0)) return r2(clamp(fair, PRICE_MIN, PRICE_MAX));
  return r2(clamp(prev * clamp(fair / prev, 1 - MAX_MOVE, 1 + MAX_MOVE), PRICE_MIN, PRICE_MAX));
}

export const brokerAsk = (b: BrokerKey, quoted: number) => r2(clamp(quoted * BROKERS[b].askMult, PRICE_MIN, PRICE_MAX));
export const brokerBid = (b: BrokerKey, quoted: number) => r2(clamp(quoted * BROKERS[b].bidMult, PRICE_MIN, PRICE_MAX));
export const isClosed = (cash: number) => cash < CLOSED_BELOW;

// ---- Explanation ("Why this price?") ----

export type ExplainRow = { label: string; value: string; note?: string };

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
const x2 = (x: number) => `×${x.toFixed(2)}`;

/** Rows for a summary table plus one plain sentence, e.g.
 *  "Fair value 14.2 GNEAR: ROI +4.1% over 120 hands (×1.38), 6 seats listed (×0.88), 3 recent buyers or uses (×1.30); quoted 13.5, up 15% (capped)." */
export function explain(s: MarketStats, prev: number): { rows: ExplainRow[]; sentence: string } {
  const f = factors(s);
  const fair = fairValue(s);
  const q = quote(prev, fair);
  const demand = s.buyers24h + s.uses24h;
  const move = prev > 0 ? q / prev - 1 : 0;
  const capped = prev > 0 && Math.abs(fair / prev - 1) > MAX_MOVE;
  const rows: ExplainRow[] = [
    { label: "Verified ROI", value: pct(f.roi), note: `${s.n} hands, shrunk to ${pct(f.shrunk)}` },
    { label: "Performance", value: x2(f.P), note: "exp(10 × shrunk ROI), 0.5–3" },
    { label: "Seats listed", value: String(s.listed), note: `${x2(f.S)} stock` },
    { label: "Recent demand", value: String(demand), note: `${x2(f.D)} buyers + uses, 24 h` },
    { label: "Fair value", value: `${fair.toFixed(1)} GNEAR`, note: "10 GNEAR × P × S × D" },
    { label: "Quoted", value: `${q.toFixed(1)} GNEAR`, note: capped ? "moved the ±15% maximum" : undefined },
  ];
  const dir = move > 0.0005 ? `up ${Math.round(move * 100)}%` : move < -0.0005 ? `down ${Math.round(-move * 100)}%` : "unchanged";
  const sentence =
    `Fair value ${fair.toFixed(1)} GNEAR: ROI ${pct(f.roi)} over ${s.n} hands (${x2(f.P)}), ` +
    `${s.listed} seats listed (${x2(f.S)}), ${demand} recent buyers or uses (${x2(f.D)}); ` +
    `quoted ${q.toFixed(1)}, ${dir}${capped ? " (capped)" : ""}.`;
  return { rows, sentence };
}

// ---- Rule-based brokers ----

export type NpcState = {
  key: BrokerKey;
  cash: number;
  /** Seats held, not listed. */
  holdings: Record<string, number>;
  /** This broker's own listings: token → price each. */
  listings: Record<string, number>;
};

export type MarketView = {
  tokenId: string;
  /** Current quoted price. */
  price: number;
  /** Quoted price one tick ago. */
  prev: number;
  fair: number;
  /** Seats anyone can buy right now. */
  listed: number;
}[];

export type NpcAction = {
  kind: "buy" | "list" | "reprice" | "none";
  tokenId?: string;
  price?: number;
  reason: string;
};

/**
 * One broker decision per call (the tick calls it up to twice).
 * Order: closed → reprice a stale listing → buy the best discount → list a held seat.
 * `rand` breaks ties so brokers don't all chase the same token.
 */
export function npcDecide(npc: NpcState, market: MarketView, rand: () => number): NpcAction {
  const b = BROKERS[npc.key];
  if (isClosed(npc.cash)) return { kind: "none", reason: `${b.name} is closed: cash ${npc.cash.toFixed(1)} GNEAR is below ${CLOSED_BELOW}` };

  for (const m of market) {
    const mine = npc.listings[m.tokenId];
    if (mine === undefined) continue;
    const ask = brokerAsk(npc.key, m.price);
    if (Math.abs(mine / ask - 1) > REPRICE_GAP) {
      return { kind: "reprice", tokenId: m.tokenId, price: ask, reason: `${b.name} reprices ${m.tokenId} ${mine.toFixed(1)} → ${ask.toFixed(1)}: quote moved to ${m.price.toFixed(1)}` };
    }
  }

  // Tilt bends fair value by the last move: a rising price looks worth more.
  const value = (m: MarketView[number]) => m.fair * (1 + b.trend * (m.prev > 0 ? m.price / m.prev - 1 : 0));
  const deals = market
    .filter((m) => m.listed > 0 && m.price <= npc.cash - CLOSED_BELOW && m.price <= brokerBid(npc.key, value(m)))
    .map((m) => ({ m, edge: value(m) / m.price + rand() * 0.01 }))
    .sort((a, z) => z.edge - a.edge);
  if (deals.length) {
    const { m } = deals[0];
    const under = Math.round((1 - m.price / value(m)) * 100);
    const why = b.trend && m.price > m.prev ? `rising ${pct(m.price / m.prev - 1)}, ` : "";
    return { kind: "buy", tokenId: m.tokenId, price: m.price, reason: `${b.name} bought ${m.tokenId} @${m.price.toFixed(1)}: ${why}${under}% under its value ${value(m).toFixed(1)}` };
  }

  const held = Object.keys(npc.holdings).find((id) => npc.holdings[id] > 0 && npc.listings[id] === undefined);
  const hm = held && market.find((m) => m.tokenId === held);
  if (hm) {
    const ask = brokerAsk(npc.key, hm.price);
    return { kind: "list", tokenId: hm.tokenId, price: ask, reason: `${b.name} lists ${hm.tokenId} @${ask.toFixed(1)}: quote ${hm.price.toFixed(1)} × ${b.askMult}` };
  }
  return { kind: "none", reason: `${b.name} waits: nothing under its bid` };
}

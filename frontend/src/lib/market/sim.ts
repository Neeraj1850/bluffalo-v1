/**
 * A seeded week of the strategy market (168 hourly ticks), run in the browser.
 * Practice bots only: no NEAR AI, nothing on-chain. Same seed ⇒ same week.
 *
 * Each tick: every strategy plays a few hands against the practice bot (the
 * offline heuristic), prices re-quote through rules.ts, 200 bot traders and
 * the two brokers (Bookie, Tilt) trade, deployers burn seats.
 */
import type { Card } from "@/lib/cards";
import { PRESETS, type StrategyParams } from "@/lib/data/strategy";
import { heuristic, seatView } from "@/lib/poker/agent";
import { freshDeck, rng } from "@/lib/poker/deck";
import { apply, isOver, newHand, settle, type Seat } from "@/lib/poker/game";
import {
  BROKERS,
  fairValue,
  isClosed,
  npcDecide,
  quote,
  type BrokerKey,
  type MarketStats,
  type MarketView,
  type NpcState,
} from "./rules";

export const TICKS = 168;
// ponytail: 2 hands per strategy per hour (~336 a week) keeps the week ~0.5 s; the engine costs ~0.13 ms a hand (structuredClone per action). Cheaper engine if more are needed.
export const HANDS_PER_TICK = 2;
export const TRADERS = 200;
/** Seats each strategy starts with on the shelf. */
export const START_SEATS = 10;
export const BROKER_CASH = 300;
export const TRADER_CASH = 150;
/** Chance a trader acts in a given hour. */
const ACT_P = 0.08;
const BLINDS = { small: 5, big: 10 };
const STACK = 1000;
/** The practice bot's sliders; mirrors HOUSE_PARAMS in lib/server/decide.ts (server-only module). */
const BOT_PARAMS: StrategyParams = { aggression: 55, bluff: 25, position: 70, sizing: 55 };

export type SimStrategy = { id: string; label: string; params: StrategyParams };
export type SimEvent = { t: number; actor: string; action: string; reason: string };
export type SimTick = {
  t: number;
  prices: Record<string, number>;
  /** GNEAR traded this tick. */
  volume: number;
  /** Seats used (burned) by deployers this tick. */
  burns: number;
  brokerCash: Record<BrokerKey, number>;
};
export type SimSummary = {
  strategies: SimStrategy[];
  start: Record<string, number>;
  end: Record<string, number>;
  /** Strategy ids, best final price first. */
  ranking: string[];
  hands: number;
  volume: number;
  burns: number;
  brokerCash: Record<BrokerKey, number>;
  closed: BrokerKey[];
};
export type SimOptions = { draft?: StrategyParams; ticks?: number; handsPerTick?: number };

/** Any seed string → the 32-hex seed `rng` wants (FNV-1a, four lanes). */
function hexSeed(seed: string): string {
  if (/^[0-9a-f]{32}$/.test(seed)) return seed;
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((h) => {
      for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
      return h.toString(16).padStart(8, "0");
    })
    .join("");
}

/** The cast: 3 presets, 8 seeded synthetic strategies, and the draft if given. */
export function cast(seed: string, opts: SimOptions = {}): SimStrategy[] {
  const rand = rng(hexSeed(`cast:${seed}`));
  const n = () => Math.round(rand() * 100);
  const out: SimStrategy[] = PRESETS.filter((p) => p.params).map((p) => ({ id: p.key, label: p.label, params: p.params! }));
  for (let i = 1; i <= 8; i++) out.push({ id: `bot-${i}`, label: `Bot ${i}`, params: { aggression: n(), bluff: n(), position: n(), sizing: n() } });
  if (opts.draft) out.push({ id: "draft", label: "Your draft", params: opts.draft });
  return out;
}

function deal(rand: () => number): Card[] {
  const d = freshDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** One practice hand; returns the agent's stake and payout. */
function playHand(params: StrategyParams, button: Seat, rand: () => number) {
  let s = newHand({ deck: deal(rand), stacks: [STACK, STACK], blinds: BLINDS, button });
  while (!isOver(s)) {
    const seat = s.toAct;
    s = apply(s, heuristic(seatView(s, seat), seat === 0 ? params : BOT_PARAMS, rand).action);
  }
  return { stake: s.committed[0], payout: settle(s).payouts[0] };
}

type Trader = { id: number; kind: "value" | "momentum" | "panic" | "deployer"; cash: number; held: Record<string, number> };
const KINDS: Trader["kind"][] = ["value", "momentum", "panic", "deployer"];
const sum24 = (a: number[]) => a.slice(-24).reduce((x, y) => x + y, 0);

/** Step-wise week: yields one tick (with its events) at a time, returns the summary. */
export function* simulateSteps(seed: string, opts: SimOptions = {}): Generator<SimTick & { events: SimEvent[] }, SimSummary> {
  const rand = rng(hexSeed(seed));
  const strategies = cast(seed, opts);
  const ticks = opts.ticks ?? TICKS;
  const hpt = opts.handsPerTick ?? HANDS_PER_TICK;
  const ids = strategies.map((s) => s.id);
  const stats: Record<string, MarketStats> = {};
  const buys: Record<string, number[]> = {};
  const uses: Record<string, number[]> = {};
  const shelf: Record<string, number> = {};
  const price: Record<string, number> = {};
  const prev: Record<string, number> = {};
  for (const id of ids) {
    stats[id] = { n: 0, sumStake: 0, sumNet: 0, listed: START_SEATS, buyers24h: 0, uses24h: 0 };
    buys[id] = [];
    uses[id] = [];
    shelf[id] = START_SEATS;
    price[id] = prev[id] = quote(0, fairValue(stats[id]));
  }
  const start = { ...price };
  const brokers: NpcState[] = (Object.keys(BROKERS) as BrokerKey[]).map((key) => ({ key, cash: BROKER_CASH, holdings: {}, listings: {} }));
  const traders: Trader[] = Array.from({ length: TRADERS }, (_, i) => ({ id: i + 1, kind: KINDS[i % 4], cash: TRADER_CASH, held: {} }));
  const paid: Record<string, number> = {}; // panic sellers remember what they paid: `${trader}:${token}`
  let hands = 0;
  let totalVolume = 0;
  let totalBurns = 0;

  const listedOf = (id: string) => shelf[id] + brokers.reduce((n, b) => n + (b.listings[id] !== undefined ? b.holdings[id] ?? 0 : 0), 0);
  const fairOf = (id: string) => fairValue({ ...stats[id], listed: listedOf(id) });

  for (let t = 1; t <= ticks; t++) {
    const events: SimEvent[] = [];
    let volume = 0;
    let burns = 0;
    for (const id of ids) {
      buys[id].push(0);
      uses[id].push(0);
    }

    // Buy one seat: broker listings first (cheapest), then the creator's shelf at the quote.
    const buy = (id: string): number | null => {
      const b = brokers
        .filter((x) => x.listings[id] !== undefined && (x.holdings[id] ?? 0) > 0)
        .sort((x, y) => x.listings[id] - y.listings[id])[0];
      if (b) {
        const p = b.listings[id];
        b.cash += p;
        if (--b.holdings[id] === 0) delete b.listings[id];
        return p;
      }
      if (shelf[id] <= 0) return null;
      shelf[id]--;
      return price[id];
    };

    // 1. Play: every strategy's record grows.
    for (const s of strategies) {
      for (let h = 0; h < hpt; h++) {
        const { stake, payout } = playHand(s.params, ((t + h) % 2) as Seat, rand);
        const st = stats[s.id];
        st.n++;
        st.sumStake += stake;
        st.sumNet += payout - stake;
      }
      hands += hpt;
    }

    // 2. Re-quote through the rules (±15% max).
    for (const id of ids) {
      prev[id] = price[id];
      price[id] = quote(price[id], fairOf(id));
    }

    // 3. Bot traders.
    for (const tr of traders) {
      if (rand() >= ACT_P) continue;
      const who = `Trader ${tr.id} (${tr.kind})`;
      const affordable = ids.filter((id) => listedOf(id) > 0 && price[id] <= tr.cash);
      const take = (id: string, reason: string) => {
        const p = buy(id);
        if (p === null || p > tr.cash) return;
        tr.cash -= p;
        tr.held[id] = (tr.held[id] ?? 0) + 1;
        paid[`${tr.id}:${id}`] = p;
        buys[id][buys[id].length - 1]++;
        volume += p;
        events.push({ t, actor: who, action: `buy ${id} @${p.toFixed(1)}`, reason });
      };
      const owned = Object.keys(tr.held).filter((id) => tr.held[id] > 0);
      if (tr.kind === "value") {
        const best = affordable.sort((a, b) => fairOf(b) / price[b] - fairOf(a) / price[a])[0];
        if (best && fairOf(best) > price[best] * 1.05) take(best, `${Math.round((1 - price[best] / fairOf(best)) * 100)}% under fair value`);
      } else if (tr.kind === "momentum") {
        const best = affordable.sort((a, b) => price[b] / prev[b] - price[a] / prev[a])[0];
        if (best && price[best] > prev[best] * 1.03) take(best, `price rising ${Math.round((price[best] / prev[best] - 1) * 100)}%`);
      } else if (tr.kind === "panic") {
        const dump = owned.find((id) => price[id] < paid[`${tr.id}:${id}`] * 0.9);
        if (dump) {
          // ponytail: a panic sale goes straight back on the shelf at 90% of the quote; add trader listings if resale depth matters.
          const p = Math.round(price[dump] * 0.9 * 100) / 100;
          tr.held[dump]--;
          tr.cash += p;
          shelf[dump]++;
          volume += p;
          events.push({ t, actor: who, action: `sell ${dump} @${p.toFixed(1)}`, reason: `down more than 10% from ${paid[`${tr.id}:${dump}`].toFixed(1)}` });
        } else if (affordable.length && rand() < 0.3) {
          take(affordable[Math.floor(rand() * affordable.length)], "hunch");
        }
      } else if (owned.length) {
        const id = owned[0];
        tr.held[id]--;
        uses[id][uses[id].length - 1]++;
        burns++;
        events.push({ t, actor: who, action: `use ${id}`, reason: "deployed an agent: one seat burned" });
      } else {
        const best = affordable.sort((a, b) => stats[b].sumNet / (stats[b].sumStake || 1) - stats[a].sumNet / (stats[a].sumStake || 1))[0];
        if (best) take(best, "best record to deploy");
      }
    }

    // 4. Brokers: up to 2 decisions each.
    for (const b of brokers) {
      for (let k = 0; k < 2; k++) {
        const market: MarketView = ids.map((id) => ({ tokenId: id, price: price[id], prev: prev[id], fair: fairOf(id), listed: listedOf(id) }));
        const a = npcDecide(b, market, rand);
        const actor = BROKERS[b.key].name;
        if (a.kind === "none") {
          if (k === 0 && t % 24 === 0) events.push({ t, actor, action: "none", reason: a.reason });
          break;
        }
        const id = a.tokenId!;
        if (a.kind === "buy") {
          const p = shelf[id] > 0 ? (shelf[id]--, price[id]) : buy(id);
          if (p === null) break;
          b.cash -= p;
          b.holdings[id] = (b.holdings[id] ?? 0) + 1;
          volume += p;
        } else {
          b.listings[id] = a.price!;
        }
        events.push({ t, actor, action: `${a.kind} ${id} @${a.price!.toFixed(1)}`, reason: a.reason });
      }
    }

    for (const id of ids) {
      stats[id].listed = listedOf(id);
      stats[id].buyers24h = sum24(buys[id]);
      stats[id].uses24h = sum24(uses[id]);
    }
    totalVolume += volume;
    totalBurns += burns;
    yield {
      t,
      prices: { ...price },
      volume: Math.round(volume * 100) / 100,
      burns,
      brokerCash: Object.fromEntries(brokers.map((b) => [b.key, Math.round(b.cash * 100) / 100])) as Record<BrokerKey, number>,
      events,
    };
  }

  const brokerCash = Object.fromEntries(brokers.map((b) => [b.key, Math.round(b.cash * 100) / 100])) as Record<BrokerKey, number>;
  return {
    strategies,
    start,
    end: { ...price },
    ranking: [...ids].sort((a, b) => price[b] - price[a]),
    hands,
    volume: Math.round(totalVolume * 100) / 100,
    burns: totalBurns,
    brokerCash,
    closed: brokers.filter((b) => isClosed(b.cash)).map((b) => b.key),
  };
}

/** The whole week at once. For animation, pull from simulateSteps() a few ticks per frame instead. */
export function simulate(seed: string, opts: SimOptions = {}) {
  const gen = simulateSteps(seed, opts);
  const ticks: SimTick[] = [];
  const events: SimEvent[] = [];
  for (;;) {
    const r = gen.next();
    if (r.done) return { ticks, events, summary: r.value };
    const { events: ev, ...tick } = r.value;
    ticks.push(tick);
    events.push(...ev);
  }
}

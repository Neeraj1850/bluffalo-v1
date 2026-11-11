import type { PokerTable } from "@/lib/data/tables";
import type { LiveHand } from "@/lib/poker/record";

/**
 * The house's economics, all disclosed: a capped rake on pots the agent wins
 * past the flop, a flat table fee at deploy, and bankroll limits that keep the
 * house solvent. None of this touches the deal, the shuffle or the commit-reveal,
 * and none of it gives the house information about the cards.
 *
 * Amounts are table NEAR (on-chain × 1000). Every constant can be overridden
 * from the environment and is read at call time.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const economics = () => ({
  /** Share of the pot taken when the agent wins it after a flop. */
  rakePct: num("RAKE_PCT", 0.05),
  /** Most rake per hand, in big blinds. */
  rakeCapBb: num("RAKE_CAP_BB", 3),
  /** Flat fee at deploy, as a share of the buy-in. */
  tableFeePct: num("TABLE_FEE_PCT", 0.02),
  /**
   * Dynamic cap: the most the house stakes on one hand — and so the largest
   * buy-in — is this share of its current balance. It grows and shrinks with
   * the bankroll; no static per-table maximum.
   */
  maxExposurePct: num("MAX_EXPOSURE_PCT", 0.01),
  /** An agent whose balance reaches this × the current cap must cash out before playing on. */
  maxSessionPayoutMult: num("MAX_SESSION_PAYOUT_MULT", 3),
});

const floor2 = (n: number) => Math.floor(Math.round(n * 1e6) / 1e4) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The pot of a finished hand (its last step). */
function potOf(hand: Pick<LiveHand, "steps">): number {
  return hand.steps.at(-1)?.pot ?? 0;
}

/** Whether a hand ended before the flop was dealt. */
export function endedPreflop(hand: Pick<LiveHand, "steps">): boolean {
  return (hand.steps.at(-1)?.boardCount ?? 0) === 0;
}

/**
 * Rake on a finished hand: RAKE_PCT of the pot, capped at RAKE_CAP_BB big
 * blinds, taken only from the agent's winnings when it wins the pot. Nothing
 * if the hand ended preflop ("no flop, no drop"), if the house won, or on a
 * split (no net winnings).
 */
export function rakeFor(hand: Pick<LiveHand, "steps" | "net">, bigBlind: number): number {
  if (hand.net <= 0 || endedPreflop(hand)) return 0;
  const { rakePct, rakeCapBb } = economics();
  return floor2(Math.min(potOf(hand) * rakePct, rakeCapBb * bigBlind, hand.net));
}

/** What the agent gets back on-chain: its ending stack less the rake (always ≤ the pot). */
export function payoutFor(stackAfter: number, rake: number): number {
  return Math.max(0, round2(stackAfter - rake));
}

/** The flat table fee for a buy-in. */
export function tableFeeFor(buyIn: number): number {
  const fee = round2(buyIn * economics().tableFeePct);
  return buyIn > 0 ? Math.max(fee, 0.01) : 0;
}

/** Most the house will stake on one hand given its balance. */
export function exposureCap(houseBalance: number): number {
  return floor2(houseBalance * economics().maxExposurePct);
}

/** The agent's stake for a hand: its balance, up to the exposure cap. */
export function stakeFor(agentBalance: number, houseBalance: number): number {
  return floor2(Math.min(agentBalance, exposureCap(houseBalance)));
}

/** The house balance below which a table closes: its cap would no longer cover the table's minimum buy-in. */
export function houseFloor(t: PokerTable): number {
  const pct = economics().maxExposurePct;
  return pct > 0 ? round2((t.buyIn?.min ?? 0) / pct) : Infinity;
}

/** The most an agent may buy in for right now: the dynamic cap (not a static table maximum). */
export function maxBuyInFor(_t: PokerTable, houseBalance: number): number {
  return exposureCap(houseBalance);
}

/** The balance at which an agent must cash out before playing another hand (scales with the house). */
export const sessionPayoutCap = (_t: PokerTable, houseBalance: number) =>
  round2(economics().maxSessionPayoutMult * exposureCap(houseBalance));

export type TableStatus = { id: string; open: boolean; reason?: string; maxBuyIn: number };

export const TABLE_CLOSED = { error: "Table closed — the house is rebalancing", code: "table_closed" } as const;

/** Whether a real-money table is open given the house balance, and its current max buy-in. */
export function tableStatus(t: PokerTable, houseBalance: number): TableStatus {
  const maxBuyIn = maxBuyInFor(t, houseBalance);
  if (t.buyIn && maxBuyIn < t.buyIn.min) return { id: t.id, open: false, reason: "house_below_floor", maxBuyIn: 0 };
  return { id: t.id, open: true, maxBuyIn };
}

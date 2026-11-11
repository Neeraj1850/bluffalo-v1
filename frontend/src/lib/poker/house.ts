import type { Card } from "@/lib/cards";
import { RANKS, SUITS } from "./deck";
import { bestHand } from "./evaluate";
import { holeLabel, type Decision, type SeatView } from "./agent";

/**
 * The house's tight-aggressive baseline. FAIRNESS: everything here works from a
 * SeatView only — the house's own hole cards, the visible board, pot/stacks/bets
 * and the public action history. It never receives the player's cards, the deck
 * order, future board cards or the player agent's strategy params. Equity is a
 * Monte Carlo estimate against a *random* opponent hand drawn from the cards the
 * house can't see, so its edge is skill (math), not information.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------- fast 7-card evaluator (ints: rank 0..12 = 2..A, card = rank*4+suit) ----------

const toInt = (c: Card) => RANKS.indexOf(c.rank) * 4 + SUITS.indexOf(c.suit);

/** Highest straight in a 13-bit rank mask: top rank index + 1 (wheel = 4), or 0. */
function straightTop(mask: number): number {
  const m = (mask << 1) | ((mask >> 12) & 1); // bit 0 = ace-low
  for (let hi = 13; hi >= 4; hi--) if (((m >> (hi - 4)) & 0x1f) === 0x1f) return hi;
  return 0;
}

const pack = (cat: number, ks: number[]) => {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (ks[i] ?? 0);
  return s;
};

/** Comparable score for the best five of `cards` (higher wins). */
export function score7(cards: number[]): number {
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitN = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitN[s]++;
    mask |= 1 << r;
  }
  for (let s = 0; s < 4; s++) {
    if (suitN[s] >= 5) {
      const sf = straightTop(suitMask[s]);
      if (sf) return pack(8, [sf]);
      const ks: number[] = [];
      for (let r = 12; r >= 0 && ks.length < 5; r--) if (suitMask[s] & (1 << r)) ks.push(r + 1);
      return pack(5, ks);
    }
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [], singles: number[] = [];
  for (let r = 12; r >= 0; r--) {
    const n = counts[r];
    if (n === 4) quads.push(r + 1);
    else if (n === 3) trips.push(r + 1);
    else if (n === 2) pairs.push(r + 1);
    else if (n === 1) singles.push(r + 1);
  }
  const kick = (exclude: number[], k: number) => {
    const out: number[] = [];
    for (let r = 12; r >= 0 && out.length < k; r--) if (counts[r] && !exclude.includes(r + 1)) out.push(r + 1);
    return out;
  };
  if (quads.length) return pack(7, [quads[0], ...kick([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return pack(6, [trips[0], p]);
  }
  const st = straightTop(mask);
  if (st) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...kick([trips[0]], 2)]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return pack(1, [pairs[0], ...kick([pairs[0]], 3)]);
  return pack(0, singles.slice(0, 5));
}

/**
 * Win probability (ties count half) of `hole` against one random hand, given the
 * visible `board`, over random runouts. Bounded by iterations and wall time.
 */
export function equity(
  hole: Card[],
  board: Card[],
  opts: { iterations?: number; maxMs?: number; rand?: () => number } = {},
): number {
  const { iterations = 1500, maxMs = 15, rand = Math.random } = opts;
  const known = new Set([...hole, ...board].map(toInt));
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const mine = hole.map(toInt);
  const shown = board.map(toInt);
  const need = 2 + (5 - shown.length);
  const start = Date.now();
  let won = 0, n = 0;
  const a = new Array(7), b = new Array(7);
  for (; n < iterations; n++) {
    if ((n & 127) === 127 && Date.now() - start > maxMs) break;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rand() * (deck.length - i));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    const run = [...shown, ...deck.slice(2, need)];
    for (let i = 0; i < 5; i++) a[i] = b[i] = run[i];
    a[5] = mine[0]; a[6] = mine[1];
    b[5] = deck[0]; b[6] = deck[1];
    const x = score7(a), y = score7(b);
    won += x > y ? 1 : x === y ? 0.5 : 0;
  }
  return n ? won / n : 0.5;
}

// ---------- preflop chart (heads-up) ----------

export type PreflopAction = "raise" | "call" | "fold";

/** Chen formula score for two hole cards (−1 … 20). */
export function chen([c1, c2]: Card[]): number {
  const v1 = RANKS.indexOf(c1.rank) + 2, v2 = RANKS.indexOf(c2.rank) + 2;
  const [hi, lo] = v1 >= v2 ? [v1, v2] : [v2, v1];
  const base = (v: number) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  let s = base(hi);
  if (hi === lo) return Math.max(5, s * 2);
  if (c1.suit === c2.suit) s += 2;
  const gap = hi - lo - 1;
  s -= [0, 1, 2, 4][Math.min(gap, 3)] + (gap >= 4 ? 1 : 0);
  if (gap <= 1 && hi < 12) s += 1;
  return Math.ceil(s);
}

/**
 * Heads-up chart. Button (small blind) opens wide; big blind defends vs a single
 * raise and 3-bets value; anyone facing a re-raise continues only with strong hands.
 * `raises` = number of raises already made preflop (blinds aren't raises).
 */
export function preflopChart(hole: Card[], button: boolean, raises: number): PreflopAction {
  const c = chen(hole);
  if (raises === 0) return button ? (c >= 5 ? "raise" : c >= 3 ? "call" : "fold") : c >= 9 ? "raise" : "call";
  if (raises === 1) return c >= 10 ? "raise" : c >= (button ? 6 : 5) ? "call" : "fold";
  if (raises === 2) return c >= 12 ? "raise" : c >= 9 ? "call" : "fold";
  return c >= 14 ? "raise" : c >= 11 ? "call" : "fold";
}

// ---------- the baseline decision ----------

export type HouseStats = {
  /** Raw equity vs a random hand. */
  equity: number;
  /** Equity discounted for the strength a bet represents. */
  effectiveEquity: number;
  /** Share of the final pot needed to call (0 when checking is free). */
  potOdds: number;
  /** Effective stack / pot. */
  spr: number;
  inPosition: boolean;
  /** Pot fraction of the bet faced. */
  betFraction: number;
  preflopRaises: number;
  aggressor: boolean;
  /** Preflop only. */
  chart?: PreflopAction;
};

/** Counts raises and whether "you" made the last one preflop, from the public log. */
function preflopInfo(view: SeatView) {
  const pre = view.history.filter((h) => h.startsWith("PRE-FLOP:"));
  const raises = pre.filter((h) => / raise/.test(h));
  return { raises: raises.length, aggressor: raises.length > 0 && raises[raises.length - 1].includes(": you raise") };
}

export function houseStats(view: SeatView, opts: { rand?: () => number; maxMs?: number } = {}): HouseStats {
  const l = view.legal;
  const eq = equity(view.hole, view.board, { rand: opts.rand, maxMs: opts.maxMs, iterations: view.board.length ? 1500 : 800 });
  const potBefore = Math.max(view.pot - l.toCall, view.bigBlind);
  const betFraction = l.toCall / potBefore;
  // A bet narrows the opponent's range: the bigger the bet, the stronger it tends to be.
  // eq^k keeps the nuts at 1 while shrinking marginal hands.
  const effectiveEquity = view.board.length ? Math.pow(eq, 1 + 0.6 * Math.min(1.5, betFraction)) : eq;
  const { raises, aggressor } = preflopInfo(view);
  return {
    equity: eq,
    effectiveEquity,
    potOdds: l.canCheck ? 0 : l.toCall / (view.pot + l.toCall),
    spr: Math.min(view.stack, view.opponentStack + view.opponentBet - view.bet) / Math.max(view.pot, view.bigBlind),
    inPosition: view.inPosition,
    betFraction,
    preflopRaises: raises,
    aggressor,
    chart: view.board.length ? undefined : preflopChart(view.hole, view.inPosition, raises),
  };
}

const describe = (view: SeatView) =>
  view.board.length ? bestHand([...view.hole, ...view.board]).description : holeLabel(view.hole);

function raiseTo(view: SeatView, to: number): number {
  return r2(clamp(to, view.legal.minRaiseTo, view.legal.maxRaiseTo));
}

/** Bet `frac` of the pot (or raise to 3x the bet faced plus the pot share). */
function sized(view: SeatView, frac: number) {
  const l = view.legal;
  const target = l.canCheck ? view.bet + view.pot * frac : view.opponentBet + (view.pot + l.toCall) * frac;
  return raiseTo(view, target);
}

/** Deterministic-ish TAG policy; `rand` only seeds the equity sim and rare semi-bluffs. */
export function baseline(view: SeatView, stats: HouseStats, rand: () => number = Math.random): Decision {
  const l = view.legal;
  const what = describe(view);
  const raise = (to: number, reason: string): Decision => ({ action: { type: "raise", to }, reason: `${what}. ${reason}` });
  const call = (reason: string): Decision => ({ action: { type: l.canCheck ? "check" : "call" }, reason: `${what}. ${reason}` });
  const fold = (reason: string): Decision =>
    l.canCheck ? { action: { type: "check" }, reason: `${what}. Checking costs nothing.` } : { action: { type: "fold" }, reason: `${what}. ${reason}` };

  if (!view.board.length) {
    const chart = stats.chart!;
    if (chart === "raise" && l.canRaise) {
      // 2.5x open; 3x the raise faced when re-raising; shove when shallow.
      const to = stats.preflopRaises === 0 ? view.bigBlind * 2.5 : view.opponentBet * 3;
      return raise(stats.spr < 3 ? l.maxRaiseTo : raiseTo(view, to), "A strong starting hand — raise.");
    }
    if (chart === "fold" && !l.canCheck && stats.potOdds > 0.25 && stats.equity < 0.55) return fold("Not worth the price.");
    if (chart === "fold" && !l.canCheck && stats.equity < stats.potOdds) return fold("Not worth the price.");
    return call("Good enough to see a flop.");
  }

  const eq = stats.effectiveEquity;
  if (l.canCheck) {
    if (l.canRaise && eq > 0.65) {
      // Value bet scaled by equity: ~1/2 pot at 65%, ~3/4+ pot near the nuts.
      const frac = stats.spr < 1.2 ? 10 : 0.5 + (eq - 0.65) * 1.2;
      return raise(sized(view, frac), "Strong hand — bet for value.");
    }
    if (l.canRaise && view.street === "FLOP" && stats.aggressor && (eq > 0.45 || rand() < 0.35)) {
      return raise(sized(view, 0.5), "Keep the lead with a continuation bet.");
    }
    return call("Check and see what comes.");
  }

  // Facing a bet.
  if (l.canRaise && eq > 0.78) {
    return raise(stats.spr < 2 ? l.maxRaiseTo : sized(view, 0.75), "Very strong — raise for value.");
  }
  if (eq >= stats.potOdds + 0.03) return call("The price is right for this hand.");
  return fold("Too expensive without enough equity — let it go.");
}

/** Model output check: is this a move a sound player would never make here? */
export function absurd(d: Decision, view: SeatView, stats: HouseStats): string | null {
  const l = view.legal;
  const eq = view.board.length ? stats.effectiveEquity : stats.equity;
  const a = d.action;
  if (a.type === "fold") {
    if (l.canCheck) return "folded when checking was free";
    if (stats.equity >= 0.85 || eq >= stats.potOdds + 0.15) return "folded a hand with plenty of equity";
  }
  if (a.type === "call") {
    const allIn = l.toCall >= view.stack - 0.001;
    if (eq < stats.potOdds - (allIn ? 0 : 0.08) && l.toCall > view.pot * 0.15) return "called without pot-odds equity";
  }
  if (a.type === "raise") {
    const size = a.to - view.opponentBet;
    const bigBluff = size > view.pot && eq < 0.35;
    const chartFold =
      !view.board.length && stats.chart !== "raise" && stats.equity < 0.5 && a.to > Math.max(view.bigBlind * 4, view.opponentBet * 3.5);
    if (bigBluff || chartFold) return "oversized bluff with a weak hand";
  }
  return null;
}

/** Stats block for the house model's prompt. */
export function statsLines(s: HouseStats): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return [
    `Equity vs a random hand: ${pct(s.equity)}${s.betFraction > 0 ? ` (≈${pct(s.effectiveEquity)} vs a betting range)` : ""}.`,
    `Pot odds needed to call: ${s.potOdds ? pct(s.potOdds) : "n/a (you can check)"}.`,
    `Stack-to-pot ratio: ${s.spr.toFixed(1)}. Position: ${s.inPosition ? "button, in position" : "big blind, out of position"}.`,
    `Preflop raises so far: ${s.preflopRaises}; you were ${s.aggressor ? "" : "not "}the last raiser.`,
    s.chart ? `Preflop chart says: ${s.chart}.` : "",
    "Strategy: tight-aggressive. Open 2.5x, c-bet 1/2–2/3 pot, size value bets up with equity, few bluffs, fold to big bets without equity, never call off below pot odds.",
  ]
    .filter(Boolean)
    .join("\n");
}

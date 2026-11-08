import type { Card } from "@/lib/cards";
import type { StrategyParams } from "@/lib/data/strategy";
import { RANKS } from "./deck";
import { bestHand, rankName } from "./evaluate";
import { legal, type Action, type HandState, type Legal, type Seat, type Street } from "./game";

/** Everything one seat is allowed to know when it's their turn. */
export type SeatView = {
  street: Street;
  hole: Card[];
  board: Card[];
  pot: number;
  stack: number;
  opponentStack: number;
  /** Chips this seat and the opponent put in this street. */
  bet: number;
  opponentBet: number;
  inPosition: boolean;
  legal: Legal;
  /** This hand so far, e.g. "PRE-FLOP: you raise 3, opponent call". */
  history: string[];
};

export type Decision = { action: Action; reason: string };

export function seatView(s: HandState, seat: Seat): SeatView {
  const opp: Seat = seat === 0 ? 1 : 0;
  return {
    street: s.street,
    hole: s.hole[seat],
    board: s.board.slice(0, s.boardCount),
    pot: Math.round((s.committed[0] + s.committed[1]) * 100) / 100,
    stack: s.stacks[seat],
    opponentStack: s.stacks[opp],
    bet: s.bets[seat],
    opponentBet: s.bets[opp],
    inPosition: s.button === seat,
    legal: legal(s),
    history: s.log.map(
      (e) => `${e.street}: ${e.seat === seat ? "you" : "opponent"} ${e.action}${e.amount ? ` ${e.amount}` : ""}`,
    ),
  };
}

const v = (c: Card) => RANKS.indexOf(c.rank) + 2;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "Pair of queens", "Ace and king, suited". */
export function holeLabel([a, b]: Card[]): string {
  if (a.rank === b.rank) return `Pair of ${rankName(a.rank, true)}`;
  const [hi, lo] = v(a) >= v(b) ? [a, b] : [b, a];
  return `${cap(rankName(hi.rank))} and ${rankName(lo.rank)}${a.suit === b.suit ? ", suited" : ""}`;
}

/** Rough 0–1 hand strength. Good enough to steer a fallback, not to win a tournament. */
export function strength(hole: Card[], board: Card[]): number {
  if (board.length === 0) {
    const [hi, lo] = [Math.max(v(hole[0]), v(hole[1])), Math.min(v(hole[0]), v(hole[1]))];
    let s = hi === lo ? 0.5 + hi / 28 : (hi + lo) / 40;
    if (hole[0].suit === hole[1].suit) s += 0.05;
    if (hi - lo === 1) s += 0.04;
    return Math.min(1, s);
  }
  const { category } = bestHand([...hole, ...board]);
  return [0.15, 0.45, 0.68, 0.78, 0.85, 0.88, 0.93, 0.97, 1][category];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function raiseTo(view: SeatView, sizing: number): number {
  const target = view.opponentBet + view.pot * (0.33 + 0.67 * sizing);
  return r2(clamp(target, view.legal.minRaiseTo, view.legal.maxRaiseTo));
}

/** The fallback policy: same sliders, no network. `rand` drives bluffs. */
export function heuristic(view: SeatView, params: StrategyParams, rand: () => number = Math.random): Decision {
  const a = params.aggression / 100;
  const b = params.bluff / 100;
  const s = strength(view.hole, view.board);
  const what = view.board.length ? bestHand([...view.hole, ...view.board]).description : holeLabel(view.hole);
  const l = view.legal;
  // Acting last is worth a little; position awareness decides how much.
  const edge = view.inPosition ? (params.position / 100) * 0.06 : 0;

  if (l.canRaise && s + edge > 0.78 - 0.33 * a) {
    return { action: { type: "raise", to: raiseTo(view, params.sizing / 100) }, reason: `${what}. Strong enough to bet and build the pot.` };
  }
  if (l.canCheck) {
    if (l.canRaise && rand() < b * 0.35) {
      return { action: { type: "raise", to: raiseTo(view, 0.2) }, reason: `${what}. A small bluff to see if the house gives up.` };
    }
    return { action: { type: "check" }, reason: `${what}. Nothing to gain by betting — check and see the next card.` };
  }
  const price = l.toCall / (view.pot + l.toCall);
  if (s + edge >= 0.25 + price * 0.6 || l.toCall <= view.pot * 0.1) {
    return { action: { type: "call" }, reason: `${what}. Worth the price to stay in.` };
  }
  return { action: { type: "fold" }, reason: `${what}. Too expensive for this hand — let it go.` };
}

const band = (n: number, low: string, mid: string, high: string) => (n < 34 ? low : n < 67 ? mid : high);

export function persona(params: StrategyParams | null): string {
  if (!params) return "You are the house: a solid, balanced, hard-to-read heads-up player.";
  return [
    "You are the player's poker agent. Follow this personality closely:",
    `- Aggression ${params.aggression}/100: ${band(params.aggression, "mostly check and call", "bet good hands, fold bad ones", "bet and raise often")}.`,
    `- Bluffing ${params.bluff}/100: bet a weak hand about ${Math.round(params.bluff / 10)} in 10 times.`,
    `- Position ${params.position}/100: ${band(params.position, "ignore your seat", "play a few more hands when acting last", "play many more hands when acting last")}.`,
    `- Bet sizing ${params.sizing}/100: ${band(params.sizing, "small bets", "around half the pot", "big bets")}.`,
  ].join("\n");
}

const show = (cards: Card[]) => (cards.length ? cards.map((c) => c.rank + c.suit).join(" ") : "none yet");

export function buildPrompt(view: SeatView, params: StrategyParams | null) {
  const l = view.legal;
  const moves = [
    "fold",
    l.canCheck ? "check" : `call (${l.toCall})`,
    l.canRaise ? `raise (amount = your total bet this street, ${l.minRaiseTo} to ${l.maxRaiseTo})` : null,
  ].filter(Boolean);
  return [
    {
      role: "system" as const,
      content: `${persona(params)}
Game: heads-up no-limit Texas hold'em, amounts in NEAR.
Reply with JSON only: {"action":"fold|check|call|raise","amount":number,"reason":string}.
"reason" is one plain-English sentence under 16 words a beginner understands — no poker jargon.`,
    },
    {
      role: "user" as const,
      content: `Street: ${view.street}
Your cards: ${show(view.hole)}
Board: ${show(view.board)}
Pot: ${view.pot}. Your stack: ${view.stack}. Opponent stack: ${view.opponentStack}.
This street — you put in ${view.bet}, opponent ${view.opponentBet}. You act ${view.inPosition ? "last" : "first"} after the flop.
So far: ${view.history.join("; ") || "nothing"}
Legal moves: ${moves.join(", ")}.`,
    },
  ];
}

/** Turn a model reply into a legal decision, or null if it can't be trusted. */
export function parseDecision(raw: unknown, l: Legal): Decision | null {
  if (!raw || typeof raw !== "object") return null;
  const { action, amount, reason } = raw as Record<string, unknown>;
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 140) : "No reason given.";

  switch (action) {
    case "fold":
      // Never fold when checking is free.
      return { action: { type: l.canCheck ? "check" : "fold" }, reason: why };
    case "check":
      return l.canCheck ? { action: { type: "check" }, reason: why } : null;
    case "call":
      // A "call" with nothing owed is a check.
      return { action: { type: l.canCheck ? "check" : "call" }, reason: why };
    case "raise": {
      const to = Number(amount);
      if (!l.canRaise || !Number.isFinite(to)) return null;
      return { action: { type: "raise", to: r2(clamp(to, l.minRaiseTo, l.maxRaiseTo)) }, reason: why };
    }
    default:
      return null;
  }
}

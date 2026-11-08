import type { Card } from "@/lib/cards";
import { bestHand, compareHands, type HandValue } from "./evaluate";

/**
 * Heads-up no-limit hold'em, one hand at a time. Seat 0 is the player's
 * agent, seat 1 the house. Pure and immutable: `apply` returns a new state.
 * Amounts are NEAR, rounded to cents after every operation.
 */

export type Seat = 0 | 1;
export type Street = "PRE-FLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

/** `raise.to` is the seat's total bet this street (a bet when nothing is owed). */
export type Action = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "raise"; to: number };

/** `amount` is chips added; `total` the seat's bet this street afterwards. */
export type LogEntry = { seat: Seat; street: Street; action: Action["type"]; amount: number; total: number; pot: number };

export type HandState = {
  hole: [Card[], Card[]];
  /** All five board cards, dealt from the deck up front; `boardCount` says how many are visible. */
  board: Card[];
  boardCount: 0 | 3 | 4 | 5;
  button: Seat;
  bigBlind: number;
  stacks: [number, number];
  /** Put in this street. */
  bets: [number, number];
  /** Put in this hand. */
  committed: [number, number];
  street: Street;
  toAct: Seat;
  acted: [boolean, boolean];
  /** Size of the last bet/raise increment this street; the minimum next raise. */
  lastRaise: number;
  folded: Seat | null;
  log: LogEntry[];
};

export type Legal = {
  canCheck: boolean;
  /** Chips needed to call (capped by stack); 0 when checking. */
  toCall: number;
  canRaise: boolean;
  /** Totals for this street, inclusive. */
  minRaiseTo: number;
  maxRaiseTo: number;
};

export type Settlement = {
  winner: Seat | "split";
  /** What each seat gets back from the pot. */
  payouts: [number, number];
  pot: number;
  /** Null when the hand ended on a fold. */
  hands: [HandValue, HandValue] | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const pot = (s: HandState) => r2(s.committed[0] + s.committed[1]);

export function newHand({
  deck,
  stacks,
  blinds,
  button,
}: {
  deck: Card[];
  stacks: [number, number];
  blinds: { small: number; big: number };
  button: Seat;
}): HandState {
  if (deck.length < 9) throw new Error("Deck too short");
  const s: HandState = {
    hole: [
      [deck[0], deck[2]],
      [deck[1], deck[3]],
    ],
    board: deck.slice(4, 9),
    boardCount: 0,
    button,
    bigBlind: blinds.big,
    stacks: [...stacks],
    bets: [0, 0],
    committed: [0, 0],
    street: "PRE-FLOP",
    // Heads-up: the button posts the small blind and acts first before the flop.
    toAct: button,
    acted: [false, false],
    lastRaise: blinds.big,
    folded: null,
    log: [],
  };
  put(s, button, blinds.small);
  put(s, other(button), blinds.big);
  return s;
}

function put(s: HandState, seat: Seat, amount: number) {
  const a = r2(Math.min(amount, s.stacks[seat]));
  s.stacks[seat] = r2(s.stacks[seat] - a);
  s.bets[seat] = r2(s.bets[seat] + a);
  s.committed[seat] = r2(s.committed[seat] + a);
}

export const isOver = (s: HandState) => s.street === "SHOWDOWN";

export function legal(s: HandState): Legal {
  const me = s.toAct;
  const owed = r2(Math.max(0, s.bets[other(me)] - s.bets[me]));
  const toCall = r2(Math.min(owed, s.stacks[me]));
  const maxRaiseTo = r2(s.bets[me] + s.stacks[me]);
  const minRaiseTo = r2(Math.min(maxRaiseTo, s.bets[other(me)] + s.lastRaise));
  return {
    canCheck: owed === 0,
    toCall,
    // Raising needs chips beyond the call and an opponent who can still act.
    canRaise: s.stacks[me] > owed && s.stacks[other(me)] > 0,
    minRaiseTo,
    maxRaiseTo,
  };
}

export function apply(state: HandState, action: Action): HandState {
  if (isOver(state)) throw new Error("Hand is over");
  const s = structuredClone(state);
  const me = s.toAct;
  const l = legal(s);
  let amount = 0;

  switch (action.type) {
    case "fold":
      s.folded = me;
      break;
    case "check":
      if (!l.canCheck) throw new Error("Can't check facing a bet");
      break;
    case "call":
      if (l.canCheck) throw new Error("Nothing to call");
      amount = l.toCall;
      put(s, me, amount);
      break;
    case "raise": {
      if (!l.canRaise) throw new Error("Can't raise");
      const to = r2(action.to);
      if (to < l.minRaiseTo || to > l.maxRaiseTo) {
        throw new Error(`Raise must be between ${l.minRaiseTo} and ${l.maxRaiseTo}`);
      }
      const increment = r2(to - s.bets[other(me)]);
      // A short all-in doesn't reopen a full raise size.
      if (increment >= s.lastRaise) s.lastRaise = increment;
      amount = r2(to - s.bets[me]);
      put(s, me, amount);
      s.acted[other(me)] = false;
      break;
    }
  }

  s.acted[me] = true;
  s.log.push({ seat: me, street: s.street, action: action.type, amount, total: s.bets[me], pot: pot(s) });

  if (s.folded !== null) s.street = "SHOWDOWN";
  else if (streetDone(s)) advance(s);
  else s.toAct = other(me);
  return s;
}

function streetDone(s: HandState) {
  const settled = ([0, 1] as Seat[]).every((i) => s.acted[i] || s.stacks[i] === 0);
  const low: Seat = s.bets[0] < s.bets[1] ? 0 : 1;
  return settled && (s.bets[0] === s.bets[1] || s.stacks[low] === 0);
}

const NEXT: Record<Street, Street> = {
  "PRE-FLOP": "FLOP",
  FLOP: "TURN",
  TURN: "RIVER",
  RIVER: "SHOWDOWN",
  SHOWDOWN: "SHOWDOWN",
};
const SHOWN: Record<Street, HandState["boardCount"]> = {
  "PRE-FLOP": 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
  SHOWDOWN: 5,
};

function advance(s: HandState) {
  // Someone is all-in: no more betting, run the board out.
  const runOut = s.stacks[0] === 0 || s.stacks[1] === 0;
  s.street = runOut ? "SHOWDOWN" : NEXT[s.street];
  s.boardCount = SHOWN[s.street];
  s.bets = [0, 0];
  s.acted = [false, false];
  s.lastRaise = s.bigBlind;
  // After the flop the player out of position (not the button) acts first.
  s.toAct = other(s.button);
}

/** Who wins what. Uncalled chips go back to whoever put them in. */
export function settle(s: HandState): Settlement {
  if (!isOver(s)) throw new Error("Hand still in play");
  const total = pot(s);
  const matched = Math.min(s.committed[0], s.committed[1]);
  const refund: [number, number] = [r2(s.committed[0] - matched), r2(s.committed[1] - matched)];
  const contested = r2(matched * 2);

  if (s.folded !== null) {
    const w = other(s.folded);
    const payouts: [number, number] = [0, 0];
    payouts[w] = total;
    return { winner: w, payouts, pot: total, hands: null };
  }

  const hands: [HandValue, HandValue] = [
    bestHand([...s.hole[0], ...s.board]),
    bestHand([...s.hole[1], ...s.board]),
  ];
  const cmp = compareHands(hands[0], hands[1]);
  if (cmp === 0) {
    const half = r2(contested / 2);
    return {
      winner: "split",
      payouts: [r2(half + refund[0]), r2(contested - half + refund[1])],
      pot: total,
      hands,
    };
  }
  const w: Seat = cmp > 0 ? 0 : 1;
  const payouts: [number, number] = [...refund];
  payouts[w] = r2(payouts[w] + contested);
  return { winner: w, payouts, pot: total, hands };
}

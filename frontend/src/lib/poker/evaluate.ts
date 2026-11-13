import type { Card, Rank } from "@/lib/cards";
import { RANKS } from "./deck";

export type HandValue = {
  /** 0 = high card … 8 = straight flush. */
  category: number;
  /** Compare lexicographically: [category, ...tiebreak ranks]. */
  score: number[];
  /** Best five, playing cards first. */
  cards: Card[];
  /** Index in `cards` of the first kicker (doesn't make the hand), or -1. */
  kickerIndex: number;
  /** Plain English, e.g. "Two pair, queens and fours". */
  description: string;
};

const value = (r: Rank) => RANKS.indexOf(r) + 2;

const NAME: Record<number, [string, string]> = {
  2: ["two", "twos"],
  3: ["three", "threes"],
  4: ["four", "fours"],
  5: ["five", "fives"],
  6: ["six", "sixes"],
  7: ["seven", "sevens"],
  8: ["eight", "eights"],
  9: ["nine", "nines"],
  10: ["ten", "tens"],
  11: ["jack", "jacks"],
  12: ["queen", "queens"],
  13: ["king", "kings"],
  14: ["ace", "aces"],
};
/** "queen" / "queens". */
export const rankName = (r: Rank, plural = false) => NAME[value(r)][plural ? 1 : 0];

const one = (v: number) => NAME[v][0];
const many = (v: number) => NAME[v][1];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function describe(category: number, s: number[]): string {
  switch (category) {
    case 8:
      return s[0] === 14 ? "Royal flush" : `Straight flush, ${one(s[0])}-high`;
    case 7:
      return `Four ${many(s[0])}`;
    case 6:
      return `Full house, ${many(s[0])} over ${many(s[1])}`;
    case 5:
      return `Flush, ${one(s[0])}-high`;
    case 4:
      return `Straight, ${one(s[0])}-high`;
    case 3:
      return `Three ${many(s[0])}`;
    case 2:
      return `Two pair, ${many(s[0])} and ${many(s[1])}`;
    case 1:
      return `Pair of ${many(s[0])}`;
    default:
      return `${cap(one(s[0]))}-high`;
  }
}

/** Highest straight in a set of distinct values (wheel counts as five-high), or 0. */
function straightHigh(values: number[]): number {
  const set = new Set(values);
  if (set.has(14)) set.add(1);
  for (let hi = 14; hi >= 5; hi--) {
    if ([0, 1, 2, 3, 4].every((k) => set.has(hi - k))) return hi;
  }
  return 0;
}

function evaluateFive(five: Card[]): HandValue {
  const vals = five.map((c) => value(c.rank));
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Groups by size, then rank: [[12,2],[4,2],[13,1]] for QQ44K.
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = five.every((c) => c.suit === five[0].suit);
  const high = counts.size === 5 ? straightHigh(vals) : 0;

  let category: number;
  let tiebreak: number[];
  if (flush && high) [category, tiebreak] = [8, [high]];
  else if (groups[0][1] === 4) [category, tiebreak] = [7, groups.map((g) => g[0])];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [category, tiebreak] = [6, groups.map((g) => g[0])];
  else if (flush) [category, tiebreak] = [5, groups.map((g) => g[0])];
  else if (high) [category, tiebreak] = [4, [high]];
  else if (groups[0][1] === 3) [category, tiebreak] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [category, tiebreak] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [category, tiebreak] = [1, groups.map((g) => g[0])];
  else [category, tiebreak] = [0, groups.map((g) => g[0])];

  // Order cards like the groups so the made part comes first.
  const order = groups.map((g) => g[0]);
  const cards = [...five].sort((a, b) => order.indexOf(value(a.rank)) - order.indexOf(value(b.rank)));
  if (high) cards.sort((a, b) => value(b.rank) - value(a.rank));
  const made = [0, 2, 4, 3, 5, 5, 5, 4, 5][category];

  return {
    category,
    score: [category, ...tiebreak],
    cards,
    kickerIndex: made < 5 ? made : -1,
    description: describe(category, tiebreak),
  };
}

/** Negative if a < b, positive if a > b, 0 on a tie. */
export function compareHands(a: HandValue, b: HandValue): number {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
    const d = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The winner's description, plus the deciding kicker when both read the same ("Pair of kings, ace kicker"). */
export function describeWinner(win: HandValue, lose: HandValue): string {
  if (win.description !== lose.description) return win.description;
  const i = win.score.findIndex((v, k) => v !== lose.score[k]);
  return i > 0 ? `${win.description}, ${one(win.score[i])} kicker` : win.description;
}

/** Best five-card hand from five to seven cards. */
export function bestHand(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error("Need 5 to 7 cards");
  let best: HandValue | null = null;
  for (const five of choose(cards, 5)) {
    const v = evaluateFive(five);
    if (!best || compareHands(v, best) > 0) best = v;
  }
  return best!;
}

function choose<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...choose(rest, k - 1).map((c) => [head, ...c]), ...choose(rest, k)];
}

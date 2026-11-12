import { payoutFor, rakeFor } from "@/lib/server/economics";
import { shuffle } from "./deck";
import { mixSeed } from "./fairness";
import { apply, isOver, newHand, type Action, type HandState, type Seat } from "./game";
import { toRecord } from "./record";

/**
 * Everything besides the two seeds needed to re-play a hand: the stacks before
 * the blinds, the blinds, the button and every action in order. With the seeds
 * revealed on-chain, anyone can rebuild the deck, re-run the pure engine and
 * check the payout the contract settled.
 */
export type Replay = {
  stacks: [number, number];
  blinds: { small: number; big: number };
  button: Seat;
  actions: Action[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function replayOf(s: HandState): Replay {
  return {
    stacks: [r2(s.stacks[0] + s.committed[0]), r2(s.stacks[1] + s.committed[1])],
    blinds: { small: s.smallBlind ?? r2(s.bigBlind / 2), big: s.bigBlind },
    button: s.button,
    actions: s.log.map((e): Action => (e.action === "raise" ? { type: "raise", to: e.total } : { type: e.action })),
  };
}

export type PayoutCheck = { ok: true; payout: number } | { ok: false; reason: string; expected?: number };

/**
 * Re-deal from both seeds, re-play the recorded actions and compute what the
 * agent should have been paid (ending stack less the disclosed rake, at its
 * default rate). Compares against the payout the contract recorded.
 */
export async function checkPayout({
  serverSeed,
  playerSeed,
  replay,
  payout,
}: {
  serverSeed: string;
  playerSeed: string;
  replay: Replay;
  /** On-chain payout, table units (GNEAR). */
  payout: number;
}): Promise<PayoutCheck> {
  let s: HandState;
  try {
    s = newHand({ deck: shuffle(await mixSeed(serverSeed, playerSeed)), stacks: replay.stacks, blinds: replay.blinds, button: replay.button });
    for (const a of replay.actions) s = apply(s, a);
  } catch {
    return { ok: false, reason: "The recorded actions aren't a legal hand with these cards" };
  }
  if (!isOver(s)) return { ok: false, reason: "The recorded actions don't finish the hand" };
  const hand = toRecord(s, { id: "", table: "", reasons: [], proof: { seed: serverSeed, commitment: "", playerSeed, hole: s.hole, board: s.board } });
  const expected = payoutFor(hand.stackAfter, rakeFor(hand, replay.blinds.big));
  return Math.abs(expected - payout) < 0.005
    ? { ok: true, payout }
    : { ok: false, reason: "The on-chain payout doesn't match the cards", expected };
}

import { describe, expect, it } from "vitest";
import { shuffle } from "@/lib/poker/deck";
import { mixSeed } from "@/lib/poker/fairness";
import { apply, isOver, legal, newHand, type HandState } from "@/lib/poker/game";
import { toRecord } from "@/lib/poker/record";
import { checkPayout } from "@/lib/poker/replay";
import { payoutFor, rakeFor } from "@/lib/server/economics";

const serverSeed = "00112233445566778899aabbccddeeff";
const playerSeed = "ffeeddccbbaa99887766554433221100";

/** A hand where seat 0 bets 4 every street and seat 1 calls, to showdown. */
async function played() {
  let s: HandState = newHand({ deck: shuffle(await mixSeed(serverSeed, playerSeed)), stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 0 });
  while (!isOver(s)) {
    const l = legal(s);
    s = apply(s, s.toAct === 0 && l.canCheck && l.canRaise ? { type: "raise", to: 4 } : l.canCheck ? { type: "check" } : { type: "call" });
  }
  const hand = toRecord(s, { id: "0123abcd", table: "t", reasons: [], proof: { seed: serverSeed, commitment: "", playerSeed, hole: s.hole, board: s.board } });
  return { hand, payout: payoutFor(hand.stackAfter, rakeFor(hand, 1)) };
}

describe("checkPayout", () => {
  it("re-plays the recorded actions from the seeds and matches the payout", async () => {
    const { hand, payout } = await played();
    expect(hand.replay!.actions.length).toBeGreaterThan(2);
    expect(await checkPayout({ serverSeed, playerSeed, replay: hand.replay!, payout })).toEqual({ ok: true, payout });
  });

  it("flags a tampered on-chain payout", async () => {
    const { hand, payout } = await played();
    expect(await checkPayout({ serverSeed, playerSeed, replay: hand.replay!, payout: payout + 1 })).toMatchObject({ ok: false, expected: payout });
  });

  it("flags a tampered action", async () => {
    const { hand, payout } = await played();
    const actions = hand.replay!.actions.map((a) => (a.type === "raise" ? { ...a, to: 5 } : a));
    expect((await checkPayout({ serverSeed, playerSeed, replay: { ...hand.replay!, actions }, payout })).ok).toBe(false);
    const cut = hand.replay!.actions.slice(0, -1);
    expect(await checkPayout({ serverSeed, playerSeed, replay: { ...hand.replay!, actions: cut }, payout })).toMatchObject({ ok: false });
  });
});

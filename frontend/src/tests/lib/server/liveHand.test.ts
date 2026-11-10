import { describe, expect, it, vi } from "vitest";
import { freshDeck } from "@/lib/poker/deck";
import { legal, type Action, type HandState, type Legal } from "@/lib/poker/game";
import type { LiveHand } from "@/lib/poker/record";
import {
  applyExternalAction,
  type Deps,
  IllegalMoveError,
  memoryStore,
  startHand,
  timeoutHand,
  UnknownHandError,
} from "@/lib/server/liveHand";

/** Check when free, otherwise call — a passive line that always reaches showdown. */
const passive = (l: Legal): Action => (l.canCheck ? { type: "check" } : { type: "call" });
const house = async (s: HandState): Promise<Action> => passive(legal(s));

const DEAL = { seed: "a".repeat(32), commitment: "b".repeat(64), playerSeed: "c".repeat(32) };

function deps(over: Partial<Deps> = {}): Deps & { settled: LiveHand[] } {
  const settled: LiveHand[] = [];
  return {
    store: memoryStore(),
    house,
    onSettle: async (_rec, hand) => {
      settled.push(hand);
    },
    settled,
    ...over,
  };
}

function start(d: Deps, button: 0 | 1 = 0) {
  return startHand(d, {
    handId: "0123abcd",
    sessionId: "s1",
    tableName: "the back room",
    deck: freshDeck(), // unshuffled: a fixed, known hand
    stacks: [100, 100],
    blinds: { small: 0.5, big: 1 },
    button,
    deal: DEAL,
  });
}

describe("liveHand turn machine", () => {
  it("plays a hand to settlement, one external turn at a time", async () => {
    const d = deps();
    let result = await start(d);
    let externalTurns = 0;
    while (!result.done) {
      externalTurns++;
      result = await applyExternalAction(d, "0123abcd", passive(result.view.legal), "staying in");
      expect(externalTurns).toBeLessThan(50); // guard a runaway test
    }
    expect(result.done).toBe(true);
    if (result.done) {
      expect(result.settled).toBe(true);
      expect(typeof result.hand.net).toBe("number");
      // One recorded reason per external action; one settlement.
      expect(result.hand.steps.filter((s) => s.reason === "staying in").length).toBe(externalTurns);
      expect(d.settled).toHaveLength(1);
    }
  });

  it("times out by folding when facing a bet, and still settles (funds never locked)", async () => {
    const d = deps();
    const first = await start(d); // seat 0 is the button, owes the small blind — can't check
    expect(first.done).toBe(false);
    const result = await timeoutHand(d, "0123abcd");
    expect(result?.done).toBe(true);
    if (result?.done) {
      expect(result.settled).toBe(true);
      expect(result.hand.net).toBeLessThan(0); // gave up the small blind
    }
    expect(d.settled).toHaveLength(1);
  });

  it("refunds instead of locking funds when on-chain settlement fails", async () => {
    const onCancel = vi.fn(async () => {});
    const d = deps({
      onSettle: async () => {
        throw new Error("testnet unreachable");
      },
      onCancel,
    });
    let result = await start(d);
    while (!result.done) {
      result = await applyExternalAction(d, "0123abcd", passive(result.view.legal));
    }
    expect(result.done).toBe(true);
    if (result.done) expect(result.settled).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("rejects an unknown hand and a move out of turn", async () => {
    const d = deps();
    await expect(applyExternalAction(d, "ffffffff", { type: "check" })).rejects.toBeInstanceOf(UnknownHandError);

    await start(d);
    // Fold now; the hand is over, so a second action is out of turn.
    let r = await applyExternalAction(d, "0123abcd", { type: "fold" });
    while (!r.done) r = await applyExternalAction(d, "0123abcd", passive(r.view.legal));
    await expect(applyExternalAction(d, "0123abcd", { type: "check" })).rejects.toBeInstanceOf(UnknownHandError);
  });

  it("rejects an illegal move", async () => {
    const d = deps();
    await start(d); // seat 0 owes the blind: checking is illegal here
    await expect(applyExternalAction(d, "0123abcd", { type: "check" })).rejects.toBeInstanceOf(IllegalMoveError);
  });

  it("lets the house act first when it holds position pre-flop", async () => {
    const d = deps();
    // Button on the house: it posts the small blind and acts first pre-flop, so
    // startHand should run the house before handing the external agent its turn.
    const first = await start(d, 1);
    expect(first.done).toBe(false);
    if (!first.done) expect(first.view.history.length).toBeGreaterThan(0);
  });
});

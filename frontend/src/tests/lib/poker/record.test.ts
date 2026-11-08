import { describe, expect, it } from "vitest";
import { cards } from "@/lib/cards";
import { apply, newHand, type Action } from "@/lib/poker/game";
import { pushHand, toHistory, toRecord } from "@/lib/poker/record";

// Agent Qs Qd · house 9h 8s · board 9c 4h 2s Kd 4c; agent on the button.
const DECK = cards("Qs", "9h", "Qd", "8s", "9c", "4h", "2s", "Kd", "4c");
const proof = { seed: "s", commitment: "c", hole: [[], []] as [never[], never[]], board: [] };
const meta = (reasons: string[]) => ({ id: "ab12", table: "the back room", reasons, proof });
const play = (...actions: Action[]) =>
  actions.reduce(apply, newHand({ deck: DECK, stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 0 }));

const call: Action = { type: "call" };
const check: Action = { type: "check" };
const raise = (to: number): Action => ({ type: "raise", to });

describe("toRecord", () => {
  // Pre-flop limp/check, flop: house checks, agent bets 2, house calls;
  // turn checks through; river: house checks, agent bets 4, house calls.
  const hand = play(call, check, check, raise(2), call, check, check, check, raise(4), call);
  const rec = toRecord(hand, meta(["limp", "value", "pot control", "value again"]));

  it("makes one step per agent decision plus the result", () => {
    expect(rec.steps.map((s) => [s.street, s.action, s.opponent, s.boardCount])).toEqual([
      ["PRE-FLOP", "CALL 0.5", "checked", 0],
      ["FLOP", "BET 2", "called 2", 3],
      ["TURN", "CHECK", "checked", 4],
      ["RIVER", "BET 4", "called 4", 5],
      ["SHOWDOWN", "WON 14", "showed 9♡ 8♠", 5],
    ]);
    expect(rec.steps.map((s) => s.reason).slice(0, 4)).toEqual(["limp", "value", "pot control", "value again"]);
  });

  it("works out the money", () => {
    expect(rec).toMatchObject({ id: "#ab12", potWon: 14, net: 7, stackAfter: 57 });
  });

  it("explains the result and keeps the winning five", () => {
    expect(rec.outcome).toBe("Two pair, queens and fours beat the house agent’s two pair, nines and fours.");
    expect(rec.winningFive.map((c) => c.rank)).toEqual(["Q", "Q", "4", "4", "K"]);
    expect(rec.kickerIndex).toBe(4);
  });

  it("never shows a later street's move as the reply", () => {
    // Agent (button) limps, house raises to 3, agent calls; the house's next move is on the flop.
    const r = toRecord(play(call, raise(3), call, check, check, check, check, check, check), meta([]));
    expect(r.steps[1]).toMatchObject({ street: "PRE-FLOP", action: "CALL 2", opponent: "raised to 3" });
  });

  it("labels raises after a bet as RAISE TO", () => {
    const r = toRecord(play(raise(3), raise(9), call, check, check, check, check, check, check), meta([]));
    expect(r.steps[0].action).toBe("RAISE TO 3");
    expect(r.steps[0].opponent).toBe("raised to 9");
  });

  it("handles the house folding", () => {
    const r = toRecord(play(raise(3), { type: "fold" }), meta(["open"]));
    expect(r.steps.at(-1)).toMatchObject({ action: "WON 4", opponent: "folded", boardCount: 0 });
    expect(r.net).toBe(1);
    expect(r.winningFive).toEqual([]);
  });

  it("handles the agent folding", () => {
    const r = toRecord(play({ type: "fold" }), meta(["junk"]));
    expect(r.steps.at(-1)).toMatchObject({ action: "LOST 0.5", opponent: "won uncontested" });
    expect(r.outcome).toMatch(/folded/);
    expect(r.potWon).toBe(0);
  });
});

describe("toHistory", () => {
  it("summarises streets for the archive", () => {
    const rec = toRecord(play(call, check, check, raise(2), call, check, check, check, raise(4), call), meta([]));
    const h = toHistory(rec);
    expect(h).toMatchObject({ id: "#ab12", net: 7, scope: "session" });
    expect(h.steps[0]).toEqual({ street: "PRE", board: "—", action: "Call 0.5, checked" });
    expect(h.steps[1]).toEqual({ street: "FLOP", board: "9♣ 4♡ 2♠", action: "Bet 2, called 2" });
  });
});

describe("pushHand", () => {
  const rec = (id: string) => toRecord(play({ type: "fold" }), { ...meta([]), id });

  it("adds newest first and drops duplicates", () => {
    const list = pushHand(pushHand([], rec("a")), rec("b"));
    expect(list.map((h) => h.id)).toEqual(["#b", "#a"]);
    expect(pushHand(list, rec("a")).map((h) => h.id)).toEqual(["#a", "#b"]);
  });

  it("keeps at most the cap", () => {
    let list = pushHand([], rec("a"), 2);
    list = pushHand(list, rec("b"), 2);
    list = pushHand(list, rec("c"), 2);
    expect(list.map((h) => h.id)).toEqual(["#c", "#b"]);
  });
});

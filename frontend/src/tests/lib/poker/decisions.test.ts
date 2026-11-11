import { describe, expect, it } from "vitest";
import type { HandStep } from "@/lib/data/hands";
import { agentMove, decisionLine, replyMove } from "@/lib/poker/decisions";

const step = (over: Partial<HandStep>): HandStep =>
  ({ street: "FLOP", pot: 4, action: "BET 2", reason: "Top pair.", opponent: "called 2", boardCount: 3, ...over }) as HandStep;

describe("agentMove", () => {
  it("explains each poker word once, in plain English", () => {
    expect(agentMove("FOLD")).toBe("folded (gave up the hand)");
    expect(agentMove("CHECK")).toBe("checked (passed without betting)");
    expect(agentMove("CALL 0.5")).toBe("called 0.5 (matched the bet)");
    expect(agentMove("RAISE TO 3")).toBe("raised to 3 (bet more)");
    expect(agentMove("BET 2")).toBe("bet 2");
  });
});

describe("replyMove", () => {
  it("glosses the other side's reply and skips no-reply", () => {
    expect(replyMove("called 2")).toBe("called 2 (matched the bet)");
    expect(replyMove("folded")).toBe("folded (gave up)");
    expect(replyMove("—")).toBeNull();
  });
});

describe("decisionLine", () => {
  it("names the street, the move, why, and the reply", () => {
    expect(decisionLine(step({}), "house agent")).toEqual({
      street: "Flop · first 3 shared cards",
      move: "Your agent bet 2",
      reason: "Top pair.",
      reply: "House agent called 2 (matched the bet)",
    });
  });

  it("turns the last step into the hand's result sentence", () => {
    const line = decisionLine(step({ street: "SHOWDOWN", action: "WON 4", reason: "The practice bot folded." }), "practice bot");
    expect(line).toEqual({ street: "Result", move: "The practice bot folded.", reason: "", reply: null });
  });
});

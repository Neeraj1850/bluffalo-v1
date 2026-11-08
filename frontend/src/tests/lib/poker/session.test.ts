import { describe, expect, it } from "vitest";
import { addHand, stopReason } from "@/lib/poker/session";

const limits = { stopLoss: 25, takeProfit: 60, maxHands: 100 };
const session = (over: Partial<{ hands: number; net: number; stack: number }>) => ({
  hands: 10,
  net: 0,
  stack: 50,
  ...over,
});

describe("stopReason", () => {
  it("keeps playing inside the limits", () => {
    expect(stopReason(session({}), limits, 1)).toBeNull();
  });

  it.each([
    ["stop-loss", { net: -25 }],
    ["take-profit", { net: 60 }],
    ["max-hands", { hands: 100 }],
    ["busted", { stack: 0.5 }],
  ] as const)("stops on %s", (reason, over) => {
    expect(stopReason(session(over), limits, 1)).toBe(reason);
  });

  it("checks the stop loss first", () => {
    expect(stopReason(session({ net: -30, hands: 100, stack: 0 }), limits, 1)).toBe("stop-loss");
  });
});

describe("addHand", () => {
  it("adds the hand and takes the new stack", () => {
    expect(addHand(session({ net: 1.1 }), { net: 2.2, stackAfter: 53.3 })).toEqual({ hands: 11, net: 3.3, stack: 53.3 });
  });
});

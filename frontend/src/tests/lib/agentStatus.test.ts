import { describe, expect, it } from "vitest";
import { activeNavKey, NAV_ITEMS } from "@/components/nav/navItems";
import { agentBalanceState, buyInMoveCopy, IN_HAND_COPY } from "@/lib/agentStatus";

describe("agentBalanceState", () => {
  it("never calls a locked stack empty", () => {
    expect(agentBalanceState({ account: "a.testnet", balance: 0, inHand: true })).toBe("in_hand");
    expect(IN_HAND_COPY).toMatch(/hand is being played/);
  });
  it("covers loading, no agent, empty and funded", () => {
    expect(agentBalanceState(null)).toBe("loading");
    expect(agentBalanceState({ account: null, balance: 0 })).toBe("none");
    expect(agentBalanceState({ account: "a.testnet", balance: 0, inHand: false })).toBe("empty");
    expect(agentBalanceState({ account: "a.testnet", balance: 12 })).toBe("funded");
  });
});

describe("buyInMoveCopy", () => {
  it("is future tense before confirm and past tense after", () => {
    expect(buyInMoveCopy(95, 50, false)).toBe(
      "Will move from your playing balance (95.00 → 45.00) to your agent’s account when you confirm.",
    );
    expect(buyInMoveCopy(95, 50, true)).toBe("Moved from your playing balance (95.00 → 45.00) to your agent’s account.");
  });
});

describe("nav", () => {
  it("points Wallet at /wallet and /results at Live", () => {
    expect(NAV_ITEMS.find((i) => i.key === "wallet")?.href).toBe("/wallet");
    expect(activeNavKey("/wallet")).toBe("wallet");
    expect(activeNavKey("/results")).toBe("live");
  });
});

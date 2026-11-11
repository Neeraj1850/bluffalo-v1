import { describe, expect, it } from "vitest";
import { activeNavKey, NAV_ITEMS } from "@/components/nav/navItems";
import { agentBalanceState, buyInMoveCopy, deploymentIsStale, IN_HAND_COPY } from "@/lib/agentStatus";

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
    expect(activeNavKey("/live/abc123")).toBe("live");
    expect(activeNavKey("/practice/abc123")).toBe("practice");
  });
});

describe("deploymentIsStale", () => {
  it("is stale with no agent account", () => {
    expect(deploymentIsStale({ account: null, balance: 0 }, 1)).toBe(true);
  });
  it("is stale when the agent can't cover a big blind and isn't mid-hand", () => {
    expect(deploymentIsStale({ account: "a.testnet", balance: 0.5, inHand: false }, 1)).toBe(true);
  });
  it("keeps a funded agent, and one whose stack is locked in a hand", () => {
    expect(deploymentIsStale({ account: "a.testnet", balance: 48, inHand: false }, 1)).toBe(false);
    expect(deploymentIsStale({ account: "a.testnet", balance: 0, inHand: true }, 1)).toBe(false);
  });
});

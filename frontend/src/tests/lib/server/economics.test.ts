import { afterEach, describe, expect, it, vi } from "vitest";
import { getTable } from "@/lib/data/tables";
import {
  endedPreflop,
  exposureCap,
  houseFloor,
  maxBuyInFor,
  payoutFor,
  rakeFor,
  sessionPayoutCap,
  stakeFor,
  tableFeeFor,
  tableStatus,
} from "@/lib/server/economics";

/** A finished hand: only the last step's pot/board and the agent's net matter for the rake. */
const hand = (net: number, pot: number, boardCount: 0 | 3 | 4 | 5) => ({
  net,
  steps: [{ street: "SHOWDOWN" as const, pot, action: "", reason: "", opponent: "", boardCount }],
});
const backRoom = getTable("back-room"); // blinds 0.5/1, buy-in 20–100

afterEach(() => vi.unstubAllEnvs());

describe("rakeFor", () => {
  it("takes 5% of the pot when the agent wins after the flop", () => {
    expect(rakeFor(hand(10, 20, 5), 1)).toBe(1);
  });

  it("caps the rake at 3 big blinds", () => {
    expect(rakeFor(hand(100, 200, 5), 1)).toBe(3);
    expect(rakeFor(hand(100, 200, 5), 2)).toBe(6);
  });

  it("no flop, no drop", () => {
    expect(endedPreflop(hand(10, 20, 0))).toBe(true);
    expect(rakeFor(hand(10, 20, 0), 1)).toBe(0);
  });

  it("takes nothing when the house wins or the pot is split", () => {
    expect(rakeFor(hand(-10, 20, 5), 1)).toBe(0);
    expect(rakeFor(hand(0, 20, 5), 1)).toBe(0);
  });

  it("never takes more than the agent won", () => {
    expect(rakeFor(hand(0.4, 20, 3), 1)).toBe(0.4);
  });

  it("rounds down to the table's 2 decimals", () => {
    expect(rakeFor(hand(5, 9.99, 3), 1)).toBe(0.49);
  });

  it("is env-overridable", () => {
    vi.stubEnv("RAKE_PCT", "0.1");
    vi.stubEnv("RAKE_CAP_BB", "1");
    expect(rakeFor(hand(10, 20, 5), 1)).toBe(1);
    expect(rakeFor(hand(10, 8, 5), 1)).toBe(0.8);
  });
});

describe("payoutFor", () => {
  it("is the ending stack less the rake, never negative", () => {
    expect(payoutFor(60, 1)).toBe(59);
    expect(payoutFor(0, 0)).toBe(0);
  });
});

describe("table fee and bankroll limits", () => {
  it("charges 2% of the buy-in, at least 0.01", () => {
    expect(tableFeeFor(50)).toBe(1);
    expect(tableFeeFor(0.1)).toBe(0.01);
    expect(tableFeeFor(0)).toBe(0);
  });

  it("caps the house stake at 1% of its current balance (dynamic)", () => {
    expect(exposureCap(5000)).toBe(50);
    expect(exposureCap(20000)).toBe(200);
    expect(stakeFor(30, 5000)).toBe(30);
    expect(stakeFor(150, 5000)).toBe(50);
  });

  it("derives max buy-in, floor and session cap from the house, not a static table max", () => {
    expect(maxBuyInFor(backRoom, 5000)).toBe(50);
    expect(maxBuyInFor(backRoom, 50000)).toBe(500); // above the table's listed 100: the cap is dynamic
    expect(houseFloor(backRoom)).toBe(2000); // 1% of 2000 = backRoom min buy-in 20
    expect(sessionPayoutCap(backRoom, 5000)).toBe(150);
  });

  it("closes a table when 1% of the house no longer covers its minimum buy-in", () => {
    expect(tableStatus(backRoom, 5000)).toEqual({ id: "back-room", open: true, maxBuyIn: 50 });
    expect(tableStatus(backRoom, 1999)).toEqual({ id: "back-room", open: false, reason: "house_below_floor", maxBuyIn: 0 });
  });

  it("follows MAX_EXPOSURE_PCT", () => {
    vi.stubEnv("MAX_EXPOSURE_PCT", "0.02");
    expect(exposureCap(5000)).toBe(100);
  });
});

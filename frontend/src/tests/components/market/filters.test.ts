import { describe, expect, it } from "vitest";
import { changeLabel, filterStrategies, leaderboard, seatsListed } from "@/components/market/filters";
import { ticksDue } from "@/components/market/SimView";
import type { MarketListing, MarketStrategy } from "@/lib/market/types";

const s = (o: Partial<MarketStrategy>): MarketStrategy => ({
  tokenId: "x", title: "X", creator: "c.testnet", you: false, supply: 10, maxSupply: 10, hands: 0, net: 0, roi: 0,
  wins: 0, rated: false, price: 10, prev: 10, fair: 10, change: 0, why: { rows: [], sentence: "" }, spark: [],
  lowestAsk: null, owned: 0, ...o,
});

describe("market filters", () => {
  const list = [
    s({ tokenId: "a", price: 8, fair: 10, net: 5 }),
    s({ tokenId: "b", change: 1, rated: true, net: -3 }),
    s({ tokenId: "c", you: true, net: 9 }),
    s({ tokenId: "d", owned: 2 }),
  ];
  const ids = (l: MarketStrategy[]) => l.map((x) => x.tokenId);

  it("filters by under fair, rising and mine", () => {
    expect(ids(filterStrategies(list, "all"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filterStrategies(list, "under"))).toEqual(["a"]);
    expect(ids(filterStrategies(list, "rising"))).toEqual(["b"]);
    expect(ids(filterStrategies(list, "mine"))).toEqual(["c", "d"]);
  });

  it("ranks rated first, then by net", () => {
    expect(ids(leaderboard(list))).toEqual(["b", "c", "a", "d"]);
  });

  it("breaks net ties by hands, then price", () => {
    const tie = [s({ tokenId: "x", price: 3 }), s({ tokenId: "y", price: 9 }), s({ tokenId: "z", hands: 4 })];
    expect(ids(leaderboard(tie))).toEqual(["z", "y", "x"]);
  });

  it("signs changes with an arrow, never color alone", () => {
    expect(changeLabel(1.25)).toBe("▲ +1.3");
    expect(changeLabel(-0.8)).toBe("▼ −0.8");
    expect(changeLabel(0)).toBe("±0.0");
  });

  it("counts seats for sale per strategy", () => {
    const l = (tokenId: string, amount: number) => ({ tokenId, amount }) as MarketListing;
    expect(seatsListed([l("a", 2), l("b", 5), l("a", 3)], "a")).toBe(5);
  });
});

describe("sim pacing", () => {
  it("plays the 168-tick week in about 60 s at 1×", () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const r = ticksDue(carry, 1 / 60, 1);
      carry = r.carry;
      total += r.n;
    }
    expect(total).toBeGreaterThanOrEqual(167);
    expect(total).toBeLessThanOrEqual(168);
    expect(ticksDue(0, 1, 100).n).toBe(280);
  });
});

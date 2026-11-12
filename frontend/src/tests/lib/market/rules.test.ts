import { describe, expect, it } from "vitest";
import { brokerAsk, brokerBid, explain, priceChange, fairValue, isClosed, npcDecide, quote, type MarketStats, type NpcState } from "@/lib/market/rules";

const base: MarketStats = { n: 100, sumStake: 1000, sumNet: 0, listed: 4, buyers24h: 0, uses24h: 0 };
const zero = () => 0;

describe("fairValue", () => {
  it("is 10 GNEAR for a flat record, normal stock, no demand", () => {
    expect(fairValue(base)).toBeCloseTo(10);
  });
  it("rises with ROI", () => {
    const vals = [-0.3, -0.1, 0, 0.05, 0.1].map((r) => fairValue({ ...base, sumNet: r * base.sumStake }));
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
    expect(vals[4]).toBeGreaterThan(vals[2]);
  });
  it("clamps every factor", () => {
    expect(fairValue({ ...base, sumNet: 1e6 })).toBeCloseTo(30);
    expect(fairValue({ ...base, sumNet: -1e6 })).toBeCloseTo(5);
    expect(fairValue({ ...base, listed: 100 })).toBeCloseTo(7);
    expect(fairValue({ ...base, listed: 0 })).toBeCloseTo(12.4);
    expect(fairValue({ ...base, buyers24h: 50, uses24h: 50 })).toBeCloseTo(20);
    expect(fairValue({ ...base, n: 0, sumStake: 0, sumNet: 0 })).toBeCloseTo(10);
  });
  it("shrinks small samples", () => {
    const small = fairValue({ ...base, n: 3, sumNet: 100 });
    const big = fairValue({ ...base, n: 300, sumNet: 100 });
    expect(small).toBeLessThan(big);
  });
});

describe("quote", () => {
  it("moves at most ±15% per tick", () => {
    expect(quote(100, 1000)).toBe(115);
    expect(quote(100, 1)).toBe(85);
    expect(quote(100, 105)).toBe(105);
  });
  it("stays within [1, 500]", () => {
    expect(quote(490, 5000)).toBe(500);
    expect(quote(1, 0.01)).toBe(1);
    expect(quote(0, 7)).toBe(7);
  });
});

describe("brokers", () => {
  it("quotes ask above and bid below", () => {
    expect(brokerAsk("bookie", 100)).toBe(108);
    expect(brokerBid("bookie", 100)).toBe(88);
    expect(brokerAsk("tilt", 100)).toBe(112);
    expect(brokerBid("tilt", 100)).toBe(85);
  });
  it("closes below 20 GNEAR and does nothing", () => {
    expect(isClosed(19.9)).toBe(true);
    expect(isClosed(20)).toBe(false);
    const npc: NpcState = { key: "bookie", cash: 10, holdings: {}, listings: {} };
    const a = npcDecide(npc, [{ tokenId: "shark", price: 5, prev: 5, fair: 50, listed: 3 }], zero);
    expect(a.kind).toBe("none");
    expect(a.reason).toMatch(/closed/);
  });
  it("Bookie buys under its bid, reprices stale listings, lists held seats", () => {
    const npc: NpcState = { key: "bookie", cash: 500, holdings: {}, listings: {} };
    const m = [{ tokenId: "shark", price: 10, prev: 10, fair: 20, listed: 3 }];
    expect(npcDecide(npc, m, zero)).toMatchObject({ kind: "buy", tokenId: "shark", price: 10 });
    expect(npcDecide(npc, [{ ...m[0], fair: 10 }], zero).kind).toBe("none");
    expect(npcDecide({ ...npc, holdings: { shark: 1 } }, [{ ...m[0], fair: 10 }], zero)).toMatchObject({ kind: "list", price: 10.8 });
    expect(npcDecide({ ...npc, holdings: { shark: 1 }, listings: { shark: 20 } }, m, zero)).toMatchObject({ kind: "reprice", price: 10.8 });
  });
  it("names the strategy by title in reasons, never the raw token id", () => {
    const npc: NpcState = { key: "bookie", cash: 500, holdings: {}, listings: { sccc8ab49: 20 } };
    const a = npcDecide(npc, [{ tokenId: "sccc8ab49", title: "Shark", price: 10, prev: 10, fair: 10, listed: 3 }], zero);
    expect(a.reason).toMatch(/reprices Shark /);
    expect(a.reason).not.toMatch(/sccc8ab49/);
  });
  it("a strategy with no previous quote has not moved", () => {
    expect(priceChange(7, 0)).toBe(0);
    expect(priceChange(7.6, 7)).toBe(0.6);
  });
  it("Tilt chases a rising price that Bookie ignores", () => {
    const m = [{ tokenId: "maniac", price: 11.5, prev: 10, fair: 11.5, listed: 3 }];
    expect(npcDecide({ key: "bookie", cash: 500, holdings: {}, listings: {} }, m, zero).kind).toBe("none");
    expect(npcDecide({ key: "tilt", cash: 500, holdings: {}, listings: {} }, m, zero).kind).toBe("buy");
  });
});

describe("explain", () => {
  it("gives rows and one sentence with the inputs", () => {
    const { rows, sentence } = explain({ ...base, sumNet: 41, n: 120, listed: 6, buyers24h: 2, uses24h: 1 }, 10);
    expect(rows.map((r) => r.label)).toContain("Fair value");
    expect(sentence).toMatch(/^Fair value [\d.]+ GNEAR: ROI \+4\.1% over 120 hands \(×[\d.]+\), 6 seats listed \(×0\.88\), 3 recent buyers or uses \(×1\.30\); quoted [\d.]+, up \d+% \(capped\)\.$/);
  });
});

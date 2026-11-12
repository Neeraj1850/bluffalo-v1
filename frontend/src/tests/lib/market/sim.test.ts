import { describe, expect, it } from "vitest";
import { PRICE_MAX, PRICE_MIN } from "@/lib/market/rules";
import { dayOf, simulate, simulateSteps } from "@/lib/market/sim";

describe("simulate", () => {
  const a = simulate("demo");
  it("is deterministic for a seed", () => {
    expect(simulate("demo")).toEqual(a);
  });
  it("differs across seeds", () => {
    expect(simulate("other", { ticks: 24 }).ticks.at(-1)!.prices).not.toEqual(simulate("demo", { ticks: 24 }).ticks.at(-1)!.prices);
  });
  it("runs a week of 168 ticks with prices in bounds and moving ≤15% per tick", () => {
    expect(a.ticks).toHaveLength(168);
    expect(a.summary.strategies).toHaveLength(11);
    let prev = a.summary.start;
    for (const t of a.ticks) {
      for (const [id, p] of Object.entries(t.prices)) {
        expect(p).toBeGreaterThanOrEqual(PRICE_MIN);
        expect(p).toBeLessThanOrEqual(PRICE_MAX);
        expect(p).toBeLessThanOrEqual(prev[id] * 1.15 + 0.006);
        expect(p).toBeGreaterThanOrEqual(prev[id] * 0.85 - 0.006);
      }
      prev = t.prices;
    }
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.summary.volume).toBeGreaterThan(0);
  });
  it("includes the draft and steps one tick at a time", () => {
    const gen = simulateSteps("x", { draft: { aggression: 50, bluff: 50, position: 50, sizing: 50 } });
    const first = gen.next();
    expect(first.done).toBe(false);
    if (!first.done) expect(first.value.prices.draft).toBeGreaterThan(0);
  });
  it("runs the week within the time budget", () => {
    const t0 = performance.now();
    simulate("speed");
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("dayOf", () => {
  it("caps a 168-tick week at day 7", () => {
    expect([dayOf(0), dayOf(1), dayOf(24), dayOf(25), dayOf(168)]).toEqual([0, 1, 1, 2, 7]);
  });
});

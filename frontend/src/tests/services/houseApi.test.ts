import { describe, expect, it, vi } from "vitest";
import {
  clampBuyIn,
  deployTotal,
  fetchQuote,
  fetchTables,
  isTableClosed,
  looksTableClosed,
  netAfterRake,
  rakeLabel,
  rakeOf,
  stackAfterRake,
  TableClosedError,
} from "@/services/houseApi";

const json = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("house math", () => {
  it("clamps the buy-in to the table max, ignoring a missing max", () => {
    expect(clampBuyIn(20, 10)).toBe(10);
    expect(clampBuyIn(5, 10)).toBe(5);
    expect(clampBuyIn(20, 0)).toBe(20);
    expect(clampBuyIn(20, undefined)).toBe(20);
  });
  it("totals buy-in plus table fee", () => {
    expect(deployTotal(10, 0.2)).toBe(10.2);
    expect(deployTotal(10, undefined)).toBe(10);
  });
  it("reads rake defensively and nets it out", () => {
    expect(rakeOf({})).toBe(0);
    expect(rakeOf(null)).toBe(0);
    expect(rakeOf({ rake: -1 })).toBe(0);
    expect(rakeOf({ rake: 0.15 })).toBe(0.15);
    expect(netAfterRake({ net: 3, rake: 0.15 } as { net: number })).toBe(2.85);
    expect(netAfterRake({ net: -2 })).toBe(-2);
    expect(stackAfterRake({ stackAfter: 13, rake: 0.15 } as { stackAfter: number })).toBe(12.85);
    expect(rakeLabel(0.15)).toBe("Rake −0.1");
  });
});

describe("houseApi fetchers", () => {
  it("fetches tables and normalizes the house balance", async () => {
    const r = await fetchTables(json({ tables: [{ id: "a", open: false, reason: "low", maxBuyIn: 5 }], house: { balance: 9 } }));
    expect(r.tables[0]).toEqual({ id: "a", open: false, reason: "low", maxBuyIn: 5 });
    expect(r.house.balance).toBe(9);
  });
  it("fills missing quote fields with 0", async () => {
    const q = await fetchQuote("a", json({ fee: 0, currency: "NEAR", expiresAt: 1, buyIn: 10 }));
    expect(q.tableFee).toBe(0);
    expect(q.maxBuyIn).toBe(0);
  });
  it("turns a 503 table_closed into TableClosedError", async () => {
    await expect(fetchQuote("a", json({ error: "closed", code: "table_closed" }, 503))).rejects.toBeInstanceOf(
      TableClosedError,
    );
  });
  it("recognizes table_closed by code or message", () => {
    expect(isTableClosed({ code: "table_closed" })).toBe(true);
    expect(isTableClosed(new Error("x"))).toBe(false);
    expect(looksTableClosed("Table closed: house bankroll low")).toBe(true);
    expect(looksTableClosed("network down")).toBe(false);
  });
});

import { closedReason } from "@/components/lobby/TableCard";
describe("closedReason", () => {
  it("never shows raw server codes", () => {
    expect(closedReason("house_below_floor")).not.toContain("_");
    expect(closedReason("exposure_limit")).toContain("per hand");
    expect(closedReason()).toContain("bankroll");
  });
});

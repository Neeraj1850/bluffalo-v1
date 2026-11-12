import { describe, expect, it } from "vitest";
import { inRange } from "@/lib/history";

const now = new Date(2026, 10, 12, 15, 0).getTime();

describe("inRange", () => {
  it("shows everything under All, even hands without a timestamp", () => {
    expect(inRange(undefined, "all", now)).toBe(true);
    expect(inRange(1, "all", now)).toBe(true);
  });

  it("keeps untimed older records out of Today and 7 days", () => {
    expect(inRange(undefined, "today", now)).toBe(false);
    expect(inRange(undefined, "week", now)).toBe(false);
  });

  it("Today starts at local midnight", () => {
    expect(inRange(new Date(2026, 10, 12, 0, 5).getTime(), "today", now)).toBe(true);
    expect(inRange(new Date(2026, 10, 11, 23, 55).getTime(), "today", now)).toBe(false);
  });

  it("7 days covers the last week", () => {
    expect(inRange(now - 6 * 86_400_000, "week", now)).toBe(true);
    expect(inRange(now - 8 * 86_400_000, "week", now)).toBe(false);
  });
});

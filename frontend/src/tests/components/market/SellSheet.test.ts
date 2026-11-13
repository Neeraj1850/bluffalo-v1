import { describe, expect, it } from "vitest";
import { listError } from "@/components/market/SellSheet";

describe("listError", () => {
  it("accepts a price in range and 1..owned seats", () => {
    expect(listError(8.1, 1, 2)).toBeNull();
    expect(listError(8.1, 2, 2)).toBeNull();
  });
  it("refuses out-of-range prices and seat counts", () => {
    expect(listError(0, 1, 2)).toMatch(/Price/);
    expect(listError(NaN, 1, 2)).toMatch(/Price/);
    expect(listError(5, 3, 2)).toMatch(/1–2 seats/);
    expect(listError(5, 0, 2)).toMatch(/seats/);
    expect(listError(5, 1.5, 2)).toMatch(/seats/);
  });
});

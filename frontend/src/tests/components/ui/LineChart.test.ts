import { describe, expect, it } from "vitest";
import { linePath } from "@/components/ui/LineChart";

describe("linePath", () => {
  it("is empty for no points", () => {
    expect(linePath([], 100, 40)).toBe("");
  });
  it("draws one point as a flat mid line", () => {
    expect(linePath([5], 100, 40, 2)).toBe("M2,20L98,20");
  });
  it("keeps a flat series at mid height without NaN", () => {
    expect(linePath([3, 3, 3], 100, 40)).toBe("M0,20L50,20L100,20");
  });
  it("puts the max at the top and min at the bottom inside the padding", () => {
    expect(linePath([0, 10], 100, 40, 4)).toBe("M4,36L96,4");
  });
  it("skips non-finite values", () => {
    expect(linePath([1, NaN, 2], 10, 10)).not.toMatch(/NaN/);
  });
});

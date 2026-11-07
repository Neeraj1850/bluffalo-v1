import { describe, expect, it } from "vitest";
import { amount, near, percent, signed } from "./format";

describe("format", () => {
  it("signs every amount without relying on color", () => {
    expect(signed(6)).toBe("+6.0");
    expect(signed(-3)).toBe("−3.0");
    expect(signed(0)).toBe("±0.0");
    expect(signed(1.234, 2)).toBe("+1.23");
  });

  it("formats absolute amounts and NEAR", () => {
    expect(amount(-12.5)).toBe("12.5");
    expect(near(2)).toBe("2.0 NEAR");
  });

  it("guards percent against zero", () => {
    expect(percent(0, 0)).toBe("0%");
    expect(percent(1, 3)).toBe("33%");
  });
});

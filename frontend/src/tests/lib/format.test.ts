import { describe, expect, it } from "vitest";
import { ago, amount, near, percent, signed } from "@/lib/format";

describe("format", () => {
  it("signs every amount without relying on color", () => {
    expect(signed(6)).toBe("+6.0");
    expect(signed(-3)).toBe("−3.0");
    expect(signed(0)).toBe("±0.0");
    expect(signed(1.234, 2)).toBe("+1.23");
  });

  it("formats absolute amounts and GNEAR", () => {
    expect(amount(-12.5)).toBe("12.5");
    expect(near(2)).toBe("2.0 GNEAR");
  });

  it("guards percent against zero", () => {
    expect(percent(0, 0)).toBe("0%");
    expect(percent(1, 3)).toBe("33%");
  });
});

describe("ago", () => {
  const now = 10 * 86_400_000;
  it("reads like a person would say it", () => {
    expect(ago(0, now)).toBe("earlier");
    expect(ago(now - 20_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(ago(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });
});

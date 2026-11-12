import { describe, expect, it } from "vitest";
import { proofLine } from "@/components/market/ListingView";

describe("proofLine", () => {
  it("always says something", () => {
    expect(proofLine("checking")).toMatch(/Checking/);
    expect(proofLine("failed")).toMatch(/Couldn’t/);
    expect(proofLine({ verified: 0, total: 0, mismatches: [] })).toBe("No real hands to verify yet.");
    expect(proofLine({ verified: 5, total: 5, mismatches: [] })).toBe("Verified 5 of 5 hands on-chain.");
    expect(proofLine({ verified: 4, total: 5, mismatches: ["#a: not settled on-chain"] })).toMatch(/4 of 5.*#a: not settled/);
  });
});

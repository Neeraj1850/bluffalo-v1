import { describe, expect, it } from "vitest";
import { freshDeck, rng, shuffle } from "./deck";

const SEED = "00112233445566778899aabbccddeeff";
const key = (c: { rank: string; suit: string }) => c.rank + c.suit;

describe("deck", () => {
  it("has 52 unique cards", () => {
    expect(new Set(freshDeck().map(key)).size).toBe(52);
  });

  it("shuffles deterministically from the seed", () => {
    expect(shuffle(SEED)).toEqual(shuffle(SEED));
    expect(shuffle(SEED)).not.toEqual(shuffle("ffeeddccbbaa99887766554433221100"));
  });

  it("keeps all 52 cards after shuffling", () => {
    expect(new Set(shuffle(SEED).map(key)).size).toBe(52);
  });

  it("produces numbers in [0, 1)", () => {
    const next = rng(SEED);
    for (let i = 0; i < 1000; i++) {
      const n = next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("rejects malformed seeds", () => {
    expect(() => shuffle("abc")).toThrow();
    expect(() => shuffle(SEED.toUpperCase())).toThrow();
  });
});

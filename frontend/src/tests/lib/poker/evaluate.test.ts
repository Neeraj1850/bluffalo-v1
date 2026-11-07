import { describe, expect, it } from "vitest";
import { cards } from "@/lib/cards";
import { bestHand, compareHands } from "@/lib/poker/evaluate";

const best = (...codes: string[]) => bestHand(cards(...codes));

describe("bestHand", () => {
  it.each([
    [["Ah", "Kh", "Qh", "Jh", "10h", "2c", "3d"], "Royal flush"],
    [["9s", "8s", "7s", "6s", "5s", "Ac", "Ad"], "Straight flush, nine-high"],
    [["9s", "9h", "9d", "9c", "2s", "3c", "4d"], "Four nines"],
    [["9s", "9h", "9d", "4c", "4s", "Kc", "2d"], "Full house, nines over fours"],
    [["Qh", "9h", "6h", "4h", "2h", "Kc", "Kd"], "Flush, queen-high"],
    [["Ac", "2d", "3h", "4s", "5c", "Kd", "Qd"], "Straight, five-high"],
    [["8c", "8d", "8h", "Ks", "2c", "3d", "5h"], "Three eights"],
    [["Qs", "Qd", "9c", "4h", "2s", "Kd", "4c"], "Two pair, queens and fours"],
    [["As", "Ad", "9c", "4h", "2s", "Kd", "7c"], "Pair of aces"],
    [["Ks", "Jd", "9c", "4h", "2s", "7d", "3c"], "King-high"],
  ])("describes %j as %s", (hand, description) => {
    expect(best(...hand).description).toBe(description);
  });

  it("picks the best five and marks the kicker", () => {
    // The demo hero hand: QQ44 with a king kicker.
    const v = best("Qs", "Qd", "9c", "4h", "2s", "Kd", "4c");
    expect(v.cards.map((c) => c.rank)).toEqual(["Q", "Q", "4", "4", "K"]);
    expect(v.kickerIndex).toBe(4);
  });

  it("has no kicker when all five play", () => {
    expect(best("Qh", "9h", "6h", "4h", "2h", "Kc", "Kd").kickerIndex).toBe(-1);
  });

  it("ranks categories and kickers", () => {
    const qq44 = best("Qs", "Qd", "9c", "4h", "2s", "Kd", "4c");
    const nn44 = best("9h", "8s", "9c", "4h", "2s", "Kd", "4c");
    expect(compareHands(qq44, nn44)).toBeGreaterThan(0);

    const aceKicker = best("As", "Ks", "Kd", "7h", "2c");
    const queenKicker = best("Qs", "Kc", "Kh", "7d", "2s");
    expect(compareHands(aceKicker, queenKicker)).toBeGreaterThan(0);
  });

  it("treats the wheel as the lowest straight", () => {
    expect(compareHands(best("Ac", "2d", "3h", "4s", "5c"), best("2c", "3d", "4h", "5s", "6c"))).toBeLessThan(0);
  });

  it("returns 0 for a chopped board", () => {
    const board = ["Ah", "Kh", "Qd", "Jc", "10s"];
    expect(compareHands(best(...board, "2c", "3d"), best(...board, "4c", "5d"))).toBe(0);
  });

  it("rejects too few or too many cards", () => {
    expect(() => best("As", "Kd")).toThrow();
  });
});

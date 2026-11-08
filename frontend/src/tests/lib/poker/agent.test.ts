import { describe, expect, it } from "vitest";
import { cards } from "@/lib/cards";
import { getPreset } from "@/lib/data/strategy";
import { heuristic, holeLabel, seatView, strength } from "@/lib/poker/agent";
import { shuffle } from "@/lib/poker/deck";
import { apply, isOver, newHand, type HandState } from "@/lib/poker/game";

const DECK = cards("Qs", "9h", "Qd", "8s", "9c", "4h", "2s", "Kd", "4c");
const start = () => newHand({ deck: DECK, stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 0 });
const shark = getPreset("shark").params!;
const rock = getPreset("rock").params!;
const maniac = getPreset("maniac").params!;

describe("seatView", () => {
  it("shows a seat its own cards only, and the visible board", () => {
    const flop = [{ type: "call" as const }, { type: "check" as const }].reduce(apply, start());
    const house = seatView(flop, 1);
    expect(house.hole).toEqual(cards("9h", "8s"));
    expect(house.board).toEqual(cards("9c", "4h", "2s"));
    expect(house.pot).toBe(2);
    expect(JSON.stringify(house)).not.toContain('"Qs"');
  });

  it("describes history from the seat's point of view", () => {
    const s = apply(start(), { type: "raise", to: 3 });
    expect(seatView(s, 1).history).toEqual(["PRE-FLOP: opponent raise 2.5"]);
  });
});

describe("holeLabel / strength", () => {
  it("names starting hands plainly", () => {
    expect(holeLabel(cards("Qs", "Qd"))).toBe("Pair of queens");
    expect(holeLabel(cards("Kh", "Ah"))).toBe("Ace and king, suited");
  });

  it("ranks strong hands above weak ones", () => {
    expect(strength(cards("As", "Ad"), [])).toBeGreaterThan(strength(cards("7s", "2d"), []));
    expect(strength(cards("Qs", "Qd"), cards("9c", "4h", "2s", "Kd", "4c"))).toBeGreaterThan(
      strength(cards("Js", "3d"), cards("9c", "4h", "2s", "Kd", "6c")),
    );
  });
});

describe("heuristic", () => {
  const never = () => 1;

  it("raises a big pair", () => {
    expect(heuristic(seatView(start(), 0), shark, never).action.type).toBe("raise");
  });

  it("folds junk facing a big bet", () => {
    const deck = cards("7s", "Ah", "2d", "Ad", "9c", "4h", "Kc", "Kd", "4c");
    const s = apply(newHand({ deck, stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 1 }), {
      type: "raise",
      to: 20,
    });
    expect(heuristic(seatView(s, 0), rock, never).action.type).toBe("fold");
  });

  it("bluffs only when the dice say so and the sliders allow it", () => {
    const deck = cards("7s", "Ah", "2d", "Ad", "9c", "Jh", "Kc", "Kd", "4c");
    let s = newHand({ deck, stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 1 });
    s = apply(s, { type: "call" }); // house limps, agent (BB) can check
    expect(heuristic(seatView(s, 0), maniac, () => 0).action.type).toBe("raise");
    expect(heuristic(seatView(s, 0), { ...maniac, bluff: 0 }, () => 0).action.type).not.toBe("raise");
  });

  it("only ever returns legal moves", () => {
    for (let n = 0; n < 200; n++) {
      let s: HandState = newHand({
        deck: shuffle(n.toString(16).padStart(32, "0")),
        stacks: [30, 30],
        blinds: { small: 0.5, big: 1 },
        button: (n % 2) as 0 | 1,
      });
      let r = n;
      const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      while (!isOver(s)) {
        const params = [rock, shark, maniac][n % 3];
        const d = heuristic(seatView(s, s.toAct), params, rand);
        expect(() => (s = apply(s, d.action))).not.toThrow();
      }
    }
  });
});

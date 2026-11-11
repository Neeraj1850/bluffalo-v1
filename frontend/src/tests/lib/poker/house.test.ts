import { describe, expect, it } from "vitest";
import { cards } from "@/lib/cards";
import { rng } from "@/lib/poker/deck";
import { bestHand } from "@/lib/poker/evaluate";
import { newHand, apply } from "@/lib/poker/game";
import { seatView, type SeatView } from "@/lib/poker/agent";
import { absurd, baseline, equity, houseStats, preflopChart, score7 } from "@/lib/poker/house";
import { RANKS, SUITS } from "@/lib/poker/deck";

const seeded = () => rng("00".repeat(16));
const toInt = (c: { rank: string; suit: string }) => RANKS.indexOf(c.rank as never) * 4 + SUITS.indexOf(c.suit as never);

describe("score7", () => {
  it("agrees with bestHand ordering on random hands", () => {
    const r = seeded();
    const deck = cards(...RANKS.flatMap((rk) => SUITS.map((s) => rk + s)));
    for (let i = 0; i < 300; i++) {
      const d = [...deck].sort(() => r() - 0.5);
      const a = d.slice(0, 7), b = [...d.slice(0, 5), ...d.slice(7, 9)];
      const fast = Math.sign(score7(a.map(toInt)) - score7(b.map(toInt)));
      const ha = bestHand(a).score, hb = bestHand(b).score;
      let slow = 0;
      for (let k = 0; k < 6 && !slow; k++) slow = Math.sign((ha[k] ?? 0) - (hb[k] ?? 0));
      expect(fast).toBe(slow);
    }
  });
});

describe("equity", () => {
  it("is sane preflop", () => {
    expect(equity(cards("As", "Ah"), [], { rand: seeded(), iterations: 2000 })).toBeGreaterThan(0.8);
    expect(equity(cards("7d", "2c"), [], { rand: seeded(), iterations: 2000 })).toBeLessThan(0.4);
  });
  it("knows the nuts and near-dead hands", () => {
    expect(equity(cards("As", "Ks"), cards("Qs", "Js", "10s"), { rand: seeded() })).toBe(1);
    expect(equity(cards("2d", "3c"), cards("Ah", "Kd", "9s", "8c", "Jd"), { rand: seeded() })).toBeLessThan(0.3);
  });
  it("runs in about 20ms or less", () => {
    const t = Date.now();
    equity(cards("Jh", "10h"), cards("9h", "2c", "Kd"));
    expect(Date.now() - t).toBeLessThan(40);
  });
});

describe("preflopChart", () => {
  it("opens premiums and trash correctly on the button", () => {
    expect(preflopChart(cards("As", "Kd"), true, 0)).toBe("raise");
    expect(preflopChart(cards("7d", "2c"), true, 0)).toBe("fold");
  });
  it("defends the big blind wider than it 3-bets, and tightens vs re-raises", () => {
    expect(preflopChart(cards("Qh", "Jh"), false, 1)).toBe("call");
    expect(preflopChart(cards("Qs", "Qd"), false, 1)).toBe("raise");
    expect(preflopChart(cards("9h", "8h"), true, 2)).toBe("fold");
    expect(preflopChart(cards("As", "Ad"), true, 3)).toBe("raise");
  });
});

const view = (over: Partial<SeatView>): SeatView => ({
  street: "RIVER", hole: cards("As", "Ks"), board: cards("Qs", "Js", "10s", "2d", "3c"),
  pot: 20, stack: 40, opponentStack: 30, bet: 0, opponentBet: 10, inPosition: false, bigBlind: 1,
  legal: { canCheck: false, toCall: 10, canRaise: true, minRaiseTo: 20, maxRaiseTo: 40 }, history: [], ...over,
});

describe("baseline and clamping", () => {
  it("raises the nuts and flags folding it", () => {
    const v = view({});
    const s = houseStats(v, { rand: seeded() });
    expect(baseline(v, s).action.type).toBe("raise");
    expect(absurd({ action: { type: "fold" }, reason: "" }, v, s)).toMatch(/equity/);
  });
  it("folds air to a big bet and flags calling off below pot odds", () => {
    const v = view({ hole: cards("2h", "4h"), board: cards("Ac", "Kd", "9s", "7c", "8d"), pot: 60, opponentBet: 40,
      legal: { canCheck: false, toCall: 40, canRaise: true, minRaiseTo: 80, maxRaiseTo: 40 } });
    const s = houseStats(v, { rand: seeded() });
    expect(baseline(v, s).action.type).toBe("fold");
    expect(absurd({ action: { type: "call" }, reason: "" }, v, s)).toMatch(/pot-odds/);
  });
  it("opens 2.5x on the button", () => {
    const st = newHand({ deck: cards("Qs", "Ah", "Qd", "Ad", "9c", "4h", "2s", "Kd", "4c"), stacks: [100, 100], blinds: { small: 0.5, big: 1 }, button: 1 });
    const v = seatView(st, 1);
    expect(baseline(v, houseStats(v, { rand: seeded() })).action).toEqual({ type: "raise", to: 2.5 });
  });
});

describe("never reads hidden info", () => {
  it("decides identically whatever the opponent holds or the deck will deal", () => {
    const mk = (opp: string[], future: string[]) => {
      let st = newHand({ deck: cards(opp[0], "Ah", opp[1], "Kh", "9c", "4h", "2s", ...future), stacks: [50, 50], blinds: { small: 0.5, big: 1 }, button: 1 });
      st = apply(st, { type: "call" });
      st = apply(st, { type: "check" }); // flop dealt, house (seat 1, button) acts second → seat 0 first
      st = apply(st, { type: "check" });
      return st;
    };
    const a = mk(["Qs", "Qd"], ["Kd", "4c"]);
    const b = mk(["7c", "2d"], ["3d", "5s"]);
    const va = seatView(a, a.toAct), vb = seatView(b, b.toAct);
    expect(va).toEqual(vb);
    expect(baseline(va, houseStats(va, { rand: seeded() }), seeded())).toEqual(
      baseline(vb, houseStats(vb, { rand: seeded() }), seeded()),
    );
    expect(Object.keys(va)).not.toContain("deck");
  });
});

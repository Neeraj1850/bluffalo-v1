import { describe, expect, it } from "vitest";
import { cards } from "@/lib/cards";
import { shuffle } from "@/lib/poker/deck";
import { apply, isOver, legal, newHand, settle, type Action, type HandState } from "@/lib/poker/game";

// Deal order: agent, house, agent, house, then the five board cards.
// Agent Qs Qd · house 9h 8s · board 9c 4h 2s Kd 4c (the demo hero hand).
const DECK = cards("Qs", "9h", "Qd", "8s", "9c", "4h", "2s", "Kd", "4c");
const BLINDS = { small: 0.5, big: 1 };

const start = (stacks: [number, number] = [50, 50], button: 0 | 1 = 0) =>
  newHand({ deck: DECK, stacks, blinds: BLINDS, button });

const play = (s: HandState, ...actions: Action[]) => actions.reduce(apply, s);
const check: Action = { type: "check" };
const call: Action = { type: "call" };
const fold: Action = { type: "fold" };
const raise = (to: number): Action => ({ type: "raise", to });

describe("newHand", () => {
  it("deals hole cards alternately and posts blinds", () => {
    const s = start();
    expect(s.hole[0]).toEqual(cards("Qs", "Qd"));
    expect(s.hole[1]).toEqual(cards("9h", "8s"));
    expect(s.bets).toEqual([0.5, 1]);
    expect(s.stacks).toEqual([49.5, 49]);
    expect(s.toAct).toBe(0); // button = small blind acts first pre-flop
    expect(s.boardCount).toBe(0);
  });

  it("caps a blind at a short stack", () => {
    expect(start([50, 0.6]).bets).toEqual([0.5, 0.6]);
  });
});

describe("legal", () => {
  it("knows what the small blind owes", () => {
    expect(legal(start())).toEqual({ canCheck: false, toCall: 0.5, canRaise: true, minRaiseTo: 2, maxRaiseTo: 50 });
  });

  it("gives the big blind its option after a limp", () => {
    const s = play(start(), call);
    expect(s.street).toBe("PRE-FLOP");
    expect(s.toAct).toBe(1);
    expect(legal(s).canCheck).toBe(true);
  });

  it("sets the min re-raise from the last raise size", () => {
    const s = play(start(), raise(3)); // raise of 2 over the big blind
    expect(legal(s).minRaiseTo).toBe(5);
  });
});

describe("apply", () => {
  it("moves through every street to showdown", () => {
    const s = play(start(), call, check, check, check, check, check, check, check);
    expect(isOver(s)).toBe(true);
    expect(s.boardCount).toBe(5);
  });

  it("lets the non-button act first after the flop", () => {
    const s = play(start(), call, check);
    expect(s.street).toBe("FLOP");
    expect(s.boardCount).toBe(3);
    expect(s.toAct).toBe(1);
  });

  it("reopens action after a raise", () => {
    const s = play(start(), call, check, check, raise(2));
    expect(s.street).toBe("FLOP");
    expect(s.toAct).toBe(1);
  });

  it("ends on a fold", () => {
    const s = play(start(), raise(3), fold);
    expect(isOver(s)).toBe(true);
    expect(s.folded).toBe(1);
  });

  it("runs the board out when someone is all-in", () => {
    const s = play(start(), raise(50), call);
    expect(isOver(s)).toBe(true);
    expect(s.boardCount).toBe(5);
  });

  it("logs each action with the pot after it", () => {
    const s = play(start(), raise(3), call);
    expect(s.log.map((e) => [e.seat, e.action, e.amount, e.total, e.pot])).toEqual([
      [0, "raise", 2.5, 3, 4],
      [1, "call", 2, 3, 6],
    ]);
  });

  it("does not mutate the previous state", () => {
    const s = start();
    apply(s, call);
    expect(s.bets).toEqual([0.5, 1]);
  });

  it.each([
    ["check facing a bet", start(), check],
    ["call with nothing owed", play(start(), call), call],
    ["raise below the minimum", start(), raise(1.5)],
    ["raise above the stack", start(), raise(51)],
  ])("rejects %s", (_, s, a) => {
    expect(() => apply(s, a)).toThrow();
  });

  it("rejects actions after the hand is over", () => {
    expect(() => apply(play(start(), fold), check)).toThrow();
  });
});

describe("settle", () => {
  it("pays the better hand at showdown", () => {
    const s = play(start(), call, check, raise(2), call, check, check, raise(4), call);
    const r = settle(s);
    expect(r.winner).toBe(0);
    expect(r.pot).toBe(14);
    expect(r.payouts).toEqual([14, 0]);
    expect(r.hands?.[0].description).toBe("Two pair, queens and fours");
  });

  it("gives everything to the player who didn't fold", () => {
    const r = settle(play(start(), raise(3), fold));
    expect(r).toMatchObject({ winner: 0, payouts: [4, 0], pot: 4, hands: null });
  });

  it("returns uncalled chips to the bigger stack", () => {
    // House has only 10; agent shoves 50.
    const r = settle(play(start([50, 10]), raise(50), call));
    expect(r.pot).toBe(60);
    expect(r.payouts).toEqual([60, 0]); // agent wins 20 contested + 40 back
  });

  it("splits a chopped pot", () => {
    const board = cards("2c", "2d", "3c", "3d", "Ah", "Kh", "Qd", "Jc", "10s");
    const s = newHand({ deck: board, stacks: [50, 50], blinds: BLINDS, button: 0 });
    const r = settle(play(s, call, check, check, check, check, check, check, check));
    expect(r.winner).toBe("split");
    expect(r.payouts).toEqual([1, 1]);
  });

  it("conserves chips across random hands", () => {
    for (let n = 0; n < 50; n++) {
      const seed = n.toString(16).padStart(32, "0");
      let s = newHand({ deck: shuffle(seed), stacks: [20, 20], blinds: BLINDS, button: (n % 2) as 0 | 1 });
      while (!isOver(s)) {
        const l = legal(s);
        const a: Action = l.canRaise && n % 3 === 0 ? raise(l.minRaiseTo) : l.canCheck ? check : call;
        s = apply(s, a);
      }
      const r = settle(s);
      expect(r.payouts[0] + r.payouts[1]).toBeCloseTo(r.pot);
      expect(s.stacks[0] + s.stacks[1] + r.pot).toBeCloseTo(40);
    }
  });

  it("refuses to settle a hand in play", () => {
    expect(() => settle(start())).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import type { StrategyParams } from "@/lib/data/strategy";
import type { LiveHand } from "@/lib/poker/record";
import { EARLIER_RUN, handsOfRun, newRunId, runHref, runsOf, winRate } from "@/lib/poker/runs";

const shark: StrategyParams = { aggression: 65, bluff: 30, position: 85, sizing: 60 };
const hand = (run: string | undefined, net: number, at: number, extra: Partial<LiveHand> = {}) =>
  ({ id: `#${at}`, run, net, at, table: "the kitchen", mode: "practice", agent: { preset: "shark", params: shark }, ...extra }) as LiveHand;

describe("runsOf", () => {
  it("groups hands into sessions with their record and strategy", () => {
    const [r] = runsOf([hand("a1", 2, 10), hand("a1", -1, 20), hand("a1", 0, 30)]);
    expect(r).toMatchObject({ id: "a1", mode: "practice", hands: 3, won: 1, lost: 1, net: 1, startedAt: 10, endedAt: 30 });
    expect(r.agent).toEqual({ preset: "shark", params: shark });
    expect(winRate(r)).toBeCloseTo(1 / 3);
  });

  it("lists the newest session first", () => {
    expect(runsOf([hand("old", 1, 5), hand("new", 1, 50)]).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("counts net after rake for real hands", () => {
    const [r] = runsOf([hand("live", 4, 1, { mode: "real", rake: 0.3 })]);
    expect(r).toMatchObject({ mode: "real", net: 3.7, won: 1 });
  });

  it("puts hands from before sessions existed into one earlier session", () => {
    expect(runsOf([hand(undefined, 1, 1), hand(undefined, -2, 2)])).toMatchObject([{ id: EARLIER_RUN, hands: 2, net: -1 }]);
  });
});

describe("handsOfRun", () => {
  it("returns one session's hands in the order they were played", () => {
    const hands = [hand("a", 1, 30), hand("b", 1, 20), hand("a", 1, 10)];
    expect(handsOfRun(hands, "a").map((h) => h.at)).toEqual([10, 30]);
  });
});

it("makes short hex session ids", () => {
  expect(newRunId()).toMatch(/^[0-9a-f]{12}$/);
});

it("links practice and live sessions under their own tabs", () => {
  expect(runHref("practice", "ab12")).toBe("/practice/ab12");
  expect(runHref("real", "ab12")).toBe("/live/ab12");
});

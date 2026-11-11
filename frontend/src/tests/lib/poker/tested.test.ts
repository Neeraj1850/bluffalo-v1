import { describe, expect, it } from "vitest";
import type { StrategyParams } from "@/lib/data/strategy";
import type { LiveHand } from "@/lib/poker/record";
import { agentKey, testedAgents, winRate } from "@/lib/poker/tested";

const shark: StrategyParams = { aggression: 65, bluff: 30, position: 85, sizing: 60 };
const rock: StrategyParams = { aggression: 25, bluff: 5, position: 50, sizing: 40 };
const hand = (net: number, at: number, params = shark, extra: Partial<LiveHand> = {}) =>
  ({ id: `#${at}`, net, at, mode: "practice", agent: { preset: "shark", params }, ...extra }) as LiveHand;

describe("testedAgents", () => {
  it("groups practice hands by exact strategy and sums the record", () => {
    const [a] = testedAgents([hand(2, 3), hand(-1, 2), hand(0, 1)]);
    expect(a).toMatchObject({ key: agentKey(shark), preset: "shark", hands: 3, won: 1, lost: 1, net: 1, lastAt: 3 });
    expect(winRate(a)).toBeCloseTo(1 / 3);
  });

  it("lists the most recently tested strategy first", () => {
    const list = testedAgents([hand(1, 5, rock, { agent: { preset: "rock", params: rock } }), hand(1, 9)]);
    expect(list.map((a) => a.preset)).toEqual(["shark", "rock"]);
  });

  it("ignores real-money hands and untagged old records", () => {
    expect(testedAgents([hand(1, 1, shark, { mode: "real" }), { id: "#x", net: 5 } as LiveHand])).toEqual([]);
  });

  it("keeps float sums tidy", () => {
    expect(testedAgents([hand(0.1, 1), hand(0.2, 2)])[0].net).toBe(0.3);
  });

  it("calls an untested agent 0% rather than dividing by zero", () => {
    expect(winRate({ hands: 0, won: 0 })).toBe(0);
  });
});

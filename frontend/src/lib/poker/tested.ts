import { PARAMS, type PresetKey, type StrategyParams } from "@/lib/data/strategy";
import type { LiveHand } from "./record";

/** One strategy as tested in practice: who it was and how it did. */
export type TestedAgent = {
  /** Stable id of the exact settings (preset + slider values). */
  key: string;
  preset: PresetKey;
  params: StrategyParams;
  hands: number;
  won: number;
  lost: number;
  /** Chips won minus lost over all its practice hands. */
  net: number;
  /** Most recent practice hand (ms since epoch). */
  lastAt: number;
};

export const agentKey = (params: StrategyParams) => PARAMS.map(({ key }) => params[key]).join("-");

/**
 * Practice hands grouped by the exact strategy that played them, most recently
 * tested first. Hands recorded before strategies were tagged are skipped.
 */
export function testedAgents(hands: LiveHand[]): TestedAgent[] {
  const byKey = new Map<string, TestedAgent>();
  for (const h of hands) {
    if (h.mode !== "practice" || !h.agent) continue;
    const key = agentKey(h.agent.params);
    const a = byKey.get(key) ?? {
      key,
      preset: h.agent.preset ?? "custom",
      params: h.agent.params,
      hands: 0,
      won: 0,
      lost: 0,
      net: 0,
      lastAt: 0,
    };
    a.hands += 1;
    if (h.net > 0) a.won += 1;
    if (h.net < 0) a.lost += 1;
    a.net = Math.round((a.net + h.net) * 100) / 100;
    if ((h.at ?? 0) >= a.lastAt) {
      a.lastAt = h.at ?? 0;
      if (h.agent.preset) a.preset = h.agent.preset; // name it by its latest label
    }
    byKey.set(key, a);
  }
  return [...byKey.values()].sort((x, y) => y.lastAt - x.lastAt);
}

/** Share of hands won, 0–1 (0 when untested). */
export const winRate = (a: Pick<TestedAgent, "hands" | "won">) => (a.hands ? a.won / a.hands : 0);

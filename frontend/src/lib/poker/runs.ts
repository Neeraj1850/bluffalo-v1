import type { PresetKey, StrategyParams } from "@/lib/data/strategy";
import { handMode, type HandMode, type LiveHand } from "./record";

/** One play session: a practice run, or one sitting at a live table. */
export type Run = {
  id: string;
  mode: HandMode;
  /** Table name, e.g. "the kitchen". */
  table: string;
  /** The strategy that played it (from its latest hand). */
  agent: { preset: PresetKey; params: StrategyParams } | null;
  startedAt: number;
  endedAt: number;
  hands: number;
  won: number;
  lost: number;
  /** After rake, so it matches what actually moved. */
  net: number;
};

/** Hands recorded before sessions existed are grouped into one of these. */
export const EARLIER_RUN = "earlier";

const rake = (h: LiveHand) => (typeof h.rake === "number" && h.rake > 0 ? h.rake : 0);
const round = (n: number) => Math.round(n * 100) / 100;
export const runIdOf = (h: LiveHand) => h.run ?? EARLIER_RUN;

/** Group hands (any order) into sessions, newest session first. */
export function runsOf(hands: LiveHand[]): Run[] {
  const byId = new Map<string, Run>();
  for (const h of hands) {
    const id = runIdOf(h);
    const net = h.net - rake(h);
    const at = h.at ?? 0;
    const r = byId.get(id) ?? {
      id,
      mode: handMode(h),
      table: h.table,
      agent: null,
      startedAt: at,
      endedAt: at,
      hands: 0,
      won: 0,
      lost: 0,
      net: 0,
    };
    r.hands += 1;
    if (net > 0) r.won += 1;
    if (net < 0) r.lost += 1;
    r.net = round(r.net + net);
    r.startedAt = Math.min(r.startedAt || at, at || r.startedAt);
    if (at >= r.endedAt) {
      r.endedAt = at;
      if (h.agent) r.agent = { preset: h.agent.preset ?? "custom", params: h.agent.params };
    }
    byId.set(id, r);
  }
  return [...byId.values()].sort((a, b) => b.endedAt - a.endedAt);
}

/** One session's hands, oldest first — the order they were played. */
export function handsOfRun(hands: LiveHand[], id: string): LiveHand[] {
  return hands.filter((h) => runIdOf(h) === id).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

export const winRate = (r: Pick<Run, "hands" | "won">) => (r.hands ? r.won / r.hands : 0);

/** A fresh session id for a practice run or a live sitting. */
export const newRunId = () =>
  [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Where a session's page lives: practice and live sessions sit under their own tab. */
export const runHref = (mode: HandMode, id: string) => `/${mode === "practice" ? "practice" : "live"}/${id}`;

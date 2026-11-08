import type { StrategyParams } from "@/lib/data/strategy";
import { buildPrompt, heuristic, parseDecision, seatView, type Decision } from "@/lib/poker/agent";
import type { HandState, Seat } from "@/lib/poker/game";
import { chatJson, hasGroqKey, MODELS } from "./groq";

/** What the house plays like when it falls back to the heuristic. */
export const HOUSE_PARAMS: StrategyParams = { aggression: 55, bluff: 25, position: 70, sizing: 55 };

export type SourcedDecision = Decision & { source: "groq" | "heuristic" };

/**
 * One decision for the seat to act. Groq first; any failure — no key, rate
 * limit, bad JSON, illegal move — falls back to the heuristic so play never stalls.
 * `offline` skips the model on purpose (the practice bot).
 * `params` null means the house.
 */
export async function decide(
  state: HandState,
  params: StrategyParams | null,
  opts: { fetch?: typeof fetch; rand?: () => number; offline?: boolean } = {},
): Promise<SourcedDecision> {
  const seat: Seat = state.toAct;
  const view = seatView(state, seat);
  const fallback = () => ({ ...heuristic(view, params ?? HOUSE_PARAMS, opts.rand), source: "heuristic" as const });

  if (opts.offline || !hasGroqKey()) return fallback();
  try {
    const raw = await chatJson({
      model: params ? MODELS.agent : MODELS.house,
      messages: buildPrompt(view, params),
      fetch: opts.fetch,
    });
    const d = parseDecision(raw, view.legal);
    return d ? { ...d, source: "groq" } : fallback();
  } catch {
    return fallback();
  }
}

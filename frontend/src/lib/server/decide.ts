import type { StrategyParams } from "@/lib/data/strategy";
import { buildPrompt, heuristic, parseDecision, seatView, type Decision } from "@/lib/poker/agent";
import type { HandState, Seat } from "@/lib/poker/game";
import { chatJson, hasNearAiKey, MODELS, NearAiError } from "./nearai";

/** What the house plays like when it uses the heuristic (practice bot, garbled reply). */
export const HOUSE_PARAMS: StrategyParams = { aggression: 55, bluff: 25, position: 70, sizing: 55 };

export type SourcedDecision = Decision & { source: "nearai" | "heuristic" };

export const SERVICE_DOWN_MESSAGE = "The agent service is down right now. Try again in a minute.";

/** NEAR AI can't be used (rate limit, outage, network, no key). The hand stops; nothing is faked. */
export class ServiceDownError extends Error {
  constructor(cause?: unknown) {
    super(SERVICE_DOWN_MESSAGE, { cause });
    this.name = "ServiceDownError";
  }
}

/** NEAR AI answered, but with something unusable — the service itself is fine. */
const garbled = (e: unknown) => e instanceof NearAiError && e.status === 422;

/**
 * One decision for the seat to act, from NEAR AI. If NEAR AI is unavailable this
 * throws ServiceDownError rather than quietly playing a different strategy.
 * The heuristic is used only for the practice bot (`offline`, by design) and
 * when the model's reply is malformed or illegal.
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

  if (opts.offline) return fallback();
  if (!hasNearAiKey()) throw new ServiceDownError();
  let raw: unknown;
  try {
    raw = await chatJson({
      model: params ? MODELS.agent : MODELS.house,
      messages: buildPrompt(view, params),
      fetch: opts.fetch,
    });
  } catch (e) {
    if (garbled(e)) return fallback();
    throw new ServiceDownError(e);
  }
  const d = parseDecision(raw, view.legal);
  return d ? { ...d, source: "nearai" } : fallback();
}

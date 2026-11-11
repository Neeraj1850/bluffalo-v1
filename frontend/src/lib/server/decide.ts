import type { StrategyParams } from "@/lib/data/strategy";
import { buildPrompt, heuristic, parseDecision, seatView, type Decision } from "@/lib/poker/agent";
import type { HandState, Seat } from "@/lib/poker/game";
import { absurd, baseline, houseStats, statsLines } from "@/lib/poker/house";
import type { SeatView } from "@/lib/poker/agent";
import { chatJson, chatJsonId, hasNearAiKey, MODELS, NearAiError } from "./nearai";

/** What the house plays like when it uses the heuristic (practice bot, garbled reply). */
export const HOUSE_PARAMS: StrategyParams = { aggression: 55, bluff: 25, position: 70, sizing: 55 };

export type SourcedDecision = Decision & {
  source: "nearai" | "heuristic" | "baseline";
  /** The NEAR AI completion id, when the move came from the model (for TEE verification). */
  chatId?: string;
};

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
 * `params` null means the house, which goes through decideHouse (see below).
 */
export async function decide(
  state: HandState,
  params: StrategyParams | null,
  opts: { fetch?: typeof fetch; rand?: () => number; offline?: boolean } = {},
): Promise<SourcedDecision> {
  const seat: Seat = state.toAct;
  // Only the acting seat's public view leaves this point: no opponent cards, deck or future board.
  const view = seatView(state, seat);
  if (!params && !opts.offline) return decideHouse(view, opts);
  const fallback = () => ({ ...heuristic(view, params ?? HOUSE_PARAMS, opts.rand), source: "heuristic" as const });

  if (opts.offline) return fallback();
  if (!hasNearAiKey()) throw new ServiceDownError();
  let raw: unknown;
  let chatId = "";
  try {
    ({ value: raw, id: chatId } = await chatJsonId({
      model: params ? MODELS.agent : MODELS.house,
      messages: buildPrompt(view, params),
      fetch: opts.fetch,
    }));
  } catch (e) {
    if (garbled(e)) return fallback();
    throw new ServiceDownError(e);
  }
  const d = parseDecision(raw, view.legal);
  return d ? { ...d, source: "nearai", ...(chatId ? { chatId } : {}) } : fallback();
}

/**
 * The house (a real-money table). Works from the SeatView only — never the
 * player's cards, the deck, future board cards or the player's strategy params.
 * The model gets computed public stats (equity vs a random hand, pot odds, SPR,
 * position) and its move is clamped to the TAG baseline when absurd.
 * Unlike the player's agent, if NEAR AI is down (no key, outage, garbled reply)
 * the house plays the deterministic baseline instead of throwing
 * ServiceDownError: the house is ours, so a fallback misrepresents no one.
 */
export async function decideHouse(
  view: SeatView,
  opts: { fetch?: typeof fetch; rand?: () => number } = {},
): Promise<SourcedDecision> {
  const stats = houseStats(view, { rand: opts.rand });
  const base = () => ({ ...baseline(view, stats, opts.rand), source: "baseline" as const });
  if (!hasNearAiKey()) return base();
  let raw: unknown;
  try {
    const [system, user] = buildPrompt(view, null);
    raw = await chatJson({
      model: MODELS.house,
      messages: [
        {
          ...system,
          content: `${system.content}\nPlay tight-aggressive and use the computed stats. Output exactly one JSON object; "amount" is required for raise (your total bet this street) and 0 otherwise.`,
        },
        { ...user, content: `${user.content}\n${statsLines(stats)}` },
      ],
      fetch: opts.fetch,
    });
  } catch {
    return base();
  }
  const d = parseDecision(raw, view.legal);
  if (!d || absurd(d, view, stats)) return base();
  return { ...d, source: "nearai" };
}

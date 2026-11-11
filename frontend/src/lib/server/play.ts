import { PARAMS, type StrategyParams } from "@/lib/data/strategy";
import { TABLES } from "@/lib/data/tables";
import { shuffle } from "@/lib/poker/deck";
import { mixSeed } from "@/lib/poker/fairness";
import { apply, isOver, newHand, type Seat } from "@/lib/poker/game";
import { toRecord, type LiveHand } from "@/lib/poker/record";
import { decide } from "./decide";

export type PlayRequest = {
  handId: string;
  tableId: string;
  params: StrategyParams;
  /** The agent's stack going into the hand; the house sits with the same. */
  stack: number;
  button: Seat;
  /** The player's contribution to the shuffle, sent after the server committed. */
  playerSeed: string;
};

const MAX_STACK = 10_000;

/** Validate untrusted input. Returns the request, or an error message. */
export function parsePlayRequest(body: unknown): PlayRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;
  if (typeof b.handId !== "string" || !/^[0-9a-f]{8}$/.test(b.handId)) return "Invalid handId";
  if (typeof b.tableId !== "string" || !TABLES.some((t) => t.id === b.tableId)) return "Unknown table";
  if (b.button !== 0 && b.button !== 1) return "button must be 0 or 1";
  if (typeof b.playerSeed !== "string" || !/^[0-9a-f]{32}$/.test(b.playerSeed)) return "Invalid playerSeed";
  if (typeof b.stack !== "number" || !(b.stack > 0 && b.stack <= MAX_STACK)) return "Invalid stack";
  const p = b.params as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return "Missing params";
  const params = {} as StrategyParams;
  for (const { key } of PARAMS) {
    const v = p[key];
    if (typeof v !== "number" || !(v >= 0 && v <= 100)) return `Invalid ${key}`;
    params[key] = v;
  }
  return { handId: b.handId, tableId: b.tableId, params, stack: b.stack, button: b.button, playerSeed: b.playerSeed };
}

/** Play a committed hand to the end. The house is the practice bot (no model) on practice tables. */
export async function playHand(
  req: PlayRequest,
  deal: { seed: string; commitment: string },
  opts: { fetch?: typeof fetch; rand?: () => number } = {},
): Promise<LiveHand> {
  const table = TABLES.find((t) => t.id === req.tableId)!;
  const practice = table.mode === "practice";
  let s = newHand({
    deck: shuffle(await mixSeed(deal.seed, req.playerSeed)),
    stacks: [req.stack, req.stack],
    blinds: table.blinds,
    button: req.button,
  });

  const reasons: string[] = [];
  const chatIds: (string | undefined)[] = [];
  // A heads-up hand can't take more than a few dozen actions; this guards a bad loop.
  for (let n = 0; !isOver(s) && n < 200; n++) {
    const agent = s.toAct === 0;
    const d = await decide(s, agent ? req.params : null, { ...opts, offline: !agent && practice });
    if (agent) {
      reasons.push(d.reason);
      chatIds.push(d.chatId);
    }
    s = apply(s, d.action);
  }

  return toRecord(s, {
    id: req.handId,
    table: table.name,
    reasons,
    chatIds,
    opponent: practice ? "practice bot" : "house agent",
    proof: { seed: deal.seed, commitment: deal.commitment, playerSeed: req.playerSeed, hole: s.hole, board: s.board },
  });
}

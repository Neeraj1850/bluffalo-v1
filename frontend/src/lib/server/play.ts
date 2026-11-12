import { PARAMS, PRESETS, type PresetKey, type StrategyParams } from "@/lib/data/strategy";
import { TABLES } from "@/lib/data/tables";
import { shuffle } from "@/lib/poker/deck";
import { mixSeed } from "@/lib/poker/fairness";
import { apply, isOver, newHand, type Seat } from "@/lib/poker/game";
import { toRecord, type HousePrompt, type LiveHand } from "@/lib/poker/record";
import { decide } from "./decide";

export type PlayRequest = {
  handId: string;
  tableId: string;
  params: StrategyParams;
  /** Which preset the params came from (labels sessions; not used to play). */
  preset?: PresetKey;
  /** A licensed market strategy: params come from the server, the record names only the token. */
  strategy?: string;
  /** The play session this hand belongs to (chosen by the client per run/sitting). */
  runId?: string;
  /** The agent's stack going into the hand; the house sits with the same. */
  stack: number;
  button: Seat;
  /** The player's contribution to the shuffle. Practice: sent with the hand. */
  playerSeed?: string;
  /** Real money: sha256(playerSeed) only; the seed follows once the hand is committed on-chain. */
  playerCommitment?: string;
};

const MAX_STACK = 10_000;

/** Validate untrusted strategy params (each 0–100). Returns them in PARAMS order, or an error message. */
export function parseParams(p: unknown): StrategyParams | string {
  if (!p || typeof p !== "object") return "Missing params";
  const params = {} as StrategyParams;
  for (const { key } of PARAMS) {
    const v = (p as Record<string, unknown>)[key];
    if (typeof v !== "number" || !(v >= 0 && v <= 100)) return `Invalid ${key}`;
    params[key] = v;
  }
  return params;
}

/** Validate untrusted input. Returns the request, or an error message. */
export function parsePlayRequest(body: unknown): PlayRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;
  if (typeof b.handId !== "string" || !/^[0-9a-f]{8}$/.test(b.handId)) return "Invalid handId";
  if (typeof b.tableId !== "string" || !TABLES.some((t) => t.id === b.tableId)) return "Unknown table";
  if (b.button !== 0 && b.button !== 1) return "button must be 0 or 1";
  if (b.playerSeed !== undefined && (typeof b.playerSeed !== "string" || !/^[0-9a-f]{32}$/.test(b.playerSeed))) return "Invalid playerSeed";
  if (b.playerCommitment !== undefined && (typeof b.playerCommitment !== "string" || !/^[0-9a-f]{64}$/.test(b.playerCommitment))) {
    return "Invalid playerCommitment";
  }
  if ((b.playerSeed === undefined) === (b.playerCommitment === undefined)) return "Send playerSeed or playerCommitment";
  if (typeof b.stack !== "number" || !(b.stack > 0 && b.stack <= MAX_STACK)) return "Invalid stack";
  const params = parseParams(b.params);
  if (typeof params === "string") return params;
  const preset = PRESETS.find((x) => x.key === b.preset)?.key;
  if (b.runId !== undefined && (typeof b.runId !== "string" || !/^[0-9a-f]{8,32}$/.test(b.runId))) return "Invalid runId";
  return {
    handId: b.handId,
    tableId: b.tableId,
    params,
    ...(preset ? { preset } : {}),
    ...(b.runId ? { runId: b.runId as string } : {}),
    stack: b.stack,
    button: b.button,
    ...(b.playerSeed ? { playerSeed: b.playerSeed as string } : { playerCommitment: b.playerCommitment as string }),
  };
}

/** Play a committed hand to the end. The house is the practice bot (no model) on practice tables. */
export async function playHand(
  req: PlayRequest & { playerSeed: string },
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
  const requestHashes: (string | undefined)[] = [];
  const housePrompts: HousePrompt[] = [];
  // A heads-up hand can't take more than a few dozen actions; this guards a bad loop.
  for (let n = 0; !isOver(s) && n < 200; n++) {
    const agent = s.toAct === 0;
    const d = await decide(s, agent ? req.params : null, { ...opts, offline: !agent && practice });
    if (agent) {
      // A sealed strategy's numbers must not leak through the agent's own words.
      reasons.push(req.strategy ? d.reason.replace(/\d+\s*\/\s*100/g, "—") : d.reason);
      chatIds.push(d.chatId);
      requestHashes.push(d.requestHash);
    } else if (d.request && d.requestHash) {
      housePrompts.push({ street: s.street, prompt: d.request, requestHash: d.requestHash, ...(d.chatId ? { chatId: d.chatId } : {}) });
    }
    s = apply(s, d.action);
  }

  const record = toRecord(s, {
    id: req.handId,
    table: table.name,
    reasons,
    chatIds,
    requestHashes,
    housePrompts,
    opponent: practice ? "practice bot" : "house agent",
    proof: { seed: deal.seed, commitment: deal.commitment, playerSeed: req.playerSeed, hole: s.hole, board: s.board },
  });
  return {
    ...record,
    mode: practice ? "practice" : "real",
    tableId: table.id,
    agent: req.strategy ? { strategy: req.strategy } : { ...(req.preset ? { preset: req.preset } : {}), params: req.params },
    at: Date.now(),
    ...(req.runId ? { run: req.runId } : {}),
  };
}

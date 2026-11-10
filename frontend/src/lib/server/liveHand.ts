import { apply, isOver, legal, newHand, type Action, type HandState, type Seat } from "@/lib/poker/game";
import { seatView, type SeatView } from "@/lib/poker/agent";
import { toRecord, type LiveHand } from "@/lib/poker/record";

/**
 * A hand played turn by turn across requests. Seat 0 is the external agent
 * (it acts through MCP, one `act` call at a time); seat 1 is the house, which
 * answers synchronously — so after each external action we run the house until
 * it's seat 0's turn again, or the hand is over. The pure engine (game.ts) does
 * the poker; this only persists state between turns and settles at the end.
 */

/** A hand in progress, as persisted between the external agent's turns. */
export type LiveHandRecord = {
  handId: string; // 8 hex, also the on-chain hand id
  sessionId: string;
  tableName: string;
  state: HandState;
  /** The external agent's reasons, one per action it took, in order. */
  reasons: string[];
  deal: { seed: string; commitment: string; playerSeed: string };
  status: "active" | "settled" | "cancelled";
  updatedAt: number;
};

export interface LiveHandStore {
  get(handId: string): Promise<LiveHandRecord | null>;
  put(rec: LiveHandRecord): Promise<void>;
  /** Active hands waiting on the external agent since before `cutoff` (for the timeout sweep). */
  stale(cutoff: number): Promise<LiveHandRecord[]>;
}

/**
 * `onSettle` must settle on-chain first; throw only if the chain settlement
 * failed (a later off-chain record failure should be swallowed by the impl, not
 * thrown), because a throw makes the machine refund the stakes via `onCancel`.
 */
export type Deps = {
  store: LiveHandStore;
  /** The house's move for seat 1 (Groq today, a NEAR AI Cloud TEE later). */
  house: (state: HandState) => Promise<Action>;
  onSettle?: (rec: LiveHandRecord, hand: LiveHand) => Promise<void>;
  onCancel?: (rec: LiveHandRecord) => Promise<void>;
  now?: () => number;
};

export class UnknownHandError extends Error {
  constructor() {
    super("Unknown or finished hand");
    this.name = "UnknownHandError";
  }
}
export class NotYourTurnError extends Error {
  constructor() {
    super("It isn't your turn");
    this.name = "NotYourTurnError";
  }
}
export class IllegalMoveError extends Error {
  constructor(why: string) {
    super(why);
    this.name = "IllegalMoveError";
  }
}

/** What the external agent sees after a turn: its next decision, or the finished hand. */
export type TurnResult =
  | { done: false; view: SeatView }
  | { done: true; hand: LiveHand; settled: boolean };

const HOUSE: Seat = 1;
const AGENT: Seat = 0;

/** Run the house until it's the external agent's turn again or the hand ends. */
async function runHouse(state: HandState, house: Deps["house"]): Promise<HandState> {
  let s = state;
  // A heads-up hand can't take many dozen actions; this caps a runaway loop.
  for (let n = 0; !isOver(s) && s.toAct === HOUSE && n < 200; n++) {
    s = apply(s, await house(s));
  }
  return s;
}

/** Persist the new state, settling (or, if that fails, refunding) when the hand is over. */
async function finish(deps: Deps, rec: LiveHandRecord, state: HandState, reasons: string[]): Promise<TurnResult> {
  const now = deps.now ?? Date.now;
  rec.state = state;
  rec.reasons = reasons;
  rec.updatedAt = now();

  if (!isOver(state)) {
    await deps.store.put(rec);
    return { done: false, view: seatView(state, AGENT) };
  }

  const hand = toRecord(state, {
    id: rec.handId,
    table: rec.tableName,
    reasons,
    opponent: "house agent",
    proof: {
      seed: rec.deal.seed,
      commitment: rec.deal.commitment,
      playerSeed: rec.deal.playerSeed,
      hole: state.hole,
      board: state.board,
    },
  });

  // Fund safety: a played hand either settles on-chain, or — if settling can't
  // run — is refunded. It is never left committed-but-open with funds locked.
  let settled = true;
  try {
    await deps.onSettle?.(rec, hand);
  } catch {
    settled = false;
    await deps.onCancel?.(rec);
  }
  rec.status = settled ? "settled" : "cancelled";
  await deps.store.put(rec);
  return { done: true, hand, settled };
}

/**
 * Deal a committed hand and persist it. The caller has already committed it
 * on-chain (stakes locked, seed hash recorded). Returns the external agent's
 * first decision, or the result if the hand ends before it has to act.
 */
export async function startHand(
  deps: Deps,
  input: {
    handId: string;
    sessionId: string;
    tableName: string;
    deck: Parameters<typeof newHand>[0]["deck"];
    stacks: [number, number];
    blinds: { small: number; big: number };
    button: Seat;
    deal: LiveHandRecord["deal"];
  },
): Promise<TurnResult> {
  const now = deps.now ?? Date.now;
  const state = await runHouse(
    newHand({ deck: input.deck, stacks: input.stacks, blinds: input.blinds, button: input.button }),
    deps.house,
  );
  const rec: LiveHandRecord = {
    handId: input.handId,
    sessionId: input.sessionId,
    tableName: input.tableName,
    state,
    reasons: [],
    deal: input.deal,
    status: "active",
    updatedAt: now(),
  };
  return finish(deps, rec, state, []);
}

/** Apply the external agent's action, then let the house reply. */
export async function applyExternalAction(
  deps: Deps,
  handId: string,
  action: Action,
  reason = "",
): Promise<TurnResult> {
  const rec = await deps.store.get(handId);
  if (!rec || rec.status !== "active") throw new UnknownHandError();
  if (isOver(rec.state) || rec.state.toAct !== AGENT) throw new NotYourTurnError();

  let state: HandState;
  try {
    state = apply(rec.state, action);
  } catch (e) {
    throw new IllegalMoveError((e as Error).message);
  }
  const reasons = [...rec.reasons, reason.trim().slice(0, 140)];
  state = await runHouse(state, deps.house);
  return finish(deps, rec, state, reasons);
}

/**
 * The external agent went quiet: act for it so funds don't stay locked. Facing a
 * bet it folds (loses only what it already put in); otherwise it checks. Then the
 * house finishes and the hand settles (or refunds).
 */
export async function timeoutHand(deps: Deps, handId: string): Promise<TurnResult | null> {
  const rec = await deps.store.get(handId);
  if (!rec || rec.status !== "active") return null;

  let state = rec.state;
  const reasons = [...rec.reasons];
  if (!isOver(state) && state.toAct === AGENT) {
    const give: Action = legal(state).canCheck ? { type: "check" } : { type: "fold" };
    state = apply(state, give);
    reasons.push("Timed out — gave up the turn.");
  }
  state = await runHouse(state, deps.house);
  return finish(deps, rec, state, reasons);
}

/** In-memory store: fine for tests and single-process dev; prod uses the DB-backed one. */
// ponytail: not durable across serverless invocations — swap for the backend-backed store before deploy.
export function memoryStore(): LiveHandStore {
  const hands = new Map<string, LiveHandRecord>();
  return {
    async get(id) {
      return hands.get(id) ?? null;
    },
    async put(rec) {
      hands.set(rec.handId, { ...rec });
    },
    async stale(cutoff) {
      return [...hands.values()].filter(
        (r) => r.status === "active" && !isOver(r.state) && r.state.toAct === AGENT && r.updatedAt < cutoff,
      );
    },
  };
}

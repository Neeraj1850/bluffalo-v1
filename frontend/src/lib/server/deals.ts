import { commitment, newSeed } from "@/lib/poker/fairness";
import { backend } from "./backend";
import type { PlayRequest } from "./play";

/**
 * Seeds for hands that have been committed but not yet played. The backend
 * hands a seed over once, only to the session that dealt it, within 10 minutes.
 */

export type Deal = { handId: string; commitment: string };

export async function createDeal(sessionId: string): Promise<Deal> {
  const seed = newSeed();
  const handId = crypto.randomUUID().slice(0, 8);
  const c = await commitment(seed);
  await backend(`/sessions/${sessionId}/deals`, { method: "POST", body: { hand_id: handId, seed, commitment: c } });
  return { handId, commitment: c };
}

/** Claims the seed; null for unknown, expired, already played or someone else's hand. */
export function takeSeed(handId: string, sessionId: string) {
  return backend<{ seed: string; commitment: string }>(`/sessions/${sessionId}/deals/${handId}/claim`, {
    method: "POST",
  });
}

/**
 * Real-money hands committed on-chain (both seed hashes bound) but waiting for
 * the player to reveal its seed. The server never sees the player seed before
 * it commits, so it can't preview the deck and refuse a bad hand. If the server
 * never settles, the contract's claim_timeout pays the player the whole pot.
 */
export type PendingHand = {
  handId: string;
  sessionId: string;
  agent: string;
  deal: { seed: string; commitment: string };
  playerCommitment: string;
  commitTx: string;
  tableId: string;
  stack: number;
  at: number;
  /** /api/play only: the request to play once revealed. */
  req?: PlayRequest;
};

// ponytail: in memory, like parked timeouts — a restart forgets pending hands
// (the contract still pays the player the pot after its timeout). Persist in the
// backend if restarts between commit and reveal matter.
const pending = new Map<string, PendingHand>();

export const pendingHands = {
  put: (p: PendingHand) => void pending.set(p.handId, p),
  /** This session's pending hand, or null. */
  get: (handId: string, sessionId: string) => {
    const p = pending.get(handId);
    return p && p.sessionId === sessionId ? p : null;
  },
  delete: (handId: string) => void pending.delete(handId),
  /** The agent's unrevealed hand, if any. */
  forAgent: (agent: string) => [...pending.values()].find((p) => p.agent === agent) ?? null,
};

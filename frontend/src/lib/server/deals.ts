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
 *
 * Stored in the backend, so a restart neither unblocks an agent that withheld
 * its seed nor loses the hand an honest player can still reveal.
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
  /** Server autoplay only: the server chose (and holds) the player seed. */
  autoSeed?: string;
};

type Row = {
  hand_id: string;
  session_id: string;
  agent: string;
  player_commitment: string;
  commit_tx: string;
  created_at: number;
  seed: string;
  commitment: string;
  data: { tableId: string; stack: number; req?: PlayRequest; autoSeed?: string };
};

const fromRow = (r: Row): PendingHand => ({
  handId: r.hand_id,
  sessionId: r.session_id,
  agent: r.agent,
  deal: { seed: r.seed, commitment: r.commitment },
  playerCommitment: r.player_commitment,
  commitTx: r.commit_tx,
  at: r.created_at,
  ...r.data,
});

export const pendingHands = {
  /** Throws BackendError 409 if the agent already has an unrevealed hand. */
  put: async ({ handId, sessionId, agent, playerCommitment, commitTx, tableId, stack, req, autoSeed }: Omit<PendingHand, "deal" | "at">) => {
    await backend(`/pending/${handId}`, {
      method: "PUT",
      body: {
        session_id: sessionId,
        agent,
        player_commitment: playerCommitment,
        commit_tx: commitTx,
        data: { tableId, stack, ...(req ? { req } : {}), ...(autoSeed ? { autoSeed } : {}) },
      },
    });
  },
  /** This session's unrevealed hand, or null. */
  get: async (handId: string, sessionId: string) => {
    const r = await backend<Row>(`/pending/${handId}`);
    return r && r.session_id === sessionId ? fromRow(r) : null;
  },
  /** Mark revealed (or closed on-chain) — once. False if it already was. */
  take: async (handId: string) => (await backend(`/pending/${handId}/reveal`, { method: "POST" })) !== null,
  /** The agent's unrevealed hand, if any. */
  forAgent: async (agent: string) => {
    const r = await backend<{ hand: Row | null }>(`/pending?agent=${encodeURIComponent(agent)}`);
    return r?.hand ? fromRow(r.hand) : null;
  },
};

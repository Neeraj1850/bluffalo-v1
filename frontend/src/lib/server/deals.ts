import { commitment, newSeed } from "@/lib/poker/fairness";
import { backend } from "./backend";

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

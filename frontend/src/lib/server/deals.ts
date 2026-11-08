import { commitment, newSeed } from "@/lib/poker/fairness";

/**
 * Seeds for hands that have been committed but not yet played. The seed
 * leaves this module only once, when the hand is played and revealed.
 */

// ponytail: in-memory, per server process — lost on restart and not shared across
// serverless instances. Moves on-chain with the poker contract (commit stored there).
// Kept on globalThis: route handlers can be bundled with separate copies of this module.
const store = globalThis as typeof globalThis & {
  __npDeals?: Map<string, { seed: string; commitment: string; at: number }>;
};
const pending = (store.__npDeals ??= new Map());

const TTL_MS = 10 * 60_000;

export type Deal = { handId: string; commitment: string };

export async function createDeal(): Promise<Deal> {
  const now = Date.now();
  for (const [id, d] of pending) if (now - d.at > TTL_MS) pending.delete(id);

  const seed = newSeed();
  const handId = crypto.randomUUID().slice(0, 8);
  const c = await commitment(seed);
  pending.set(handId, { seed, commitment: c, at: now });
  return { handId, commitment: c };
}

/** Hands the seed over exactly once; null for unknown, expired or already-played hands. */
export function takeSeed(handId: string): { seed: string; commitment: string } | null {
  const d = pending.get(handId);
  if (!d) return null;
  pending.delete(handId);
  if (Date.now() - d.at > TTL_MS) return null;
  return { seed: d.seed, commitment: d.commitment };
}

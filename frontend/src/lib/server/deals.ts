import { commitment, newSeed } from "@/lib/poker/fairness";
import { db } from "./db";

/**
 * Seeds for hands that have been committed but not yet played. A seed is
 * handed over once, and only to the session that dealt it.
 */

const TTL_MINUTES = 10;

export type Deal = { handId: string; commitment: string };

export async function createDeal(sessionId: string): Promise<Deal> {
  const seed = newSeed();
  const handId = crypto.randomUUID().slice(0, 8);
  const c = await commitment(seed);
  await db().query("insert into deals (hand_id, session_id, seed, commitment) values ($1, $2, $3, $4)", [
    handId,
    sessionId,
    seed,
    c,
  ]);
  return { handId, commitment: c };
}

/** Claims the seed atomically; null for unknown, expired, already played or someone else's hand. */
export async function takeSeed(handId: string, sessionId: string): Promise<{ seed: string; commitment: string } | null> {
  const { rows } = await db().query<{ seed: string; commitment: string }>(
    `update deals set played_at = now()
     where hand_id = $1 and session_id = $2 and played_at is null
       and created_at > now() - make_interval(mins => $3)
     returning seed, commitment`,
    [handId, sessionId, TTL_MINUTES],
  );
  return rows[0] ?? null;
}

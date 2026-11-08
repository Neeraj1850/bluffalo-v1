import type { LiveHand } from "@/lib/poker/record";
import { db } from "./db";

const LIMIT = 50;

export async function recordHand(sessionId: string, hand: LiveHand) {
  await db().query("insert into hands (id, session_id, record) values ($1, $2, $3) on conflict (id) do nothing", [
    hand.id,
    sessionId,
    JSON.stringify(hand),
  ]);
}

/** The session's real-money hands, newest first. */
export async function listHands(sessionId: string): Promise<LiveHand[]> {
  const { rows } = await db().query<{ record: LiveHand }>(
    "select record from hands where session_id = $1 order by created_at desc limit $2",
    [sessionId, LIMIT],
  );
  return rows.map((r) => r.record);
}

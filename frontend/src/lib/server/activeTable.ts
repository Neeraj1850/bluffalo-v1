/**
 * One table at a time per player: the table a session is playing at, and when
 * it last dealt there. A hand at another table is refused while this is fresh.
 */
// ponytail: in memory, single instance. Move to the session row if the app scales out.
const active = new Map<string, { tableId: string; at: number }>();

/** A table counts as busy this long after its last hand (covers slow AI moves). */
export const ACTIVE_MS = 90_000;

/** Claim `tableId` for this session. Returns the other table it's busy at, or null when free. */
export function claimTable(sessionId: string, tableId: string, now = Date.now()): string | null {
  const cur = active.get(sessionId);
  if (cur && cur.tableId !== tableId && now - cur.at < ACTIVE_MS) return cur.tableId;
  active.set(sessionId, { tableId, at: now });
  return null;
}

/** The player stopped playing: free their table straight away. */
export function leaveTable(sessionId: string) {
  active.delete(sessionId);
}

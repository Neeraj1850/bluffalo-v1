import { backend } from "./backend";
import type { LiveHandRecord, LiveHandStore } from "./liveHand";

/**
 * Durable live-hand storage, backed by the `backend/` service. The whole turn
 * record goes in `data`; status / to_act / updated_at are sent alongside so the
 * timeout sweep can query for stuck hands without deserialising every row.
 */
export function backendStore(): LiveHandStore {
  return {
    async get(handId) {
      const row = await backend<{ data: LiveHandRecord }>(`/live/${handId}`);
      return row?.data ?? null;
    },
    async put(rec) {
      await backend(`/live/${rec.handId}`, {
        method: "PUT",
        body: {
          session_id: rec.sessionId,
          status: rec.status,
          to_act: rec.state.toAct,
          updated_at: rec.updatedAt,
          data: rec,
        },
      });
    },
    async stale(cutoff) {
      const res = await backend<{ hands: LiveHandRecord[] }>(`/live?cutoff=${cutoff}`);
      return res?.hands ?? [];
    },
  };
}

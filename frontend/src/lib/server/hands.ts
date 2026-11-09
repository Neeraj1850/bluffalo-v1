import type { LiveHand } from "@/lib/poker/record";
import { backend } from "./backend";

export async function recordHand(sessionId: string, hand: LiveHand) {
  await backend(`/sessions/${sessionId}/hands`, { method: "POST", body: { id: hand.id, record: hand } });
}

/** The session's real-money hands, newest first. */
export async function listHands(sessionId: string): Promise<LiveHand[]> {
  return (await backend<{ hands: LiveHand[] }>(`/sessions/${sessionId}/hands`))?.hands ?? [];
}

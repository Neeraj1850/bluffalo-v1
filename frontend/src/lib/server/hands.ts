import type { HandMode, LiveHand } from "@/lib/poker/record";
import { backend } from "./backend";

export async function recordHand(sessionId: string, hand: LiveHand) {
  await backend(`/sessions/${sessionId}/hands`, { method: "POST", body: { id: hand.id, record: hand } });
}

/** The session's hands of one mode (real money by default), newest first. */
export async function listHands(sessionId: string, mode: HandMode = "real", limit = 50): Promise<LiveHand[]> {
  return (await backend<{ hands: LiveHand[] }>(`/sessions/${sessionId}/hands?mode=${mode}&limit=${limit}`))?.hands ?? [];
}

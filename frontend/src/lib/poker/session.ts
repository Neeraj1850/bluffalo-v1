import type { Limits } from "@/lib/data/strategy";

/** Running totals for one sitting at a table. */
export type Session = { hands: number; net: number; stack: number };

export type StopReason = "stop-loss" | "take-profit" | "max-hands" | "busted";

export const STOP_COPY: Record<StopReason, string> = {
  "stop-loss": "Stop loss reached — your agent left the table.",
  "take-profit": "Take profit reached — your agent left the table up.",
  "max-hands": "Played its maximum number of hands — your agent left the table.",
  busted: "Out of chips for this table — your agent left the table.",
};

/** Why the agent should leave after the last hand, or null to keep playing. */
export function stopReason(s: Session, limits: Limits, bigBlind: number): StopReason | null {
  if (s.net <= -limits.stopLoss) return "stop-loss";
  if (s.net >= limits.takeProfit) return "take-profit";
  if (s.hands >= limits.maxHands) return "max-hands";
  if (s.stack < bigBlind) return "busted";
  return null;
}

/** Fold one finished hand into the session. */
export function addHand(s: Session, hand: { net: number; stackAfter: number }): Session {
  return { hands: s.hands + 1, net: Math.round((s.net + hand.net) * 100) / 100, stack: hand.stackAfter };
}

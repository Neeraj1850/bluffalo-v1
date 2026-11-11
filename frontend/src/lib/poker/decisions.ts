import type { HandStep } from "@/lib/data/hands";

/** Street names a non-poker player understands. */
export const STREET_LABEL: Record<string, string> = {
  "PRE-FLOP": "Before the shared cards",
  FLOP: "Flop · first 3 shared cards",
  TURN: "Turn · 4th shared card",
  RIVER: "River · last shared card",
  SHOWDOWN: "Result",
};

/** "RAISE TO 3" → "raised to 3 (bet more)": the move, past tense, with the poker word explained once. */
export function agentMove(action: string): string {
  const [verb, ...rest] = action.split(" ");
  const amount = rest.join(" ").toLowerCase();
  switch (verb) {
    case "FOLD":
      return "folded (gave up the hand)";
    case "CHECK":
      return "checked (passed without betting)";
    case "CALL":
      return `called ${amount} (matched the bet)`;
    case "BET":
      return `bet ${amount}`;
    case "RAISE":
      return `raised ${amount} (bet more)`;
    default:
      return action.toLowerCase();
  }
}

/** The other side's reply, "called 0.5" → "called 0.5 (matched the bet)"; null when it didn't act. */
export function replyMove(opponent: string): string | null {
  if (!opponent || opponent === "—") return null;
  if (opponent.startsWith("called")) return `${opponent} (matched the bet)`;
  if (opponent.startsWith("raised")) return `${opponent} (bet more)`;
  if (opponent === "checked") return "checked (passed)";
  if (opponent === "folded") return "folded (gave up)";
  return opponent;
}

/** One decision as a sentence pair for the session page. The last step of a hand is its result. */
export function decisionLine(step: HandStep, opponentName: string) {
  if (step.street === "SHOWDOWN") return { street: STREET_LABEL.SHOWDOWN, move: step.reason, reason: "", reply: null };
  const reply = replyMove(step.opponent);
  return {
    street: STREET_LABEL[step.street] ?? step.street,
    move: `Your agent ${agentMove(step.action)}`,
    reason: step.reason,
    reply: reply ? `${opponentName[0].toUpperCase()}${opponentName.slice(1)} ${reply}` : null,
  };
}

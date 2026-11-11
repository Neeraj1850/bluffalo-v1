/** Copy shared by the wallet, results and deploy screens. Pure, so it can be tested. */

export type AgentStatus = { account: string | null; balance: number; inHand?: boolean };

export const IN_HAND_COPY = "A hand is being played — balance unlocks when it settles";

/** What the agent's balance means right now, honestly. */
export function agentBalanceState(agent: AgentStatus | null): "loading" | "none" | "in_hand" | "empty" | "funded" {
  if (!agent) return "loading";
  if (!agent.account) return "none";
  if (agent.inHand) return "in_hand";
  return agent.balance > 0 ? "funded" : "empty";
}

/** Risk-card line on the deploy screen: future tense until the move is confirmed. */
export function buyInMoveCopy(start: number, buyIn: number, moved: boolean): string {
  const fmt = (n: number) => n.toFixed(2);
  const range = `(${fmt(start)} → ${fmt(Math.max(0, start - buyIn))})`;
  return moved
    ? `Moved from your playing balance ${range} to your agent’s account.`
    : `Will move from your playing balance ${range} to your agent’s account when you confirm.`;
}

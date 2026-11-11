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

/**
 * The saved "deployed" flag says an agent is seated, but the chain is the truth.
 * It's stale when there's no agent account, or the agent can't cover a big blind
 * and isn't mid-hand (busted, or its chips already went back to the balance).
 */
export function deploymentIsStale(onChain: AgentStatus, bigBlind: number): boolean {
  if (!onChain.account) return true;
  return !onChain.inHand && onChain.balance < bigBlind;
}

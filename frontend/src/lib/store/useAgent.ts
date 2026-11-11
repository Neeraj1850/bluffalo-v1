"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentStatus } from "@/lib/agentStatus";
import { fetchAgent } from "@/services/agentApi";

export type AgentOnChain = AgentStatus;

/** How often to re-read the agent while a hand has its stack locked. */
export const IN_HAND_POLL_MS = 3000;

/** The player's agent account and its real balance in the contract; null while loading. */
export function useAgent() {
  const [agent, setAgent] = useState<AgentOnChain | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchAgent()
      .then((a) => {
        setAgent(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn’t read the agent’s balance."));
  }, []);

  useEffect(refresh, [refresh]);

  // A hand in progress locks the whole stack: keep checking until it settles.
  const inHand = Boolean(agent?.inHand);
  useEffect(() => {
    if (!inHand) return;
    const t = setInterval(refresh, IN_HAND_POLL_MS);
    return () => clearInterval(t);
  }, [inHand, refresh]);

  return { agent, error, refresh };
}

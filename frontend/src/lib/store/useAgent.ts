"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAgent } from "@/services/agentApi";

export type AgentOnChain = { account: string | null; balance: number };

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
  return { agent, error, refresh };
}

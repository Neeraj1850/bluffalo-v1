"use client";

import { useEffect } from "react";
import { deploymentIsStale } from "@/lib/agentStatus";
import { getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { fetchAgent } from "@/services/agentApi";

/**
 * Clears a "deployed" flag the chain no longer backs, on every screen change,
 * so a busted agent can't trap the player (Deploy refusing to buy in again,
 * Live erroring with the nav locked).
 */
export function AgentReconciler({ pathname }: { pathname: string }) {
  const { hydrated, agent, stopAgent } = useSetup();
  const deployed = hydrated && agent.status === "deployed";
  const tableId = agent.status === "deployed" ? agent.tableId : null;

  useEffect(() => {
    if (!deployed || !tableId) return;
    let cancelled = false;
    fetchAgent()
      .then((a) => {
        if (!cancelled && deploymentIsStale(a, getTable(tableId).blinds.big)) stopAgent();
      })
      .catch(() => {
        // Can't reach the chain right now: leave the flag alone.
      });
    return () => {
      cancelled = true;
    };
  }, [deployed, tableId, pathname, stopAgent]);

  return null;
}

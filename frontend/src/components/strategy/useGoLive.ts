"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { PresetKey, StrategyParams } from "@/lib/data/strategy";
import { DEFAULT_TABLE_ID, getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";

/**
 * "Play live with this agent": loads the strategy and goes straight to the
 * real-money review. An agent already at a table → watch it instead. From the
 * free practice table, the recommended real table is picked for the player.
 */
export function useGoLive() {
  const router = useRouter();
  const { agent, tableId, applyAgent, selectTable } = useSetup();
  const live = agent.status === "deployed";

  const goLive = useCallback(
    (strategy?: { preset: PresetKey; params: StrategyParams }) => {
      if (live) return router.push("/game");
      if (strategy) applyAgent(strategy.preset, strategy.params);
      if (getTable(tableId).mode !== "real") selectTable(DEFAULT_TABLE_ID);
      router.push("/deploy");
    },
    [live, tableId, applyAgent, selectTable, router],
  );

  return { goLive, live };
}

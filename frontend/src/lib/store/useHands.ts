"use client";

import { useEffect, useState } from "react";
import type { HandMode, LiveHand } from "@/lib/poker/record";
import { fetchHands } from "@/services/agentApi";

/** The player's recorded hands; null while loading (or if they couldn't be loaded). */
export function useHands(mode: HandMode = "real") {
  const [hands, setHands] = useState<LiveHand[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHands(null);
    fetchHands(mode)
      .then((h) => !cancelled && setHands(h))
      .catch(() => !cancelled && setHands([]));
    return () => {
      cancelled = true;
    };
  }, [mode]);
  return hands;
}

"use client";

import { useEffect, useState } from "react";
import type { LiveHand } from "@/lib/poker/record";
import { fetchHands } from "@/services/agentApi";

/** The player's recorded hands; null while loading (or if they couldn't be loaded). */
export function useHands() {
  const [hands, setHands] = useState<LiveHand[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchHands()
      .then((h) => !cancelled && setHands(h))
      .catch(() => !cancelled && setHands([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return hands;
}

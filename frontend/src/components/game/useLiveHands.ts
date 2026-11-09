"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Limits, StrategyParams } from "@/lib/data/strategy";
import type { LiveHand } from "@/lib/poker/record";
import { addHand, stopReason, type Session, type StopReason } from "@/lib/poker/session";
import { fetchLiveHand } from "@/services/agentApi";

type Options = {
  tableId: string;
  params: StrategyParams;
  startStack: number;
  limits: Limits;
  bigBlind: number;
};

/**
 * Hand after hand at one table. Fetches a committed hand, lets the screen
 * play it back, then — once the screen calls `finish` — updates the session
 * and either deals the next one or says why the agent stopped.
 */
export function useLiveHands({ tableId, params, startStack, limits, bigBlind }: Options) {
  const [hand, setHand] = useState<LiveHand | null>(null);
  const [session, setSession] = useState<Session>({ hands: 0, net: 0, stack: startStack });
  const [stopped, setStopped] = useState<StopReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Latest values for the async loader without re-creating it every render.
  const latest = useRef({ tableId, params, session });
  latest.current = { tableId, params, session };

  const deal = useCallback(async () => {
    const { tableId, params, session } = latest.current;
    setLoading(true);
    setError(null);
    try {
      setHand(await fetchLiveHand({ tableId, params, stack: session.stack, button: (session.hands % 2) as 0 | 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t deal the next hand.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deal();
  }, [deal]);

  /** Call once when a hand's playback ends. Returns why play stopped, if it did. */
  const finish = useCallback(
    (h: LiveHand) => {
      const next = addHand(latest.current.session, h);
      latest.current.session = next;
      setSession(next);
      const reason = stopReason(next, limits, bigBlind);
      if (reason) setStopped(reason);
      return reason;
    },
    [limits, bigBlind],
  );

  /** After an error: drop the finished hand (so it isn't settled twice) and deal again. */
  const retry = useCallback(() => {
    setHand(null);
    deal();
  }, [deal]);

  return { hand, session, stopped, error, loading, finish, next: deal, retry };
}

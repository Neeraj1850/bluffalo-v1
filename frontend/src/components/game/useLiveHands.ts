"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Limits, PresetKey, StrategyParams } from "@/lib/data/strategy";
import type { LiveHand } from "@/lib/poker/record";
import { addHand, stopReason, type Session, type StopReason } from "@/lib/poker/session";
import { fetchLiveHand } from "@/services/agentApi";
import { fetchTables, isTableClosed, looksTableClosed, netAfterRake, stackAfterRake } from "@/services/houseApi";

type Options = {
  tableId: string;
  params: StrategyParams;
  /** Labels the recorded hand with the preset that played it. */
  preset?: PresetKey;
  /** Groups the hands dealt by this loop into one saved session. */
  runId?: string;
  startStack: number;
  limits: Limits;
  bigBlind: number;
};

/**
 * Hand after hand at one table. Fetches a committed hand, lets the screen
 * play it back, then — once the screen calls `finish` — updates the session
 * and either deals the next one or says why the agent stopped.
 */
export function useLiveHands({ tableId, params, preset, runId, startStack, limits, bigBlind }: Options) {
  const [hand, setHand] = useState<LiveHand | null>(null);
  const [session, setSession] = useState<Session>({ hands: 0, net: 0, stack: startStack });
  const [stopped, setStopped] = useState<StopReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Real money: the commit tx once the hand is bound on-chain, before it's played (submitted ≠ settled). */
  const [committedTx, setCommittedTx] = useState<string | null>(null);
  /** The server closed this table (house bankroll low). Non-null = reason text. */
  const [closed, setClosed] = useState<string | null>(null);
  // Latest values for the async loader without re-creating it every render.
  const latest = useRef({ tableId, params, preset, runId, session });
  latest.current = { tableId, params, preset, runId, session };

  // One hand in flight at a time: each real hand locks the agent's whole stack on-chain.
  const dealing = useRef(false);

  const deal = useCallback(async () => {
    if (dealing.current) return;
    dealing.current = true;
    const { tableId, params, preset, runId, session } = latest.current;
    setLoading(true);
    setError(null);
    setClosed(null);
    setCommittedTx(null);
    try {
      setHand(
        await fetchLiveHand(
          { tableId, params, preset, runId, stack: session.stack, button: (session.hands % 2) as 0 | 1 },
          fetch,
          setCommittedTx,
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn’t deal the next hand.";
      // /api/play answers 503 {code:"table_closed"}; the code may be lost in transit, so confirm with /api/tables.
      let reason: string | null = isTableClosed(e) || looksTableClosed(message) ? message : null;
      if (!reason) {
        const t = await fetchTables()
          .then((r) => r.tables.find((x) => x.id === tableId))
          .catch(() => undefined);
        if (t && !t.open) reason = t.reason ?? message;
      }
      if (reason) setClosed(reason);
      else setError(message);
    } finally {
      dealing.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deal();
  }, [deal]);

  /** Call once when a hand's playback ends. Returns why play stopped, if it did. */
  const finish = useCallback(
    (h: LiveHand) => {
      const next = addHand(latest.current.session, { net: netAfterRake(h), stackAfter: stackAfterRake(h) });
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

  return { hand, session, stopped, error, closed, loading, committedTx, finish, next: deal, retry };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveHands } from "@/components/game/useLiveHands";
import { getTable, PRACTICE_STACK, PRACTICE_TABLE_ID } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { netAfterRake } from "@/services/houseApi";

const TICK_MS = 1400;

export type PracticeFeedItem = {
  index: string;
  action: string;
  reason: string;
  street: string;
  latest: boolean;
};

/**
 * Real practice hands against the practice bot, revealed one decision per
 * tick. Stats only ever count hands that actually finished.
 */
export function usePracticeSim(runId?: string) {
  const { params, preset, limits } = useSetup();
  const table = getTable(PRACTICE_TABLE_ID);
  const loop = useLiveHands({
    tableId: table.id,
    params,
    preset,
    runId,
    startStack: PRACTICE_STACK,
    limits,
    bigBlind: table.blinds.big,
  });
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState({ id: "", step: 0 });
  const [wins, setWins] = useState(0);
  const settled = useRef("");

  const hand = loop.hand;
  const step = hand && pos.id === hand.id ? pos.step : 0;
  const last = hand ? hand.steps.length - 1 : 0;
  const done = Boolean(hand) && step === last;
  const { finish, next, stopped, loading } = loop;

  useEffect(() => {
    if (!hand || paused || loading) return;
    const id = setTimeout(() => {
      if (step < last) return setPos({ id: hand.id, step: step + 1 });
      if (settled.current !== hand.id) {
        settled.current = hand.id;
        if (hand.net > 0) setWins((w) => w + 1);
        if (finish(hand)) return;
      }
      if (!stopped) next();
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [hand, step, last, paused, loading, stopped, finish, next]);

  const feed: PracticeFeedItem[] = hand
    ? hand.steps
        .slice(0, step + 1)
        .map((s, i) => ({ index: `#${i + 1}`, action: s.action, reason: s.reason, street: s.street, latest: i === step }))
        .reverse()
    : [];

  return {
    hand,
    feed,
    // Nobody is thinking while the service is down.
    thinking: !paused && !stopped && !loop.error && (loading || !hand || done),
    paused,
    togglePaused: () => setPaused((p) => !p),
    boardShown: hand ? hand.steps[step].boardCount : 0,
    stats: { hands: loop.session.hands, wins, net: loop.session.net },
    /**
     * Totals at Stop: the hand on screen is already saved to the session, so it
     * counts even though its playback hasn't finished — matching the saved session.
     */
    finalStats: () =>
      hand && settled.current !== hand.id
        ? {
            hands: loop.session.hands + 1,
            wins: wins + (hand.net > 0 ? 1 : 0),
            net: Math.round((loop.session.net + netAfterRake(hand)) * 100) / 100,
          }
        : { hands: loop.session.hands, wins, net: loop.session.net },
    stopped,
    error: loop.error,
    retry: next,
  };
}

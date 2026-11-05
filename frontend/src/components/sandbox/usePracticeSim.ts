"use client";

import { useEffect, useState } from "react";
import { PRACTICE_STEPS } from "@/lib/data/hands";

/** How each simulated hand ends, cycled so results aren't a fake 100% win rate. */
const OUTCOMES = [
  { net: 6.5, action: "WON 6.5", reason: "Bot called with a pair of nines. Queens hold. (Practice chips.)" },
  { net: -2, action: "LOST 2", reason: "Bot had the king. Agent checked the river and gave up a small pot. (Practice chips.)" },
  { net: 3, action: "WON 3", reason: "Bot folded to the river bet. Small pot taken. (Practice chips.)" },
];

const TICK_MS = 1100;

export type PracticeFeedItem = {
  index: string;
  action: string;
  reason: string;
  street: string;
  latest: boolean;
};

/**
 * Plays the practice script on a loop: think → decide → think → decide…
 * Stats only ever count hands that this simulation actually completed.
 */
export function usePracticeSim() {
  const [step, setStep] = useState(0);
  const [thinking, setThinking] = useState(true);
  const [paused, setPaused] = useState(false);
  const [hand, setHand] = useState(0);
  const [stats, setStats] = useState({ hands: 0, wins: 0, net: 0 });

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (!thinking) {
        setThinking(true);
        return;
      }
      setThinking(false);
      const last = PRACTICE_STEPS.length - 1;
      if (step < last) {
        const next = step + 1;
        setStep(next);
        if (next === last) {
          const o = OUTCOMES[hand % OUTCOMES.length];
          setStats((s) => ({ hands: s.hands + 1, wins: s.wins + (o.net > 0 ? 1 : 0), net: s.net + o.net }));
        }
      } else {
        setStep(0);
        setHand((h) => h + 1);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, thinking, step, hand]);

  const outcome = OUTCOMES[hand % OUTCOMES.length];
  const feed: PracticeFeedItem[] = PRACTICE_STEPS.slice(0, step + 1)
    .map((s, i) => {
      const isEnd = s.street === "END";
      return {
        index: `#${i + 1}`,
        action: isEnd ? outcome.action : s.action,
        reason: isEnd ? outcome.reason : s.reason,
        street: s.street,
        latest: i === step,
      };
    })
    .reverse();

  return {
    feed,
    thinking: thinking && !paused,
    paused,
    togglePaused: () => setPaused((p) => !p),
    boardShown: PRACTICE_STEPS[step].board,
    stats,
  };
}

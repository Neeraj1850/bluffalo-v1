"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScriptedHand } from "@/lib/data/hands";

const AUTO_ADVANCE_MS = 3200;

/**
 * Steps through a hand street by street. Auto-advances like a live table;
 * "next street" skips the wait. Stops at showdown.
 */
export function useHandPlayback(hand: ScriptedHand, { auto = true } = {}) {
  const [step, setStep] = useState(0);
  const last = hand.steps.length - 1;
  const done = step === last;

  const next = useCallback(() => setStep((s) => Math.min(last, s + 1)), [last]);
  const replay = useCallback(() => setStep(0), []);

  useEffect(() => {
    if (!auto || done) return;
    const id = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [auto, done, step, next]);

  const current = hand.steps[step];
  const previous = step > 0 ? hand.steps[step - 1] : null;

  return {
    step,
    current,
    done,
    next,
    replay,
    /** True on steps where chips went into the pot. */
    potGrew: previous ? current.pot > previous.pot : false,
    log: hand.steps.slice(0, step).reverse(),
  };
}

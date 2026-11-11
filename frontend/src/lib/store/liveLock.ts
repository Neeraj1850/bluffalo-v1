"use client";

import { useSyncExternalStore } from "react";

/**
 * True while a live hand is in play, so the nav locks and the player can't
 * wander off mid-hand (the agent has real stake committed on-chain). Only the
 * per-decision TEE-verify links stay clickable, and they open in a new tab.
 */
let locked = false;
const listeners = new Set<() => void>();

export function setLiveLock(value: boolean) {
  if (value === locked) return;
  locked = value;
  listeners.forEach((l) => l());
}

export function useLiveLock(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => locked,
    () => false,
  );
}

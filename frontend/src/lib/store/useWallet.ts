"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchWallet, SignedOutError, type Wallet } from "@/services/agentApi";

export const WALLET_POLL_MS = 5000;

export type WalletState = {
  wallet: Wallet | null;
  error: string | null;
  signedOut: boolean;
  loading: boolean;
};

/**
 * One shared store for the player's deposit wallet, so the balance chip, the
 * deposit sheet and the deploy screen always agree. Balance only ever comes
 * from the chain (GET /api/wallet).
 */
export function createWalletStore(load: () => Promise<Wallet> = () => fetchWallet()) {
  let state: WalletState = { wallet: null, error: null, signedOut: false, loading: true };
  const listeners = new Set<() => void>();
  let inFlight: Promise<void> | null = null;

  const set = (next: Partial<WalletState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight;
    inFlight = load()
      .then((wallet) => set({ wallet, error: null, signedOut: false, loading: false }))
      .catch((e) =>
        set({
          wallet: e instanceof SignedOutError ? null : state.wallet,
          signedOut: e instanceof SignedOutError,
          error: e instanceof Error ? e.message : "Couldn’t read your balance.",
          loading: false,
        }),
      )
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  return { getState: () => state, refresh, subscribe, listenerCount: () => listeners.size };
}

const store = createWalletStore();
const SERVER_STATE: WalletState = { wallet: null, error: null, signedOut: false, loading: true };

let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  if (document.visibilityState === "visible") void store.refresh();
}

function startPolling() {
  if (pollers++ > 0) return;
  tick();
  timer = setInterval(tick, WALLET_POLL_MS);
  document.addEventListener("visibilitychange", tick);
}

function stopPolling() {
  if (--pollers > 0) return;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", tick);
}

/** The player's real wallet balance, polled every ~5 s while the page is visible. */
export function useWallet() {
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);
  useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);
  return { ...state, refresh: store.refresh };
}

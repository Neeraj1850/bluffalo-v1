"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, type CashoutQuote, type Chain } from "@/services/agentApi";

export type CashoutState =
  | { step: "choose"; quoting: boolean; error?: string }
  | { step: "review"; quote: CashoutQuote; submitting: boolean; error?: string }
  | { step: "track"; quote: CashoutQuote; status: "submitted" | "confirmed" | "failed" };

/**
 * destination → quote → submitted → confirmed.
 * Each transition only happens when the service says so.
 */
export function useCashout(amount: number, onConfirmed: () => void) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [state, setState] = useState<CashoutState>({ step: "choose", quoting: false });
  const [now, setNow] = useState(() => Date.now());
  const confirmedRef = useRef(onConfirmed);
  confirmedRef.current = onConfirmed;

  const reset = useCallback(() => {
    setChain(null);
    setState({ step: "choose", quoting: false });
  }, []);

  const getQuote = useCallback(async () => {
    if (!chain) return;
    setState({ step: "choose", quoting: true });
    try {
      const quote = await agentApi.getCashoutQuote(chain, amount);
      setNow(Date.now());
      setState({ step: "review", quote, submitting: false });
    } catch {
      setState({ step: "choose", quoting: false, error: "Couldn’t get a quote. Nothing was sent." });
    }
  }, [chain, amount]);

  const confirm = useCallback(async () => {
    if (state.step !== "review" || state.submitting) return;
    const { quote } = state;
    setState({ step: "review", quote, submitting: true });
    try {
      const { id } = await agentApi.submitCashout(quote.id);
      setState({ step: "track", quote, status: "submitted" });
      // Poll until the destination network confirms.
      for (let i = 0; i < 20; i++) {
        const status = await agentApi.getCashoutStatus(id);
        if (status !== "submitted") {
          setState({ step: "track", quote, status });
          if (status === "confirmed") confirmedRef.current();
          return;
        }
      }
    } catch (err) {
      setState({
        step: "review",
        quote,
        submitting: false,
        error: `${err instanceof Error ? err.message : "Submission failed."} No funds moved.`,
      });
    }
  }, [state]);

  // Quote expiry countdown.
  const reviewing = state.step === "review";
  useEffect(() => {
    if (!reviewing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reviewing]);

  const secondsLeft =
    state.step === "review" ? Math.max(0, Math.ceil((state.quote.expiresAt - now) / 1000)) : 0;

  return { chain, setChain, state, getQuote, confirm, reset, secondsLeft };
}

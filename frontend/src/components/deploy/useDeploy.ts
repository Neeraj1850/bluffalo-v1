"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, ApiError, type DeployRequest, type FeeQuote } from "@/services/agentApi";

export type FeeState =
  | { status: "loading" }
  | { status: "quoted"; quote: FeeQuote }
  | { status: "unavailable" };

export type DeployPhase =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "failed"; message: string; fundsMoved: boolean; code?: string }
  | { status: "done"; account: string };

/** Fee quote + deploy state machine. Success only when the service resolves. */
export function useDeploy(request: DeployRequest) {
  const [fee, setFee] = useState<FeeState>({ status: "loading" });
  const [phase, setPhase] = useState<DeployPhase>({ status: "idle" });
  const inFlight = useRef(false);

  const loadFee = useCallback(() => {
    let cancelled = false;
    setFee({ status: "loading" });
    agentApi
      .getFeeQuote(request)
      .then((quote) => !cancelled && setFee({ status: "quoted", quote }))
      .catch(() => !cancelled && setFee({ status: "unavailable" }));
    return () => {
      cancelled = true;
    };
    // The fee and buy-in depend on the table only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.tableId]);

  useEffect(() => loadFee(), [loadFee]);

  const deploy = useCallback(async () => {
    if (inFlight.current) return null; // no duplicate submissions
    inFlight.current = true;
    setPhase({ status: "pending" });
    try {
      const result = await agentApi.deployAgent(request);
      setPhase({ status: "done", account: result.agentAccount });
      return result;
    } catch (err) {
      setPhase({
        status: "failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
        fundsMoved: err instanceof ApiError ? err.fundsMoved : false,
        code: err instanceof ApiError ? err.code : undefined,
      });
      return null;
    } finally {
      inFlight.current = false;
    }
  }, [request]);

  /** Back to idle (e.g. after topping up following an insufficient-funds refusal). */
  const clearFailure = useCallback(() => setPhase((p) => (p.status === "failed" ? { status: "idle" } : p)), []);

  return { fee, phase, deploy, retryFee: loadFee, clearFailure };
}

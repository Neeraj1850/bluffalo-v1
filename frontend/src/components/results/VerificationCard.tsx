"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { verifyDeal, type DealProof } from "@/lib/poker/fairness";
import { agentApi, type Verification } from "@/services/agentApi";

const COPY: Record<Verification, string> = {
  verified:
    "Before this hand was dealt, the shuffle was locked in with a fingerprint. That fingerprint matches the revealed shuffle, and the shuffle deals exactly these cards — no one could change them mid-hand.",
  pending: "Checking this hand’s shuffle against the fingerprint published before the deal…",
  unavailable:
    "This hand’s shuffle doesn’t check out against the fingerprint published before the deal. Treat the result as unverified.",
};

/**
 * Shows "verified" only when the check actually passed. With a proof the
 * browser checks the deal itself (commit-reveal); without one it asks the service.
 */
export function VerificationCard({ handId, proof }: { handId: string; proof?: DealProof }) {
  const [state, setState] = useState<Verification | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    const check = proof
      ? verifyDeal(proof).then((r): Verification => (r.ok ? "verified" : "unavailable"))
      : agentApi.getVerification(handId);
    check.then((v) => !cancelled && setState(v)).catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [handId, proof]);

  const shown: Verification = state === "loading" ? "pending" : state;

  return (
    <section
      aria-label="Fair-play verification"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-card border border-border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge
          kind={shown === "verified" ? "verified" : shown === "pending" ? "verifying" : "unverified"}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Fair deal</span>
      </div>
      <p className="text-[13px] leading-normal text-muted">{COPY[shown]}</p>
      {shown === "verified" && proof && (
        <Disclosure
          hint="Details"
          summary={<span className="font-mono text-[11px] uppercase tracking-[0.12em]">Check it yourself</span>}
        >
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 pb-1 font-mono text-[11px]">
            <dt className="text-muted">HAND</dt>
            <dd>{handId}</dd>
            <dt className="text-muted">FINGERPRINT</dt>
            <dd className="break-all">{proof.commitment}</dd>
            <dt className="text-muted">SHUFFLE SEED</dt>
            <dd className="break-all">{proof.seed}</dd>
            <dt className="text-muted">HOW</dt>
            <dd>SHA-256 of the seed equals the fingerprint; the seed re-deals these exact cards.</dd>
          </dl>
        </Disclosure>
      )}
    </section>
  );
}

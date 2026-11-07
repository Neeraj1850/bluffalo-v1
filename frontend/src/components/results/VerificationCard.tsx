"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { agentApi, type Verification } from "@/services/agentApi";

const COPY: Record<Verification, string> = {
  verified:
    "The hand ran inside sealed, tamper-proof hardware, and its signed record checks out. No one — including us — could see or change the cards.",
  pending:
    "Checking the signed record for this hand. This usually takes a few seconds. Winnings are shown, but not yet verified.",
  unavailable:
    "We couldn’t check this hand’s signed record yet. Your balance is unaffected; we’ll retry automatically.",
};

/** Shows "verified" only when the service has actually verified the hand. */
export function VerificationCard({ handId }: { handId: string }) {
  const [state, setState] = useState<Verification | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    agentApi
      .getVerification(handId)
      .then((v) => !cancelled && setState(v))
      .catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [handId]);

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
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">TEE attestation</span>
      </div>
      <p className="text-[13px] leading-normal text-muted">{COPY[shown]}</p>
      {shown === "verified" && (
        <Disclosure
          hint="Details"
          summary={<span className="font-mono text-[11px] uppercase tracking-[0.12em]">View attestation details</span>}
        >
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 pb-1 font-mono text-[11px]">
            <dt className="text-muted">HAND</dt>
            <dd>{handId}</dd>
            <dt className="text-muted">ENVIRONMENT</dt>
            <dd>Trusted Execution Environment</dd>
            <dt className="text-muted">RECORD</dt>
            <dd className="break-all">Signed by the enclave; shown here once your backend returns it.</dd>
          </dl>
        </Disclosure>
      )}
    </section>
  );
}

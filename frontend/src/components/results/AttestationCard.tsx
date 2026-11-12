"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { type Attestation, fetchAttestation } from "@/services/agentApi";

/**
 * The AI decisions in this hand ran on NEAR AI Cloud inside a TEE. This checks
 * that live: a fresh completion whose response signature recovers to a signer
 * the model's attestation vouches for. The full hardware quote is at verifyUrl.
 */
const loadingOf = (a: unknown): a is "loading" => a === "loading";

export function AttestationCard({ chatIds = [] }: { chatIds?: string[] }) {
  const [att, setAtt] = useState<
    | (Attestation & { decisions?: number; verifiedDecisions?: number })
    | "loading"
  >("loading");
  const key = chatIds.join(",");

  useEffect(() => {
    let cancelled = false;
    fetchAttestation(key ? key.split(",") : []).then(
      (a) => !cancelled && setAtt(a),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  const perHand = !loadingOf(att) && typeof att.decisions === "number";

  const loading = att === "loading";
  const verified = !loading && att.verified;

  return (
    <section
      aria-label="TEE attestation"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-card border border-border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge
          kind={loading ? "verifying" : verified ? "verified" : "unverified"}
        >
          {loading
            ? "Checking TEE…"
            : verified
              ? perHand
                ? `TEE attested · ${att.verifiedDecisions}/${att.decisions} decisions`
                : "TEE attested"
              : "TEE unverified"}
        </StatusBadge>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          TEE inference
        </span>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        {loading
          ? "Checking that the agent’s decisions ran in a trusted enclave…"
          : verified
            ? perHand
              ? "Every AI decision in this hand was checked: each one’s NEAR AI signature recovers to a signer the model’s TEE hardware attestation vouches for — the model, not the host, produced and signed it."
              : "This hand has no AI decisions to check, so this is a live check of the model: a fresh completion’s signature recovers to a signer the TEE attestation vouches for."
            : `The TEE attestation didn’t check out${"detail" in att && att.detail ? ` (${att.detail})` : ""}. Treat the AI’s reasoning as unverified.`}
      </p>
      {!loading && (
        <Disclosure
          hint="Details"
          summary={
            <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Check it yourself
            </span>
          }
        >
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 pb-1 font-mono text-[11px]">
            {att.model && (
              <>
                <dt className="text-muted">MODEL</dt>
                <dd className="break-all">{att.model}</dd>
              </>
            )}
            {att.signer && (
              <>
                <dt className="text-muted">TEE SIGNER</dt>
                <dd className="break-all">{att.signer}</dd>
              </>
            )}
            <dt className="text-muted">FULL QUOTE</dt>
            <dd>
              <a
                className="underline underline-offset-4"
                href={att.verifyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Verify the hardware quote at NEAR’s Verification Center ↗
              </a>
            </dd>
          </dl>
        </Disclosure>
      )}
    </section>
  );
}

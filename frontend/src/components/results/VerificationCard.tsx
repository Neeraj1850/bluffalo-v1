"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { verifyDeal, type DealProof } from "@/lib/poker/fairness";
import { checkPayout, type PayoutCheck, type Replay } from "@/lib/poker/replay";
import { agentApi, fetchChainHand, type Verification } from "@/services/agentApi";

const COPY: Record<Verification, string> = {
  verified:
    "Before this hand was dealt, the house locked in its half of the shuffle with a fingerprint; your browser then added its own half. The fingerprint matches, and the two halves deal exactly these cards — no one could pick or change the cards.",
  pending:
    "Checking this hand’s shuffle against the fingerprint published before the deal…",
  unavailable:
    "This hand’s shuffle doesn’t check out against the fingerprint published before the deal. Treat the result as unverified.",
};

const txUrl = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;

/**
 * Shows "verified" only when the check actually passed. With a proof the
 * browser checks the deal itself (commit-reveal); without one it asks the service.
 */
export function VerificationCard({
  handId,
  proof,
  chain,
  replay,
}: {
  handId: string;
  proof?: DealProof;
  chain?: { contract: string; commitTx: string; settleTx: string };
  /** The hand's actions: with the on-chain seeds, re-played here to check the payout. */
  replay?: Replay;
}) {
  const [state, setState] = useState<Verification | "loading">("loading");
  const [payout, setPayout] = useState<PayoutCheck | null>(null);

  useEffect(() => {
    let cancelled = false;
    const local = proof
      ? verifyDeal(proof).then((r): Verification =>
          r.ok ? "verified" : "unavailable",
        )
      : agentApi.getVerification(handId);
    // Real-money hands must also check out against the contract's own record of both seeds.
    // The browser re-plays the hand from the contract's revealed seeds and checks its payout.
    const onChain = chain
      ? fetchChainHand(handId.replace(/^#/, ""), chain.contract).then(async ({ status, hand }) => {
          if (status === "verified" && hand && replay && hand.payout !== null) {
            const p = await checkPayout({ serverSeed: hand.serverSeed, playerSeed: hand.playerSeed, replay, payout: hand.payout });
            if (!cancelled) setPayout(p);
            if (!p.ok) return "unavailable" as const;
          }
          return status;
        })
      : null;
    const check = onChain
      ? Promise.all([local, onChain]).then(([a, b]): Verification =>
          a === "verified" && b === "verified"
            ? "verified"
            : a === "unavailable" || b === "unavailable"
              ? "unavailable"
              : "pending",
        )
      : local;
    check
      .then((v) => !cancelled && setState(v))
      .catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [handId, proof, chain, replay]);

  const shown: Verification = state === "loading" ? "pending" : state;

  return (
    <section
      aria-label="Fair-play verification"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-card border border-border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge
          kind={
            shown === "verified"
              ? "verified"
              : shown === "pending"
                ? "verifying"
                : "unverified"
          }
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Fair deal
        </span>
      </div>
      <p className="text-[13px] leading-normal text-muted">{COPY[shown]}</p>
      {payout && (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em]" role="status">
          {payout.ok
            ? `Payout matches the cards: ${payout.payout} GNEAR`
            : `Payout mismatch — ${payout.reason}${payout.expected !== undefined ? ` (expected ${payout.expected} GNEAR)` : ""}`}
        </p>
      )}
      {chain && (
        <p className="text-[11px] leading-normal text-muted">
          If the house never settles a committed hand, anyone can close it on-chain after the timeout and the whole pot goes to your agent.
        </p>
      )}
      {shown === "verified" && proof && (
        <Disclosure
          hint="Details"
          summary={
            <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Check it yourself
            </span>
          }
        >
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 pb-1 font-mono text-[11px]">
            <dt className="text-muted">HAND</dt>
            <dd>{handId}</dd>
            <dt className="text-muted">FINGERPRINT</dt>
            <dd className="break-all">{proof.commitment}</dd>
            <dt className="text-muted">HOUSE SEED</dt>
            <dd className="break-all">{proof.seed}</dd>
            <dt className="text-muted">YOUR SEED</dt>
            <dd className="break-all">{proof.playerSeed}</dd>
            <dt className="text-muted">HOW</dt>
            <dd>
              SHA-256(house seed) equals the fingerprint; SHA-256(house
              seed:your seed) re-deals these exact cards.
            </dd>
            {chain && (
              <>
                <dt className="text-muted">ON NEAR</dt>
                <dd className="flex flex-col gap-1">
                  <a
                    className="underline underline-offset-4"
                    href={txUrl(chain.commitTx)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Committed before the deal ↗
                  </a>
                  <a
                    className="underline underline-offset-4"
                    href={txUrl(chain.settleTx)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Seed checked and settled ↗
                  </a>
                </dd>
              </>
            )}
          </dl>
        </Disclosure>
      )}
    </section>
  );
}

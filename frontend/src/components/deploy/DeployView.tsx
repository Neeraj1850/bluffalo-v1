"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Arrow, Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmationSummary, type SummaryRow } from "@/components/ui/ConfirmationSummary";
import { Disclosure } from "@/components/ui/Disclosure";
import { IconButton } from "@/components/ui/IconButton";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { getPreset } from "@/lib/data/strategy";
import { blindsLabel, getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { useDeploy } from "./useDeploy";

export function DeployView() {
  const setup = useSetup();
  const table = getTable(setup.tableId);
  const preset = getPreset(setup.preset);
  const buyIn = setup.buyIn;
  const [agreed, setAgreed] = useState(false);

  const request = useMemo(
    () => ({
      tableId: setup.tableId,
      buyIn,
      preset: setup.preset,
      params: setup.params,
      limits: setup.limits,
    }),
    [setup.tableId, buyIn, setup.preset, setup.params, setup.limits],
  );
  const { fee, phase, deploy, retryFee } = useDeploy(request);

  // Balance at the moment of submitting, so the copy stays correct after it drops.
  const [committedFrom, setCommittedFrom] = useState<number | null>(null);
  const startBalance = committedFrom ?? setup.balance;

  // Coming back here with an agent already seated must never allow a second deploy.
  const alreadyDeployed = setup.agent.status === "deployed" && phase.status === "idle";
  const isPractice = table.mode === "practice";
  const pending = phase.status === "pending";
  const done = phase.status === "done" || alreadyDeployed;
  const insufficient = !isPractice && !done && startBalance < buyIn;
  const canSubmit = agreed && fee.status === "quoted" && !insufficient && !isPractice;

  const feeRow: SummaryRow =
    fee.status === "loading"
      ? { label: "Network fee", value: <span className="text-muted">Loading quote…</span> }
      : fee.status === "unavailable"
        ? {
            label: "Network fee",
            value: "Unavailable",
            note: (
              <button type="button" onClick={retryFee} className="underline underline-offset-2">
                Can&rsquo;t confirm until a quote loads · retry
              </button>
            ),
          }
        : { label: "Network fee", value: `≈ ${fee.quote.fee} NEAR`, note: "Network’s cost, not ours" };

  const rows: SummaryRow[] = [
    { label: "Table", value: table.name, note: table.seated !== null ? `${table.seated} / ${table.seats} seated` : undefined },
    { label: "Blinds", value: `${blindsLabel(table)} NEAR`, note: "two small forced bets per hand" },
    { label: "Agent balance", value: `${buyIn} NEAR`, note: "its whole stack" },
    { label: "Strategy", value: preset.label, note: preset.tag.split("·").pop()?.trim().toLowerCase() },
    { label: "Stop loss", value: `${setup.limits.stopLoss} NEAR`, note: "stops after losing this" },
    { label: "Take profit", value: `${setup.limits.takeProfit} NEAR`, note: "stops after winning this" },
    { label: "Max hands", value: String(setup.limits.maxHands), note: "then leaves the table" },
    feeRow,
  ];

  const onSubmit = async () => {
    if (!canSubmit || pending) return;
    setCommittedFrom(setup.balance);
    const result = await deploy();
    if (result) setup.markDeployed(result.agentAccount);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pb-8 pt-5 lg:pt-10">
      <div className="flex items-center justify-between">
        <IconButton href="/strategy" label="Back to strategy">
          {"←"}
        </IconButton>
        <MonoLabel tracking="wide">05 · Confirm deployment</MonoLabel>
        <span className="w-11" aria-hidden="true" />
      </div>

      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <h1 className="display text-[54px] leading-[0.88] tracking-[-0.06em] lg:text-[72px]">
          {done ? "your agent is in play." : "your agent is ready."}
        </h1>
        <p className="max-w-[300px] text-[15px] leading-normal text-muted">
          {done
            ? "Confirmed on the network. Grab a seat and watch."
            : "Check everything once. This uses real money."}
        </p>
      </header>

      <div className="flex items-stretch overflow-hidden rounded-card bg-sel text-onsel">
        <div className="flex flex-1 flex-col gap-1.5 px-5 py-[18px]">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Real money at risk</span>
          <span className="font-display text-[44px] font-bold leading-[0.95] tracking-[-0.05em]">
            {buyIn} NEAR
          </span>
          <span className="text-[13px] leading-[1.4]">
            {alreadyDeployed
              ? "Already moved from your playing balance to your agent’s account."
              : `Moved from your playing balance (${startBalance} → ${startBalance - buyIn}) to your agent’s account.`}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="flex w-16 items-center justify-center border-l border-dashed border-current font-display text-[40px]"
        >
          {"♠︎"}
        </div>
      </div>

      <ConfirmationSummary rows={rows} />

      <AnimatePresence mode="popLayout">
        {phase.status === "failed" && (
          <motion.div
            key="failed"
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1.5 rounded-card border-2 border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">! Couldn&rsquo;t start your agent</span>
            <span className="text-[14px] leading-normal text-muted">
              {phase.message} {phase.fundsMoved ? "Some funds may have moved — check your balance." : "No funds moved."}{" "}
              Your settings are saved — try again, or edit them first.
            </span>
          </motion.div>
        )}
        {done && (
          <motion.div
            key="done"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-1.5 rounded-card border border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              {alreadyDeployed ? "Your agent is already seated" : "Confirmed · your agent is seated"}
            </span>
            <span className="text-[14px] leading-normal text-muted">
              {buyIn} NEAR moved to your agent&rsquo;s account. You can stop it anytime from the game screen.
            </span>
          </motion.div>
        )}
        {insufficient && (
          <motion.div key="funds" role="alert" className="flex flex-col gap-1.5 rounded-card border-2 border-fg p-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">! Not enough playing balance</span>
            <span className="text-[14px] leading-normal text-muted">
              This table needs at least {buyIn} NEAR and you have {startBalance}. Add funds from another network, or pick
              a table with a smaller buy-in.
            </span>
          </motion.div>
        )}
        {isPractice && (
          <motion.div key="practice" role="status" className="flex flex-col gap-1.5 rounded-card border border-dashed border-fg p-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Practice table selected</span>
            <span className="text-[14px] leading-normal text-muted">
              The kitchen uses free chips — there&rsquo;s nothing to confirm. Pick a real-money table to play for real.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!done && !isPractice && !insufficient && (
        <Checkbox checked={agreed} onChange={setAgreed} disabled={pending}>
          I understand my agent can lose up to <strong>{buyIn} NEAR</strong> playing for real.
        </Checkbox>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        {done ? (
          <ButtonLink href="/game" trailing={<Arrow />}>
            Watch your agent play
          </ButtonLink>
        ) : isPractice || insufficient ? (
          <ButtonLink href="/lobby" trailing={<Arrow />}>
            Pick a table
          </ButtonLink>
        ) : (
          <Button onClick={onSubmit} disabled={!canSubmit} pending={pending} pendingLabel="Waiting for confirmation…">
            {phase.status === "failed" ? "Try again" : "Put my agent in play"}
          </Button>
        )}
        {!done && (
          <ButtonLink href="/strategy" variant="secondary" size="md">
            Edit strategy
          </ButtonLink>
        )}
      </div>

      <Disclosure
        hint="How?"
        className="border-t border-hair pt-1.5"
        summary={<span className="text-[13px] text-muted">Your agent runs in a sealed, tamper-proof environment.</span>}
      >
        <p className="text-[13px] leading-[1.55] text-muted">
          It runs inside a Trusted Execution Environment (TEE): hardware that keeps the agent&rsquo;s code and cards
          private, even from us. After each hand you can view a fair-play attestation — a signed record that the hand
          ran as stated.
        </p>
      </Disclosure>
    </main>
  );
}

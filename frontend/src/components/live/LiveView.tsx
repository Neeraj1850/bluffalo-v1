"use client";

import Link from "next/link";
import { useGoLive } from "@/components/strategy/useGoLive";
import { SessionList } from "@/components/sessions/SessionList";
import { ButtonLink } from "@/components/ui/Button";
import { Rise } from "@/components/ui/Rise";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";

/** Real-money play: is the agent at a table right now, and every live session so far. */
export function LiveView() {
  const { agent, preset, params } = useSetup();
  const { goLive } = useGoLive();
  const seated = agent.status === "deployed" ? getTable(agent.tableId) : null;
  const p = getPreset(preset);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 pb-12 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Real stakes · NEAR testnet</span>
        <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[88px] leading-[0.8] tracking-[-0.07em] lg:text-[128px]">
          live
        </Rise>
        <p className="max-w-lg text-[15px] leading-normal text-muted">
          Your agent plays the house agent for real GNEAR. Every deal is locked on NEAR before the cards come out, and
          you can stop any time — its chips come back to your balance.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        {seated ? (
          <>
            <StatusBadge kind="live" size="sm" className="self-start">
              Playing now
            </StatusBadge>
            <p className="font-display text-[24px] font-bold tracking-[-0.03em]">Your agent is at {seated.name}.</p>
            <p className="text-[14px] text-muted">It plays while the table is open. Open it to watch, or to stop.</p>
            <ButtonLink href="/game">Open the table</ButtonLink>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Your agent</span>
              <span className="font-display text-[26px] font-bold tracking-[-0.03em]">{p.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{strategyLine(params)}</span>
            </div>
            <button
              type="button"
              onClick={() => goLive()}
              className="flex h-14 items-center justify-between rounded-btn bg-fg px-5 font-display text-[17px] font-medium text-bg"
            >
              <span>Play live with this agent</span>
              <span aria-hidden="true">{"→"}</span>
            </button>
            <p className="text-[13px] text-muted">
              Not sure yet? <Link href="/practice" className="underline underline-offset-4">Practise it free first</Link>.
            </p>
          </>
        )}
      </section>

      <SessionList mode="real" />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useGoLive } from "@/components/strategy/useGoLive";
import { Rise } from "@/components/ui/Rise";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { signed } from "@/lib/format";
import type { HandMode } from "@/lib/poker/record";
import { EARLIER_RUN, runsOf, winRate } from "@/lib/poker/runs";
import { useHands } from "@/lib/store/useHands";
import { HandRow } from "./HandRow";

/** One play session: its record, the strategy that played it, and every hand with its decisions. */
export function SessionView({ mode, id, back }: { mode: HandMode; id: string; back: { href: string; label: string } }) {
  const hands = useHands(mode, id);
  const { goLive, live } = useGoLive();
  const [open, setOpen] = useState<number | null>(null);
  const run = hands && hands.length ? runsOf(hands)[0] : null;
  const when = run?.startedAt
    ? new Date(run.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-12 pt-6 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between gap-3">
        <Link href={back.href} className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-fg">
          {"←"} {back.label}
        </Link>
        <StatusBadge kind={mode === "practice" ? "practice" : "live"} size="sm">
          {mode === "practice" ? "Practice session · free chips" : "Live session · real money"}
        </StatusBadge>
      </div>

      {hands === null && <p className="text-[14px] text-muted">Loading the session…</p>}
      {hands?.length === 0 && <p className="text-[15px] text-muted">This session has no finished hands.</p>}

      {run && (
        <>
          <header className="flex flex-col gap-2">
            <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[96px] leading-[0.8] tracking-[-0.07em] lg:text-[140px]">
              {id === EARLIER_RUN ? "earlier" : run.agent ? getPreset(run.agent.preset).label.toLowerCase() : "session"}
            </Rise>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {run.table}
              {when && ` · ${when}`}
              {run.agent && ` · ${strategyLine(run.agent.params)}`}
            </p>
          </header>

          <StatGroup>
            <StatBox label="Result" value={signed(run.net)} emphasis="strong" />
            <StatBox label="Hands" value={run.hands} />
            <StatBox label={`Won · lost · ${Math.round(winRate(run) * 100)}%`} value={`${run.won} · ${run.lost}`} />
          </StatGroup>

          {run.agent && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => goLive(run.agent!)}
                className="flex h-14 items-center justify-between rounded-btn bg-fg px-5 font-display text-[17px] font-medium text-bg"
              >
                <span>{live ? "Your agent is live · watch it" : "Use this strategy for live play"}</span>
                <span aria-hidden="true">{"→"}</span>
              </button>
              <p className="text-[13px] leading-[1.45] text-muted">
                {live
                  ? "Stop your live agent first to switch strategies."
                  : `Plays like this session's ${getPreset(run.agent.preset).label}. You'll see exactly what's at risk before anything is charged.`}
              </p>
            </div>
          )}

          <section aria-labelledby="hands" className="flex flex-col">
            <div className="flex items-baseline justify-between pb-2">
              <h2 id="hands" className="font-mono text-[11px] uppercase tracking-[0.2em]">
                Every hand
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Tap a hand to see each move</span>
            </div>
            <ul className="flex flex-col">
              {hands!.map((h, i) => (
                <HandRow key={h.id} hand={h} number={i + 1} expanded={open === i} onToggle={() => setOpen(open === i ? null : i)} />
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

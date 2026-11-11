"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getPreset } from "@/lib/data/strategy";
import { ago, signed } from "@/lib/format";
import type { HandMode } from "@/lib/poker/record";
import { EARLIER_RUN, runHref, winRate, type Run } from "@/lib/poker/runs";
import { fetchRuns } from "@/services/agentApi";

type SessionListProps = {
  mode: HandMode;
  /** The session playing right now, marked "Now". */
  current?: string | null;
  /** Bump to reload (e.g. after each finished hand). */
  refresh?: number;
};

const EMPTY: Record<HandMode, string> = {
  practice: "No practice sessions yet. Press Start practice above — every run is saved here.",
  real: "No live sessions yet. Practise first, then tap “Use this strategy for live play” on a session you liked.",
};

/** Every session of one mode, newest first. Dashed = practice, solid = real money. */
export function SessionList({ mode, current, refresh = 0 }: SessionListProps) {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuns(mode)
      .then((r) => !cancelled && setRuns(r))
      .catch(() => !cancelled && setRuns((prev) => prev ?? []));
    return () => {
      cancelled = true;
    };
  }, [mode, refresh]);

  return (
    <section aria-labelledby={`${mode}-sessions`} className="flex flex-col gap-3">
      <h2 id={`${mode}-sessions`} className="font-display text-[28px] font-medium tracking-[-0.03em]">
        {mode === "practice" ? "practice sessions" : "live sessions"}
      </h2>
      {runs === null && <p className="text-[14px] text-muted">Loading your sessions…</p>}
      {runs?.length === 0 && (
        <p className="rounded-card border border-dashed border-border p-5 text-[14px] leading-normal text-muted">{EMPTY[mode]}</p>
      )}
      <ul className="flex flex-col gap-2.5">
        {runs?.map((r) => (
          <li key={r.id}>
            <Link
              href={runHref(mode, r.id)}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-card border p-4 transition-colors hover:border-fg",
                mode === "practice" ? "border-dashed" : "border-solid",
                r.id === current ? "border-fg" : "border-border",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-[18px] font-bold tracking-[-0.02em]">
                  {r.id === EARLIER_RUN ? "Earlier hands" : r.agent ? getPreset(r.agent.preset).label : "Your agent"}
                </span>
                {r.id === current && (
                  <span className="rounded-[4px] bg-fg px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bg">Now</span>
                )}
              </span>
              <span className="text-right font-display text-[20px] font-bold tabular">{signed(r.net)}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {r.table} · {r.hands} {r.hands === 1 ? "hand" : "hands"} · won {Math.round(winRate(r) * 100)}%
              </span>
              <span className="text-right font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{ago(r.endedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

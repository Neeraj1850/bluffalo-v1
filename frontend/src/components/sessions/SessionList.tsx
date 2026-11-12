"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getPreset } from "@/lib/data/strategy";
import { ago, signed } from "@/lib/format";
import type { HandMode } from "@/lib/poker/record";
import { EARLIER_RUN, runHref, winRate, type Run } from "@/lib/poker/runs";
import { inRange, type HistoryFilter } from "@/lib/history";
import { paginate, Pager } from "@/components/ui/Pager";
import { agentKey } from "@/lib/poker/tested";
import { fetchRuns } from "@/services/agentApi";

type SessionListProps = {
  mode: HandMode;
  /** The session playing right now, marked "Now". */
  current?: string | null;
  /** Bump to reload (e.g. after each finished hand). */
  refresh?: number;
  /** History's time range, applied to when each session last played. */
  filter?: HistoryFilter;
  /** Paginate with this many sessions per page (default: show all). */
  pageSize?: number;
  /** Only sessions played with this exact strategy (see agentKey). */
  agentKey?: string;
};

const EMPTY: Record<HandMode, string> = {
  practice:
    "No practice sessions yet. Test an agent for free on the Strategy page and every test run is saved here.",
  real: "No live sessions yet. Send your agent to a real-money table and each sitting is saved here.",
};

/** Every session of one mode, newest first. Dashed = practice, solid = real money. */
export function SessionList({
  mode,
  current,
  refresh = 0,
  filter = "all",
  pageSize,
  agentKey: only,
}: SessionListProps) {
  const [loaded, setRuns] = useState<Run[] | null>(null);
  const all =
    loaded?.filter((r) => inRange(r.endedAt, filter) && (!only || (r.agent && agentKey(r.agent.params) === only))) ??
    null;
  const [page, setPage] = useState(1);
  const shown = all && pageSize ? paginate(all, page, pageSize) : null;
  const runs = shown ? shown.items : all;

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
    <div className="flex flex-col gap-3">
      {runs === null && (
        <p className="text-[14px] text-muted">Loading your sessions…</p>
      )}
      {runs?.length === 0 && (
        <p className="rounded-card border border-dashed border-border p-5 text-[14px] leading-normal text-muted">
          {EMPTY[mode]}
        </p>
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
                  {r.id === EARLIER_RUN
                    ? "Earlier hands"
                    : r.agent
                      ? getPreset(r.agent.preset).label
                      : "Your agent"}
                </span>
                {r.id === current && (
                  <span className="rounded-[4px] bg-fg px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                    Now
                  </span>
                )}
              </span>
              <span className="text-right font-display text-[20px] font-bold tabular">
                {signed(r.net)}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {r.table} · {r.hands} {r.hands === 1 ? "hand" : "hands"} · won{" "}
                {Math.round(winRate(r) * 100)}%
              </span>
              <span className="text-right font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {ago(r.endedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown && <Pager page={shown.page} pages={shown.pages} onChange={setPage} />}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { getPreset } from "@/lib/data/strategy";
import { signed } from "@/lib/format";
import {
  HISTORY_FILTERS as FILTERS,
  inRange,
  type HistoryFilter as Filter,
} from "@/lib/history";
import { spring } from "@/lib/motion";
import { toHistory, type HandMode, type LiveHand } from "@/lib/poker/record";
import { useHands } from "@/lib/store/useHands";
import { netAfterRake, rakeOf } from "@/services/houseApi";
import { SessionList } from "@/components/sessions/SessionList";
import { paginate, Pager } from "@/components/ui/Pager";
import { HistoryRow } from "./HistoryRow";
import { replayHref } from "./ReplayView";

/** Rows per page in History. */
const PAGE_SIZE = 10;

const MODES: { key: HandMode; label: string }[] = [
  { key: "real", label: "Real money" },
  { key: "practice", label: "Practice" },
];

const agentTag = (h: LiveHand) =>
  h.agent
    ? `Agent · ${getPreset(h.agent.preset ?? "custom").label}`
    : undefined;

export function HistoryView({
  mode,
  view = "hands",
}: {
  mode: HandMode;
  view?: "hands" | "sessions";
}) {
  const router = useRouter();
  const played = useHands(mode);
  const archive = played
    ? played.map((h) => ({
        ...toHistory(h),
        net: netAfterRake(h),
        rake: rakeOf(h),
        at: h.at,
        tag: agentTag(h),
      }))
    : [];
  const [filter, setFilter] = useState<Filter>("all");
  const [chosen, setOpen] = useState<string | null | undefined>(undefined);
  // Open the newest hand until the player picks one (hands load after first render).
  const open = chosen === undefined ? (archive[0]?.id ?? null) : chosen;

  const hands = archive.filter((h) => inRange(h.at, filter));
  const [page, setPage] = useState(1);
  const shown = paginate(hands, page, PAGE_SIZE);
  const net = hands.reduce((a, h) => a + h.net, 0);
  const won = hands.filter((h) => h.net > 0).reduce((a, h) => a + h.net, 0);
  const lost = hands.filter((h) => h.net < 0).reduce((a, h) => a + h.net, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <MonoLabel tracking="wide">07 · The archive</MonoLabel>
          <div className="flex items-center gap-1 lg:hidden">
            <SignOutButton />
            <ThemeToggle />
          </div>
        </div>
        <Rise
          as="h1"
          feel="spring"
          className="display pb-[0.1em] text-[96px] leading-[0.8] tracking-[-0.07em] lg:text-[140px]"
        >
          history
        </Rise>
      </header>

      <div
        role="tablist"
        aria-label="Real or practice hands"
        className="grid grid-cols-2 gap-2"
      >
        {MODES.map((m) => {
          const on = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setOpen(undefined);
                router.replace(
                  `/history?mode=${m.key}${view === "sessions" ? "&view=sessions" : ""}`,
                  { scroll: false },
                );
              }}
              className={cn(
                "h-12 rounded-btn border font-display text-[16px] font-medium transition-colors",
                m.key === "practice" && "border-dashed",
                on
                  ? "border-fg bg-fg text-bg"
                  : "border-border text-fg hover:border-fg",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div role="tablist" aria-label="Time range" className="flex gap-2">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={cn(
                "relative h-10 rounded-chip border px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-200",
                on ? "border-sel text-onsel" : "border-border text-fg",
              )}
            >
              {on && (
                <motion.span
                  layoutId="history-filter"
                  transition={spring.indicator}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[7px] bg-sel"
                />
              )}
              <span className="relative">{f.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tablist" aria-label="Hands or sessions" className="flex gap-2">
        {(["hands", "sessions"] as const).map((v) => {
          const on = v === view;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() =>
                router.replace(
                  `/history?mode=${mode}${v === "sessions" ? "&view=sessions" : ""}`,
                  { scroll: false },
                )
              }
              className={cn(
                "relative h-10 rounded-chip border px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-200",
                on ? "border-sel text-onsel" : "border-border text-fg",
              )}
            >
              {on && (
                <motion.span
                  layoutId="history-view"
                  transition={spring.indicator}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[7px] bg-sel"
                />
              )}
              <span className="relative">
                {v === "hands" ? "Hands" : "Sessions"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="grid grid-cols-[1.4fr_1fr_1fr] items-end gap-3 border-b border-hair pb-5"
        aria-live="polite"
      >
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Net winnings
          </span>
          <AnimatedNumber
            value={net}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[44px] font-bold leading-[0.9] tracking-[-0.06em] tabular"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Won
          </span>
          <AnimatedNumber
            value={won}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[26px] font-medium tracking-[-0.04em] tabular"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Lost
          </span>
          <AnimatedNumber
            value={lost}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[26px] font-medium tracking-[-0.04em] tabular"
          />
        </div>
      </div>

      {view === "sessions" ? (
        <section aria-labelledby="sessions" className="flex flex-col">
          <div className="flex items-baseline justify-between pb-2">
            <h2
              id="sessions"
              className="font-mono text-[11px] uppercase tracking-[0.2em]"
            >
              Sessions
            </h2>
            <MonoLabel tracking="tight">Tap a session to open</MonoLabel>
          </div>
          <SessionList key={filter} mode={mode} filter={filter} pageSize={PAGE_SIZE} />
        </section>
      ) : (
        <section aria-labelledby="replay" className="flex flex-col">
          <div className="flex items-baseline justify-between pb-2">
            <h2
              id="replay"
              className="font-mono text-[11px] uppercase tracking-[0.2em]"
            >
              Hand replay
            </h2>
            <MonoLabel tracking="tight">
              {hands.length} hands · tap to open
            </MonoLabel>
          </div>
          {played === null && (
            <p className="py-4 text-[14px] text-muted">Loading your hands…</p>
          )}
          {played && archive.length === 0 && mode === "real" && (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-[15px] text-muted">
                No real hands yet. Send your agent to a real-money table and its
                hands show up here.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <ButtonLink href="/lobby" size="sm">
                  Pick a table
                </ButtonLink>
                <ButtonLink href="/strategy" variant="secondary" size="sm">
                  Test an agent first
                </ButtonLink>
              </div>
            </div>
          )}
          {played && archive.length === 0 && mode === "practice" && (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-[15px] text-muted">
                No practice hands yet. Test an agent for free on the Strategy
                page and every hand lands here.
              </p>
              <ButtonLink href="/strategy" size="sm" className="self-start">
                Test an agent
              </ButtonLink>
            </div>
          )}
          {played && archive.length > 0 && hands.length === 0 && (
            <p className="py-4 text-[14px] text-muted">
              No hands in this range — try “All”.
            </p>
          )}
          <ul className="flex flex-col">
            {shown.items.map((h, i) => (
              <HistoryRow
                key={h.id}
                hand={h}
                index={i}
                expanded={open === h.id}
                onToggle={() => setOpen(open === h.id ? null : h.id)}
                replayHref={replayHref(h.id, mode)}
                tag={mode === "practice" ? h.tag : undefined}
              />
            ))}
          </ul>
          <Pager page={shown.page} pages={shown.pages} onChange={setPage} />
        </section>
      )}
    </main>
  );
}

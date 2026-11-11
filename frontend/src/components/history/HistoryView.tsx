"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { cn } from "@/lib/cn";
import type { HistoryHand } from "@/lib/data/hands";
import { ButtonLink } from "@/components/ui/Button";
import { signed } from "@/lib/format";
import { spring } from "@/lib/motion";
import { toHistory } from "@/lib/poker/record";
import { useHands } from "@/lib/store/useHands";
import { netAfterRake, rakeOf } from "@/services/houseApi";
import { HistoryRow } from "./HistoryRow";

type Filter = "session" | "week" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "session", label: "This session" },
  { key: "week", label: "7 days" },
  { key: "all", label: "All" },
];

function inScope(scope: HistoryHand["scope"], filter: Filter) {
  return filter === "all" || scope === "session" || (filter === "week" && scope === "week");
}

export function HistoryView() {
  const played = useHands();
  // Only real, recorded hands — never demo data.
  const archive = played ? played.map((h) => ({ ...toHistory(h), net: netAfterRake(h), rake: rakeOf(h) })) : [];
  const [filter, setFilter] = useState<Filter>("session");
  const [chosen, setOpen] = useState<string | null | undefined>(undefined);
  // Open the newest hand until the player picks one (hands load after first render).
  const open = chosen === undefined ? (archive[0]?.id ?? null) : chosen;

  const hands = archive.filter((h) => inScope(h.scope, filter));
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

      <div role="tablist" aria-label="Session filter" className="flex gap-2">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.key)}
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

      <div className="grid grid-cols-[1.4fr_1fr_1fr] items-end gap-3 border-b border-hair pb-5" aria-live="polite">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Net winnings</span>
          <AnimatedNumber
            value={net}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[44px] font-bold leading-[0.9] tracking-[-0.06em] tabular"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Won</span>
          <AnimatedNumber
            value={won}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[26px] font-medium tracking-[-0.04em] tabular"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Lost</span>
          <AnimatedNumber
            value={lost}
            format={(n) => signed(n)}
            duration={0.4}
            className="font-display text-[26px] font-medium tracking-[-0.04em] tabular"
          />
        </div>
      </div>

      <section aria-labelledby="replay" className="flex flex-col">
        <div className="flex items-baseline justify-between pb-2">
          <h2 id="replay" className="font-mono text-[11px] uppercase tracking-[0.2em]">
            Hand replay
          </h2>
          <MonoLabel tracking="tight">{hands.length} hands · tap to open</MonoLabel>
        </div>
        {played === null && <p className="py-4 text-[14px] text-muted">Loading your hands…</p>}
        {played && archive.length === 0 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-[15px] text-muted">
              No real hands yet. Deploy your agent to a real-money table and its hands show up here.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ButtonLink href="/lobby" size="sm">
                Pick a table
              </ButtonLink>
              <ButtonLink href="/sandbox" variant="secondary" size="sm">
                Practice first
              </ButtonLink>
            </div>
          </div>
        )}
        {played && archive.length > 0 && hands.length === 0 && (
          <p className="py-4 text-[14px] text-muted">No hands in this range — try “All”.</p>
        )}
        <ul className="flex flex-col">
          {hands.map((h, i) => (
            <HistoryRow
              key={h.id}
              hand={h}
              index={i}
              expanded={open === h.id}
              onToggle={() => setOpen(open === h.id ? null : h.id)}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}

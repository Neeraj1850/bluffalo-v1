"use client";

import { AnimatePresence } from "framer-motion";
import { DecisionFeedRow } from "@/components/game/DecisionFeedRow";
import { Arrow, ButtonLink } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DEMO_HAND } from "@/lib/data/hands";
import { getPreset } from "@/lib/data/strategy";
import { getTable, PRACTICE_TABLE_ID } from "@/lib/data/tables";
import { percent, signed } from "@/lib/format";
import { useSetup } from "@/lib/store/setup";
import { PracticeTable } from "./PracticeTable";
import { usePracticeSim } from "./usePracticeSim";

export function SandboxView() {
  const { preset, tableId } = useSetup();
  const sim = usePracticeSim();
  const practice = getTable(PRACTICE_TABLE_ID);
  const chosen = getTable(tableId);
  // From the practice table, "for real" means picking a real-money table first.
  const realHref = chosen.mode === "real" ? "/deploy" : "/lobby";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-8 pt-5 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between">
        <IconButton href="/strategy" label="Back to strategy">
          {"←"}
        </IconButton>
        <StatusBadge kind="practice" className="h-8 px-3">
          Practice mode — no real money
        </StatusBadge>
      </div>

      <header className="flex items-end justify-between">
        <h1 className="display text-[64px] leading-[0.82] tracking-[-0.06em] lg:text-[96px]">
          the
          <br />
          kitchen
        </h1>
        <div className="text-right font-mono text-[11px] uppercase leading-[1.6] text-muted">
          {getPreset(preset).label} preset
          <br />
          Blinds {practice.blinds.small} / {practice.blinds.big}
          <br />
          Free chips
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div className="flex flex-col gap-5">
          <PracticeTable
            board={DEMO_HAND.board}
            shown={sim.boardShown}
            hole={DEMO_HAND.hole}
            thinking={sim.thinking}
          />

          <StatGroup variant="rule">
            <StatBox
              label="Net winnings*"
              value={
                <AnimatedNumber value={sim.stats.net} format={(n) => signed(n, 2)} duration={0.5} />
              }
            />
            <StatBox
              label="Win rate"
              value={sim.stats.hands ? percent(sim.stats.wins, sim.stats.hands) : "—"}
            />
            <StatBox label="Hands" value={sim.stats.hands} />
          </StatGroup>
        </div>

        <section aria-label="Agent decisions" className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between pb-2">
            <MonoLabel as="h2">What your agent did · newest first</MonoLabel>
            <button
              type="button"
              onClick={sim.togglePaused}
              aria-pressed={sim.paused}
              className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-chip border border-border px-2.5 font-mono text-[11px] uppercase"
            >
              {sim.paused ? "▶ Resume" : "❚❚ Pause"}
            </button>
          </div>
          <ol aria-live="polite" className="flex flex-col">
            <AnimatePresence initial={false}>
              {sim.thinking && <DecisionFeedRow key="thinking" thinking street="SIM" />}
              {sim.feed.map((d) => (
                <DecisionFeedRow key={`${d.index}-${d.action}`} {...d} />
              ))}
            </AnimatePresence>
          </ol>
        </section>
      </div>

      <div className="flex flex-col gap-2.5 lg:ml-auto lg:w-[min(100%,480px)]">
        <p className="font-mono text-[11px] leading-normal text-muted">
          * Simulated against a practice bot. Practice results don&rsquo;t predict real winnings.
        </p>
        <ButtonLink href={realHref} trailing={<Arrow />}>
          Start playing for real
        </ButtonLink>
        <p className="text-[13px] leading-[1.45] text-muted">
          {chosen.mode === "real"
            ? "Next you’ll review exactly what’s at risk. Nothing is charged until you confirm."
            : "Pick a real-money table first. Nothing is charged until you confirm."}
        </p>
      </div>
    </main>
  );
}

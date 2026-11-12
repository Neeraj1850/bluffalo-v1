"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { DecisionFeedRow } from "@/components/game/DecisionFeedRow";
import { PracticeTable } from "@/components/sandbox/PracticeTable";
import { usePracticeSim } from "@/components/sandbox/usePracticeSim";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { percent, signed } from "@/lib/format";
import { STOP_COPY } from "@/lib/poker/session";

type TestBenchProps = {
  /** This practice session: every hand dealt here is saved under it. */
  runId: string;
  onStop: () => void;
  /** After each finished practice hand (it's already archived by then). */
  onHand: () => void;
};

/** Free practice hands for the strategy on screen, right next to its sliders. */
export function TestBench({ runId, onStop, onHand }: TestBenchProps) {
  const sim = usePracticeSim(runId);
  const hands = sim.stats.hands;

  useEffect(() => {
    if (hands > 0) onHand();
  }, [hands, onHand]);

  return (
    <div className="flex flex-col gap-4">
      <PracticeTable
        board={sim.hand?.board ?? []}
        shown={sim.boardShown}
        hole={sim.hand?.hole ?? []}
        thinking={sim.thinking}
      />

      <StatGroup variant="rule">
        <StatBox
          label="This run"
          value={<AnimatedNumber value={sim.stats.net} format={(n) => signed(n, 1)} duration={0.5} />}
        />
        <StatBox label="Win rate" value={hands ? percent(sim.stats.wins, hands) : "—"} />
        <StatBox label="Hands" value={hands} />
      </StatGroup>

      {(sim.error || sim.stopped) && (
        <p role="status" className="flex items-center justify-between gap-3 text-[13px] text-muted">
          {sim.error ?? STOP_COPY[sim.stopped!]}
          {sim.error && (
            <button type="button" onClick={sim.retry} className="h-9 shrink-0 rounded-chip border border-border px-3">
              Try again
            </button>
          )}
        </p>
      )}

      <section aria-label="Agent decisions" className="flex flex-col">
        <div className="flex items-center justify-between gap-2 pb-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Why it moved · newest first</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={sim.togglePaused}
              aria-pressed={sim.paused}
              className="h-9 rounded-chip border border-border px-3 font-mono text-[11px] uppercase"
            >
              {sim.paused ? "▶ Resume" : "❚❚ Pause"}
            </button>
            <button
              type="button"
              onClick={onStop}
              className="h-9 rounded-chip border border-border px-3 font-mono text-[11px] uppercase"
            >
              Stop test
            </button>
          </div>
        </div>
        <ol aria-live="polite" className="flex max-h-[260px] flex-col overflow-y-auto">
          <AnimatePresence initial={false}>
            {sim.thinking && <DecisionFeedRow key="thinking" thinking street="SIM" />}
            {sim.feed.slice(0, 4).map((d) => (
              <DecisionFeedRow key={`${sim.hand?.id}-${d.index}`} {...d} />
            ))}
          </AnimatePresence>
        </ol>
      </section>
    </div>
  );
}

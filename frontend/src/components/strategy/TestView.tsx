"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DecisionFeedRow } from "@/components/game/DecisionFeedRow";
import { PracticeTable } from "@/components/sandbox/PracticeTable";
import { usePracticeSim } from "@/components/sandbox/usePracticeSim";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Arrow, ButtonLink } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPreset } from "@/lib/data/strategy";
import { getTable, PRACTICE_TABLE_ID } from "@/lib/data/tables";
import { percent, signed } from "@/lib/format";
import { newRunId } from "@/lib/poker/runs";
import { STOP_COPY } from "@/lib/poker/session";
import { setLiveLock } from "@/lib/store/liveLock";
import { leaveTable } from "@/services/agentApi";
import { useSetup } from "@/lib/store/setup";
import { useGoLive } from "./useGoLive";

type Stats = { hands: number; wins: number; net: number };

/**
 * Full-page practice test of the strategy on the Strategy tab. While it runs
 * the only control is Stop; the session and History open once it has ended.
 */
export function TestView() {
  const { preset, agent, hydrated } = useSetup();
  const { goLive } = useGoLive();
  // Each run is one practice session; a new id starts a fresh one.
  const [run, setRun] = useState<string>(newRunId);
  const [ended, setEnded] = useState<Stats | null>(null);
  const practice = getTable(PRACTICE_TABLE_ID);
  const liveTable = agent.status === "deployed" ? getTable(agent.tableId) : null;

  const header = (
    <>
      <div className="flex items-center justify-between">
        {ended || liveTable ? (
          <IconButton href="/strategy" label="Back to strategy">
            {"←"}
          </IconButton>
        ) : (
          <span className="h-11 w-11" aria-hidden="true" />
        )}
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
    </>
  );

  if (!hydrated) return null;

  // One table at a time: a live agent is already playing.
  if (liveTable) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-8 pt-5 lg:px-10 lg:pt-10">
        {header}
        <section className="flex flex-col gap-3 rounded-card border border-border p-5">
          <p className="font-display text-[22px] font-bold tracking-[-0.03em]">Your agent is playing live at {liveTable.name}.</p>
          <p className="text-[14px] text-muted">
            You can play one table at a time. Stop your live agent first, then come back to test.
          </p>
          <ButtonLink href="/game" trailing={<Arrow />}>
            Open the live table
          </ButtonLink>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-8 pt-5 lg:px-10 lg:pt-10">
      {header}
      {ended ? (
        <TestSummary
          stats={ended}
          run={run}
          onAgain={() => {
            setEnded(null);
            setRun(newRunId());
          }}
          onLive={() => goLive()}
        />
      ) : (
        <TestRun key={run} runId={run} onStop={setEnded} />
      )}
    </main>
  );
}

/** The running test: table, stats and decisions. Stop is the only control. */
function TestRun({ runId, onStop }: { runId: string; onStop: (s: Stats) => void }) {
  const sim = usePracticeSim(runId);

  // Lock the nav while the test runs, like a live table: History opens after it ends.
  useEffect(() => {
    setLiveLock(true);
    return () => {
      setLiveLock(false);
      void leaveTable(); // stopped: free the table for live play straight away
    };
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div className="flex flex-col gap-5">
        <PracticeTable
          board={sim.hand?.board ?? []}
          shown={sim.boardShown}
          hole={sim.hand?.hole ?? []}
          thinking={sim.thinking}
        />

        <StatGroup variant="rule">
          <StatBox
            label="Net winnings*"
            value={<AnimatedNumber value={sim.stats.net} format={(n) => signed(n, 2)} duration={0.5} />}
          />
          <StatBox label="Win rate" value={sim.stats.hands ? percent(sim.stats.wins, sim.stats.hands) : "—"} />
          <StatBox label="Hands" value={sim.stats.hands} />
        </StatGroup>

        <button
          type="button"
          onClick={() => onStop(sim.stats)}
          className="h-14 rounded-btn border border-fg font-display text-[17px] font-medium hover:bg-fg hover:text-bg"
        >
          Stop test
        </button>
      </div>

      <section aria-label="Agent decisions" className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between pb-2">
          <MonoLabel as="h2">What your agent did · newest first</MonoLabel>
        </div>
        {(sim.error || sim.stopped) && (
          <p className="flex items-center justify-between gap-3 border-b border-hair py-3 text-[13px] text-muted">
            {sim.error ?? STOP_COPY[sim.stopped!]}
            {sim.error && (
              <button type="button" onClick={sim.retry} className="h-9 shrink-0 rounded-chip border border-border px-3">
                Try again
              </button>
            )}
          </p>
        )}
        <ol aria-live="polite" className="flex flex-col">
          <AnimatePresence initial={false}>
            {sim.thinking && <DecisionFeedRow key="thinking" thinking street="SIM" />}
            {sim.feed.map((d) => (
              <DecisionFeedRow key={`${sim.hand?.id}-${d.index}`} {...d} />
            ))}
          </AnimatePresence>
        </ol>
      </section>
    </div>
  );
}

/** After Stop: how it went, and where to go next. */
function TestSummary({ stats, run, onAgain, onLive }: { stats: Stats; run: string; onAgain: () => void; onLive: () => void }) {
  return (
    <section className="flex flex-col gap-5">
      <StatGroup>
        <StatBox label="Net winnings*" value={signed(stats.net, 2)} emphasis="strong" />
        <StatBox label="Win rate" value={stats.hands ? percent(stats.wins, stats.hands) : "—"} />
        <StatBox label="Hands" value={stats.hands} />
      </StatGroup>
      <p className="font-mono text-[11px] leading-normal text-muted">
        * Simulated against a practice bot. Practice results don&rsquo;t predict real winnings.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {stats.hands > 0 && (
          <ButtonLink href={`/strategy/session/${run}`} trailing={<Arrow />}>
            See this test session
          </ButtonLink>
        )}
        <button type="button" onClick={onLive} className="h-14 rounded-btn border border-fg font-display text-[17px] font-medium">
          Play live with this agent
        </button>
        <button type="button" onClick={onAgain} className="h-12 rounded-btn border border-dashed border-border text-[15px]">
          Test again
        </button>
        <Link
          href="/history?mode=practice&view=sessions"
          className="flex h-12 items-center justify-center rounded-btn border border-border text-[15px]"
        >
          All practice sessions in History
        </Link>
      </div>
    </section>
  );
}

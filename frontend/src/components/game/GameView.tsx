"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DEMO_HAND } from "@/lib/data/hands";
import { getPreset } from "@/lib/data/strategy";
import { blindsLabel, getTable } from "@/lib/data/tables";
import { signed } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useSetup } from "@/lib/store/setup";
import { ActionPanel } from "./ActionPanel";
import { Board } from "./Board";
import { ChipBurst } from "./ChipBurst";
import { OpponentSeat } from "./OpponentSeat";
import { useHandPlayback } from "./useHandPlayback";

const hand = DEMO_HAND;

export function GameView() {
  const setup = useSetup();
  const play = useHandPlayback(hand);
  const [stopRequested, setStopRequested] = useState(false);
  const agent = setup.agent.status === "deployed" ? setup.agent : null;
  // Stays live for the rest of this hand even after a requested stop lands.
  const live = Boolean(agent) || stopRequested;
  const table = getTable(agent?.tableId ?? setup.tableId);
  const preset = getPreset(setup.preset);
  const startStack = agent?.buyIn ?? setup.buyIn;

  // A requested stop takes effect once the hand in progress has finished.
  const { stopAgent } = setup;
  useEffect(() => {
    if (stopRequested && play.done) stopAgent(hand.stackAfter);
  }, [stopRequested, play.done, stopAgent]);

  const s = play.current;
  const panel = {
    street: s.street,
    stepLabel: `${play.step + 1} / ${hand.steps.length}`,
    stepKey: play.step,
    action: s.action,
    reason: s.reason,
    done: play.done,
    onNext: play.next,
    onReplay: play.replay,
    onStop: live ? () => setStopRequested(true) : undefined,
    stopRequested,
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:h-auto lg:min-h-dvh lg:flex-row lg:flex-wrap">
      <main className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[999_1_560px]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hair px-5 pb-3 pt-4 lg:px-8 lg:py-5">
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
            <StatusBadge kind={live ? "live" : "practice"} size="sm" className="self-start lg:h-7 lg:self-auto">
              {live ? "Live · real money" : "Practice · simulated"}
            </StatusBadge>
            <span className="hidden font-display text-[28px] font-bold tracking-[-0.04em] lg:inline">
              {table.name}
            </span>
            <MonoLabel className="tracking-[0.14em] lg:text-[12px]">
              Blinds {blindsLabel(table)} · Hand {hand.id}
            </MonoLabel>
          </div>
          <div className="flex flex-col items-end lg:flex-row lg:items-baseline lg:gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted lg:text-[11px]">Pot</span>
            <motion.span
              key={s.pot}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.32, delay: 0.2 }}
              className="origin-right font-display text-[34px] font-bold leading-none tracking-[-0.05em] tabular lg:text-[48px]"
            >
              <AnimatedNumber value={s.pot} decimals={1} duration={0.5} />
              <span className="text-[14px] font-medium tracking-normal lg:hidden"> NEAR</span>
            </motion.span>
            <span className="hidden font-display text-[18px] font-medium lg:inline">NEAR</span>
          </div>
        </header>

        <section
          aria-label="Table"
          className="stage relative flex min-h-0 flex-1 flex-col items-center gap-3.5 px-4 pt-[18px] lg:min-h-[640px] lg:justify-between lg:gap-8 lg:px-6 lg:py-8"
        >
          <OpponentSeat
            name="house agent"
            status={s.opponent}
            thinking={s.opponent === "thinking"}
            cards={hand.opponentHole}
            revealed={s.street === "SHOWDOWN"}
            className="self-stretch lg:self-auto"
          />

          <Board cards={hand.board} shown={s.boardCount} className="pt-[30px] lg:pt-0" />

          <div className="pointer-events-none absolute left-1/2 top-[150px] -ml-3.5 lg:top-[40%]">
            <AnimatePresence>{play.potGrew && <ChipBurst key={play.step} />}</AnimatePresence>
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 pb-4 [--hole-card:92px] lg:mt-0 lg:pb-0 lg:[--hole-card:124px]">
            <div className="flex">
              <PlayingCard card={hand.hole[0]} width="var(--hole-card)" tilt={-8} deal="deal" style={{ translate: "10px 0" }} />
              <PlayingCard
                card={hand.hole[1]}
                width="var(--hole-card)"
                tilt={7}
                deal="deal"
                delay={0.08}
                style={{ translate: "-10px 6px" }}
              />
            </div>
            <MonoLabel tracking="normal" className="text-[10px] tracking-[0.18em] lg:text-[11px]">
              Your agent · {preset.label} · {live ? `Stack ${(play.done ? startStack + hand.net : startStack).toFixed(1)}` : "Practice chips"}
            </MonoLabel>
          </div>
        </section>

        <ActionPanel {...panel} className="lg:hidden" />
      </main>

      <aside
        aria-label="Agent decisions"
        className="hidden flex-col border-l border-hair lg:flex lg:max-w-full lg:flex-[1_1_340px]"
      >
        <ActionPanel {...panel} size="desktop" />

        <div className="flex flex-1 flex-col gap-1 px-6 py-5">
          <MonoLabel as="h2" className="mb-2">
            This hand
          </MonoLabel>
          <ol>
            <AnimatePresence initial={false}>
              {play.log.map((d) => (
                <motion.li
                  key={d.street + d.action}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={spring.indicator}
                  className="grid grid-cols-[76px_1fr] gap-3 border-b border-hair py-3"
                >
                  <span className="pt-[3px] font-mono text-[11px] text-muted">{d.street}</span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="font-display text-[17px] font-bold">{d.action}</span>
                    <span className="text-[13px] leading-[1.45] text-muted">house agent {d.opponent}</span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-hair px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">This hand</span>
            <span className="font-display text-[22px] font-medium">{play.done ? signed(hand.net) : "in play"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Stop loss</span>
            <span className="font-display text-[22px] font-medium">{"−"}{setup.limits.stopLoss}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Hands</span>
            <span className="font-display text-[22px] font-medium">1 / {setup.limits.maxHands}</span>
          </div>
          {live && (
            <button
              type="button"
              onClick={() => setStopRequested(true)}
              disabled={stopRequested}
              className="col-span-full h-12 rounded-btn border border-border text-[15px] disabled:opacity-60"
            >
              {stopRequested ? "Stopping after this hand…" : "Stop agent after this hand"}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

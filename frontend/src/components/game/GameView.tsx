"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { getPreset } from "@/lib/data/strategy";
import { blindsLabel, getTable, PRACTICE_STACK, PRACTICE_TABLE_ID } from "@/lib/data/tables";
import { signed } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { LiveHand } from "@/lib/poker/record";
import { STOP_COPY } from "@/lib/poker/session";
import { useSetup } from "@/lib/store/setup";
import { ActionPanel } from "./ActionPanel";
import { Board } from "./Board";
import { ChipBurst } from "./ChipBurst";
import { OpponentSeat } from "./OpponentSeat";
import { useHandPlayback } from "./useHandPlayback";
import { useLiveHands } from "./useLiveHands";

/** Pause on a finished hand before dealing the next. */
const NEXT_HAND_MS = 4500;

export function GameView() {
  const setup = useSetup();
  // Fixed for this sitting: stopping the agent mustn't turn a live hand into practice.
  // Without a deployed agent this screen watches practice hands.
  const [agent] = useState(() => (setup.agent.status === "deployed" ? setup.agent : null));
  const table = getTable(agent?.tableId ?? PRACTICE_TABLE_ID);
  const live = Boolean(agent);
  const loop = useLiveHands({
    tableId: table.id,
    params: setup.params,
    startStack: agent?.buyIn ?? PRACTICE_STACK,
    limits: setup.limits,
    bigBlind: table.blinds.big,
  });
  const [stopRequested, setStopRequested] = useState(false);

  if (!loop.hand) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <StatusBadge kind={live ? "live" : "practice"} size="sm">
          {live ? "Live · real money" : "Practice · simulated"}
        </StatusBadge>
        {loop.error ? (
          <>
            <p className="max-w-sm text-[15px] text-muted">{loop.error}</p>
            <button type="button" onClick={loop.next} className="h-11 rounded-btn border border-border px-4">
              Try again
            </button>
          </>
        ) : (
          <>
            <ThinkingDots />
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Committing the deal · shuffling
            </p>
          </>
        )}
      </main>
    );
  }

  return (
    <GameTable
      key={loop.hand.id}
      hand={loop.hand}
      live={live}
      tableName={table.name}
      blinds={blindsLabel(table)}
      presetLabel={getPreset(setup.preset).label}
      session={loop.session}
      maxHands={setup.limits.maxHands}
      stopLoss={setup.limits.stopLoss}
      stopRequested={stopRequested}
      stopped={loop.stopped ? STOP_COPY[loop.stopped] : null}
      dealing={loop.loading}
      onStop={live ? () => setStopRequested(true) : undefined}
      onDone={(hand) => {
        if (live) setup.recordHand(hand);
        const reason = loop.finish(hand);
        const leaving = reason || stopRequested;
        if (live && leaving) setup.stopAgent(hand.stackAfter);
        return !leaving;
      }}
      onNextHand={loop.next}
    />
  );
}

type GameTableProps = {
  hand: LiveHand;
  live: boolean;
  tableName: string;
  blinds: string;
  presetLabel: string;
  session: { hands: number; net: number; stack: number };
  maxHands: number;
  stopLoss: number;
  stopRequested: boolean;
  stopped: string | null;
  dealing: boolean;
  onStop?: () => void;
  /** Called once when playback ends; return true to keep playing. */
  onDone: (hand: LiveHand) => boolean;
  onNextHand: () => void;
};

function GameTable({
  hand,
  live,
  tableName,
  blinds,
  presetLabel,
  session,
  maxHands,
  stopLoss,
  stopRequested,
  stopped,
  dealing,
  onStop,
  onDone,
  onNextHand,
}: GameTableProps) {
  const play = useHandPlayback(hand);
  const [keepPlaying, setKeepPlaying] = useState<boolean | null>(null);

  // Settle the hand exactly once when playback reaches the result.
  const done = useRef(false);
  const settle = useRef(onDone);
  settle.current = onDone;
  useEffect(() => {
    if (!play.done || done.current) return;
    done.current = true;
    setKeepPlaying(settle.current(hand));
  }, [play.done, hand]);

  useEffect(() => {
    if (!keepPlaying) return;
    const id = setTimeout(onNextHand, NEXT_HAND_MS);
    return () => clearTimeout(id);
  }, [keepPlaying, onNextHand]);

  const s = play.current;
  const stack = play.done ? hand.stackAfter : session.stack;
  const panel = {
    street: s.street,
    stepLabel: `${play.step + 1} / ${hand.steps.length}`,
    stepKey: play.step,
    action: s.action,
    reason: stopped && play.done ? `${s.reason} ${stopped}` : s.reason,
    done: play.done,
    onNext: play.next,
    onReplay: play.replay,
    onStop,
    stopRequested,
    onNextHand: keepPlaying && !dealing ? onNextHand : undefined,
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:h-auto lg:min-h-dvh lg:flex-row lg:flex-wrap">
      <main className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[999_1_560px]">
        <header className="flex items-center justify-between gap-3 border-b border-hair px-5 pb-3 pt-4 lg:flex-wrap lg:gap-4 lg:px-8 lg:py-5">
          <div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
            <StatusBadge kind={live ? "live" : "practice"} size="sm" className="self-start lg:h-7 lg:self-auto">
              {live ? "Live · real money" : "Practice · simulated"}
            </StatusBadge>
            <span className="hidden font-display text-[28px] font-bold tracking-[-0.04em] lg:inline">
              {tableName}
            </span>
            <MonoLabel className="truncate tracking-[0.14em] lg:text-[12px]">
              Blinds {blinds} · <span className="hidden sm:inline">Hand </span>
              {hand.id}
            </MonoLabel>
          </div>
          <div className="flex shrink-0 flex-col items-end lg:flex-row lg:items-baseline lg:gap-2.5">
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
            name={live ? "house agent" : "practice bot"}
            status={s.opponent}
            thinking={s.opponent === "thinking"}
            cards={hand.opponentHole}
            revealed={s.street === "SHOWDOWN" && s.opponent.startsWith("showed")}
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
              Your agent · {presetLabel} · {live ? `Stack ${stack.toFixed(1)}` : "Practice chips"}
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
              {play.log.map((d, i) => (
                <motion.li
                  key={i}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={spring.indicator}
                  className="grid grid-cols-[76px_1fr] gap-3 border-b border-hair py-3"
                >
                  <span className="pt-[3px] font-mono text-[11px] text-muted">{d.street}</span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="font-display text-[17px] font-bold">{d.action}</span>
                    <span className="text-[13px] leading-[1.45] text-muted">
                      {d.opponent !== "—" && `${live ? "house agent" : "practice bot"} ${d.opponent}`}
                    </span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-hair px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Session</span>
            <span className="font-display text-[22px] font-medium">{signed(session.net)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Stop loss</span>
            <span className="font-display text-[22px] font-medium">{"−"}{stopLoss}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Hands</span>
            <span className="font-display text-[22px] font-medium">
              {session.hands + (play.done ? 0 : 1)} / {maxHands}
            </span>
          </div>
          {live && onStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={stopRequested}
              className="col-span-full h-12 rounded-btn border border-border text-[15px] disabled:opacity-60"
            >
              {stopRequested ? "Stopping after this hand…" : "Stop agent after this hand"}
            </button>
          )}
          {stopped && (
            <ButtonLink href="/results" size="md" className="col-span-full">
              See the result
            </ButtonLink>
          )}
        </div>
      </aside>
    </div>
  );
}

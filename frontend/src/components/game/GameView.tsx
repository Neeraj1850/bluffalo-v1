"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { getPreset } from "@/lib/data/strategy";
import {
  blindsLabel,
  getTable,
  PRACTICE_STACK,
  PRACTICE_TABLE_ID,
} from "@/lib/data/tables";
import { signed } from "@/lib/format";
import {
  netAfterRake,
  rakeLabel,
  rakeOf,
  stackAfterRake,
} from "@/services/houseApi";
import { spring } from "@/lib/motion";
import type { LiveHand } from "@/lib/poker/record";
import { newRunId, runHref } from "@/lib/poker/runs";
import { STOP_COPY } from "@/lib/poker/session";
import { setLiveLock } from "@/lib/store/liveLock";
import { useSetup } from "@/lib/store/setup";
import { stopAgent, txUrl } from "@/services/agentApi";
import { ActionPanel } from "./ActionPanel";
import { Board } from "./Board";
import { ChipBurst } from "./ChipBurst";
import { OpponentSeat } from "./OpponentSeat";
import { useHandPlayback } from "./useHandPlayback";
import { useLiveHands } from "./useLiveHands";

type ReturnState =
  | { status: "idle" }
  | { status: "returning" }
  | { status: "done"; tx: string; amount: number }
  | { status: "failed"; error: string };

/** Pause on a finished hand before dealing the next. */
const NEXT_HAND_MS = 4500;

export function GameView() {
  const setup = useSetup();
  // Wait for saved state: whether an agent is deployed decides the table.
  if (!setup.hydrated) return null;
  // Practice lives on the Strategy page; this screen is only ever the real table.
  if (setup.agent.status !== "deployed") return <NoAgent />;
  return <Sitting />;
}

function NoAgent() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-6">
      <StatusBadge kind="practice" size="sm" className="self-start">
        No agent at a table
      </StatusBadge>
      <h1 className="display text-[56px] leading-[0.85] tracking-[-0.06em] lg:text-[80px]">
        nothing live yet.
      </h1>
      <p className="text-[15px] leading-normal text-muted">
        Your agent plays here once you send it to a real-money table. Test a
        strategy for free first, then take it live from the Strategy page.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink href="/practice">Practise free</ButtonLink>
        <ButtonLink href="/live" variant="secondary">
          Play live
        </ButtonLink>
      </div>
    </main>
  );
}

function Sitting() {
  const setup = useSetup();
  // Fixed for this sitting: stopping the agent mustn't turn a live hand into practice.
  // Without a deployed agent this screen watches practice hands.
  const [agent] = useState(() =>
    setup.agent.status === "deployed" ? setup.agent : null,
  );
  const table = getTable(agent?.tableId ?? PRACTICE_TABLE_ID);
  const live = Boolean(agent);
  // ponytail: one session per sitting; reloading the table starts a new one.
  // Store the id on setup.agent if sessions should survive a reload.
  const [runId] = useState(newRunId);
  const loop = useLiveHands({
    tableId: table.id,
    params: setup.params,
    preset: setup.preset,
    runId,
    startStack: agent?.buyIn ?? PRACTICE_STACK,
    limits: setup.limits,
    bigBlind: table.blinds.big,
  });
  const [stopRequested, setStopRequested] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [returned, setReturned] = useState<ReturnState>({ status: "idle" });

  // Lock the nav while a live hand is in play — the agent has real stake committed,
  // so the player can't wander off mid-hand. Releases once the agent stops.
  useEffect(() => {
    // An error (e.g. the agent is out of chips) must never trap the player here.
    setLiveLock(live && !loop.stopped && !loop.error);
    return () => setLiveLock(false);
  }, [live, loop.stopped, loop.error]);

  // Take the agent off the table for real: return its on-chain balance to the wallet.
  const returnFunds = async () => {
    setReturned({ status: "returning" });
    try {
      const r = await stopAgent();
      setReturned({ status: "done", tx: r.tx, amount: r.amount });
    } catch (e) {
      setReturned({
        status: "failed",
        error:
          e instanceof Error ? e.message : "Couldn’t return the agent’s funds.",
      });
    }
  };

  // Also mid-session: if the service goes down, say so instead of leaving the last hand up.
  if (loop.closed) {
    return (
      <main
        role="alert"
        className="flex h-dvh flex-col items-center justify-center gap-4 px-5 text-center"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
          Table closed
        </span>
        <p className="max-w-sm text-[15px] text-muted">
          The house bankroll is too low to cover this table, so it isn&rsquo;t
          dealing new hands right now. Your agent&rsquo;s funds are safe in its
          account.
        </p>
        {live && returned.status !== "done" && (
          <button
            type="button"
            onClick={() => {
              setup.stopAgent();
              void returnFunds();
            }}
            disabled={returned.status === "returning"}
            className="h-11 rounded-btn border border-border px-4"
          >
            {returned.status === "returning"
              ? "Returning…"
              : "Return funds to my balance"}
          </button>
        )}
        {returned.status === "done" && (
          <p className="text-[13px] text-muted">
            {returned.amount} GNEAR returned.
          </p>
        )}
        {returned.status === "failed" && (
          <p className="text-[13px] text-muted">! {returned.error}</p>
        )}
        <Link
          href="/live"
          className="font-mono text-[11px] uppercase tracking-[0.12em] underline"
        >
          Pick another table
        </Link>
      </main>
    );
  }

  if (!loop.hand || loop.error) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <StatusBadge kind={live ? "live" : "practice"} size="sm">
          {live ? "Live · real money" : "Practice · simulated"}
        </StatusBadge>
        {loop.error ? (
          <>
            <p className="max-w-sm text-[15px] text-muted">{loop.error}</p>
            <button
              type="button"
              onClick={loop.retry}
              className="h-11 rounded-btn border border-border px-4"
            >
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
    <>
      <GameTable
        key={loop.hand.id}
        sessionHref={runHref("real", runId)}
        hand={loop.hand}
        live={live}
        tableName={table.name}
        blinds={blindsLabel(table)}
        presetLabel={getPreset(setup.preset).label}
        session={loop.session}
        maxHands={setup.limits.maxHands}
        stopLoss={setup.limits.stopLoss}
        stopRequested={stopRequested}
        returned={returned}
        onRetryReturn={() => void returnFunds()}
        stopped={loop.stopped ? STOP_COPY[loop.stopped] : null}
        dealing={loop.loading}
        onStop={live ? () => setConfirmStop(true) : undefined}
        onDone={(hand) => {
          const reason = loop.finish(hand);
          const leaving = reason || stopRequested;
          if (live && leaving) {
            setup.stopAgent();
            if (stopRequested) void returnFunds();
          }
          return !leaving;
        }}
        onNextHand={loop.next}
      />
      {confirmStop && (
        <ConfirmStop
          onCancel={() => setConfirmStop(false)}
          onConfirm={() => {
            setConfirmStop(false);
            setStopRequested(true);
          }}
        />
      )}
    </>
  );
}

/** Confirm stopping the agent: it keeps playing to the end of the current hand first. */
function ConfirmStop({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stop the agent"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-5 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <span className="font-display text-[20px] font-bold tracking-[-0.03em]">
          Stop the agent?
        </span>
        <p className="text-[14px] leading-normal text-muted">
          The agent won’t stop mid-hand. It finishes the hand it’s playing now,
          then sits out and returns its balance to your playing wallet. Proceed?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-btn border border-border text-[15px]"
          >
            Keep playing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 flex-1 rounded-btn border border-fg bg-fg text-[15px] text-bg"
          >
            Stop after this hand
          </button>
        </div>
      </div>
    </div>
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
  returned?: ReturnState;
  onRetryReturn?: () => void;
  stopped: string | null;
  dealing: boolean;
  onStop?: () => void;
  /** Called once when playback ends; return true to keep playing. */
  onDone: (hand: LiveHand) => boolean;
  onNextHand: () => void;
  /** This sitting's saved session: where "See this session" goes once play stops. */
  sessionHref?: string;
};

export function GameTable({
  hand,
  live,
  tableName,
  blinds,
  presetLabel,
  session,
  maxHands,
  stopLoss,
  stopRequested,
  returned = { status: "idle" },
  onRetryReturn,
  stopped,
  dealing,
  onStop,
  onDone,
  onNextHand,
  sessionHref,
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
  const stack = play.done ? stackAfterRake(hand) : session.stack;
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
    // Mid-session the table stays put; once play stops, the session page has every hand.
    doneLink:
      stopped && sessionHref
        ? { href: sessionHref, label: "See this session" }
        : null,
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:h-auto lg:min-h-dvh lg:flex-row lg:flex-wrap">
      <main className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[999_1_560px]">
        <header className="flex items-center justify-between gap-3 border-b border-hair px-5 pb-3 pt-4 lg:flex-wrap lg:gap-4 lg:px-8 lg:py-5">
          <div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
            <StatusBadge
              kind={live ? "live" : "practice"}
              size="sm"
              className="self-start lg:h-7 lg:self-auto"
            >
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
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted lg:text-[11px]">
              Pot
            </span>
            <motion.span
              key={s.pot}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.32, delay: 0.2 }}
              className="origin-right font-display text-[34px] font-bold leading-none tracking-[-0.05em] tabular lg:text-[48px]"
            >
              <AnimatedNumber value={s.pot} decimals={1} duration={0.5} />
              <span className="text-[14px] font-medium tracking-normal lg:hidden">
                {" "}
                GNEAR
              </span>
            </motion.span>
            <span className="hidden font-display text-[18px] font-medium lg:inline">
              GNEAR
            </span>
            {play.done && rakeOf(hand) > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted lg:text-[11px]">
                {rakeLabel(rakeOf(hand))} · Net {signed(netAfterRake(hand))}
              </span>
            )}
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
            revealed={
              s.street === "SHOWDOWN" && s.opponent.startsWith("showed")
            }
            className="self-stretch lg:self-auto"
          />

          <Board
            cards={hand.board}
            shown={s.boardCount}
            className="pt-[30px] lg:pt-0"
          />

          <div className="pointer-events-none absolute left-1/2 top-[150px] -ml-3.5 lg:top-[40%]">
            <AnimatePresence>
              {play.potGrew && <ChipBurst key={play.step} />}
            </AnimatePresence>
          </div>

          <div className="mt-auto flex flex-col items-center gap-5 pb-4 [--hole-card:92px] lg:mt-0 lg:gap-6 lg:pb-0 lg:[--hole-card:124px]">
            <div className="flex">
              <PlayingCard
                card={hand.hole[0]}
                width="var(--hole-card)"
                tilt={-8}
                deal="deal"
                style={{ translate: "10px 0" }}
              />
              <PlayingCard
                card={hand.hole[1]}
                width="var(--hole-card)"
                tilt={7}
                deal="deal"
                delay={0.08}
                style={{ translate: "-10px 6px" }}
              />
            </div>
            <MonoLabel
              tracking="normal"
              className="text-[10px] tracking-[0.18em] lg:text-[11px]"
            >
              Your agent · {presetLabel} ·{" "}
              {live ? `Stack ${stack.toFixed(1)}` : "Practice chips"}
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
                  <span className="pt-[3px] font-mono text-[11px] text-muted">
                    {d.street}
                  </span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-[17px] font-bold">
                        {d.action}
                      </span>
                      {d.chatId && (
                        <a
                          href={`/verify/${encodeURIComponent(d.chatId)}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Check this decision ran in a NEAR AI TEE"
                          className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted underline underline-offset-2 hover:text-fg"
                        >
                          TEE ↗
                        </a>
                      )}
                    </span>
                    <span className="text-[13px] leading-[1.45] text-muted">
                      {d.opponent !== "—" &&
                        `${live ? "house agent" : "practice bot"} ${d.opponent}`}
                    </span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-hair px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Session
            </span>
            <span className="font-display text-[22px] font-medium">
              {signed(session.net)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Stop loss
            </span>
            <span className="font-display text-[22px] font-medium">
              {"−"}
              {stopLoss}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Hands
            </span>
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
              {returned.status === "done"
                ? "Agent stopped"
                : returned.status === "returning"
                  ? "Returning funds…"
                  : stopRequested
                    ? "Stopping after this hand…"
                    : "Stop agent after this hand"}
            </button>
          )}
          {returned.status === "returning" && (
            <p role="status" className="col-span-full text-[13px] text-muted">
              Returning your agent’s balance to your playing balance…
            </p>
          )}
          {returned.status === "done" && (
            <p role="status" className="col-span-full text-[13px] text-muted">
              Agent stopped. Returned {returned.amount.toFixed(2)} GNEAR to your
              playing balance.{" "}
              <a
                href={txUrl(returned.tx)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                View the transaction ↗
              </a>
            </p>
          )}
          {returned.status === "failed" && (
            <p role="alert" className="col-span-full text-[13px] text-muted">
              ! {returned.error} Your funds are still in the agent’s account.{" "}
              {onRetryReturn && (
                <button
                  type="button"
                  onClick={onRetryReturn}
                  className="underline underline-offset-2"
                >
                  Try again
                </button>
              )}{" "}
              <Link href="/wallet" className="underline underline-offset-2">
                Open wallet
              </Link>
            </p>
          )}
          {stopped && (
            <ButtonLink
              href={sessionHref ?? "/live"}
              size="md"
              className="col-span-full"
            >
              See this session
            </ButtonLink>
          )}
        </div>
      </aside>
    </div>
  );
}

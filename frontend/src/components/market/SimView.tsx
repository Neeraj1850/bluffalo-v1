"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DecisionFeedRow } from "@/components/game/DecisionFeedRow";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { LineChart } from "@/components/ui/LineChart";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { signed } from "@/lib/format";
import { cast, simulateSteps, TICKS, type SimEvent, type SimSummary } from "@/lib/market/sim";
import { spring } from "@/lib/motion";
import { useSetup } from "@/lib/store/setup";
import { Segmented } from "./Segmented";

const SEED = "bluffalo-week";
/** A week at 1× takes about a minute. */
const TICKS_PER_SEC = TICKS / 60;
const ROWS_PER_SEC = 3;
const SPEEDS = [1, 10, 100] as const;

type Row = SimEvent & { key: number };

/** Ticks due after `dt` seconds at `speed`, carrying the fraction. Pure for tests. */
export function ticksDue(carry: number, dt: number, speed: number): { n: number; carry: number } {
  const total = carry + dt * TICKS_PER_SEC * speed;
  const n = Math.floor(total);
  return { n, carry: total - n };
}

/** A seeded week of the market, played in the browser. Practice bots, nothing on-chain. */
export function SimView() {
  const { params } = useSetup();
  const reduce = useReducedMotion();
  const [draft] = useState(params); // freeze the cast at mount
  const [strategies] = useState(() => cast(SEED, { draft }));
  const gen = useRef<ReturnType<typeof simulateSteps> | null>(null);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<SimSummary | null>(null);
  const queue = useRef<SimEvent[]>([]);
  const skip = useRef(false);
  const rowKey = useRef(0);

  useEffect(() => {
    gen.current = simulateSteps(SEED, { draft });
  }, [draft]);

  // Pull ticks per animation frame; ticker rows are released at most 3 a second.
  useEffect(() => {
    if (paused || summary) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let rowClock = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const due = ticksDue(carry, dt, speed);
      carry = due.carry;
      const n = skip.current ? TICKS : due.n;
      skip.current = false;
      const fresh: Record<string, number>[] = [];
      for (let i = 0; i < n && gen.current; i++) {
        const r = gen.current.next();
        if (r.done) {
          setSummary(r.value);
          break;
        }
        fresh.push(r.value.prices);
        queue.current.push(...r.value.events);
        setT(r.value.t + 1);
      }
      if (fresh.length)
        setSeries((s) => {
          const next = { ...s };
          for (const p of fresh) for (const [id, v] of Object.entries(p)) next[id] = [...(next[id] ?? []), v];
          return next;
        });
      rowClock += dt;
      if (rowClock >= 1 / ROWS_PER_SEC && queue.current.length) {
        rowClock = 0;
        const e = queue.current.at(-1)!;
        queue.current = []; // drop the backlog: the ticker shows the latest, never lags
        setRows((r) => [{ ...e, key: ++rowKey.current }, ...r].slice(0, 6));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [paused, summary, speed]);

  const latest = (id: string) => series[id]?.at(-1) ?? 0;
  const ranked = [...strategies].sort((a, b) => latest(b.id) - latest(a.id));
  const top = ranked.filter((s) => s.id !== "draft").slice(0, 5);
  const shown = [...top, ...strategies.filter((s) => s.id === "draft")];
  const change = (id: string) => latest(id) - (series[id]?.[0] ?? latest(id));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-16 pt-6 lg:px-10 lg:pt-10">
      <p role="note" className="rounded-card border border-dashed border-fg p-3 font-mono text-[11px] uppercase tracking-[0.12em]">
        Simulation: practice bots, rules-based play, no NEAR AI, nothing on-chain
      </p>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/market" className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-fg">
            {"←"} Market
          </Link>
          <h1 className="display text-[56px] leading-[0.85] tracking-[-0.06em] lg:text-[88px]">a week in 60 s</h1>
        </div>
        <div className="flex items-baseline gap-2">
          <MonoLabel>Day</MonoLabel>
          <span className="font-display text-[44px] font-bold tabular">
            <AnimatedNumber value={Math.min(7, Math.floor(t / 24) + 1)} decimals={0} />
          </span>
          <StatusBadge kind="practice" size="sm">
            Simulated
          </StatusBadge>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented id="sim-speed" role="radio" label="Speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ key: s, label: `${s}×` }))} />
        <Button size="sm" variant="secondary" disabled={!!summary} onClick={() => setPaused((p) => !p)}>
          {paused ? "Play" : "Pause"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!!summary}
          onClick={() => {
            skip.current = true;
            setPaused(false);
          }}
        >
          Skip to end
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 rounded-card border border-dashed border-border p-4">
              <span className="flex items-baseline justify-between">
                <span className="font-display text-[16px] font-bold">{s.label}</span>
                <span className="font-display text-[16px] tabular">{latest(s.id).toFixed(1)}</span>
              </span>
              <LineChart values={series[s.id] ?? []} height={40} dashed label={`${s.label} simulated price`} />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="sim-board">
            <MonoLabel as="h2" id="sim-board">
              Leaderboard
            </MonoLabel>
            <ol>
              {ranked.slice(0, 6).map((s, i) => (
                <motion.li
                  key={s.id}
                  layout={!reduce}
                  transition={spring.indicator}
                  className="grid grid-cols-[32px_1fr_auto_auto] items-baseline gap-3 border-b border-hair py-2.5"
                >
                  <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-[16px] font-bold">{s.label}</span>
                  <span className="font-display text-[16px] tabular">{latest(s.id).toFixed(1)}</span>
                  <span className="w-14 text-right font-mono text-[11px] tabular text-muted">{signed(change(s.id))}</span>
                </motion.li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="sim-ticker">
            <MonoLabel as="h2" id="sim-ticker">
              Trades
            </MonoLabel>
            <ul>
              <AnimatePresence initial={false}>
                {rows.map((e, i) => (
                  <DecisionFeedRow key={e.key} index={`D${Math.floor(e.t / 24) + 1}`} action={e.action} reason={e.reason} street={e.actor} latest={i === 0} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        </div>
      </div>

      {summary && (
        <section aria-labelledby="sim-end" className="flex flex-col gap-3">
          <MonoLabel as="h2" id="sim-end">
            End of the week · {strategies.find((s) => s.id === summary.ranking[0])?.label} on top
          </MonoLabel>
          <StatGroup>
            <StatBox label="Hands" value={summary.hands} />
            <StatBox label="Traded · GNEAR" value={summary.volume.toFixed(0)} />
            <StatBox label="Seats used" value={summary.burns} />
          </StatGroup>
          {summary.closed.length > 0 && (
            <p className="text-[13px] text-muted">Went broke and closed: {summary.closed.join(", ")}.</p>
          )}
        </section>
      )}
    </main>
  );
}

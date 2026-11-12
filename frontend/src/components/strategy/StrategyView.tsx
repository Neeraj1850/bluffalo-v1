"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { cn } from "@/lib/cn";
import { getPreset, LIMITS, PARAMS } from "@/lib/data/strategy";
import { DEFAULT_TABLE_ID, getTable } from "@/lib/data/tables";
import { newRunId } from "@/lib/poker/runs";
import { agentKey } from "@/lib/poker/tested";
import { useSetup } from "@/lib/store/setup";
import { PresetPicker } from "./PresetPicker";
import { RiskLimitRow } from "./RiskLimitRow";
import { StrategySlider } from "./StrategySlider";
import { TestBench } from "./TestBench";
import { TestedAgents } from "./TestedAgents";
import { useGoLive } from "./useGoLive";

const STEPS = ["Build", "Test free", "Play live"];

/** Build the agent, test it for free right here, then take it to a real table. */
export function StrategyView({ autoTest = false }: { autoTest?: boolean }) {
  const { tableId, preset, params, limits, agent, choosePreset, setParam, setLimit, applyAgent } = useSetup();
  const { goLive, live } = useGoLive();
  const key = agentKey(params);
  // The test bench plays the strategy it started with; changing it ends the run.
  const [testing, setTesting] = useState<string | null>(autoTest ? key : null);
  // Each test run is one practice session; its hands are saved under this id.
  const [run, setRun] = useState<string | null>(() => (autoTest ? newRunId() : null));
  const start = () => {
    setTesting(key);
    setRun(newRunId());
  };
  const changedMidTest = testing !== null && testing !== key;
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(() => setRefresh((n) => n + 1), []);

  const step = live ? 2 : testing && !changedMidTest ? 1 : 0;
  const realTable = getTable(getTable(tableId).mode === "real" ? tableId : DEFAULT_TABLE_ID);
  const liveTable = agent.status === "deployed" ? getTable(agent.tableId) : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-10 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          <Link href="/lobby" className="inline-flex min-h-11 items-center hover:text-fg">
            {"←"} Tables
          </Link>
          <span>03 · Build &amp; test your agent</span>
        </div>
        <Rise
          as="h1"
          feel="spring"
          className="display pb-[0.1em] text-[88px] leading-[0.8] tracking-[-0.07em] lg:text-[140px]"
        >
          strategy
        </Rise>
        <ol aria-label="Steps" className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex h-9 items-center gap-2 rounded-chip border px-3 font-mono text-[11px] uppercase tracking-[0.12em]",
                i === step ? "border-fg bg-fg text-bg" : "border-border text-muted",
                i === 1 && "border-dashed",
              )}
            >
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-start lg:gap-10">
        {/* 1 · Build */}
        <div className="flex flex-col gap-6">
          <PresetPicker value={preset} onChange={choosePreset} />

          <section
            aria-labelledby="fine-tune"
            className="flex flex-col rounded-card border border-border bg-surface px-5 pb-3 pt-1"
          >
            <div className="flex items-baseline justify-between pb-1 pt-4">
              <MonoLabel as="h2" id="fine-tune">
                Fine-tune · optional
              </MonoLabel>
              <span className="font-mono text-[11px] text-muted">moving any = custom</span>
            </div>
            {PARAMS.map((p) => (
              <StrategySlider
                key={p.key}
                label={p.label}
                value={params[p.key]}
                lo={p.lo}
                hi={p.hi}
                hint={p.hint(params[p.key])}
                onChange={(v) => setParam(p.key, v)}
              />
            ))}
          </section>

          <section aria-labelledby="limits" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between pb-2">
              <h2 id="limits" className="font-display text-[28px] font-medium tracking-[-0.03em]">
                safety limits
              </h2>
              <MonoLabel>Agent stops itself</MonoLabel>
            </div>
            <div className="rounded-card border border-border bg-surface">
              {LIMITS.map((l) => (
                <RiskLimitRow
                  key={l.key}
                  label={l.label}
                  hint={l.hint(limits[l.key])}
                  value={limits[l.key]}
                  step={l.step}
                  min={l.min}
                  max={l.max}
                  decLabel={l.decLabel}
                  incLabel={l.incLabel}
                  onChange={(v) => setLimit(l.key, v)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* 2 · Test free → 3 · Play live */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          <section
            id="test-bench"
            aria-labelledby="bench"
            className="flex scroll-mt-6 flex-col gap-4 rounded-card border border-dashed border-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="bench" className="whitespace-nowrap font-display text-[24px] font-bold tracking-[-0.03em]">
                test bench
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Free chips · vs practice bot
              </span>
            </div>

            {testing && !changedMidTest ? (
              <TestBench key={run!} runId={run!} onStop={() => setTesting(null)} onHand={bump} />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[14px] leading-normal text-muted">
                  {changedMidTest
                    ? "You changed the settings, so the test stopped. Test again to see how the new strategy does."
                    : `Watch your ${getPreset(preset).label} agent play free hands and read why it makes each move. Every hand is saved, so you can compare strategies below.`}
                </p>
                <button
                  type="button"
                  onClick={start}
                  className="h-12 rounded-btn border border-dashed border-fg font-display text-[16px] font-medium hover:bg-fg hover:text-bg"
                >
                  Test this agent · free
                </button>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {run && (
                    <Link href={`/strategy/session/${run}`} className="text-[13px] text-muted underline underline-offset-4 hover:text-fg">
                      Last test session {"→"}
                    </Link>
                  )}
                  <Link href="/history?mode=practice&view=sessions" className="text-[13px] text-muted underline underline-offset-4 hover:text-fg">
                    All practice sessions {"→"}
                  </Link>
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => goLive()}
              className="flex h-14 items-center justify-between rounded-btn bg-fg px-5 font-display text-[17px] font-medium text-bg"
            >
              <span>{live ? "Your agent is live · watch it" : "Play live with this agent"}</span>
              <span aria-hidden="true">{"→"}</span>
            </button>
            <p className="text-[13px] leading-[1.45] text-muted">
              {live && liveTable
                ? `It’s playing at ${liveTable.name}. Stop it from the Live screen before switching strategies.`
                : `Real money at ${realTable.name}. You’ll see exactly what’s at risk before anything is charged.`}
            </p>
          </div>
        </aside>
      </div>

      <TestedAgents
        params={params}
        refresh={refresh}
        live={live}
        onUse={(p, values) => {
          applyAgent(p, values);
          setTesting(null);
        }}
        onPlayLive={(p, values) => goLive({ preset: p, params: values })}
      />

      {/* Phones: the two next steps stay in reach above the bottom nav. */}
      <div className="sticky bottom-24 z-10 -mx-1 flex gap-2 rounded-card border border-border bg-bg/90 p-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => {
            start();
            document.getElementById("test-bench")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="h-12 flex-1 rounded-btn border border-dashed border-fg text-[15px]"
        >
          Test free
        </button>
        <button
          type="button"
          onClick={() => goLive()}
          className="h-12 flex-[1.4] rounded-btn bg-fg font-display text-[15px] font-medium text-bg"
        >
          {live ? "Watch live →" : "Play live →"}
        </button>
      </div>
    </main>
  );
}

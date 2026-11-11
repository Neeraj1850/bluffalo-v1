"use client";

import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { cn } from "@/lib/cn";
import { getPreset, LIMITS, PARAMS } from "@/lib/data/strategy";
import { DEFAULT_TABLE_ID, getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { PresetPicker } from "./PresetPicker";
import { RiskLimitRow } from "./RiskLimitRow";
import { StrategySlider } from "./StrategySlider";
import { useGoLive } from "./useGoLive";

const STEPS = ["Build", "Practise free", "Play live"];

/** Build the agent here; practise it free on the Practice tab, then take it live. */
export function StrategyView() {
  const { tableId, preset, params, limits, agent, choosePreset, setParam, setLimit } = useSetup();
  const { goLive, live } = useGoLive();
  const router = useRouter();

  const step = live ? 2 : 0;
  const realTable = getTable(getTable(tableId).mode === "real" ? tableId : DEFAULT_TABLE_ID);
  const liveTable = agent.status === "deployed" ? getTable(agent.tableId) : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-10 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          <span>Your agent</span>
          <span>Build · then practise · then play</span>
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

        {/* Next steps */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          <section className="flex flex-col gap-3 rounded-card border border-dashed border-border bg-surface p-5">
            <h2 className="font-display text-[24px] font-bold tracking-[-0.03em]">try it free</h2>
            <p className="text-[14px] leading-normal text-muted">
              Watch your {getPreset(preset).label} agent play free hands and read why it makes each move. Every run is
              saved as a session you can look back on.
            </p>
            <ButtonLink href="/practice" variant="secondary">
              Practise it · free
            </ButtonLink>
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


      {/* Phones: the two next steps stay in reach above the bottom nav. */}
      <div className="sticky bottom-24 z-10 -mx-1 flex gap-2 rounded-card border border-border bg-bg/90 p-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => router.push("/practice")}
          className="h-12 flex-1 rounded-btn border border-dashed border-fg text-[15px]"
        >
          Practise free
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

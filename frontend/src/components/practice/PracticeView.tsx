"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { SessionList } from "@/components/sessions/SessionList";
import { Rise } from "@/components/ui/Rise";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { newRunId, runHref } from "@/lib/poker/runs";
import { useSetup } from "@/lib/store/setup";
import { TestBench } from "./TestBench";

/** Practise the current strategy with free chips. Each Start → Stop is saved as a session. */
export function PracticeView() {
  const { preset, params } = useSetup();
  // The practice table mounts only while a session runs: it deals as soon as it mounts.
  const [run, setRun] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(() => setRefresh((n) => n + 1), []);
  const p = getPreset(preset);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 pb-12 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Free chips · nothing to lose</span>
        <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[88px] leading-[0.8] tracking-[-0.07em] lg:text-[128px]">
          practice
        </Rise>
        <p className="max-w-lg text-[15px] leading-normal text-muted">
          Your agent plays poker for you against a practice bot. Watch each move and read why it made it. When you
          stop, the whole run is saved as a session.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-dashed border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Your agent</span>
            <span className="font-display text-[26px] font-bold tracking-[-0.03em]">{p.label}</span>
            <span className="text-[14px] text-muted">
              {preset === "custom" ? "Your own mix of settings, tuned on the Strategy tab." : p.description}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{strategyLine(params)}</span>
          </div>
          <Link
            href="/strategy"
            className="inline-flex h-10 items-center rounded-chip border border-border px-3 font-mono text-[11px] uppercase tracking-[0.12em] hover:border-fg"
          >
            Change
          </Link>
        </div>

        {run ? (
          <>
            <TestBench key={run} runId={run} onStop={() => setRun(null)} onHand={bump} />
            <Link href={runHref("practice", run)} className="self-start text-[13px] text-muted underline underline-offset-4 hover:text-fg">
              Open this session {"→"}
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setRun(newRunId())}
            className="h-14 rounded-btn bg-fg font-display text-[17px] font-medium text-bg"
          >
            Start practice
          </button>
        )}
      </section>

      <SessionList mode="practice" current={run} refresh={refresh} />
    </main>
  );
}

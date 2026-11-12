"use client";

import Link from "next/link";
import { YourLicenses } from "@/components/market/YourLicenses";
import { ButtonHint, ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { LIMITS, PARAMS } from "@/lib/data/strategy";
import { getTable } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { PresetPicker } from "./PresetPicker";
import { RiskLimitRow } from "./RiskLimitRow";
import { StrategySlider } from "./StrategySlider";

export function StrategyView() {
  const { tableId, preset, params, limits, license, choosePreset, setParam, setLimit } = useSetup();
  const table = getTable(tableId);
  const isPractice = table.mode === "practice";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 pt-6 lg:h-dvh lg:gap-4 lg:overflow-hidden lg:px-10 lg:pb-6 lg:pt-8">
      <PageHeader
        eyebrow={
          <>
            <Link href="/lobby" className="hover:text-fg">
              {"←"} {table.name}
            </Link>
            <span aria-hidden="true">·</span>
            <span>Tune your agent</span>
          </>
        }
        title="strategy"
        description="Pick a personality. Your agent plays every hand with it. You can fine-tune later."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:gap-6">
        <div className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
          <PresetPicker value={preset} onChange={choosePreset} />
          <YourLicenses />
        </div>

        <div className="flex flex-col gap-6 lg:contents">
          <div className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
          {license ? (
            <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5">
              <MonoLabel as="h2">Licensed · {license.name}</MonoLabel>
              <p className="text-[14px] leading-normal text-muted">
                Settings sealed by the creator. Your safety limits still apply. Pick a personality to go back to your own.
              </p>
            </section>
          ) : (
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
          )}
          </div>

          <div className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
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

          <div className="flex flex-col gap-3">
            <ButtonLink href="/strategy/test" trailing={<ButtonHint>Free {"→"}</ButtonHint>}>
              Test this agent
            </ButtonLink>
            {isPractice ? (
              <ButtonLink
                href="/lobby"
                variant="secondary"
                trailing={<ButtonHint muted>Pick a table</ButtonHint>}
              >
                Play for real money
              </ButtonLink>
            ) : (
              <ButtonLink
                href="/deploy"
                variant="secondary"
                trailing={<ButtonHint muted>Real money · review first</ButtonHint>}
              >
                Start playing
              </ButtonLink>
            )}
          </div>
          </div>
        </div>
      </div>
    </main>
  );
}

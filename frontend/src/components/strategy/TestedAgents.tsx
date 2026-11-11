"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getPreset, PARAMS, type PresetKey, type StrategyParams } from "@/lib/data/strategy";
import { signed } from "@/lib/format";
import { agentKey, winRate, type TestedAgent } from "@/lib/poker/tested";
import { fetchTestedAgents } from "@/services/agentApi";

type TestedAgentsProps = {
  /** The strategy on screen, to mark it "current". */
  params: StrategyParams;
  /** Bump to reload (e.g. after a practice hand). */
  refresh: number;
  onUse: (preset: PresetKey, params: StrategyParams) => void;
  onPlayLive: (preset: PresetKey, params: StrategyParams) => void;
  /** An agent is already at a real table. */
  live: boolean;
};

function ago(at: number, now = Date.now()) {
  if (!at) return "earlier";
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const settings = (p: StrategyParams) => PARAMS.map(({ key, label }) => `${label.split(" ")[0]} ${p[key]}`).join(" · ");

/** Every strategy tested in practice, with its record — pick one and take it live. */
export function TestedAgents({ params, refresh, onUse, onPlayLive, live }: TestedAgentsProps) {
  const [agents, setAgents] = useState<TestedAgent[] | null>(null);
  const current = agentKey(params);

  useEffect(() => {
    let cancelled = false;
    fetchTestedAgents()
      .then((a) => !cancelled && setAgents(a))
      .catch(() => !cancelled && setAgents((prev) => prev ?? []));
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return (
    <section aria-labelledby="tested" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="tested" className="whitespace-nowrap font-display text-[28px] font-medium tracking-[-0.03em]">
          tested agents
        </h2>
        <Link
          href="/history?mode=practice"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:text-fg"
        >
          Every practice hand {"→"}
        </Link>
      </div>

      {agents === null && <p className="text-[14px] text-muted">Loading your tested agents…</p>}
      {agents?.length === 0 && (
        <p className="rounded-card border border-dashed border-border p-5 text-[14px] leading-normal text-muted">
          Nothing tested yet. Press <strong className="text-fg">Test this agent</strong>: it plays free hands against
          the practice bot, and its record lands here so you can compare strategies before risking anything.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {agents?.map((a) => {
          const isCurrent = a.key === current;
          return (
            <li
              key={a.key}
              className={cn(
                "flex flex-col gap-4 rounded-card border border-dashed p-5",
                isCurrent ? "border-fg" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-[22px] font-bold tracking-[-0.03em]">
                      {getPreset(a.preset).label}
                    </span>
                    {isCurrent && (
                      <span className="rounded-[4px] bg-fg px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                        On screen
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{settings(a.params)}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  {ago(a.lastAt)}
                </span>
              </div>

              <dl className="grid grid-cols-4 gap-2">
                {[
                  ["Hands", String(a.hands)],
                  ["Won", `${a.won}`],
                  ["Win rate", `${Math.round(winRate(a) * 100)}%`],
                  ["Net", signed(a.net, 1)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                    <dd className="font-display text-[20px] font-medium tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12px] text-muted">
                {signed(a.hands ? a.net / a.hands : 0, 2)} per hand · {a.lost} lost
                {a.hands < 10 && " · test a few more hands for a fair read"}
              </p>

              <div className="flex gap-2">
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onUse(a.preset, a.params)}
                    className="h-11 flex-1 rounded-btn border border-border text-[14px] hover:border-fg"
                  >
                    Use these settings
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onPlayLive(a.preset, a.params)}
                  className="h-11 flex-1 rounded-btn bg-fg font-display text-[15px] font-medium text-bg"
                >
                  {live ? "Agent is live · watch" : "Play live with this agent →"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SessionList } from "@/components/sessions/SessionList";
import { useGoLive } from "@/components/strategy/useGoLive";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { signed } from "@/lib/format";
import { winRate, type TestedAgent } from "@/lib/poker/tested";
import { useSetup } from "@/lib/store/setup";
import { fetchTestedAgents } from "@/services/agentApi";

/** One tested agent: its practice record, and every practice and live session it played. */
export function AgentProfileView({ agentKey }: { agentKey: string }) {
  const [agent, setAgent] = useState<TestedAgent | null | undefined>(undefined);
  const { applyAgent } = useSetup();
  const { goLive, live } = useGoLive();
  const [used, setUsed] = useState(false);

  useEffect(() => {
    fetchTestedAgents()
      .then((list) => setAgent(list.find((a) => a.key === agentKey) ?? null))
      .catch(() => setAgent(null));
  }, [agentKey]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-12 pt-6 lg:px-10 lg:pt-10">
      <Link href="/profile" className="inline-flex min-h-11 items-center self-start font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-fg">
        {"←"} Profile
      </Link>

      {agent === undefined && <p className="text-[14px] text-muted">Loading the agent…</p>}
      {agent === null && <p className="text-[15px] text-muted">This agent isn’t in your tested agents.</p>}

      {agent && (
        <>
          <header className="flex flex-col gap-2">
            <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[96px] leading-[0.8] tracking-[-0.07em] lg:text-[140px]">
              {getPreset(agent.preset).label.toLowerCase()}
            </Rise>
            <MonoLabel tracking="tight">{strategyLine(agent.params)}</MonoLabel>
          </header>

          <StatGroup>
            <StatBox label="Practice net" value={signed(agent.net, 1)} emphasis="strong" />
            <StatBox label="Hands" value={agent.hands} />
            <StatBox label="Win rate" value={`${Math.round(winRate(agent) * 100)}%`} />
          </StatGroup>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => goLive({ preset: agent.preset, params: agent.params })}
              className="h-14 rounded-btn bg-fg font-display text-[17px] font-medium text-bg"
            >
              {live ? "Your agent is live · watch it" : "Play live with this agent"}
            </button>
            <button
              type="button"
              onClick={() => {
                applyAgent(agent.preset, agent.params);
                setUsed(true);
              }}
              className="h-14 rounded-btn border border-border text-[15px] hover:border-fg"
            >
              {used ? "Loaded on the Strategy tab ✓" : "Use these settings"}
            </button>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]">Practice sessions</h2>
            <SessionList mode="practice" agentKey={agentKey} pageSize={10} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]">Live sessions</h2>
            <SessionList mode="real" agentKey={agentKey} pageSize={10} />
          </section>
        </>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { ago, signed } from "@/lib/format";
import { winRate, type TestedAgent } from "@/lib/poker/tested";
import { useWallet } from "@/lib/store/useWallet";
import { fetchTestedAgents } from "@/services/agentApi";

/** The player: their balance, and every agent they've tested with its record. */
export function ProfileView() {
  const wallet = useWallet();
  const [agents, setAgents] = useState<TestedAgent[] | null>(null);

  useEffect(() => {
    fetchTestedAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-12 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <MonoLabel tracking="wide">Your account</MonoLabel>
          <div className="flex items-center gap-1 lg:hidden">
            <SignOutButton />
            <ThemeToggle />
          </div>
        </div>
        <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[96px] leading-[0.8] tracking-[-0.07em] lg:text-[140px]">
          profile
        </Rise>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-border p-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Playing balance</span>
          <span className="font-display text-[40px] font-bold leading-none tracking-[-0.05em] tabular">
            {wallet.wallet ? wallet.wallet.balance.toFixed(2) : "—"}
            <span className="ml-2 font-display text-[18px] font-medium">GNEAR</span>
          </span>
          {wallet.wallet && (
            <span className="max-w-[260px] truncate font-mono text-[10px] text-muted">{wallet.wallet.account}</span>
          )}
        </div>
        <ButtonLink href="/wallet" variant="secondary" size="sm">
          Wallet
        </ButtonLink>
      </section>

      <section aria-labelledby="tested" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="tested" className="font-display text-[28px] font-medium tracking-[-0.03em]">
            tested agents
          </h2>
          <MonoLabel tracking="tight">Tap an agent for its history</MonoLabel>
        </div>
        {agents === null && <p className="text-[14px] text-muted">Loading your agents…</p>}
        {agents?.length === 0 && (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-border p-5">
            <p className="text-[14px] text-muted">No tested agents yet. Test one for free on the Strategy tab.</p>
            <ButtonLink href="/strategy" size="sm" className="self-start">
              Build an agent
            </ButtonLink>
          </div>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {agents?.map((a) => (
            <li key={a.key}>
              <Link
                href={`/profile/agent/${a.key}`}
                className="flex flex-col gap-4 rounded-card border border-dashed border-border p-5 transition-colors hover:border-fg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-display text-[22px] font-bold tracking-[-0.03em]">{getPreset(a.preset).label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{strategyLine(a.params)}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{ago(a.lastAt)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    ["Hands", String(a.hands)],
                    ["Win rate", `${Math.round(winRate(a) * 100)}%`],
                    ["Net", signed(a.net, 1)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                      <dd className="font-display text-[20px] font-medium tabular">{v}</dd>
                    </div>
                  ))}
                </dl>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">History {"→"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

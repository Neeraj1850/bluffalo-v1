"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PublishSheet } from "@/components/market/PublishSheet";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { ago, signed } from "@/lib/format";
import { winRate, type TestedAgent } from "@/lib/poker/tested";
import { useWallet } from "@/lib/store/useWallet";
import { fetchTestedAgents } from "@/services/agentApi";

/** The player: their balance, and every agent they've tested with its record. */
export function ProfileView() {
  const wallet = useWallet();
  const [agents, setAgents] = useState<TestedAgent[] | null>(null);
  const [listing, setListing] = useState<TestedAgent | null>(null);

  useEffect(() => {
    fetchTestedAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 pb-8 pt-6 lg:h-dvh lg:gap-4 lg:overflow-hidden lg:px-10 lg:pb-6 lg:pt-8">
      <PageHeader
        eyebrow="Your account · NEAR testnet"
        title="profile"
        description="Every agent you have tested, with its record. List one on the market to earn from its seats."
        actions={
          <>
            <SignOutButton />
            <ThemeToggle />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
      <section className="flex flex-col gap-4 rounded-card border border-border p-5">
        <div className="flex flex-col gap-1">
          <MonoLabel>Playing balance</MonoLabel>
          <span className="font-display text-[40px] font-bold leading-none tracking-[-0.05em] tabular">
            {wallet.wallet ? wallet.wallet.balance.toFixed(2) : "—"}
            <span className="ml-2 font-display text-[18px] font-medium">GNEAR</span>
          </span>
          {wallet.wallet && <span className="truncate font-mono text-[10px] text-muted">{wallet.wallet.account}</span>}
        </div>
        <ButtonLink href="/wallet" variant="secondary" size="sm">
          Wallet
        </ButtonLink>
      </section>
      {agents && agents.length > 0 && (
        <dl className="grid grid-cols-3 gap-2 rounded-card border border-dashed border-border p-4">
          {[
            ["Agents", String(agents.length)],
            ["Hands", String(agents.reduce((n, a) => n + a.hands, 0))],
            ["Net", signed(agents.reduce((n, a) => n + a.net, 0), 1)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{k}</dt>
              <dd className="font-display text-[20px] font-medium tabular">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      </aside>

      <section aria-labelledby="tested" className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
        <div className="flex items-baseline justify-between">
          <h2 id="tested" className="font-display text-[28px] font-medium tracking-[-0.03em]">
            tested agents
          </h2>
          <MonoLabel tracking="tight">Tap an agent for its history</MonoLabel>
        </div>
        {agents === null && (
          <div role="status" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <span className="sr-only">Loading your agents…</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[190px]" />
            ))}
          </div>
        )}
        {agents?.length === 0 && (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-border p-5">
            <p className="text-[14px] text-muted">No tested agents yet. Test one for free on the Strategy tab.</p>
            <ButtonLink href="/strategy" size="sm" className="self-start">
              Build an agent
            </ButtonLink>
          </div>
        )}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents?.map((a) => (
            <li key={a.key} className="flex flex-col gap-1">
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
              <Button size="sm" variant="ghost" onClick={() => setListing(a)}>
                List on market
              </Button>
            </li>
          ))}
        </ul>
      </section>
      </div>
      {listing && (
        <PublishSheet open onClose={() => setListing(null)} agent={{ name: getPreset(listing.preset).label, params: listing.params }} />
      )}
    </main>
  );
}

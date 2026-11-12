"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { TABLES } from "@/lib/data/tables";
import { signed } from "@/lib/format";
import type { MarketStrategy } from "@/lib/market/types";
import { useSetup } from "@/lib/store/setup";
import { useTables } from "@/lib/store/useTables";
import { fetchMarket } from "@/services/agentApi";
import { HouseRules } from "@/components/house/HouseRules";
import { leaderboard } from "@/components/market/filters";
import { BalanceChip } from "./BalanceChip";
import { TableCard } from "./TableCard";

export function LobbyView() {
  const { selectTable } = useSetup();
  const tables = useTables();
  const open = tables.status ? Object.values(tables.status).filter((t) => t.open).length : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 pt-6 lg:h-dvh lg:gap-4 lg:overflow-hidden lg:px-10 lg:pb-6 lg:pt-8">
      <PageHeader
        eyebrow="Pick a seat · NEAR testnet"
        title="tables"
        description="Practice tables use free chips. Real-money tables play the house for GNEAR and always ask first."
        actions={<BalanceChip />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <motion.ul
          className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start lg:min-h-0 lg:content-start lg:gap-4 lg:overflow-y-auto"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } }}
        >
          {TABLES.map((t) => (
            <motion.li
              key={t.id}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] } },
              }}
            >
              <TableCard table={t} onSelect={selectTable} status={tables.status?.[t.id]} />
            </motion.li>
          ))}
        </motion.ul>

        <aside className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:gap-4 lg:overflow-y-auto">
          <div className="hidden lg:block [&>button]:w-full [&>button]:items-start [&>button]:text-left">
            <BalanceChip />
          </div>

          <section aria-labelledby="house-h" className="flex flex-col gap-3 rounded-card border border-border p-4">
            <MonoLabel as="h2" id="house-h">
              The house
            </MonoLabel>
            <dl className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Bankroll</dt>
                <dd className="font-display text-[20px] font-medium tabular">
                  {tables.houseBalance === null ? "—" : `${tables.houseBalance.toFixed(0)} GNEAR`}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Tables open</dt>
                <dd className="font-display text-[20px] font-medium tabular">{open === null ? "—" : `${open} / ${TABLES.length}`}</dd>
              </div>
            </dl>
            <HouseRules />
          </section>

          <TopStrategies />

          <Disclosure
            summary="New to poker stakes?"
            className="border-b border-hair py-1.5"
            summaryClassName="text-[14px] font-medium"
          >
            <dl className="flex flex-col gap-2.5 pb-2 text-[14px] leading-[1.45]">
              <div>
                <dt className="inline font-semibold">Blinds 0.5 / 1</dt>
                <dd className="inline text-muted">
                  {" "}
                  — two small forced bets that start every hand, so there&rsquo;s always a pot.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Buy-in</dt>
                <dd className="inline text-muted">
                  {" "}
                  — what your agent brings to the table. It can only lose what it brings.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Practice vs real money</dt>
                <dd className="inline text-muted">
                  {" "}
                  — practice tables use free chips. Real-money tables always ask you to confirm first.
                </dd>
              </div>
            </dl>
          </Disclosure>
        </aside>
      </div>
    </main>
  );
}

/** Market teaser: the three best strategies by net, linking into the market. */
function TopStrategies() {
  const [top, setTop] = useState<MarketStrategy[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMarket()
      .then((d) => !cancelled && setTop(leaderboard(d.strategies).slice(0, 3)))
      .catch(() => !cancelled && setTop([]));
    return () => {
      cancelled = true;
    };
  }, []);
  if (top?.length === 0) return null;
  return (
    <section aria-labelledby="top-h" className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <MonoLabel as="h2" id="top-h">
          Top strategies
        </MonoLabel>
        <Link href="/market" className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-fg">
          Market {"→"}
        </Link>
      </div>
      {top === null ? (
        <div className="flex flex-col gap-2 pt-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-chip" />
          ))}
        </div>
      ) : (
        <ol>
          {top.map((s, i) => (
            <li key={s.tokenId}>
              <Link
                href={`/market/${s.tokenId}`}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-hair py-2.5"
              >
                <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate font-display text-[16px] font-bold tracking-[-0.02em]">{s.title}</span>
                <span className="font-display text-[16px] font-bold tabular">{signed(s.net)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

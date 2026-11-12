"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { DecisionFeedRow } from "@/components/game/DecisionFeedRow";
import { LineChart } from "@/components/ui/LineChart";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { paginate, Pager } from "@/components/ui/Pager";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { signed } from "@/lib/format";
import type { MarketEvent, MarketStrategy } from "@/lib/market/types";
import { fetchMarket, type MarketSnapshot } from "@/services/agentApi";
import { changeLabel, clock, FILTERS, filterStrategies, leaderboard, seatsListed, type MarketFilter } from "./filters";
import { Segmented } from "./Segmented";

const POLL_MS = 10_000;
const PAGE = 8;

export function MarketView() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"strategies" | "leaderboard">("strategies");
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMarket()
        .then((d) => !cancelled && (setData(d), setError(false)))
        .catch(() => !cancelled && setError(true));
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const list = data ? (tab === "leaderboard" ? leaderboard(data.strategies) : filterStrategies(data.strategies, filter)) : [];
  const shown = paginate(list, page, PAGE);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 pt-6 lg:h-dvh lg:gap-4 lg:overflow-hidden lg:px-10 lg:pb-6 lg:pt-8">
      <PageHeader
        eyebrow="Strategy market · NEAR testnet"
        title="market"
        description="Buy a license to play someone else’s strategy. Settings stay sealed; prices follow real hands."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex flex-col gap-4 lg:min-h-0 lg:gap-3 lg:overflow-y-auto">
          <Link
            href="/market/sim"
            className="flex items-center justify-between gap-4 rounded-card border border-dashed border-border p-4 transition-colors hover:border-fg lg:py-3"
          >
            <span className="flex flex-col gap-1">
              <span className="font-display text-[18px] font-bold tracking-[-0.02em]">Watch a week in 60 s</span>
              <span className="text-[13px] text-muted">Practice bots trade a whole week of the market</span>
            </span>
            <StatusBadge kind="practice" size="sm">
              Simulated
            </StatusBadge>
          </Link>

          <div className="flex flex-wrap gap-2">
          <Segmented
            id="market-tab"
            label="Market view"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={[
              { key: "strategies", label: "Strategies" },
              { key: "leaderboard", label: "Leaderboard" },
            ]}
          />
          {tab === "strategies" && (
            <Segmented
              id="market-filter"
              label="Filter"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(1);
              }}
              options={FILTERS}
            />
          )}
          </div>

          {!data && (
            <>
              <p role="status" className={error ? "text-[14px] text-muted" : "sr-only"}>
                {error ? "The market isn’t reachable right now. Retrying…" : "Loading the market…"}
              </p>
              <ul aria-hidden="true" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: PAGE }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-[150px]" />
                  </li>
                ))}
              </ul>
            </>
          )}
          {data && list.length === 0 && (
            <p className="rounded-card border border-dashed border-border p-5 text-[14px] leading-normal text-muted">
              {filter === "mine" ? "No licenses or strategies of yours yet. Publish one from the Strategy tab." : "Nothing here right now."}
            </p>
          )}

          {tab === "strategies" ? (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.items.map((s) => (
                <li key={s.tokenId}>
                  <StrategyCard s={s} seats={seatsListed(data!.listings, s.tokenId)} />
                </li>
              ))}
            </ul>
          ) : (
            <ol className="flex flex-col">
              {shown.items.map((s, i) => (
                <li key={s.tokenId}>
                  <Link
                    href={`/market/${s.tokenId}`}
                    className="grid grid-cols-[32px_1fr_auto] items-baseline gap-3 border-b border-hair py-3 hover:text-fg"
                  >
                    <span className="font-mono text-[11px] text-muted">{String((shown.page - 1) * PAGE + i + 1).padStart(2, "0")}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-display text-[18px] font-bold tracking-[-0.02em]">{s.title}</span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                        {s.hands} hands · ROI {signed(s.roi * 100)}% · {s.rated ? "rated" : "unrated"}
                      </span>
                    </span>
                    <span className="font-display text-[20px] font-bold tabular">{signed(s.net)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {list.length > PAGE && <Pager page={shown.page} pages={shown.pages} onChange={setPage} />}
        </div>

        <aside className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto">
          <section aria-labelledby="ticker" className="flex flex-col">
            <MonoLabel as="h2" id="ticker">
              Now
            </MonoLabel>
            {data ? (
              <EventFeed events={data.events.slice(0, 20)} />
            ) : (
              <ul aria-hidden="true" className="flex flex-col gap-2 pt-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-14 rounded-chip" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function StrategyCard({ s, seats }: { s: MarketStrategy; seats: number }) {
  return (
    <Link
      href={`/market/${s.tokenId}`}
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border p-4 transition-colors hover:border-fg lg:gap-2 lg:p-3",
        s.rated ? "border-solid" : "border-dashed",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 break-words font-display text-[18px] font-bold leading-tight tracking-[-0.02em]">{s.title}</span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            by {s.creatorName ?? (s.you ? "you" : s.creator)} · {s.rated ? "rated" : "unrated"}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end whitespace-nowrap">
          <span className="font-display text-[20px] font-bold tabular">{s.price.toFixed(1)}</span>
          <span className="font-mono text-[11px] tabular text-muted">{changeLabel(s.change)}</span>
          {s.lowestAsk !== null && <span className="font-mono text-[11px] tabular text-muted">ask {s.lowestAsk.toFixed(1)}</span>}
        </span>
      </span>
      <LineChart values={s.spark} height={28} dashed={!s.rated} label={`${s.title} price, recent`} />
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {seats} for sale{s.owned > 0 ? ` · you hold ${s.owned}` : ""}
      </span>
    </Link>
  );
}

/** NPC and player trades, newest first. Reuses the game's decision row: time · trade · reason · who. */
export function EventFeed({ events }: { events: MarketEvent[] }) {
  if (events.length === 0) return <p className="py-3 text-[13px] text-muted">Quiet right now.</p>;
  return (
    <ul aria-live="polite">
      <AnimatePresence initial={false}>
        {events.map((e, i) => (
          <DecisionFeedRow key={e.id} index={clock(e.at)} action={e.action} reason={e.reason ?? ""} street={e.actor} latest={i === 0} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

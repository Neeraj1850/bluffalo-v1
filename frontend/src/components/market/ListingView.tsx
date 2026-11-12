"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { ConfirmationSummary } from "@/components/ui/ConfirmationSummary";
import { Disclosure } from "@/components/ui/Disclosure";
import { LineChart } from "@/components/ui/LineChart";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { cn } from "@/lib/cn";
import { signed } from "@/lib/format";
import type { MarketListing } from "@/lib/market/types";
import { fetchMarketProof, fetchMarketStrategy, txUrl, type MarketDetail, type MarketProof } from "@/services/agentApi";
import { BuySheet } from "./BuySheet";
import { changeLabel } from "./filters";
import { EventFeed } from "./MarketView";

export const RULES_URL = "https://github.com/Neeraj1850/bluffalo-v1/blob/main/frontend/src/lib/market/rules.ts";

export function ListingView({ id }: { id: string }) {
  const [data, setData] = useState<MarketDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [buying, setBuying] = useState<MarketListing | null>(null);
  const [proof, setProof] = useState<MarketProof | "checking" | "failed" | null>(null);

  const load = useCallback(
    () =>
      fetchMarketStrategy(id)
        .then(setData)
        .catch(() => setMissing(true)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const verify = () => {
    setProof("checking");
    fetchMarketProof(id).then(setProof, () => setProof("failed"));
  };

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 pt-6 lg:px-10 lg:pt-10">
        <p className="text-[14px] text-muted">{missing ? "No strategy with that id." : "Loading…"}</p>
      </main>
    );
  }
  const s = data.strategy;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-2">
        <Link href="/market" className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-fg">
          {"←"} Market
        </Link>
        <h1 className="display break-words text-[56px] leading-[0.85] tracking-[-0.06em] lg:text-[88px]">{s.title}</h1>
        <MonoLabel>
          by {s.creatorName ?? (s.you ? "you" : s.creator)} · {s.rated ? "rated" : "unrated · under 100 hands"}
        </MonoLabel>
      </header>

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-4">
          <StatGroup>
            <StatBox
              emphasis="inverse"
              label="Price · GNEAR"
              value={<AnimatedNumber value={s.price} />}
            />
            <StatBox label="Change" value={changeLabel(s.change)} size="sm" />
            <StatBox label="Fair" value={s.fair.toFixed(1)} size="sm" />
          </StatGroup>
          <Disclosure summary={<span className="text-[14px]">{s.why.sentence}</span>} hint="Why?">
            <div className="flex flex-col gap-3 pb-2">
              <ConfirmationSummary rows={s.why.rows} />
              <a href={RULES_URL} target="_blank" rel="noreferrer" className="font-mono text-[11px] uppercase tracking-[0.12em] underline underline-offset-4">
                Read the pricing rules ↗
              </a>
            </div>
          </Disclosure>
          <LineChart values={s.spark} height={120} dashed={!s.rated} label={`${s.title} price history`} />
          <StatGroup>
            <StatBox label="Hands" value={s.hands} size="sm" />
            <StatBox label="Net" value={signed(s.net)} size="sm" />
            <StatBox label="ROI" value={`${signed(s.roi * 100)}%`} size="sm" />
          </StatGroup>
          <p className="rounded-card border border-dashed border-border p-4 text-[14px] leading-normal text-muted">
            Settings sealed by the creator. A license plays them for you; nobody sees the sliders, and your safety limits still apply.
          </p>
          <Disclosure summary={<span className="text-[14px]">How licenses work</span>} hint="How?">
            <p className="pb-3 text-[14px] leading-normal text-muted">
              Each license is a seat token on NEAR (NEP-245). You hold it in your app account; no wallet needed. Using one as
              your agent spends the seat, and the hands it plays add to this strategy&rsquo;s record. Resales pay the creator a
              10% royalty.
            </p>
          </Disclosure>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="listings" className="flex flex-col">
            <MonoLabel as="h2" id="listings">
              For sale · {s.owned > 0 ? `you hold ${s.owned}` : "you hold none"}
            </MonoLabel>
            {data.listings.length === 0 && <p className="py-3 text-[13px] text-muted">No seats for sale right now.</p>}
            <ul>
              {data.listings.map((l) => (
                <li key={`${l.seller}-${l.priceEach}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hair py-3">
                  <span className="flex flex-col">
                    <span className="font-display text-[18px] font-bold tabular">
                      {l.priceEach.toFixed(1)} GNEAR <span className="text-[13px] font-normal text-muted">× {l.amount}</span>
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                      {l.sellerName}
                      {l.memo ? ` · ${l.memo}` : ""}
                    </span>
                  </span>
                  {l.sellerKind !== "you" && (
                    <Button size="sm" onClick={() => setBuying(l)}>
                      Buy
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="trading" className="flex flex-col">
            <MonoLabel as="h2" id="trading">
              Who&rsquo;s trading
            </MonoLabel>
            <EventFeed events={data.events.slice(0, 8)} />
          </section>

          <section aria-labelledby="hands" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <MonoLabel as="h2" id="hands">
                Verified hands
              </MonoLabel>
              <Button size="sm" variant="secondary" onClick={verify} pending={proof === "checking"}>
                Verify record
              </Button>
            </div>
            {proof && (
              <p role="status" className="text-[13px] text-muted">
                {proofLine(proof)}
              </p>
            )}
            {data.hands.length === 0 && <p className="text-[13px] text-muted">No real hands yet.</p>}
            <ul>
              {data.hands.map((h) => (
                <li key={h.handId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-hair py-2.5">
                  <span className="flex gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                    <span>#{h.handId.slice(0, 8)}</span>
                    {h.commitTx && <TxLink tx={h.commitTx} label="commit" />}
                    {h.settleTx && <TxLink tx={h.settleTx} label="settle" />}
                  </span>
                  <span className={cn("font-display text-[16px] font-bold tabular")}>{signed(h.net)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {buying && (
        <BuySheet open strategy={s} listing={buying} onClose={() => setBuying(null)} onBought={load} />
      )}
    </main>
  );
}

/** The one-line result of "Verify record", for every state. */
export function proofLine(proof: MarketProof | "checking" | "failed"): string {
  if (proof === "checking") return "Checking the chain…";
  if (proof === "failed") return "Couldn’t check the chain right now. Try again.";
  if (proof.total === 0) return "No real hands to verify yet.";
  const head = `Verified ${proof.verified} of ${proof.total} hands on-chain`;
  return proof.mismatches.length ? `${head} · mismatched: ${proof.mismatches.join("; ")}.` : `${head}.`;
}

const TxLink = ({ tx, label }: { tx: string; label: string }) => (
  <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-fg">
    {label} ↗
  </a>
);

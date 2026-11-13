"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PRICE_MAX, PRICE_MIN } from "@/lib/market/rules";
import type { MarketListing, MarketStrategy } from "@/lib/market/types";
import { tradeLicense, txUrl } from "@/services/agentApi";

/** Why a resale listing can't go up, or null if it can. */
export function listError(price: number, amount: number, owned: number): string | null {
  if (!(price >= PRICE_MIN && price <= PRICE_MAX)) return `Price must be ${PRICE_MIN}–${PRICE_MAX} GNEAR`;
  if (!Number.isInteger(amount) || amount < 1 || amount > owned) return `List 1–${owned} seat${owned === 1 ? "" : "s"}`;
  return null;
}

type Phase = { status: "quote" } | { status: "submitted" } | { status: "confirmed"; tx: string } | { status: "failed"; message: string };

/** List held seats for resale (or take down your listing). Quote → submitted → confirmed. */
export function SellSheet({
  open,
  onClose,
  strategy,
  mine,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  strategy: MarketStrategy;
  /** Your active listing, if any. */
  mine?: MarketListing;
  onDone: () => void;
}) {
  const [price, setPrice] = useState(String(mine?.priceEach ?? strategy.price));
  const [amount, setAmount] = useState(String(mine?.amount ?? 1));
  const [phase, setPhase] = useState<Phase>({ status: "quote" });
  const invalid = listError(Number(price), Number(amount), strategy.owned);

  const run = async (req: Parameters<typeof tradeLicense>[0]) => {
    setPhase({ status: "submitted" });
    try {
      const { tx } = await tradeLicense(req);
      setPhase({ status: "confirmed", tx });
      onDone();
    } catch (e) {
      setPhase({ status: "failed", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  };
  const busy = phase.status === "submitted";
  const field = "h-11 w-full rounded-btn border border-border bg-surface px-3 font-mono text-[15px] tabular";

  return (
    <Sheet open={open} onClose={onClose} title="sell a seat">
      <div className="flex flex-col gap-4">
        <StatusBadge kind={phase.status === "submitted" ? "submitted" : phase.status === "confirmed" ? "confirmed" : phase.status === "failed" ? "failed" : "quote"} />
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Price each · GNEAR (quote {strategy.price.toFixed(1)})
          <input className={field} type="number" inputMode="decimal" min={PRICE_MIN} max={PRICE_MAX} step="0.1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Seats · you hold {strategy.owned}
          <input className={field} type="number" inputMode="numeric" min={1} max={strategy.owned} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {invalid && <p className="text-[13px] text-muted">{invalid}</p>}
        {phase.status === "failed" && (
          <p role="alert" className="text-[14px] text-muted">
            {phase.message} No seats moved.
          </p>
        )}
        {phase.status === "confirmed" ? (
          <p role="status" className="text-[14px]">
            Done.{" "}
            <a href={txUrl(phase.tx)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              See the transaction ↗
            </a>
          </p>
        ) : (
          <>
            <Button
              disabled={Boolean(invalid)}
              pending={busy}
              pendingLabel="Listing…"
              onClick={() => run({ op: "list", tokenId: strategy.tokenId, amount: Number(amount), price: Number(price) })}
            >
              {mine ? "Update listing" : `List ${amount} for ${Number(price).toFixed(1)} GNEAR each`}
            </Button>
            {mine && (
              <Button variant="secondary" disabled={busy} onClick={() => run({ op: "delist", tokenId: strategy.tokenId })}>
                Delist
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

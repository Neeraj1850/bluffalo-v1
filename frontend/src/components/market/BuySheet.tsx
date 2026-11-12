"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChipBurst } from "@/components/game/ChipBurst";
import { Button, ButtonHint } from "@/components/ui/Button";
import { ConfirmationSummary } from "@/components/ui/ConfirmationSummary";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DepositPanel } from "@/components/wallet/DepositSheet";
import type { MarketListing, MarketStrategy } from "@/lib/market/types";
import { useSetup } from "@/lib/store/setup";
import { ApiError, fetchMarketStrategy, tradeLicense, txUrl } from "@/services/agentApi";

type Phase =
  | { status: "quote" }
  | { status: "submitted" }
  | { status: "confirmed"; tx: string }
  | { status: "failed"; message: string; fundsMoved: boolean; code?: string }
  | { status: "moved"; price: number };

type BuySheetProps = {
  open: boolean;
  onClose: () => void;
  strategy: MarketStrategy;
  listing: MarketListing;
  /** Reload the page's data after a confirmed buy. */
  onBought: () => void;
};

/** Quote → submitted → confirmed. Nothing claims success before the server resolves. */
export function BuySheet({ open, onClose, strategy, listing: initial, onBought }: BuySheetProps) {
  const router = useRouter();
  const { params, applyAgent } = useSetup();
  const [listing, setListing] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ status: "quote" });
  const inFlight = useRef(false);

  const buy = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ status: "submitted" });
    try {
      const { tx } = await tradeLicense({ op: "buy", tokenId: listing.tokenId, seller: listing.seller, maxPrice: listing.priceEach });
      setPhase({ status: "confirmed", tx });
      onBought();
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      if (e?.code === "price_moved") {
        // Re-read the shelf: the same seller's new ask, else the cheapest.
        const fresh = await fetchMarketStrategy(listing.tokenId).catch(() => null);
        const next = fresh?.listings.find((l) => l.seller === listing.seller) ?? fresh?.listings.sort((a, b) => a.priceEach - b.priceEach)[0];
        if (next) {
          setListing(next);
          setPhase({ status: "moved", price: next.priceEach });
          return;
        }
      }
      setPhase({
        status: "failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
        fundsMoved: e?.fundsMoved ?? false,
        code: e?.code,
      });
    } finally {
      inFlight.current = false;
    }
  };

  const close = () => {
    onClose();
    if (phase.status !== "submitted") setPhase({ status: "quote" });
  };

  const useIt = () => {
    applyAgent("custom", params, { id: strategy.tokenId, name: strategy.title });
    router.push("/strategy");
  };

  const rows = [
    { label: "License", value: strategy.title, note: "1 seat · settings stay sealed" },
    { label: "Seller", value: listing.sellerName, note: listing.sellerKind === "npc" ? "trader with a wallet" : undefined },
    { label: "Price", value: `${listing.priceEach.toFixed(1)} GNEAR`, note: `quoted ${strategy.price.toFixed(1)} · fair ${strategy.fair.toFixed(1)}` },
    { label: "Paid from", value: "Your app wallet", note: "no popup, no seed phrase" },
  ];

  const badge =
    phase.status === "submitted" ? "submitted" : phase.status === "confirmed" ? "confirmed" : phase.status === "failed" ? "failed" : "quote";

  return (
    <Sheet open={open} onClose={close} title="buy a license">
      <div className="flex flex-col gap-4">
        <StatusBadge kind={badge} />
        <ConfirmationSummary rows={rows} />

        {phase.status === "moved" && (
          <p role="status" className="text-[14px] leading-normal">
            Price moved to {phase.price.toFixed(1)} GNEAR. Buy at the new price? No funds moved.
          </p>
        )}
        {phase.status === "failed" && phase.code === "insufficient_funds" && (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-border p-4">
            <p className="text-[14px] text-muted">Not enough in your wallet. No funds moved. Top up, then buy again.</p>
            <DepositPanel open={open} />
          </div>
        )}
        {phase.status === "failed" && phase.code !== "insufficient_funds" && (
          <p role="alert" className="text-[14px] leading-normal text-muted">
            {phase.message} {phase.fundsMoved ? "Some funds may have moved — check your balance." : "No funds moved."}
          </p>
        )}

        {phase.status === "confirmed" ? (
          <div role="status" className="relative flex flex-col gap-3">
            <ChipBurst className="pointer-events-none absolute -top-10 right-6" />
            <p className="text-[14px]">
              The seat is yours.{" "}
              <a href={txUrl(phase.tx)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                See the transaction ↗
              </a>
            </p>
            <Button onClick={useIt} trailing={<ButtonHint>→</ButtonHint>}>
              Use it as your agent
            </Button>
          </div>
        ) : (
          <Button onClick={buy} pending={phase.status === "submitted"} pendingLabel="Buying…">
            {phase.status === "failed" ? "Try again" : `Buy for ${listing.priceEach.toFixed(1)} GNEAR`}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

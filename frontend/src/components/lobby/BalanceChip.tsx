"use client";

import { useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DepositSheet } from "@/components/wallet/DepositSheet";
import { useWallet } from "@/lib/store/useWallet";

/** Real wallet balance (read from NEAR testnet). Opens deposit / withdraw. */
export function BalanceChip() {
  const { wallet, error, signedOut } = useWallet();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={wallet ? `Playing balance ${wallet.balance.toFixed(2)} GNEAR — add funds` : "Playing balance — add funds"}
        className="flex flex-col items-end gap-0.5 rounded-chip border border-border px-2.5 py-1.5 text-right transition-colors hover:border-fg"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Playing balance · +</span>
        <span className="font-display text-[18px] font-medium tracking-[-0.02em] tabular">
          {wallet ? (
            <>
              <AnimatedNumber value={wallet.balance} decimals={2} /> GNEAR
            </>
          ) : signedOut ? (
            <span className="text-muted">Sign in</span>
          ) : error ? (
            <span className="text-muted">Unavailable</span>
          ) : (
            <span className="text-muted">Loading…</span>
          )}
        </span>
      </button>
      <DepositSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

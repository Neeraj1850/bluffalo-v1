"use client";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useSetup } from "@/lib/store/setup";

/** Compact playing-balance indicator. Animates between confirmed balances. */
export function BalanceChip() {
  const { balance } = useSetup();
  return (
    <div className="flex flex-col items-end gap-0.5 rounded-chip border border-border px-2.5 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Playing balance
      </span>
      <span className="font-display text-[18px] font-medium tracking-[-0.02em] tabular">
        <AnimatedNumber value={balance} decimals={2} /> NEAR
      </span>
    </div>
  );
}

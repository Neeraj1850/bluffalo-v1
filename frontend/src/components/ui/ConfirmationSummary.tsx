"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SummaryRow = { label: string; value: ReactNode; note?: ReactNode };

type ConfirmationSummaryProps = {
  rows: SummaryRow[];
  className?: string;
};

/**
 * The full picture before a consequential action. Rows reveal in a
 * restrained 60ms stagger. Unknown values must say "loading" or
 * "unavailable" — never a guessed number.
 */
export function ConfirmationSummary({ rows, className }: ConfirmationSummaryProps) {
  return (
    <motion.dl
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className={cn("rounded-card border border-border bg-surface px-[18px] py-1", className)}
    >
      {rows.map((r) => (
        <motion.div
          key={r.label}
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } },
          }}
          className="flex items-baseline justify-between gap-3 border-b border-hair py-3 last:border-b-0"
        >
          <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {r.label}
          </dt>
          <dd className="flex flex-col gap-0.5 text-right">
            <span className="text-[15px] font-medium">{r.value}</span>
            {r.note && <span className="text-[12px] text-muted">{r.note}</span>}
          </dd>
        </motion.div>
      ))}
    </motion.dl>
  );
}

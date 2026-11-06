"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useId } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { cardName } from "@/lib/cards";
import { cn } from "@/lib/cn";
import type { HistoryHand } from "@/lib/data/hands";
import { signed } from "@/lib/format";
import { spring } from "@/lib/motion";

type HistoryRowProps = {
  hand: HistoryHand;
  expanded: boolean;
  onToggle: () => void;
  /** Position in the list, for the entry stagger. */
  index?: number;
};

/** One archived hand. Expands into its street-by-street progression. */
export function HistoryRow({ hand, expanded, onToggle, index = 0 }: HistoryRowProps) {
  const id = useId();
  const won = hand.net > 0;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="border-t border-hair"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={id}
        className="grid min-h-16 w-full grid-cols-[50px_62px_1fr_auto] items-center gap-2.5 px-1 py-3.5 text-left transition-colors hover:bg-surface"
      >
        <span className="font-mono text-[11px] text-muted">{hand.id}</span>
        <span className="flex gap-[3px]" aria-label={hand.hole.map(cardName).join(", ")}>
          <PlayingCard card={hand.hole[0]} size="xs" tilt={-4} decorative className="shadow-none" />
          <PlayingCard card={hand.hole[1]} size="xs" tilt={4} decorative className="shadow-none" />
        </span>
        <span className="text-[14px] leading-[1.35]">{hand.description}</span>
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-display text-[18px] tracking-[-0.03em] tabular",
              won ? "font-bold" : "font-normal",
            )}
          >
            {signed(hand.net)}
          </span>
          <span
            className={cn(
              "rounded-[4px] border px-1 font-mono text-[10px] uppercase tracking-[0.12em]",
              won ? "border-sel bg-sel text-onsel" : "border-border text-muted",
            )}
          >
            {won ? "Won" : "Lost"}
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ol className="mb-3.5 ml-[60px] flex flex-col gap-3 border-l border-fg pl-3.5">
              {hand.steps.map((s, j) => (
                <motion.li
                  key={s.street + j}
                  initial={{ opacity: 0, y: -16, scale: 0.85, rotate: -8 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{ ...spring.card, delay: j * 0.08 }}
                  className="grid grid-cols-[58px_1fr] items-baseline gap-2"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{s.street}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[15px] font-medium">{s.board}</span>
                    <span className="text-[13px] text-muted">{s.action}</span>
                  </span>
                </motion.li>
              ))}
              <li>
                <Link
                  href="/game"
                  className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.12em] hover:underline"
                >
                  Watch full replay {"→"}
                </Link>
              </li>
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

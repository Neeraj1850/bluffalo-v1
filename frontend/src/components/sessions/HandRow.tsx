"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId } from "react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { cardName, cardShort } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { signed } from "@/lib/format";
import { decisionLine } from "@/lib/poker/decisions";
import { handMode, type LiveHand } from "@/lib/poker/record";
import { txUrl } from "@/services/agentApi";
import { netAfterRake, rakeLabel, rakeOf } from "@/services/houseApi";

type HandRowProps = {
  hand: LiveHand;
  /** Its position in the session, 1-based. */
  number: number;
  expanded: boolean;
  onToggle: () => void;
};

/** One hand of a session. Tap to read every decision in it — that's the replay. */
export function HandRow({ hand, number, expanded, onToggle }: HandRowProps) {
  const id = useId();
  const net = netAfterRake(hand);
  const real = handMode(hand) === "real";
  const opponent = real ? "house agent" : "practice bot";

  return (
    <li className="border-t border-hair">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={id}
        className="grid min-h-16 w-full grid-cols-[40px_62px_1fr_auto] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-surface"
      >
        <span className="font-mono text-[11px] text-muted">#{number}</span>
        <span className="flex gap-[3px]" aria-label={hand.hole.map(cardName).join(", ")}>
          <PlayingCard card={hand.hole[0]} size="xs" tilt={-4} decorative className="shadow-none ring-1 ring-border" />
          <PlayingCard card={hand.hole[1]} size="xs" tilt={4} decorative className="shadow-none ring-1 ring-border" />
        </span>
        <span className="text-[14px] leading-[1.35]">{hand.outcome}</span>
        <span className="flex flex-col items-end gap-0.5">
          <span className={cn("font-display text-[18px] tracking-[-0.03em] tabular", net > 0 ? "font-bold" : "font-normal")}>
            {signed(net)}
          </span>
          <span
            className={cn(
              "rounded-[4px] border px-1 font-mono text-[10px] uppercase tracking-[0.12em]",
              net > 0 ? "border-sel bg-sel text-onsel" : "border-border text-muted",
            )}
          >
            {net > 0 ? "Won" : net === 0 ? "Even" : "Lost"}
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
            <ol className="mb-4 ml-[52px] flex flex-col gap-3.5 border-l border-fg pl-4">
              {hand.steps.map((st, i) => {
                const line = decisionLine(st, opponent);
                const board = st.boardCount ? hand.board.slice(0, st.boardCount).map(cardShort).join(" ") : "";
                return (
                  <li key={i} className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {line.street}
                      {board && st.street !== "SHOWDOWN" && ` · ${board}`}
                    </span>
                    <span className="font-display text-[16px] font-medium leading-snug">{line.move}</span>
                    {line.reason && <span className="text-[13px] leading-[1.45] text-muted">Why: {line.reason}</span>}
                    {line.reply && <span className="text-[13px] leading-[1.45]">{line.reply}</span>}
                  </li>
                );
              })}
              {(rakeOf(hand) > 0 || hand.chain) && (
                <li className="flex flex-wrap gap-x-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {rakeOf(hand) > 0 && <span>{rakeLabel(rakeOf(hand))}</span>}
                  {hand.chain && (
                    <a href={txUrl(hand.chain.settleTx)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-fg">
                      Settled on NEAR testnet ↗
                    </a>
                  )}
                </li>
              )}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { parseCard } from "@/lib/cards";
import { blindsLabel, buyInLabel, type PokerTable } from "@/lib/data/tables";
import { spring } from "@/lib/motion";
import type { TableStatus } from "@/services/houseApi";
import { ExperiencePips } from "./ExperiencePips";

type TableCardProps = {
  table: PokerTable;
  onSelect: (id: string) => void;
  href?: string;
  /** Server status; closed tables render disabled with the reason. */
  status?: TableStatus;
};

const HOUSE_TERMS = "5% rake · 2% fee";

const card: Variants = {
  rest: { y: 0, rotate: 0 },
  hover: { y: -4, rotate: -0.6, transition: spring.indicator },
};

const peek = (rotate: number): Variants => ({
  rest: { y: 0, rotate, transition: spring.card },
  hover: { y: -10, rotate: rotate + 6, transition: spring.card },
});

const MotionLink = motion.create(Link);

function seatsLabel(t: PokerTable) {
  // Every hand is heads-up against the house agent; there is no live seat count to show.
  return t.mode === "practice" ? "vs practice bot" : "heads-up vs house agent";
}

/**
 * One table in the lobby. The whole card is a single link.
 * Each table gets its own typographic personality — no color involved.
 */
export function TableCard({ table: t, onSelect, href = "/strategy", status }: TableCardProps) {
  if (t.mode === "real" && status && !status.open) {
    return (
      <div
        role="group"
        aria-disabled="true"
        aria-label={`${t.name}. Closed${`: ${closedReason(status.reason)}`}.`}
        className="flex flex-col gap-2 rounded-card border border-dashed border-border p-5 opacity-60"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Real money · closed</span>
        <span className="font-display text-[28px] font-medium tracking-[-0.03em]">{t.name}</span>
        <span className="text-[14px] leading-[1.45] text-muted">
          {closedReason(status.reason)}
        </span>
        <span className="font-mono text-[11px] uppercase text-muted">
          Blinds {blindsLabel(t)} · {HOUSE_TERMS}
        </span>
      </div>
    );
  }
  const common = {
    href,
    onClick: () => onSelect(t.id),
    variants: card,
    initial: "rest" as const,
    animate: "rest" as const,
    whileHover: "hover" as const,
    whileTap: { scale: 0.97 },
    "aria-label": `${t.name}. ${t.mode === "practice" ? "Practice, no real money" : "Real money"}. Blinds ${blindsLabel(t)}. Buy-in ${buyInLabel(t)}. ${t.levelLabel}.`,
  };

  if (t.variant === "kitchen") {
    return (
      <MotionLink
        {...common}
        className="relative flex flex-col gap-3.5 overflow-hidden rounded-card border border-dashed border-fg p-5"
      >
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
          <span>Practice — no real money</span>
          <span className="text-muted">{seatsLabel(t)}</span>
        </div>
        <span className="font-display text-[40px] font-medium leading-[0.9] tracking-[-0.05em]">
          {t.name}
        </span>
        <span className="max-w-[230px] text-[14px] leading-[1.45] text-muted">{t.blurb}</span>
        <div className="flex gap-4 font-mono text-[11px] uppercase text-muted">
          <span>Blinds {blindsLabel(t)}</span>
          <span>Free chips</span>
        </div>
        <motion.div
          variants={peek(-14)}
          aria-hidden="true"
          className="absolute -bottom-[30px] -right-3.5 h-[118px] w-[84px] rounded-[10px] border border-dashed border-fg"
        />
      </MotionLink>
    );
  }

  if (t.variant === "backroom") {
    return (
      <MotionLink
        {...common}
        className="relative flex flex-col gap-3.5 overflow-hidden rounded-card bg-sel px-5 py-6 text-onsel"
      >
        <div className="flex justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.1em]">
          <span>{"★"} Recommended first table · real money</span>
          <span className="whitespace-nowrap">{seatsLabel(t)}</span>
        </div>
        <span className="max-w-[230px] font-display text-[56px] font-bold leading-[0.84] tracking-[-0.06em]">
          {t.name}
        </span>
        <div className="grid max-w-[250px] grid-cols-2 gap-3 border-t border-current pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Blinds</span>
            <span className="font-display text-[20px] font-medium">{blindsLabel(t)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Buy-in</span>
            <span className="font-display text-[20px] font-medium">{buyInLabel(t)}</span>
          </div>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em]">{HOUSE_TERMS}</span>
        <ExperiencePips level={t.level} label={t.levelLabel} />
        <motion.div
          variants={peek(16)}
          aria-hidden="true"
          className="absolute -right-[22px] top-[52px] w-[104px]"
        >
          <div className="relative aspect-[5/7] w-full rounded-[12px] bg-onsel font-display text-sel">
            <span className="absolute left-2.5 top-2 text-[24px] font-bold">A</span>
            <span className="absolute bottom-0 right-2 text-[62px] leading-none">
              {"♠︎"}
            </span>
          </div>
        </motion.div>
      </MotionLink>
    );
  }

  if (t.variant === "ceiling") {
    return (
      <MotionLink
        {...common}
        className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-card border border-border bg-surface p-5"
      >
        <span className="col-span-full font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Real money · {seatsLabel(t)}
        </span>
        <span className="font-mono text-[30px] font-bold uppercase leading-none tracking-[-0.04em]">
          low
          <br />
          ceiling
        </span>
        <div className="flex flex-col items-end gap-1 text-right font-mono text-[12px] uppercase">
          <span>Blinds {blindsLabel(t)}</span>
          <span className="text-muted">Buy-in {buyInLabel(t)}</span>
          <span className="text-muted">{HOUSE_TERMS}</span>
        </div>
        <ExperiencePips level={t.level} label={t.levelLabel} className="col-span-full text-muted" />
      </MotionLink>
    );
  }

  // vault
  return (
    <MotionLink
      {...common}
      className="relative flex items-stretch gap-4 overflow-hidden rounded-card border border-border p-5"
    >
      <span
        aria-hidden="true"
        className="rotate-180 font-display text-[44px] font-bold leading-[0.9] tracking-[-0.05em] [writing-mode:vertical-rl]"
      >
        vault
      </span>
      <div className="flex flex-1 flex-col gap-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Real money · {seatsLabel(t)}
        </span>
        <span className="font-display text-[22px] font-medium tracking-[-0.02em]">{t.name}</span>
        <span className="text-[14px] leading-[1.45] text-muted">{t.blurb}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] uppercase">
          <span>Blinds {blindsLabel(t)}</span>
          <span className="text-muted">Buy-in {buyInLabel(t)}</span>
          <span className="text-muted">{HOUSE_TERMS}</span>
        </div>
        <ExperiencePips level={t.level} label={t.levelLabel} className="text-muted" />
      </div>
      <motion.div variants={peek(28)} aria-hidden="true" className="absolute -right-[30px] -top-10">
        <PlayingCard face="down" width={80} decorative card={parseCard("As")} />
      </motion.div>
    </MotionLink>
  );
}

/** Server reason codes in plain words. */
export function closedReason(reason?: string): string {
  if (reason === "exposure_limit") return "Stakes here are above what the house can cover per hand right now.";
  return "The house bankroll is low, so this table isn’t taking agents right now.";
}

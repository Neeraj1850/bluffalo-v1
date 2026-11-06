"use client";

import { PlayingCard } from "@/components/cards/PlayingCard";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import type { Card } from "@/lib/cards";
import { cn } from "@/lib/cn";

type OpponentSeatProps = {
  name: string;
  status: string;
  thinking: boolean;
  cards: Card[];
  /** Only true once the rules allow the cards to be seen. */
  revealed: boolean;
  className?: string;
};

function Avatar() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="House agent avatar" className="size-12 shrink-0 lg:size-14">
      <rect x="1" y="1" width="46" height="46" rx="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="17" width="7" height="7" fill="currentColor" />
      <rect x="28" y="17" width="7" height="3" fill="currentColor" />
      <path d="M14 33h20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** The opponent: avatar, name, live status. Hole cards stay face down until showdown. */
export function OpponentSeat({ name, status, thinking, cards, revealed, className }: OpponentSeatProps) {
  return (
    <div className={cn("flex items-center gap-3 lg:gap-4", className)}>
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:min-w-[150px] lg:flex-none">
        <span className="font-display text-[18px] font-medium tracking-[-0.02em] lg:text-[22px]">{name}</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted lg:text-[12px]">
          {status}
          {thinking && <ThinkingDots size={5} className="text-fg" />}
        </span>
      </div>
      <div className="flex gap-1 [--opp-card:42px] lg:gap-1.5 lg:[--opp-card:60px]" style={{ perspective: 600 }}>
        {cards.map((c, i) =>
          revealed ? (
            <PlayingCard
              key={`up-${i}`}
              card={c}
              width="var(--opp-card)"
              flipIn
              delay={i * 0.09}
            />
          ) : (
            <PlayingCard key={`down-${i}`} face="down" width="var(--opp-card)" tilt={i === 0 ? -6 : 7} />
          ),
        )}
      </div>
    </div>
  );
}

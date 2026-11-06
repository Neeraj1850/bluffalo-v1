"use client";

import { PlayingCard } from "@/components/cards/PlayingCard";
import type { Card } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { timing } from "@/lib/motion";

/** Slight, fixed tilts so the board looks dealt, not printed. */
const TILTS = [-4, 3, -2, 5, -6];

const GROUPS = [
  { name: "Flop", from: 0, to: 3 },
  { name: "Turn", from: 3, to: 4 },
  { name: "River", from: 4, to: 5 },
];

type BoardProps = {
  cards: Card[];
  shown: number;
  className?: string;
};

/**
 * Community cards grouped by street. Flop deals with an 80ms stagger;
 * turn and river land with extra emphasis. Undealt slots are dashed outlines.
 */
export function Board({ cards, shown, className }: BoardProps) {
  return (
    <div
      role="group"
      aria-label={`Community cards, ${shown} of 5 dealt`}
      className={cn(
        "grid w-full grid-cols-[3fr_1fr_1fr] gap-2 [--board-card:54px] lg:flex lg:w-auto lg:flex-wrap lg:justify-center lg:gap-7 lg:[--board-card:84px]",
        className,
      )}
    >
      {GROUPS.map((g) => {
        const lit = shown >= g.to;
        return (
          <div key={g.name} className="flex flex-col items-center gap-2 lg:gap-2.5">
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-300 lg:text-[11px]",
                lit ? "text-fg" : "text-muted",
              )}
            >
              {g.name}
            </span>
            <div className="flex gap-[5px] lg:gap-2">
              {cards.slice(g.from, g.to).map((c, j) => {
                const i = g.from + j;
                return i < shown ? (
                  <PlayingCard
                    key={`up-${i}`}
                    card={c}
                    width="var(--board-card)"
                    tilt={TILTS[i]}
                    deal={i >= 3 ? "emphasis" : "deal"}
                    delay={i < 3 ? i * timing.dealStagger : 0}
                  />
                ) : (
                  <PlayingCard key={`empty-${i}`} face="empty" width="var(--board-card)" />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

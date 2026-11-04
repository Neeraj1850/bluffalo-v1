"use client";

import type { Card } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { timing } from "@/lib/motion";
import { PlayingCard, type CardSize, CARD_WIDTH } from "./PlayingCard";

type CardFanProps = {
  cards: Card[];
  size?: CardSize;
  /** Indices drawn dimmed (e.g. a kicker that doesn't play). */
  dimmed?: number[];
  /** Total angular spread in degrees, from first to last card. */
  spread?: number;
  /** Fraction of card width each card shifts right of the previous one. */
  step?: number;
  delay?: number;
  interactive?: boolean;
  className?: string;
  label?: string;
};

/** Small, deliberate unevenness so fans never look machine-made. */
const JITTER = [0, 1.5, -1, 2, -0.5];

/** 2–5 overlapping cards, rotated around a point below their centre. */
export function CardFan({
  cards,
  size = "fan",
  dimmed = [],
  spread = 34,
  step = 0.74,
  delay = 0,
  interactive = true,
  className,
  label,
}: CardFanProps) {
  const width = CARD_WIDTH[size];
  const height = (width * 7) / 5;
  const n = cards.length;
  const start = -spread / 2;
  const inc = n > 1 ? spread / (n - 1) : 0;
  const total = width + (n - 1) * width * step;

  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative", className)}
      style={{ width: total, height: height + 40 }}
    >
      {cards.map((card, i) => (
        <div
          key={`${card.rank}${card.suit}`}
          className="absolute bottom-0"
          style={{ left: i * width * step }}
        >
          <PlayingCard
            card={card}
            size={size}
            tilt={start + i * inc + JITTER[i % JITTER.length]}
            deal="deal"
            delay={delay + i * timing.dealStagger}
            lift={interactive}
            decorative={Boolean(label)}
            dim={dimmed.includes(i)}
            style={{ transformOrigin: "50% 130%" }}
          />
        </div>
      ))}
    </div>
  );
}

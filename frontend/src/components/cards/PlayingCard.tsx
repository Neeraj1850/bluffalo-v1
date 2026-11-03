"use client";

import { motion, type TargetAndTransition } from "framer-motion";
import type { CSSProperties } from "react";
import { cardName, SUIT_GLYPH, type Card } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type CardFace = "up" | "down" | "empty";
export type CardSize = "xs" | "sm" | "md" | "fan" | "lg" | "xl";

/** Widths in px; height always follows a 5:7 ratio. */
export const CARD_WIDTH: Record<CardSize, number> = {
  xs: 28,
  sm: 42,
  md: 54,
  fan: 76,
  lg: 92,
  xl: 128,
};

export type DealStyle = "none" | "deal" | "emphasis";

export type PlayingCardProps = {
  card?: Card;
  face?: CardFace;
  size?: CardSize;
  /** Overrides `size` — any CSS width (e.g. "38%", 84). */
  width?: number | string;
  /** Resting rotation in degrees. */
  tilt?: number;
  folded?: boolean;
  /** Drawn at reduced opacity, e.g. a kicker that doesn't play. */
  dim?: boolean;
  /** Mounting animation. "emphasis" = turn/river: from higher, with overshoot. */
  deal?: DealStyle;
  delay?: number;
  /** Animate a face-down → face-up 3D flip on mount. */
  flipIn?: boolean;
  /** Lift and twist on hover. */
  lift?: boolean;
  /** Hide from assistive tech (pure decoration). */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
};

function initialFor(deal: DealStyle, tilt: number, flipIn: boolean): TargetAndTransition | false {
  if (flipIn) return { rotateY: 180, rotate: tilt };
  if (deal === "deal") return { opacity: 0, y: -60, scale: 0.8, rotate: tilt - 14 };
  if (deal === "emphasis") return { opacity: 0, y: -90, scale: 0.8, rotate: tilt + 20 };
  return false;
}

/**
 * A playing card. All internal sizes are in container-query units,
 * so one component serves every size from history thumbnails to the hero fan.
 */
export function PlayingCard({
  card,
  face = "up",
  size = "md",
  width,
  tilt = 0,
  folded = false,
  dim = false,
  deal = "none",
  delay = 0,
  flipIn = false,
  lift = false,
  decorative = false,
  className,
  style,
}: PlayingCardProps) {
  const w = width ?? CARD_WIDTH[size];
  const isMini = typeof w === "number" && w < 36;
  const showFace = face === "up" && card;

  const a11y = decorative
    ? { "aria-hidden": true as const }
    : face === "empty"
      ? { "aria-hidden": true as const }
      : {
          role: "img" as const,
          "aria-label": showFace
            ? `${cardName(card)}${folded ? ", folded" : ""}`
            : "Face-down card",
        };

  const transition =
    deal === "emphasis"
      ? { ...spring.pop, delay: delay + 0.12 }
      : flipIn
        ? { type: "spring" as const, stiffness: 240, damping: 20, delay }
        : { ...spring.card, delay };

  return (
    <motion.div
      {...a11y}
      initial={initialFor(deal, tilt, flipIn)}
      animate={{ opacity: folded ? 0.32 : dim ? 0.55 : 1, y: 0, scale: 1, rotate: tilt, rotateY: 0 }}
      whileHover={lift ? { y: -10, rotate: tilt - 2, transition: spring.indicator } : undefined}
      transition={transition}
      className={cn(
        "relative shrink-0 select-none [container-type:inline-size]",
        face === "up" && "bg-face text-ink shadow-card",
        face === "down" && "card-back border border-border",
        face === "empty" && "border border-dashed border-border",
        className,
      )}
      style={{
        width: w,
        aspectRatio: "5 / 7",
        borderRadius: "11cqw",
        transformPerspective: flipIn ? 600 : undefined,
        ...style,
      }}
    >
      {showFace && (
        <span className="pointer-events-none absolute inset-0 font-display" aria-hidden="true">
          {isMini ? (
            <span
              className="absolute whitespace-pre font-bold"
              style={{ top: "10cqw", left: "14cqw", fontSize: "43cqw", lineHeight: 1.05 }}
            >
              {card.rank}
              {"\n"}
              {SUIT_GLYPH[card.suit]}
              {"︎"}
            </span>
          ) : (
            <>
              <span
                className="absolute font-bold leading-none"
                style={{ top: "9cqw", left: "11cqw", fontSize: card.rank === "10" ? "26cqw" : "31cqw" }}
              >
                {card.rank}
              </span>
              <span
                className="absolute leading-none"
                style={{ top: "42cqw", left: "12cqw", fontSize: "16cqw" }}
              >
                {SUIT_GLYPH[card.suit]}
                {"︎"}
              </span>
              <span
                className="absolute leading-none"
                style={{ bottom: "0", right: "8cqw", fontSize: "66cqw" }}
              >
                {SUIT_GLYPH[card.suit]}
                {"︎"}
              </span>
            </>
          )}
          {folded && (
            <span
              className="absolute left-[-15%] right-[-15%] top-1/2 h-[2px] -rotate-[35deg] bg-ink"
              aria-hidden="true"
            />
          )}
        </span>
      )}
    </motion.div>
  );
}

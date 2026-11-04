"use client";

import { PlayingCard } from "@/components/cards/PlayingCard";
import { parseCard } from "@/lib/cards";
import { cn } from "@/lib/cn";

type Slot = { code: string | null; left: string; top: string; tilt: number };

/** A back, then K♡ A♠ Q♣ — crooked, overlapping, slightly uneven on purpose. */
const MOBILE: Slot[] = [
  { code: null, left: "20px", top: "70px", tilt: -24 },
  { code: "Kh", left: "74px", top: "34px", tilt: -9 },
  { code: "As", left: "132px", top: "26px", tilt: 6 },
  { code: "Qc", left: "176px", top: "74px", tilt: 21 },
];

const DESKTOP: Slot[] = [
  { code: null, left: "4%", top: "22%", tilt: -26 },
  { code: "Kh", left: "22%", top: "9%", tilt: -10 },
  { code: "As", left: "41%", top: "4%", tilt: 5 },
  { code: "Qc", left: "58%", top: "20%", tilt: 22 },
];

type HeroFanProps = { variant: "mobile" | "desktop"; className?: string };

/** The signature four-card fan on the connect screen. Pure decoration. */
export function HeroFan({ variant, className }: HeroFanProps) {
  const slots = variant === "mobile" ? MOBILE : DESKTOP;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      {slots.map((s, i) => (
        <div
          key={i}
          className="pointer-events-auto absolute"
          style={{ left: s.left, top: s.top, width: variant === "mobile" ? 128 : "38%" }}
        >
          <PlayingCard
            card={s.code ? parseCard(s.code) : undefined}
            face={s.code ? "up" : "down"}
            width="100%"
            tilt={s.tilt}
            deal="deal"
            delay={0.3 + i * 0.08}
            lift
            decorative
          />
        </div>
      ))}
    </div>
  );
}

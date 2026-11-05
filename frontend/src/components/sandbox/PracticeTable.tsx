"use client";

import { PlayingCard } from "@/components/cards/PlayingCard";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import type { Card } from "@/lib/cards";
import { timing } from "@/lib/motion";

type PracticeTableProps = {
  board: Card[];
  shown: number;
  hole: Card[];
  thinking: boolean;
};

/** Felt built only from monochrome shapes: dot texture, dashed rail, no green. */
export function PracticeTable({ board, shown, hole, thinking }: PracticeTableProps) {
  return (
    <section
      aria-label="Practice table"
      className="felt relative h-[330px] overflow-hidden rounded-[160px_160px_28px_28px] border border-border"
    >
      <div
        aria-hidden="true"
        className="absolute inset-3.5 rounded-[146px_146px_18px_18px] border border-dashed border-border"
      />

      <div className="absolute inset-x-0 top-[34px] flex flex-col items-center gap-2">
        <div className="flex gap-1.5">
          <PlayingCard face="down" width={34} tilt={-6} decorative />
          <PlayingCard face="down" width={34} tilt={5} decorative />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Practice bot</span>
      </div>

      <div role="group" aria-label="Community cards" className="absolute inset-x-0 top-[140px] flex justify-center gap-1.5">
        {board.map((c, i) =>
          i < shown ? (
            <PlayingCard
              key={`up-${i}`}
              card={c}
              width={52}
              deal="deal"
              delay={i < 3 ? i * timing.dealStagger : 0}
            />
          ) : (
            <PlayingCard key={`empty-${i}`} face="empty" width={52} />
          ),
        )}
      </div>

      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2.5">
        <div className="flex gap-1.5">
          <PlayingCard card={hole[0]} width={50} tilt={-7} />
          <PlayingCard card={hole[1]} width={50} tilt={6} />
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
          Your agent
          {thinking && <ThinkingDots size={5} label="Your agent is thinking" />}
        </span>
      </div>
    </section>
  );
}

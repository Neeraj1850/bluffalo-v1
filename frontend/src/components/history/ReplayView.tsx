"use client";

import { GameTable } from "@/components/game/GameView";
import { ButtonLink } from "@/components/ui/Button";
import { getPreset } from "@/lib/data/strategy";
import { blindsLabel, getTable, PRACTICE_TABLE_ID } from "@/lib/data/tables";
import type { HandMode } from "@/lib/poker/record";
import { useHands } from "@/lib/store/useHands";

/** Link to watch a stored hand again — never the live table. */
export const replayHref = (id: string, mode: HandMode) => `/history/${id.replace(/^#/, "")}?mode=${mode}`;

/** Plays back one recorded hand. Nothing is dealt and nothing is at stake. */
export function ReplayView({ id, mode }: { id: string; mode: HandMode }) {
  const hands = useHands(mode);
  const backHref = `/history?mode=${mode}`;
  const hand = hands?.find((h) => h.id === id);

  if (!hands) {
    return <p className="p-8 font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Loading the hand…</p>;
  }
  if (!hand) {
    return (
      <div className="flex flex-col items-start gap-4 p-8">
        <p className="text-[15px] text-muted">That hand isn’t in your history any more.</p>
        <ButtonLink href={backHref} size="md">
          Back to history
        </ButtonLink>
      </div>
    );
  }

  const table = getTable(hand.tableId ?? (mode === "practice" ? PRACTICE_TABLE_ID : undefined));
  return (
    <GameTable
      key={hand.id}
      hand={hand}
      live={mode === "real"}
      tableName={hand.table}
      blinds={blindsLabel(table)}
      presetLabel={getPreset(hand.agent?.preset ?? "custom").label}
      session={{ hands: 0, net: 0, stack: hand.stackAfter }}
      maxHands={1}
      stopLoss={0}
      stopRequested={false}
      stopped={null}
      dealing={false}
      onDone={() => false}
      onNextHand={() => {}}
      replay={{ backHref }}
    />
  );
}

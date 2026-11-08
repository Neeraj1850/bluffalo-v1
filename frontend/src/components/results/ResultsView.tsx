"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { CardFan } from "@/components/cards/CardFan";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { cardName } from "@/lib/cards";
import { DEMO_HAND } from "@/lib/data/hands";
import { getTable } from "@/lib/data/tables";
import { signed } from "@/lib/format";
import { useSetup } from "@/lib/store/setup";
import { CashoutSheet } from "./CashoutSheet";
import { VerificationCard } from "./VerificationCard";

export function ResultsView() {
  const setup = useSetup();
  // The agent's latest real hand; the demo hand until it has played one.
  const live = setup.hands[0];
  const hand = live ?? DEMO_HAND;
  const won = hand.net > 0;
  const [sheetOpen, setSheetOpen] = useState(false);
  const agent = setup.agent.status === "deployed" ? setup.agent : null;
  const buyIn = agent?.buyIn ?? setup.buyIn;
  const table = getTable(agent?.tableId ?? setup.tableId);

  // Cash out the agent's stack if it's still seated, otherwise the playing balance.
  const source = agent ? "agent" : "balance";
  const amount = agent ? agent.buyIn + hand.net : setup.balance;
  const sourceLabel = agent
    ? `your agent’s stack: ${agent.buyIn} buy-in ${signed(hand.net)} net`
    : "your playing balance";

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 overflow-hidden px-5 pb-8 pt-5 lg:pt-10">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-fg"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.09, 0] }}
        transition={{ duration: 0.9, times: [0, 0.12, 1], delay: 0.2 }}
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em]">Hand complete</span>
        <MonoLabel tracking="normal" className="tracking-[0.14em]">
          {hand.id} · {table.name}
        </MonoLabel>
      </div>

      <header className="flex flex-col gap-1.5">
        <MonoLabel>{won ? "Your agent won the pot" : hand.net < 0 ? "Your agent lost this hand" : "Your agent broke even"}</MonoLabel>
        <div className="flex items-baseline gap-2">
          <AnimatedNumber
            value={won ? hand.potWon : hand.net}
            format={won ? undefined : (n) => signed(n)}
            from={0}
            duration={0.8}
            delay={0.25}
            className="font-display text-[120px] font-bold leading-[0.82] tracking-[-0.07em] tabular"
          />
          <span className="font-display text-[22px] font-medium">NEAR</span>
        </div>
        <p className="mt-2 text-[15px] leading-normal text-muted">
          {hand.outcome} After its own bets, your agent is {hand.net < 0 ? "down" : "up"}{" "}
          <strong className="text-fg">{signed(hand.net)} NEAR</strong> this hand.
        </p>
      </header>

      {hand.winningFive.length > 0 && (
        <div className="flex justify-center sm:justify-start">
          <CardFan
            cards={hand.winningFive}
            dimmed={[hand.kickerIndex]}
            delay={0.3}
            step={0.74}
            spread={33}
            label={`Winning hand: ${hand.winningFive.map(cardName).join(", ")}`}
          />
        </div>
      )}

      <VerificationCard handId={hand.id} proof={live?.proof} />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.7 } } }}
      >
        <StatGroup>
          {[
            <StatBox key="b" label="Buy-in" value={buyIn.toFixed(1)} size="sm" />,
            <StatBox key="p" label="Pot won" value={hand.potWon.toFixed(1)} size="sm" />,
            <StatBox key="n" label="Net" value={signed(hand.net)} size="sm" emphasis="inverse" />,
          ].map((node) => (
            <motion.div
              key={node.key}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              className="[&:last-child]:bg-sel"
            >
              {node}
            </motion.div>
          ))}
        </StatGroup>
      </motion.div>

      <div className="mt-auto flex flex-col gap-2.5">
        <Button
          onClick={() => setSheetOpen(true)}
          disabled={amount <= 0}
          trailing={<span aria-hidden="true">{"↗"}</span>}
        >
          Cash out to any chain
        </Button>
        <ButtonLink href="/game" variant="secondary" size="md">
          Play another hand
        </ButtonLink>
      </div>

      <CashoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        amount={amount}
        sourceLabel={sourceLabel}
        onConfirmed={() => setup.withdraw(source, amount)}
      />
    </main>
  );
}

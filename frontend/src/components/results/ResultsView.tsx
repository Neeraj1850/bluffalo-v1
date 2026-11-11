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
import { useAgent } from "@/lib/store/useAgent";
import { useHands } from "@/lib/store/useHands";
import { CashoutSheet } from "./CashoutSheet";
import { AttestationCard } from "./AttestationCard";
import { VerificationCard } from "./VerificationCard";

export function ResultsView() {
  const setup = useSetup();
  const hands = useHands();
  const onChain = useAgent();
  // The agent's latest real hand; the demo hand until it has played one.
  const live = hands?.[0];
  const hand = live ?? DEMO_HAND;
  const won = hand.net > 0;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Don't flash the demo hand (and its win animation) while real hands load.
  if (!hands) return null;
  const agent = setup.agent.status === "deployed" ? setup.agent : null;
  const buyIn = agent?.buyIn ?? setup.buyIn;
  const table = getTable(agent?.tableId ?? setup.tableId);

  // Only real money can be cashed out: the agent's balance in the contract, read from the chain.
  const amount = onChain.agent?.balance ?? 0;
  const sourceLabel = "your agent’s balance on NEAR testnet";

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

      <VerificationCard handId={hand.id} proof={live?.proof} chain={live?.chain} />

      <AttestationCard />

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
          {amount > 0 ? `Cash out ${amount.toFixed(1)} NEAR` : "Nothing to cash out"}
        </Button>
        {onChain.agent && !onChain.agent.account && (
          <p className="text-[13px] text-muted">Deploy an agent to a real-money table to have something to cash out.</p>
        )}
        {onChain.error && <p className="text-[13px] text-muted">{onChain.error}</p>}
        <ButtonLink href="/game" variant="secondary" size="md">
          Play another hand
        </ButtonLink>
      </div>

      <CashoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        amount={amount}
        sourceLabel={sourceLabel}
        onConfirmed={() => {
          setup.withdraw("agent", amount);
          onChain.refresh();
        }}
      />
    </main>
  );
}

"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { CardFan } from "@/components/cards/CardFan";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatBox, StatGroup } from "@/components/ui/StatBox";
import { cardName } from "@/lib/cards";
import { getTable } from "@/lib/data/tables";
import { signed } from "@/lib/format";
import { agentBalanceState, IN_HAND_COPY } from "@/lib/agentStatus";
import { useSetup } from "@/lib/store/setup";
import { useAgent } from "@/lib/store/useAgent";
import { useHands } from "@/lib/store/useHands";
import { useWallet } from "@/lib/store/useWallet";
import { stopAgent, txUrl } from "@/services/agentApi";
import type { LiveHand } from "@/lib/poker/record";
import { CashoutSheet } from "./CashoutSheet";
import { AttestationCard } from "./AttestationCard";
import { VerificationCard } from "./VerificationCard";
import { netAfterRake, rakeOf } from "@/services/houseApi";

type StopState =
  | { status: "idle"; error?: string }
  | { status: "stopping" }
  | { status: "done"; tx: string; amount: number };

export function ResultsView() {
  const setup = useSetup();
  const hands = useHands();
  const onChain = useAgent();
  const wallet = useWallet();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stop, setStop] = useState<StopState>({ status: "idle" });
  if (!hands) return null;
  const hand = hands[0];
  const agent = setup.agent.status === "deployed" ? setup.agent : null;
  const buyIn = agent?.buyIn ?? setup.buyIn;
  const table = getTable(agent?.tableId ?? setup.tableId);

  // Only real money can be cashed out: the agent's balance in the contract, read from the chain.
  const amount = onChain.agent?.balance ?? 0;
  const sourceLabel = "your agent’s balance on NEAR testnet";
  const hasAgent = Boolean(onChain.agent?.account);
  const inHand = agentBalanceState(onChain.agent) === "in_hand";

  const onStop = async () => {
    if (stop.status === "stopping") return;
    setStop({ status: "stopping" });
    try {
      const r = await stopAgent();
      setStop({ status: "done", tx: r.tx, amount: r.amount });
      setup.stopAgent();
    } catch (e) {
      setStop({ status: "idle", error: e instanceof Error ? e.message : "Couldn’t stop the agent." });
    } finally {
      onChain.refresh();
      void wallet.refresh();
    }
  };

  const actions = (
    <div className="mt-auto flex flex-col gap-2.5">
      {hasAgent && (
        <Button
          onClick={onStop}
          disabled={(inHand || amount <= 0) && stop.status !== "stopping"}
          pending={stop.status === "stopping"}
          pendingLabel="Returning funds…"
        >
          {inHand
            ? IN_HAND_COPY
            : amount > 0
              ? `Stop agent & return ${amount.toFixed(1)} GNEAR to balance`
              : "Agent balance is empty"}
        </Button>
      )}
      {stop.status === "done" && (
        <p role="status" className="text-[13px] text-muted">
          Returned {stop.amount.toFixed(2)} GNEAR to your playing balance
          {wallet.wallet ? ` (now ${wallet.wallet.balance.toFixed(2)} GNEAR)` : ""}.{" "}
          <a href={txUrl(stop.tx)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            View the transaction ↗
          </a>
        </p>
      )}
      {stop.status === "idle" && stop.error && (
        <p role="alert" className="text-[13px] text-muted">
          ! {stop.error}
        </p>
      )}
      <Button
        variant="secondary"
        size="md"
        onClick={() => setSheetOpen(true)}
        disabled={amount <= 0}
        trailing={<span aria-hidden="true">{"↗"}</span>}
      >
        {amount > 0 ? `Cash out ${amount.toFixed(1)} GNEAR to a testnet account` : "Nothing to cash out"}
      </Button>
      {onChain.agent && !onChain.agent.account && (
        <p className="text-[13px] text-muted">Deploy an agent to a real-money table to have something to cash out.</p>
      )}
      {onChain.error && <p className="text-[13px] text-muted">{onChain.error}</p>}
      <ButtonLink href="/game" variant="secondary" size="md">
        {hand ? "Play another hand" : "Watch your agent play"}
      </ButtonLink>
    </div>
  );

  const sheet = (
    <CashoutSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      amount={amount}
      sourceLabel={sourceLabel}
      onConfirmed={() => {
        setup.stopAgent();
        onChain.refresh();
      }}
    />
  );

  if (!hand) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pb-8 pt-5 lg:pt-10">
        <MonoLabel tracking="wide">Results</MonoLabel>
        <header className="flex flex-col gap-3">
          <h1 className="display text-[54px] leading-[0.88] tracking-[-0.06em]">no real hands yet.</h1>
          <p className="text-[15px] leading-normal text-muted">
            Results show up here once your agent plays a real-money hand. Practice hands are saved as sessions in the
            Practice tab.
          </p>
        </header>
        <div className="flex flex-col gap-2.5">
          <ButtonLink href="/live" size="md">
            Play live
          </ButtonLink>
          <ButtonLink href="/practice" variant="secondary" size="md">
            Practise free
          </ButtonLink>
        </div>
        <AttestationCard />
        {actions}
        {sheet}
      </main>
    );
  }

  return <HandResult hand={hand} tableName={table.name} buyIn={buyIn} actions={actions} sheet={sheet} />;
}

function HandResult({
  hand,
  tableName,
  buyIn,
  actions,
  sheet,
}: {
  hand: LiveHand;
  tableName: string;
  buyIn: number;
  actions: ReactNode;
  sheet: ReactNode;
}) {
  const won = hand.net > 0;
  const rake = rakeOf(hand);
  const net = netAfterRake(hand);
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
          {hand.id} · {tableName}
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
          <span className="font-display text-[22px] font-medium">GNEAR</span>
        </div>
        <p className="mt-2 text-[15px] leading-normal text-muted">
          {hand.outcome} After its own bets, your agent is {net < 0 ? "down" : "up"}{" "}
          <strong className="text-fg">{signed(net)} GNEAR</strong> this hand
          {rake > 0 ? `, after the house took ${rake.toFixed(1)} GNEAR rake from the pot` : ""}.
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

      <VerificationCard handId={hand.id} proof={hand.proof} chain={hand.chain} />

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
            ...(rake > 0 ? [<StatBox key="r" label="Rake" value={`−${rake.toFixed(1)}`} size="sm" />] : []),
            <StatBox key="n" label={rake > 0 ? "Net after rake" : "Net"} value={signed(net)} size="sm" emphasis="inverse" />,
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

      {actions}
      {sheet}
    </main>
  );
}

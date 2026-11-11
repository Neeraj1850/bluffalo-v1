"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { CashoutSheet } from "@/components/results/CashoutSheet";
import { agentBalanceState, IN_HAND_COPY } from "@/lib/agentStatus";
import { useSetup } from "@/lib/store/setup";
import { useAgent } from "@/lib/store/useAgent";
import { useWallet } from "@/lib/store/useWallet";
import { addressUrl, stopAgent, txUrl } from "@/services/agentApi";
import { DepositPanel, WithdrawPanel } from "./DepositSheet";

type StopState =
  | { status: "idle"; error?: string }
  | { status: "stopping" }
  | { status: "done"; tx: string; amount: number };

const section = "flex flex-col gap-4 rounded-card border border-border p-5";
const link = "font-mono text-[11px] uppercase tracking-[0.12em] underline underline-offset-4";

/** The player's playing balance (deposit / withdraw) and their agent's on-chain balance. */
export function WalletView() {
  const wallet = useWallet();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pb-8 pt-5 lg:pt-10">
      <MonoLabel tracking="wide">Wallet</MonoLabel>
      <header className="flex flex-col gap-1.5">
        <MonoLabel>Playing balance · NEAR testnet</MonoLabel>
        <span className="font-display text-[56px] font-bold leading-none tracking-[-0.05em] tabular">
          {wallet.wallet ? `${wallet.wallet.balance.toFixed(2)}` : "—"}
          <span className="ml-2 font-display text-[22px] font-medium">GNEAR</span>
        </span>
        {wallet.signedOut && <p className="text-[14px] text-muted">Sign in to see your balance.</p>}
      </header>

      <section aria-labelledby="deposit-h" className={section}>
        <h2 id="deposit-h" className="font-mono text-[11px] uppercase tracking-[0.16em]">
          Deposit
        </h2>
        <DepositPanel open />
      </section>

      {!wallet.signedOut && (
        <section aria-labelledby="withdraw-h" className={section}>
          <h2 id="withdraw-h" className="font-mono text-[11px] uppercase tracking-[0.16em]">
            Withdraw
          </h2>
          <WithdrawPanel />
        </section>
      )}

      <AgentCard />
    </main>
  );
}

function AgentCard() {
  const setup = useSetup();
  const onChain = useAgent();
  const wallet = useWallet();
  const [stop, setStop] = useState<StopState>({ status: "idle" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const state = agentBalanceState(onChain.agent);
  const amount = onChain.agent?.balance ?? 0;

  const onStop = async () => {
    if (stop.status === "stopping") return;
    setStop({ status: "stopping" });
    try {
      const r = await stopAgent();
      setStop({ status: "done", tx: r.tx, amount: r.amount });
      setup.stopAgent();
    } catch (e) {
      setStop({ status: "idle", error: e instanceof Error ? e.message : "Couldn’t return the agent’s funds." });
    } finally {
      onChain.refresh();
      void wallet.refresh();
    }
  };

  return (
    <section aria-labelledby="agent-h" className={section}>
      <h2 id="agent-h" className="font-mono text-[11px] uppercase tracking-[0.16em]">
        Agent
      </h2>

      {state === "loading" &&
        (onChain.error ? (
          <p role="alert" className="text-[13px] text-muted">
            ! {onChain.error}{" "}
            <button type="button" onClick={onChain.refresh} className="underline underline-offset-2">
              Retry
            </button>
          </p>
        ) : (
          <ThinkingDots />
        ))}

      {state === "none" && (
        <>
          <p className="text-[14px] text-muted">
            No agent at a table right now. Send one live and its chips show up here.
          </p>
          <ButtonLink href="/live" variant="secondary" size="md">
            Play live
          </ButtonLink>
        </>
      )}

      {onChain.agent?.account && (
        <>
          <div className="flex flex-col gap-1">
            <code className="break-all font-mono text-[12px]">{onChain.agent.account}</code>
            <span className="font-display text-[32px] font-bold leading-none tracking-[-0.04em] tabular">
              {amount.toFixed(2)} GNEAR
            </span>
            <span className="text-[12px] text-muted">On-chain balance in the table contract</span>
            <a href={addressUrl(onChain.agent.account)} target="_blank" rel="noreferrer" className={link}>
              View on NearBlocks ↗
            </a>
          </div>

          {state === "in_hand" && (
            <p role="status" className="text-[13px] text-muted">
              {IN_HAND_COPY}.
            </p>
          )}
          {state === "empty" && <p className="text-[13px] text-muted">Agent balance is empty.</p>}

          <Button
            onClick={onStop}
            disabled={state !== "funded" && stop.status !== "stopping"}
            pending={stop.status === "stopping"}
            pendingLabel="Returning funds…"
          >
            Return to balance
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setSheetOpen(true)}
            disabled={state !== "funded"}
            trailing={<span aria-hidden="true">{"↗"}</span>}
          >
            Cash out to a testnet account
          </Button>
        </>
      )}

      {stop.status === "done" && (
        <p role="status" className="text-[13px] text-muted">
          Returned {stop.amount.toFixed(2)} GNEAR to your playing balance.{" "}
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
      {onChain.agent && onChain.error && <p className="text-[13px] text-muted">{onChain.error}</p>}

      <CashoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        amount={amount}
        sourceLabel="your agent’s balance on NEAR testnet"
        onConfirmed={() => {
          setup.stopAgent();
          onChain.refresh();
        }}
      />
    </section>
  );
}

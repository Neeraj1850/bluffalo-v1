"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { useWallet } from "@/lib/store/useWallet";
import { depositReceived, FAUCET_URL, TABLE_PER_TESTNET, toTestnet, withdrawProblem } from "@/lib/wallet";
import { addressUrl, fundWallet, txUrl, withdrawFromWallet } from "@/services/agentApi";

export type WalletTab = "deposit" | "withdraw";

type DepositSheetProps = {
  open: boolean;
  onClose: () => void;
  initialTab?: WalletTab;
};

const label = "font-mono text-[11px] uppercase tracking-[0.12em] text-muted";
const link = "font-mono text-[11px] uppercase tracking-[0.12em] underline underline-offset-4";

/** Deposit address + live balance, and withdrawals back to a testnet account. */
export function DepositSheet({ open, onClose, initialTab = "deposit" }: DepositSheetProps) {
  const [tab, setTab] = useState<WalletTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Sheet open={open} onClose={onClose} title={tab === "deposit" ? "add funds" : "withdraw"}>
      <div role="tablist" aria-label="Wallet" className="flex gap-2">
        {(["deposit", "withdraw"] as const).map((t) => {
          const on = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              className={cn(
                "relative h-10 rounded-chip border px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-200",
                on ? "border-sel text-onsel" : "border-border text-fg",
              )}
            >
              {on && (
                <motion.span
                  layoutId="wallet-tab"
                  transition={spring.indicator}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[7px] bg-sel"
                />
              )}
              <span className="relative">{t === "deposit" ? "Deposit" : "Withdraw"}</span>
            </button>
          );
        })}
      </div>
      {tab === "deposit" ? <DepositPanel open={open} /> : <WithdrawPanel />}
    </Sheet>
  );
}

export function DepositPanel({ open }: { open: boolean }) {
  const { wallet, error, signedOut, refresh } = useWallet();
  const balance = wallet?.balance ?? null;
  const [baseline, setBaseline] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState<{ pending: boolean; error?: string }>({ pending: false });

  const fund = async () => {
    setFunding({ pending: true });
    try {
      await fundWallet();
      await refresh();
      setFunding({ pending: false });
    } catch (e) {
      setFunding({ pending: false, error: e instanceof Error ? e.message : "Couldn’t send testnet NEAR." });
    }
  };

  // Remember the balance when the sheet opens, so arriving funds can be announced.
  useEffect(() => {
    if (!open) return setBaseline(null);
    if (baseline === null && balance !== null) setBaseline(balance);
  }, [open, balance, baseline]);

  const received = depositReceived(baseline, balance);

  const copy = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (signedOut) return <p className="text-[14px] text-muted">Sign in to get your deposit address.</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-normal text-muted">
        Send <strong className="text-fg">NEAR testnet</strong> tokens to your deposit address. Tables use a small
        scale: 1 NEAR at the table = {1 / TABLE_PER_TESTNET} testnet NEAR, so 0.1 testnet NEAR gives you{" "}
        {0.1 * TABLE_PER_TESTNET} NEAR to play with.
      </p>
      <p className="text-[13px] leading-normal text-muted">
        This is a <strong className="text-fg">NEAR</strong> address. An EVM wallet like MetaMask can’t send to it — use
        the button below, or send from a NEAR wallet or faucet.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className={label}>Your deposit address · NEAR testnet</span>
        {wallet ? (
          <div className="flex items-stretch gap-2">
            <code className="flex min-h-12 flex-1 items-center break-all rounded-btn border border-border px-3 py-2 font-mono text-[12px]">
              {wallet.account}
            </code>
            <button
              type="button"
              onClick={copy}
              className="w-20 shrink-0 rounded-btn border border-fg font-mono text-[11px] uppercase tracking-[0.12em]"
              aria-live="polite"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : error ? (
          <p role="alert" className="text-[13px] text-muted">
            ! {error}{" "}
            <button type="button" onClick={() => void refresh()} className="underline underline-offset-2">
              Retry
            </button>
          </p>
        ) : (
          <ThinkingDots />
        )}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={cn("flex flex-col gap-1 rounded-card p-4", received ? "bg-sel text-onsel" : "border border-border")}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
          {received ? `Deposit received · +${received.toFixed(2)} NEAR` : balance ? "Balance · checks for new deposits every 5 s" : "Waiting for funds · checks every 5 s"}
        </span>
        <span className="font-display text-[32px] font-bold leading-none tracking-[-0.04em] tabular">
          {balance === null ? "—" : `${balance.toFixed(2)} NEAR`}
        </span>
        {balance !== null && (
          <span className="text-[12px] opacity-80">= {toTestnet(balance).toFixed(4)} testnet NEAR</span>
        )}
      </div>

      {wallet && balance === 0 && (
        <div className="flex flex-col gap-1.5">
          <Button onClick={fund} pending={funding.pending} pendingLabel="Sending testnet NEAR…">
            Fund my wallet with testnet NEAR
          </Button>
          {funding.error && (
            <p role="alert" className="text-[13px] text-muted">
              ! {funding.error}
            </p>
          )}
          <span className="text-[12px] text-muted">
            We’ll send {0.1 * TABLE_PER_TESTNET} NEAR to play with — once, while your wallet is empty.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" className={link}>
          Or top up from a faucet ↗
        </a>
        {wallet && balance !== null && balance > 0 && (
          <a href={addressUrl(wallet.account)} target="_blank" rel="noreferrer" className={link}>
            View on NearBlocks ↗
          </a>
        )}
      </div>
    </div>
  );
}

type WithdrawState =
  | { status: "idle"; error?: string }
  | { status: "sending" }
  | { status: "sent"; tx: string };

export function WithdrawPanel() {
  const { wallet, refresh } = useWallet();
  const balance = wallet?.balance ?? null;
  const [receiver, setReceiver] = useState("");
  const [amountText, setAmountText] = useState("");
  const [state, setState] = useState<WithdrawState>({ status: "idle" });
  const problem = withdrawProblem(receiver, amountText, balance);

  const send = async () => {
    if (problem || state.status === "sending") return;
    setState({ status: "sending" });
    try {
      const amount = amountText.trim() === "" ? undefined : Number(amountText);
      const { tx } = await withdrawFromWallet({ receiver: receiver.trim(), amount });
      setState({ status: "sent", tx });
      void refresh();
    } catch (e) {
      setState({ status: "idle", error: e instanceof Error ? e.message : "The withdrawal didn’t go through." });
    }
  };

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <StatusBadge kind="submitted" size="sm" className="self-start">
          Sent
        </StatusBadge>
        <p className="text-[14px] text-muted">
          The network accepted the transfer to <strong className="text-fg">{receiver}</strong>. Your balance updates
          below as soon as it settles.
        </p>
        <a href={txUrl(state.tx)} target="_blank" rel="noreferrer" className={link}>
          View the transaction ↗
        </a>
        <p className="font-mono text-[12px]">Balance · {balance === null ? "—" : `${balance.toFixed(2)} NEAR`}</p>
        <Button variant="secondary" size="md" onClick={() => setState({ status: "idle" })}>
          New withdrawal
        </Button>
      </div>
    );
  }

  const pending = state.status === "sending";
  const error = state.status === "idle" ? state.error : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-muted">
        Send from your balance ({balance === null ? "—" : `${balance.toFixed(2)} NEAR`}) to any NEAR testnet account.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={label}>To testnet account</span>
        <input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value.toLowerCase())}
          placeholder="you.testnet"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={pending}
          className="h-12 rounded-btn border border-border bg-transparent px-4 font-mono text-[15px] outline-none focus:border-fg"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>Amount · table NEAR (empty = everything)</span>
        <div className="flex gap-2">
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            placeholder={balance === null ? "0" : balance.toFixed(2)}
            disabled={pending}
            className="h-12 min-w-0 flex-1 rounded-btn border border-border bg-transparent px-4 font-mono text-[15px] outline-none focus:border-fg"
          />
          <button
            type="button"
            disabled={pending || balance === null}
            onClick={() => balance !== null && setAmountText(String(balance))}
            className="w-20 rounded-btn border border-fg font-mono text-[11px] uppercase tracking-[0.12em] disabled:opacity-40"
          >
            Max
          </button>
        </div>
      </label>
      {(error || (problem && receiver)) && (
        <p role="alert" className="text-[13px] text-muted">
          ! {error ?? problem}
        </p>
      )}
      <Button onClick={send} disabled={Boolean(problem)} pending={pending} pendingLabel="Sending…">
        Withdraw
      </Button>
    </div>
  );
}

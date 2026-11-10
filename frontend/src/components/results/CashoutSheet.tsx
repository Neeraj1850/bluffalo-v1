"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { cn } from "@/lib/cn";
import type { Chain } from "@/services/agentApi";
import { useCashout } from "./useCashout";

// Testnet: only NEAR is real. Other chains go through NEAR Intents, which is mainnet-only.
const CHAINS: { chain: Chain; note: string; available: boolean }[] = [
  { chain: "NEAR", note: "Testnet", available: true },
  { chain: "Ethereum", note: "Mainnet · NEAR Intents", available: false },
  { chain: "Solana", note: "Mainnet · NEAR Intents", available: false },
  { chain: "Base", note: "Mainnet · NEAR Intents", available: false },
];
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

const STEPS = ["1 Destination", "2 Review", "3 Confirm"];

type CashoutSheetProps = {
  open: boolean;
  onClose: () => void;
  amount: number;
  /** Plain-English description of where the amount comes from. */
  sourceLabel: string;
  onConfirmed: () => void;
};

function fmt(n: number) {
  return n >= 1 ? n.toFixed(2) : n.toPrecision(2);
}

export function CashoutSheet({ open, onClose, amount, sourceLabel, onConfirmed }: CashoutSheetProps) {
  const c = useCashout(amount, onConfirmed);
  const { state } = c;
  const stepIndex = state.step === "choose" ? 0 : state.step === "review" ? 1 : 2;

  const close = () => {
    onClose();
    // Leave a finished transfer visible next time only if it's still in flight.
    if (state.step !== "track" || state.status !== "submitted") setTimeout(c.reset, 350);
  };

  return (
    <Sheet open={open} onClose={close} title="cash out">
      <ol aria-label="Steps" className="grid grid-cols-3 gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === stepIndex ? "step" : undefined}
            className={cn(
              "border-t-[3px] pt-2 transition-colors duration-300",
              i <= stepIndex ? "border-fg text-fg" : "border-track text-muted",
            )}
          >
            {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        {state.step === "choose" && (
          <motion.fieldset
            key="choose"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="flex flex-col gap-2"
          >
            <legend className="pb-2 text-[14px] text-muted">
              Where should {amount.toFixed(1)} NEAR go? ({sourceLabel})
            </legend>
            {CHAINS.map(({ chain, note, available }) => {
              const on = c.chain === chain;
              return (
                <button
                  key={chain}
                  type="button"
                  aria-pressed={on}
                  disabled={!available}
                  onClick={() => c.setChain(chain)}
                  className={cn(
                    "flex h-[52px] items-center justify-between rounded-btn border px-4 text-[15px] font-medium transition-colors disabled:border-dashed disabled:text-muted",
                    on ? "border-sel bg-sel text-onsel" : "border-border text-fg",
                  )}
                >
                  {chain}
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{note}</span>
                </button>
              );
            })}
            {c.chain === "NEAR" && (
              <label className="flex flex-col gap-1.5 pt-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Your testnet account</span>
                <input
                  value={c.receiver}
                  onChange={(e) => c.setReceiver(e.target.value.toLowerCase())}
                  placeholder="you.testnet"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-12 rounded-btn border border-border bg-transparent px-4 font-mono text-[15px] outline-none focus:border-fg"
                />
              </label>
            )}
            {state.error && (
              <p role="alert" className="text-[13px] text-muted">
                ! {state.error}
              </p>
            )}
            <Button
              className="mt-2"
              disabled={c.chain !== "NEAR" || !ACCOUNT.test(c.receiver.trim())}
              pending={state.quoting}
              pendingLabel="Getting a quote…"
              onClick={c.getQuote}
            >
              Get a quote
            </Button>
          </motion.fieldset>
        )}

        {state.step === "review" && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="flex flex-col gap-3"
          >
            <StatusBadge kind="quote" size="sm" className="self-start">
              {c.secondsLeft > 0
                ? `Quote · not sent · expires in 0:${String(c.secondsLeft).padStart(2, "0")}`
                : "Quote expired · not sent"}
            </StatusBadge>
            <dl className="flex flex-col">
              {[
                ["From your agent", `${state.quote.send.toFixed(1)} NEAR`],
                ["To", state.quote.id === state.quote.chain ? state.quote.chain : `${state.quote.id} · ${state.quote.chain}`],
                ["Fees", `${fmt(state.quote.fee)} ${state.quote.receiveAsset}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-hair py-2.5">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">You get {"≈"}</dt>
                <dd className="font-display text-[20px] font-bold">
                  {fmt(state.quote.receive)} {state.quote.receiveAsset}
                </dd>
              </div>
            </dl>
            {state.error && (
              <p role="alert" className="rounded-card border-2 border-fg p-3 text-[13px]">
                ! {state.error}
              </p>
            )}
            {c.secondsLeft > 0 ? (
              <Button onClick={c.confirm} pending={state.submitting} pendingLabel="Submitting…">
                Confirm cash out
              </Button>
            ) : (
              <Button onClick={c.getQuote}>Refresh quote</Button>
            )}
            <Button variant="ghost" size="sm" onClick={c.reset} disabled={state.submitting}>
              Change destination
            </Button>
          </motion.div>
        )}

        {state.step === "track" && (
          <motion.div
            key="track"
            role="status"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-1"
          >
            {[
              { label: "Quote accepted", done: true, tag: "Done" },
              { label: "Submitted to the network", done: true, tag: "Submitted" },
              {
                label: `Arrived on ${state.quote.chain}`,
                done: state.status === "confirmed",
                tag: state.status === "confirmed" ? "Confirmed" : state.status === "failed" ? "Failed" : "Waiting",
              },
            ].map((row, i) => (
              <div key={row.label} className={cn("flex items-center gap-3 py-3", i < 2 && "border-b border-hair")}>
                <span className="w-6 text-center" aria-hidden="true">
                  {row.done ? "✓" : state.status === "failed" ? "!" : <ThinkingDots size={4} />}
                </span>
                <span className="flex-1">{row.label}</span>
                <span className="font-mono text-[10px] uppercase text-muted">{row.tag}</span>
              </div>
            ))}
            <p className="pt-1 text-[13px] leading-normal text-muted">
              {state.status === "confirmed"
                ? "Done. The funds are in your account on the destination network."
                : state.status === "failed"
                  ? "The transfer didn’t complete. Contact support with your transfer details."
                  : "Submitted is not the same as arrived. We’ll mark it confirmed only when the destination network does."}
            </p>
            <a
              href={`https://testnet.nearblocks.io/txns/${state.txId}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] uppercase tracking-[0.12em] underline underline-offset-4"
            >
              View the transaction ↗
            </a>
            {state.status === "confirmed" && (
              <Button className="mt-3" variant="secondary" onClick={close}>
                Done
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

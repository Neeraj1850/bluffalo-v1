"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Arrow, Button, ButtonLink } from "@/components/ui/Button";
import {
  ConfirmationSummary,
  type SummaryRow,
} from "@/components/ui/ConfirmationSummary";
import { Disclosure } from "@/components/ui/Disclosure";
import { IconButton } from "@/components/ui/IconButton";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { getPreset } from "@/lib/data/strategy";
import {
  blindsLabel,
  closedReason,
  DEFAULT_TABLE_ID,
  getTable,
  TABLES,
} from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { useWallet } from "@/lib/store/useWallet";
import { DepositSheet } from "@/components/wallet/DepositSheet";
import { HouseRules } from "@/components/house/HouseRules";
import { fundWallet } from "@/services/agentApi";
import {
  clampBuyIn,
  deployTotal,
  fetchTables,
  TABLE_CLOSED,
  type TableStatus,
} from "@/services/houseApi";
import { useDeploy } from "./useDeploy";

export function DeployView() {
  const setup = useSetup();
  const table = getTable(setup.tableId);
  const preset = getPreset(setup.preset);
  const wallet = useWallet();
  const [depositOpen, setDepositOpen] = useState(false);
  const [funding, setFunding] = useState<{ pending: boolean; error?: string }>({
    pending: false,
  });
  const [tables, setTables] = useState<TableStatus[] | null>(null);
  const realTables = TABLES.filter((t) => t.mode === "real");
  const { selectTable } = setup;

  // Live play always means a real table: move off the practice table.
  useEffect(() => {
    if (getTable(setup.tableId).mode !== "real") selectTable(DEFAULT_TABLE_ID);
  }, [setup.tableId, selectTable]);
  useEffect(() => {
    fetchTables()
      .then((r) => setTables(r.tables))
      .catch(() => setTables([]));
  }, []);

  const request = useMemo(
    () => ({
      tableId: setup.tableId,
      buyIn: setup.buyIn,
      preset: setup.preset,
      params: setup.params,
      limits: setup.limits,
    }),
    [setup.tableId, setup.buyIn, setup.preset, setup.params, setup.limits],
  );
  const { fee, phase, deploy, retryFee, clearFailure } = useDeploy(request);
  // The server sets the buy-in; until its quote loads, show the table's default.
  // tableFee / maxBuyIn are newer quote fields: read defensively.
  const extra =
    fee.status === "quoted"
      ? (fee.quote as { tableFee?: number; maxBuyIn?: number })
      : {};
  const tableFee = extra.tableFee ?? 0;
  const buyIn = clampBuyIn(
    fee.status === "quoted" ? fee.quote.buyIn : setup.buyIn,
    extra.maxBuyIn ?? 0,
  );
  const total = deployTotal(buyIn, tableFee);

  // Balance at the moment of submitting, so the copy stays correct after it drops.
  const [committedFrom, setCommittedFrom] = useState<number | null>(null);
  const liveBalance = wallet.wallet?.balance ?? null;
  const startBalance = committedFrom ?? liveBalance;

  // Coming back here with an agent already seated must never allow a second deploy.
  const alreadyDeployed =
    setup.agent.status === "deployed" && phase.status === "idle";
  const isPractice = table.mode === "practice";
  const pending = phase.status === "pending";
  const done = phase.status === "done" || alreadyDeployed;
  const refused =
    phase.status === "failed" && phase.code === "insufficient_funds";
  const closed = phase.status === "failed" && phase.code === TABLE_CLOSED;
  const insufficient =
    !isPractice &&
    !done &&
    !pending &&
    !closed &&
    (refused || (startBalance !== null && startBalance < total));
  const canSubmit =
    fee.status === "quoted" &&
    startBalance !== null &&
    !insufficient &&
    !isPractice &&
    !closed;
  const fmt = (n: number) => n.toFixed(2);

  const feeRow: SummaryRow =
    fee.status === "loading"
      ? {
          label: "Network fee",
          value: <span className="text-muted">Loading quote…</span>,
        }
      : fee.status === "unavailable"
        ? {
            label: "Network fee",
            value: "Unavailable",
            note: (
              <button
                type="button"
                onClick={retryFee}
                className="underline underline-offset-2"
              >
                Can&rsquo;t confirm until a quote loads · retry
              </button>
            ),
          }
        : fee.quote.fee === 0
          ? {
              label: "Network fee",
              value: "None",
              note: "Operator-funded on testnet",
            }
          : {
              label: "Network fee",
              value: `≈ ${fee.quote.fee} NEAR`,
              note: "Network’s cost, not ours",
            };

  const rows: SummaryRow[] = [
    { label: "Table", value: table.name, note: "heads-up vs the house agent" },
    {
      label: "Blinds",
      value: `${blindsLabel(table)} GNEAR`,
      note: "two small forced bets per hand",
    },
    {
      label: "Agent balance",
      value: `${buyIn} GNEAR`,
      note: "its whole stack",
    },
    {
      label: "Strategy",
      value: preset.label,
      note: preset.tag.split("·").pop()?.trim().toLowerCase(),
    },
    {
      label: "Stop loss",
      value: `${setup.limits.stopLoss} GNEAR`,
      note: "stops after losing this",
    },
    {
      label: "Take profit",
      value: `${setup.limits.takeProfit} GNEAR`,
      note: "stops after winning this",
    },
    {
      label: "Max hands",
      value: String(setup.limits.maxHands),
      note: "then leaves the table",
    },
    feeRow,
    {
      label: "Table fee",
      value:
        fee.status === "quoted"
          ? tableFee > 0
            ? `${fmt(tableFee)} GNEAR`
            : "None"
          : "—",
      note: "2% of the buy-in, kept by the house",
    },
    {
      label: "House rake",
      value: "5% of won pots",
      note: "only pots that see a flop · max 3 big blinds",
    },
    {
      label: "Total from balance",
      value: `${fmt(total)} GNEAR`,
      note: "buy-in + table fee",
    },
  ];

  const addFunds = async () => {
    setFunding({ pending: true });
    try {
      await fundWallet();
      setFunding({ pending: false });
      clearFailure();
    } catch (e) {
      setFunding({
        pending: false,
        error: e instanceof Error ? e.message : "Couldn’t add test funds.",
      });
    }
    void wallet.refresh();
  };

  const onSubmit = async () => {
    if (!canSubmit || pending) return;
    setCommittedFrom(liveBalance);
    const result = await deploy();
    if (result) setup.markDeployed(result.agentAccount, result.buyIn ?? buyIn);
    else setCommittedFrom(null);
    void wallet.refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 pb-8 pt-5 lg:pt-10">
      <div className="flex items-center justify-between">
        <IconButton href="/live" label="Back to live">
          {"←"}
        </IconButton>
        <MonoLabel tracking="wide">Play live</MonoLabel>
        <span className="w-11" aria-hidden="true" />
      </div>

      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <h1 className="display text-[54px] leading-[0.88] tracking-[-0.06em] lg:text-[72px]">
          {done ? "your agent is playing." : "play live."}
        </h1>
        <p className="max-w-[300px] text-[15px] leading-normal text-muted">
          {done
            ? "Confirmed on the network. Grab a seat and watch."
            : "Pick a table and confirm. This uses real testnet money."}
        </p>
      </header>

      {!done && (
        <div
          role="radiogroup"
          aria-label="Table"
          className="grid grid-cols-3 gap-2"
        >
          {realTables.map((t) => {
            const status = tables?.find((x) => x.id === t.id);
            const isClosed = status ? !status.open : false;
            const on = t.id === table.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={isClosed || pending}
                title={isClosed ? closedReason(status?.reason) : undefined}
                onClick={() => {
                  selectTable(t.id);
                  clearFailure();
                }}
                className={
                  "flex flex-col items-start gap-0.5 rounded-btn border p-3 text-left disabled:opacity-40 " +
                  (on
                    ? "border-fg bg-fg text-bg"
                    : "border-border hover:border-fg")
                }
              >
                <span className="font-display text-[15px] font-medium leading-tight">
                  {t.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] opacity-70">
                  {isClosed
                    ? "Closed"
                    : t.buyIn
                      ? `${t.buyIn.min}–${t.buyIn.max} GNEAR`
                      : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <dl className="flex flex-col divide-y divide-hair rounded-card border border-border">
        {[
          [
            "Your agent",
            <span key="a">
              {preset.label} ·{" "}
              <Link href="/strategy" className="underline underline-offset-4">
                change
              </Link>
            </span>,
          ],
          ["Chips for your agent", `${buyIn} GNEAR`],
          [
            "From your balance",
            `${fmt(total)} GNEAR${tableFee > 0 ? " (incl. 2% table fee)" : ""}`,
          ],
        ].map(([k, v]) => (
          <div
            key={String(k)}
            className="flex items-baseline justify-between gap-4 px-4 py-3.5"
          >
            <dt className="text-[14px] text-muted">{k}</dt>
            <dd className="font-display text-[17px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] leading-[1.5] text-muted">
        {alreadyDeployed
          ? "Already moved from your playing balance to your agent’s account."
          : `It stops itself after losing ${setup.limits.stopLoss}, winning ${setup.limits.takeProfit}, or ${setup.limits.maxHands} hands. Stop it any time — its chips come back to your balance.`}{" "}
        {startBalance !== null &&
          !done &&
          `You have ${fmt(startBalance)} GNEAR.`}
      </p>

      <AnimatePresence mode="popLayout">
        {closed && (
          <motion.div
            key="closed"
            role="alert"
            className="flex flex-col gap-1.5 rounded-card border-2 border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              ! Table closed
            </span>
            <span className="text-[14px] leading-normal text-muted">
              The house bankroll is too low to cover this table right now, so it
              isn&rsquo;t taking new agents. No funds moved. Try another table
              or come back later.
            </span>
          </motion.div>
        )}
        {phase.status === "failed" && !refused && !closed && (
          <motion.div
            key="failed"
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1.5 rounded-card border-2 border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              ! Couldn&rsquo;t start your agent
            </span>
            <span className="text-[14px] leading-normal text-muted">
              {phase.message}{" "}
              {phase.fundsMoved
                ? "Some funds may have moved — check your balance."
                : "No funds moved."}{" "}
              Your settings are saved — try again, or edit them first.
            </span>
          </motion.div>
        )}
        {done && (
          <motion.div
            key="done"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-1.5 rounded-card border border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              {alreadyDeployed
                ? "Your agent is already seated"
                : "Confirmed · your agent is seated"}
            </span>
            <span className="text-[14px] leading-normal text-muted">
              {buyIn} GNEAR moved to your agent&rsquo;s account
              {tableFee > 0 ? ` (plus a ${fmt(tableFee)} GNEAR table fee)` : ""}
              {phase.status === "done" && phase.account
                ? ` (${phase.account})`
                : ""}
              . You can stop it anytime from the game screen.
            </span>
          </motion.div>
        )}
        {insufficient && (
          <motion.div
            key="funds"
            role="alert"
            className="flex flex-col gap-1.5 rounded-card border-2 border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              ! Not enough playing balance
            </span>
            <span className="text-[14px] leading-normal text-muted">
              This table needs {fmt(total)} GNEAR (buy-in plus table fee)
              {startBalance !== null
                ? ` and you have ${fmt(startBalance)}`
                : ""}
              . Deposit testnet NEAR to your playing balance, or pick a table
              with a smaller buy-in.
            </span>
          </motion.div>
        )}
        {isPractice && (
          <motion.div
            key="practice"
            role="status"
            className="flex flex-col gap-1.5 rounded-card border border-dashed border-fg p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              Practice table selected
            </span>
            <span className="text-[14px] leading-normal text-muted">
              The kitchen uses free chips — there&rsquo;s nothing to confirm.
              Pick a real-money table to play for real.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto flex flex-col gap-2.5">
        {done ? (
          <ButtonLink href="/game" trailing={<Arrow />}>
            Open the table
          </ButtonLink>
        ) : insufficient ? (
          <>
            <Button
              onClick={addFunds}
              pending={funding.pending}
              pendingLabel="Adding test funds…"
              trailing={<Arrow />}
            >
              Add free test funds
            </Button>
            {funding.error && (
              <p role="alert" className="text-[13px] text-muted">
                ! {funding.error}
              </p>
            )}
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
              className="h-10 text-[14px] underline underline-offset-4"
            >
              Deposit another way
            </button>
          </>
        ) : (
          <Button
            onClick={onSubmit}
            disabled={!canSubmit || isPractice}
            pending={pending}
            pendingLabel="Starting your agent…"
          >
            {phase.status === "failed"
              ? "Try again"
              : `Start live play · ${fmt(total)} GNEAR`}
          </Button>
        )}
      </div>

      <DepositSheet
        open={depositOpen}
        onClose={() => {
          setDepositOpen(false);
          void wallet.refresh();
          clearFailure();
        }}
      />

      <Disclosure
        hint="All the details"
        className="border-t border-hair pt-1.5"
        summary={
          <span className="text-[13px] text-muted">
            Fees, blinds, limits and house rules.
          </span>
        }
      >
        <ConfirmationSummary rows={rows} />
        <HouseRules className="pt-3" />
      </Disclosure>

      <Disclosure
        hint="How?"
        className="border-t border-hair pt-1.5"
        summary={
          <span className="text-[13px] text-muted">
            Every deal is locked in before the cards come out.
          </span>
        }
      >
        <p className="text-[13px] leading-[1.55] text-muted">
          Before each hand we publish a fingerprint of the shuffle. After the
          hand we reveal the shuffle itself, and your browser checks that it
          matches the fingerprint and deals exactly the cards that were played —
          so no one, including us, can change the cards mid-hand.
        </p>
      </Disclosure>
    </main>
  );
}

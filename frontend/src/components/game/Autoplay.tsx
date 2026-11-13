"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { signed } from "@/lib/format";
import type { LiveHand } from "@/lib/poker/record";
import { runHref } from "@/lib/poker/runs";
import { useSetup } from "@/lib/store/setup";
import { type AutoplayStatus, fetchAutoplay, fetchHands, setAutoplay, stopAgent } from "@/services/agentApi";
import { netAfterRake } from "@/services/houseApi";

const POLL_MS = 4000;

/** What server mode trades away, said plainly wherever it's offered. */
const TRUST_COPY =
  "By default your agent plays from this tab: your browser picks its share of the shuffle, and the server only sees it after the deal is locked on-chain — so it can’t peek and refuse a bad hand. With the tab closed the server picks that share too. It still commits it on-chain before using it, but you’re trusting the server not to choose it. Hands keep appearing in History.";

/** "Keep playing when I close the tab": hands the sitting over to the server, after confirming. */
export function AutoplayToggle({ start }: { start: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-1/2 top-2 z-40 h-8 -translate-x-1/2 rounded-full border border-dashed border-border bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-fg"
      >
        Keep playing when I close the tab
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keep playing with the tab closed"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-5 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-6">
            <span className="font-display text-[20px] font-bold tracking-[-0.03em]">Play on the server?</span>
            <p className="text-[14px] leading-normal text-muted">{TRUST_COPY}</p>
            <p className="text-[14px] leading-normal text-muted">Your stop loss, take profit and hand limit still apply.</p>
            {error && <p className="text-[13px] text-muted">! {error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 flex-1 rounded-btn border border-border text-[15px]"
              >
                Stay in this tab
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await start();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn’t start server play.");
                    setBusy(false);
                  }
                }}
                className="h-11 flex-1 rounded-btn border border-fg bg-fg text-[15px] text-bg"
              >
                {busy ? "Starting…" : "Play on the server"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The sitting while the server plays it: totals and hands as they land, and Stop. */
export function AutoplaySitting({ initial }: { initial: AutoplayStatus }) {
  const setup = useSetup();
  const [status, setStatus] = useState(initial);
  const [hands, setHands] = useState<LiveHand[]>([]);
  const [returned, setReturned] = useState<string | null>(null);
  const runId = status.autoplay?.runId;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, h] = await Promise.all([
        fetchAutoplay().catch(() => null),
        runId ? fetchHands("real", runId).catch(() => null) : null,
      ]);
      if (!alive) return;
      if (s) setStatus(s);
      if (h) setHands(h);
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [runId]);

  const a = status.autoplay;
  const stopped = !status.on;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-5 py-10">
      <StatusBadge kind={stopped ? "practice" : "live"} size="sm" className="self-start">
        {stopped ? "Server play stopped" : "Live · playing on the server"}
      </StatusBadge>
      <h1 className="display text-[44px] leading-[0.9] tracking-[-0.05em]">
        {stopped ? "your agent left the table." : "playing with the tab closed."}
      </h1>
      {a && (
        <p className="font-mono text-[13px] tabular">
          {a.hands} hands · Net {signed(a.net)} · Stack {a.stack.toFixed(1)} GNEAR
        </p>
      )}
      {stopped && a?.stopped && <p className="text-[15px] text-muted">{a.stopped}</p>}
      {!stopped && <p className="text-[13px] leading-normal text-muted">{TRUST_COPY}</p>}

      <ul className="flex flex-col divide-y divide-hair border-y border-hair">
        {hands.length === 0 && <li className="py-3 text-[13px] text-muted">First hand on its way…</li>}
        {[...hands].reverse().map((h) => (
          <li key={h.id} className="flex justify-between py-2 font-mono text-[12px] tabular">
            <span>{h.id}</span>
            <span>{signed(netAfterRake(h))}</span>
          </li>
        ))}
      </ul>

      {!stopped ? (
        <button
          type="button"
          onClick={async () => {
            await setAutoplay({ on: false }).catch(() => undefined);
            setStatus(await fetchAutoplay().catch(() => status));
          }}
          className="h-11 rounded-btn border border-border px-4"
        >
          Stop after this hand
        </button>
      ) : (
        returned === null &&
        setup.agent.status === "deployed" && (
          <button
            type="button"
            onClick={async () => {
              setReturned("Returning…");
              try {
                const r = await stopAgent();
                setup.stopAgent();
                setReturned(`${r.amount} GNEAR returned.`);
              } catch (e) {
                setReturned(e instanceof Error ? `! ${e.message}` : "! Couldn’t return the funds.");
              }
            }}
            className="h-11 rounded-btn border border-border px-4"
          >
            Return funds to my balance
          </button>
        )
      )}
      {returned && <p className="text-[13px] text-muted">{returned}</p>}
      {stopped && (a?.hands ?? 0) > 0 && (
        <Link href="/results" className="flex h-11 items-center justify-center rounded-btn border border-fg bg-fg px-4 text-[15px] text-bg">
          See the result →
        </Link>
      )}
      {runId && (
        <Link href={runHref("real", runId)} className="font-mono text-[11px] uppercase tracking-[0.12em] underline">
          This session in History
        </Link>
      )}
    </main>
  );
}

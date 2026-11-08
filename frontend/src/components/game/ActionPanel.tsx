"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { pressable } from "@/lib/motion";

type ActionPanelProps = {
  street: string;
  stepLabel: string;
  stepKey: number;
  action: string;
  reason: string;
  done: boolean;
  onNext: () => void;
  onReplay: () => void;
  onStop?: () => void;
  stopRequested?: boolean;
  /** When set, a finished hand offers the next one instead of a replay. */
  onNextHand?: () => void;
  size?: "mobile" | "desktop";
  className?: string;
};

/** Inverted bar with the agent's current decision. The one thing to read on this screen. */
export function ActionPanel({
  street,
  stepLabel,
  stepKey,
  action,
  reason,
  done,
  onNext,
  onReplay,
  onStop,
  stopRequested = false,
  onNextHand,
  size = "mobile",
  className,
}: ActionPanelProps) {
  const desktop = size === "desktop";
  return (
    <section
      aria-live="polite"
      aria-label="Agent decision"
      className={cn(
        "safe-bottom flex flex-col gap-2.5 bg-sel text-onsel",
        desktop ? "gap-3 p-6" : "min-h-[172px] px-5 pt-4",
        className,
      )}
    >
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] lg:text-[11px]">
        <span>{street} · your agent</span>
        <span>{stepLabel}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex flex-col gap-1.5"
        >
          <span
            className={cn(
              "font-display font-bold leading-[0.95] tracking-[-0.05em]",
              desktop ? "text-[56px] leading-[0.9]" : "text-[40px]",
            )}
          >
            {action}
          </span>
          <span className={cn("leading-[1.45]", desktop ? "text-[15px]" : "text-[14px]")}>{reason}</span>
        </motion.div>
      </AnimatePresence>

      {stopRequested && !done && (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
          Stopping after this hand
        </span>
      )}

      <div className={cn("mt-auto flex gap-2", desktop && "pt-2")}>
        {done ? (
          <>
            <motion.div className="flex flex-1" {...pressable}>
              <Link
                href="/results"
                className="flex h-11 flex-1 items-center justify-center rounded-btn bg-onsel font-display text-[16px] font-medium text-sel lg:h-12 lg:text-[17px]"
              >
                See the result {"→"}
              </Link>
            </motion.div>
            <motion.button
              type="button"
              onClick={onNextHand ?? onReplay}
              className="h-11 rounded-btn border border-current px-3.5 font-mono text-[12px] uppercase lg:h-12 lg:px-4"
              {...pressable}
            >
              {onNextHand ? "Next hand" : "Replay"}
            </motion.button>
          </>
        ) : (
          <>
            <motion.button
              type="button"
              onClick={onNext}
              className="h-11 flex-1 rounded-btn border border-current font-mono text-[12px] uppercase tracking-[0.1em] lg:h-12"
              {...pressable}
            >
              Next street {"→"}
            </motion.button>
            {onStop && !desktop && (
              <button
                type="button"
                onClick={onStop}
                disabled={stopRequested}
                className="h-11 px-3.5 text-[14px] underline underline-offset-4 disabled:no-underline disabled:opacity-60"
              >
                {stopRequested ? "Stopping…" : "Stop agent"}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

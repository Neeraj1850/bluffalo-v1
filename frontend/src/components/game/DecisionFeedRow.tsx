"use client";

import { motion } from "framer-motion";
import { ThinkingDots } from "@/components/ui/ThinkingDots";
import { cn } from "@/lib/cn";

type DecisionFeedRowProps =
  | {
      thinking?: false;
      index: string;
      action: string;
      reason: string;
      street: string;
      latest?: boolean;
    }
  | { thinking: true; street?: string };

/** One agent decision: number, big action, a one-line reason, the street. */
export function DecisionFeedRow(props: DecisionFeedRowProps) {
  if (props.thinking) {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-hair py-3"
      >
        <span className="font-mono text-[11px] text-muted" aria-hidden="true">
          {"···"}
        </span>
        <span className="inline-flex items-center gap-2 text-[13px] text-muted">
          <ThinkingDots size={6} className="text-fg" />
          your agent is thinking
        </span>
        <span className="font-mono text-[11px] text-muted">{props.street ?? "SIM"}</span>
      </motion.li>
    );
  }

  const { index, action, reason, street, latest = false } = props;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: latest ? 1 : 0.88, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("grid grid-cols-[44px_1fr_auto] items-baseline gap-3 border-b border-hair py-3")}
    >
      <span className="font-mono text-[11px] text-muted">{index}</span>
      <div className="flex flex-col gap-1">
        <span className="font-display text-[18px] font-bold tracking-[-0.02em]">{action}</span>
        <span className="text-[13px] leading-[1.45] text-muted">{reason}</span>
      </div>
      <span className="font-mono text-[11px] text-muted">{street}</span>
    </motion.li>
  );
}

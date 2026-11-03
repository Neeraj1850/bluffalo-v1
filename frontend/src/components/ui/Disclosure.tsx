"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";

type DisclosureProps = {
  summary: ReactNode;
  /** Mono hint on the right, e.g. "EXPLAIN" or "HOW?". */
  hint?: string;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  defaultOpen?: boolean;
};

/** Progressive disclosure for explaining unfamiliar terms in place. */
export function Disclosure({
  summary,
  hint = "Explain",
  children,
  className,
  summaryClassName,
  defaultOpen = false,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-4 text-left",
          summaryClassName,
        )}
      >
        <span>{summary}</span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {hint} {open ? "−" : "+"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: ease.soft }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

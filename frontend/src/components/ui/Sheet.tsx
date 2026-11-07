"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ease } from "@/lib/motion";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Bottom sheet on mobile, centered panel on desktop. Escape and the
 * backdrop close it; focus moves in on open and back out on close.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      returnFocus.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: ease.soft }}
            className="safe-bottom relative flex max-h-[92dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-card border-t border-border bg-bg px-5 pt-5 lg:mb-0 lg:rounded-card lg:border lg:pb-6"
          >
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="font-display text-[28px] font-bold tracking-[-0.04em]">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex size-11 items-center justify-center rounded-btn border border-border text-[18px]"
              >
                {"×"}
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

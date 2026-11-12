"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

type SegmentedProps<K extends string | number> = {
  label: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  /** Tabs switch a view; radios pick a value. */
  role?: "tab" | "radio";
  /** layoutId for the sliding fill; unique per screen. */
  id: string;
};

/** The HistoryView chip row: mono chips with a sliding filled indicator. */
export function Segmented<K extends string | number>({ label, options, value, onChange, role = "tab", id }: SegmentedProps<K>) {
  return (
    <div role={role === "tab" ? "tablist" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role={role}
            aria-selected={role === "tab" ? on : undefined}
            aria-checked={role === "radio" ? on : undefined}
            onClick={() => onChange(o.key)}
            className={cn(
              "relative h-10 rounded-chip border px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-200",
              on ? "border-sel text-onsel" : "border-border text-fg",
            )}
          >
            {on && (
              <motion.span
                layoutId={id}
                transition={spring.indicator}
                aria-hidden="true"
                className="absolute inset-0 rounded-[7px] bg-sel"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { AnimatePresence, motion, useAnimate } from "framer-motion";
import { pressable } from "@/lib/motion";

type RiskLimitRowProps = {
  label: string;
  hint: string;
  value: number;
  step: number;
  min: number;
  max: number;
  decLabel: string;
  incLabel: string;
  onChange: (value: number) => void;
};

/** A safety limit with − / + steppers. Values tick; hitting a bound nudges once. */
export function RiskLimitRow({
  label,
  hint,
  value,
  step,
  min,
  max,
  decLabel,
  incLabel,
  onChange,
}: RiskLimitRowProps) {
  const [scope, animate] = useAnimate();

  const change = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) {
      animate(scope.current, { x: [0, -5, 5, -2, 0] }, { duration: 0.32 });
      return;
    }
    onChange(next);
  };

  const btn =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-btn border border-border text-[20px] text-fg disabled:opacity-40";

  return (
    <div ref={scope} className="flex items-center gap-2.5 border-b border-hair px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[13px] leading-[1.35] text-muted">{hint}</span>
      </div>
      <motion.button type="button" aria-label={decLabel} onClick={() => change(-step)} className={btn} {...pressable}>
        {"−"}
      </motion.button>
      <span
        aria-live="polite"
        className="relative h-7 min-w-[54px] overflow-hidden text-center font-display text-[22px] font-medium tabular"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="block leading-7"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <motion.button type="button" aria-label={incLabel} onClick={() => change(step)} className={btn} {...pressable}>
        +
      </motion.button>
    </div>
  );
}

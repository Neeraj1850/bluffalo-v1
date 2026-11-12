"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useId } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

type StrategySliderProps = {
  label: string;
  value: number;
  lo: string;
  hi: string;
  hint: string;
  onChange: (value: number) => void;
};

/**
 * Native range input for direct manipulation and accessibility.
 * The track fill follows a stiff spring so preset changes glide
 * instead of jumping, while dragging still feels immediate.
 */
export function StrategySlider({ label, value, lo, hi, hint, onChange }: StrategySliderProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const fill = useSpring(value, { stiffness: 500, damping: 45 });
  const pct = useTransform(fill, (v) => `${v}%`);

  useEffect(() => {
    fill.set(value);
  }, [value, fill]);

  return (
    <div className="flex flex-col gap-0.5 border-b border-hair py-4 lg:py-2.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-mono text-[12px] uppercase tracking-[0.14em]">
          {label}
        </label>
        <AnimatedNumber
          value={value}
          decimals={0}
          duration={0.3}
          className="font-display text-[36px] font-medium leading-none lg:text-[28px] tracking-[-0.04em] tabular"
        />
      </div>
      <motion.input
        id={id}
        type="range"
        min={0}
        max={100}
        value={value}
        aria-describedby={hintId}
        aria-valuetext={`${value} — ${hint}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="np-range"
        style={{ "--p": pct } as unknown as React.CSSProperties}
      />
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
      <p id={hintId} className="mt-1.5 text-[14px] leading-[1.45] text-muted lg:mt-0.5 lg:text-[13px]">
        {hint}
      </p>
    </div>
  );
}

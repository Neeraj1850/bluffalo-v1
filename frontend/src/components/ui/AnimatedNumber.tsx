"use client";

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "framer-motion";
import { useEffect } from "react";

type AnimatedNumberProps = {
  value: number;
  decimals?: number;
  /** Seconds. */
  duration?: number;
  /** Start counting from this value on mount (e.g. 0 for a win counter). */
  from?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
};

/**
 * Rolls between confirmed values. Only ever pass values the system has
 * confirmed — this animates the display, it never invents a number.
 */
export function AnimatedNumber({
  value,
  decimals = 1,
  duration = 0.6,
  from,
  delay = 0,
  format,
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(from ?? value);
  const text = useTransform(mv, (n) => (format ? format(n) : n.toFixed(decimals)));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, duration, delay, reduce, mv]);

  const final = format ? format(value) : value.toFixed(decimals);
  return (
    <span className={className}>
      <motion.span aria-hidden="true">{text}</motion.span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

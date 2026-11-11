import type { Transition, Variants } from "framer-motion";

/**
 * Motion language: springs for physical things (cards, presses, indicators),
 * short eases for state (text, status, screens).
 */

export const ease = {
  soft: [0.2, 0.8, 0.2, 1] as const,
  press: [0.3, 0.7, 0.4, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
};

export const spring = {
  /** Cards dealing, fanning, settling. */
  card: { type: "spring", stiffness: 260, damping: 22 } satisfies Transition,
  /** Button press return. */
  press: { type: "spring", stiffness: 500, damping: 30 } satisfies Transition,
  /** Sliding selection indicators (nav, presets, filters). */
  indicator: { type: "spring", stiffness: 380, damping: 30 } satisfies Transition,
  /** Bigger, bouncier moments — turn / river, headline rise. */
  pop: { type: "spring", stiffness: 220, damping: 16 } satisfies Transition,
};

export const timing = {
  press: 0.1,
  reveal: 0.4,
  screen: 0.35,
  dealStagger: 0.08,
  rowStagger: 0.06,
  thinkingCycle: 1.2,
  winCounter: 0.8,
};

/** Shared press feedback for buttons and tappable cards. */
export const pressable = {
  whileTap: { scale: 0.96 },
  transition: spring.press,
};

export const stagger = (step = timing.rowStagger, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

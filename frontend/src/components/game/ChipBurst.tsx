"use client";

import { motion } from "framer-motion";

/** Three stacked chips that spring up into the pot, then fade. Mount with a new key per bet. */
export function ChipBurst({ className }: { className?: string }) {
  return (
    <motion.div
      aria-hidden="true"
      className={className}
      initial={{ opacity: 0, y: 180, scale: 0.7 }}
      animate={{ opacity: [0, 1, 1, 0], y: [180, -6, 0, 0], scale: [0.7, 1.08, 1, 0.9] }}
      transition={{ duration: 0.6, times: [0, 0.55, 0.75, 1], ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div className="flex flex-col">
        {[false, true, false].map((filled, i) => (
          <span
            key={i}
            className={`h-2 w-7 rounded-[50%] border-2 border-fg ${filled ? "bg-fg" : "bg-bg"} ${i ? "-mt-[3px]" : ""}`}
          />
        ))}
      </div>
    </motion.div>
  );
}

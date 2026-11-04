"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { getPreset, PRESETS, type PresetKey } from "@/lib/data/strategy";
import { spring } from "@/lib/motion";
import { PresetGlyph } from "./PresetGlyph";

type PresetPickerProps = {
  value: PresetKey;
  onChange: (key: PresetKey) => void;
};

/** Segmented control with a sliding indicator, plus the personality panel below it. */
export function PresetPicker({ value, onChange }: PresetPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const preset = getPreset(value);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + PRESETS.length) % PRESETS.length;
    onChange(PRESETS[next].key);
    refs.current[next]?.focus();
  };

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Agent personality"
        className="grid h-14 grid-cols-4 rounded-btn border border-border p-1"
      >
        {PRESETS.map((p, i) => {
          const on = p.key === value;
          return (
            <button
              key={p.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(p.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative rounded-chip font-display text-[15px] font-medium transition-colors duration-200",
                on ? "text-onsel" : "text-fg",
              )}
            >
              {on && (
                <motion.span
                  layoutId="preset-indicator"
                  transition={spring.indicator}
                  className="absolute inset-0 rounded-chip bg-sel"
                  aria-hidden="true"
                />
              )}
              <span className="relative">{p.label}</span>
            </button>
          );
        })}
      </div>

      <section
        aria-live="polite"
        className="relative flex min-h-[260px] flex-col justify-end gap-2 overflow-hidden rounded-card border border-border p-5"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={preset.key}
            initial={{ opacity: 0, y: 10, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ ...spring.card, opacity: { duration: 0.15 } }}
            className="absolute right-3 top-3"
          >
            <PresetGlyph preset={preset.key} />
          </motion.div>
        </AnimatePresence>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{preset.tag}</span>
        <span className="font-display text-[56px] font-bold leading-[0.85] tracking-[-0.06em]">
          {preset.label.toLowerCase()}
        </span>
        <p className="max-w-[250px] text-[14px] leading-normal text-muted">{preset.description}</p>
      </section>
    </>
  );
}

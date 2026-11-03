"use client";

import clsx from "clsx";
import { useTheme } from "@/lib/theme";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      className={clsx(
        "label-mono inline-flex min-h-11 items-center gap-2 text-muted transition-colors hover:text-fg",
        className,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 1a6 6 0 0 1 0 12z" fill="currentColor" />
      </svg>
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}

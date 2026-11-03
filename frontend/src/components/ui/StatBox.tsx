import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatBoxProps = {
  label: ReactNode;
  value: ReactNode;
  /** "inverse" fills the cell — used for the one number that matters most. */
  emphasis?: "none" | "strong" | "inverse";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const valueSizes = {
  sm: "text-[22px]",
  md: "text-[26px]",
  lg: "text-[44px] leading-[0.9] font-bold tracking-[-0.06em]",
};

/** Mono label over a tabular Space Grotesk number. */
export function StatBox({
  label,
  value,
  emphasis = "none",
  size = "md",
  className,
}: StatBoxProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        emphasis === "inverse" && "bg-sel text-onsel",
        className,
      )}
    >
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.14em]",
          emphasis !== "inverse" && "text-muted",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-display tabular font-medium tracking-[-0.04em]",
          valueSizes[size],
          emphasis !== "none" && "font-bold",
        )}
      >
        {value}
      </span>
    </div>
  );
}

type StatGroupProps = {
  children: ReactNode;
  /** "boxed" draws a bordered card; "rule" draws top/bottom hairlines. */
  variant?: "boxed" | "rule";
  className?: string;
};

/** Three stats side by side with dividers between them. */
export function StatGroup({ children, variant = "boxed", className }: StatGroupProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 [&>*]:p-3.5 [&>*+*]:border-l",
        variant === "boxed"
          ? "overflow-hidden rounded-card border border-border [&>*+*]:border-border"
          : "border-y border-hair [&>*]:px-0 [&>*+*]:border-hair [&>*+*]:pl-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

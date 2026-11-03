import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ThinkingDots } from "./ThinkingDots";

export type StatusKind =
  | "practice"
  | "live"
  | "verified"
  | "verifying"
  | "unverified"
  | "quote"
  | "submitted"
  | "confirmed"
  | "failed";

/**
 * Meaning is carried by shape, never color:
 * dashed = provisional/practice · solid fill = committed/live · outline = state.
 */
const styles: Record<StatusKind, string> = {
  practice: "border border-dashed border-fg",
  live: "bg-sel text-onsel",
  verified: "border border-fg",
  verifying: "border border-dashed border-border text-muted",
  unverified: "border border-border text-muted",
  quote: "border border-border text-muted",
  submitted: "border border-fg",
  confirmed: "bg-sel text-onsel",
  failed: "border-2 border-fg",
};

const defaults: Record<StatusKind, string> = {
  practice: "Practice — no real money",
  live: "Live · real money",
  verified: "Fair-play verified",
  verifying: "Verifying",
  unverified: "Not yet verified",
  quote: "Quote · not sent",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
};

type StatusBadgeProps = {
  kind: StatusKind;
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

export function StatusBadge({ kind, children, size = "md", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-chip font-mono uppercase tracking-[0.12em]",
        size === "md" ? "h-7 px-2.5 text-[11px]" : "h-6 px-2 text-[10px]",
        styles[kind],
        className,
      )}
    >
      {kind === "live" && (
        <span aria-hidden="true" className="size-1.5 animate-dot rounded-full bg-current" />
      )}
      {kind === "verifying" && <ThinkingDots size={4} />}
      {kind === "verified" && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
      {kind === "failed" && <span aria-hidden="true">!</span>}
      {children ?? defaults[kind]}
    </span>
  );
}

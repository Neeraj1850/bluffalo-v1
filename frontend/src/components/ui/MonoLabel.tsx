import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type MonoLabelProps = {
  tone?: "default" | "muted" | "boxed";
  /** Letter-spacing preset. */
  tracking?: "tight" | "normal" | "wide";
  as?: ElementType;
  className?: string;
  children: ReactNode;
  id?: string;
};

const trackings = {
  tight: "tracking-[0.1em]",
  normal: "tracking-[0.16em]",
  wide: "tracking-[0.24em]",
};

/** Space Mono, uppercase, tracked. Labels, stats, card metadata. */
export function MonoLabel({
  tone = "muted",
  tracking = "normal",
  as: Tag = "span",
  className,
  children,
  id,
}: MonoLabelProps) {
  return (
    <Tag
      id={id}
      className={cn(
        "font-mono text-[11px] uppercase leading-snug",
        trackings[tracking],
        tone === "muted" && "text-muted",
        tone === "boxed" && "rounded-chip border border-border px-2 py-1",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

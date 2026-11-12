import { cn } from "@/lib/cn";

/** Dashed placeholder block; opacity pulse, static under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-card border border-dashed border-border motion-reduce:animate-none", className)} />;
}

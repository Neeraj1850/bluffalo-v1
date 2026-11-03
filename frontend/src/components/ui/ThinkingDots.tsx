import { cn } from "@/lib/cn";

type ThinkingDotsProps = {
  /** Dot diameter in px. */
  size?: number;
  className?: string;
  /** Screen-reader text; omit when a visible label sits next to the dots. */
  label?: string;
};

/** Three softly pulsing dots — "your agent is thinking". 1200ms cycle, 160ms offsets. */
export function ThinkingDots({ size = 6, className, label }: ThinkingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ gap: Math.max(3, size - 2) }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="animate-dot rounded-full bg-current"
          style={{ width: size, height: size, animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

import { cn } from "@/lib/cn";

type ExperiencePipsProps = {
  level: 1 | 2 | 3;
  label: string;
  className?: string;
};

/** Three squares: filled = harder. Always paired with words, never alone. */
export function ExperiencePips({ level, label, className }: ExperiencePipsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em]",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn("size-2", n <= level ? "bg-current" : "border border-current")}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Difficulty {level} of 3: </span>
        {label}
      </span>
    </div>
  );
}

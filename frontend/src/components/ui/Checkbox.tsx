import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

/** Native checkbox, restyled: 24px square, solid fill + check when on. */
export function Checkbox({ checked, onChange, disabled, children, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 text-[14px] leading-[1.45]",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative mt-px inline-flex size-6 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-6 cursor-[inherit] appearance-none rounded-[6px] border-[1.5px] border-fg checked:bg-fg"
        />
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden text-bg peer-checked:block"
        >
          <path d="M6 12.5l4 4L18 8" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

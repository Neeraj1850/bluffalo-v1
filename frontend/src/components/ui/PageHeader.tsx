import type { ReactNode } from "react";
import { MonoLabel } from "./MonoLabel";
import { Rise } from "./Rise";

/** The one tab header: mono eyebrow, display h1, muted description (right-aligned on desktop), optional actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
      <div className="flex min-w-0 flex-col gap-3 lg:gap-1">
        <div className="flex min-h-11 items-center lg:min-h-5 justify-between gap-4">
          <MonoLabel className="flex items-center gap-2">{eyebrow}</MonoLabel>
          {actions && <div className="flex items-center gap-1 lg:hidden">{actions}</div>}
        </div>
        <Rise as="h1" feel="spring" className="display pb-[0.1em] text-[88px] leading-[0.8] tracking-[-0.07em] lg:text-[72px]">
          {title}
        </Rise>
      </div>
      {description && <div className="max-w-md text-[15px] leading-normal text-muted lg:text-right">{description}</div>}
    </header>
  );
}

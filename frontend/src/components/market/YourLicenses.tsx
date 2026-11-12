"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/cn";
import { useSetup } from "@/lib/store/setup";
import { fetchMyLicenses, type MyLicenses } from "@/services/agentApi";

/** Bought licenses: picking one makes it the agent's strategy (settings sealed). */
export function YourLicenses() {
  const { license, params, applyAgent } = useSetup();
  const [mine, setMine] = useState<MyLicenses["licenses"] | null>(null);

  useEffect(() => {
    fetchMyLicenses().then(
      (r) => setMine(r.licenses),
      () => setMine([]), // signed out or unreachable: nothing to show
    );
  }, []);

  if (!mine?.length) return null;
  return (
    <section aria-labelledby="licenses" className="flex flex-col gap-2">
      <MonoLabel as="h2" id="licenses">
        Your licenses
      </MonoLabel>
      <div role="radiogroup" aria-labelledby="licenses" className="flex flex-col gap-2">
        {mine.map((l) => {
          const on = license?.id === l.tokenId;
          return (
            <button
              key={l.tokenId}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => applyAgent("custom", params, on ? null : { id: l.tokenId, name: l.title })}
              className={cn(
                "flex min-h-11 items-center justify-between rounded-card border p-4 text-left transition-colors",
                on ? "border-sel bg-sel text-onsel" : "border-border hover:border-fg",
              )}
            >
              <span className="font-display text-[16px] font-bold">{l.title}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
                {l.seats} {l.seats === 1 ? "seat" : "seats"}
              </span>
            </button>
          );
        })}
      </div>
      <Link href="/market" className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted underline underline-offset-4">
        Browse the market →
      </Link>
    </section>
  );
}

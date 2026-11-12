import { Skeleton } from "@/components/ui/Skeleton";

/** Shown while the decision's signature and attestation are checked server-side. */
export default function VerifyLoading() {
  return (
    <main role="status" aria-live="polite" className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-10">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Checking TEE signature…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
    </main>
  );
}

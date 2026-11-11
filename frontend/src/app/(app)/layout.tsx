"use client";

import { AppShell } from "@/components/nav/AppShell";
import { useRequireSignIn } from "@/lib/auth";

/** Protected screens: nothing renders until the player is signed in and their session is linked. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const signedIn = useRequireSignIn();
  if (!signedIn) {
    return (
      <main role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Signing you in…</span>
      </main>
    );
  }
  return <AppShell>{children}</AppShell>;
}

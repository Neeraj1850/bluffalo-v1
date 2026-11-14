"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/nav/AppShell";
import { isGuestPath, useAuth, useRequireSignIn } from "@/lib/auth";

/** Protected screens: nothing renders until the player is signed in and their session is linked. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const guestPath = isGuestPath(usePathname());
  const { ready, authenticated } = useAuth();
  if (guestPath && ready && !authenticated) return children;
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }: { children: React.ReactNode }) {
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

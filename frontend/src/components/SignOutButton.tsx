"use client";

import { useSignOut } from "@/lib/auth";
import { cn } from "@/lib/cn";

export function SignOutButton({ className }: { className?: string }) {
  const signOut = useSignOut();
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className={cn(
        "h-11 rounded-chip px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:text-fg",
        className,
      )}
    >
      Sign out
    </button>
  );
}

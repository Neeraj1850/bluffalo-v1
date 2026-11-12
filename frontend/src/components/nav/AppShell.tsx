"use client";

import { usePathname } from "next/navigation";
import { useRequireSignIn } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { AgentReconciler } from "./AgentReconciler";
import { BottomNav } from "./BottomNav";
import { NavRail } from "./NavRail";
import { activeNavKey, showsBottomNav } from "./navItems";

/** Persistent chrome for every in-app screen: rail on desktop, bottom bar on mobile browse screens. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const showBottom = showsBottomNav(pathname);
  // Signed-out players go back to Connect; render nothing meanwhile.
  const signedIn = useRequireSignIn();
  if (!signedIn) return null;

  return (
    <div className="lg:flex">
      <AgentReconciler pathname={pathname} />
      <NavRail active={active} />
      <div className={cn("min-w-0 flex-1", showBottom && "pb-28 lg:pb-0")}>{children}</div>
      {showBottom && <BottomNav active={active} />}
    </div>
  );
}

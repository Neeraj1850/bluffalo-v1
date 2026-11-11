"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { useLiveLock } from "@/lib/store/liveLock";
import { NavIcon, type NavKey } from "./NavIcon";
import { NAV_ITEMS } from "./navItems";

/** Mobile bottom bar. The active bar slides between items. */
export function BottomNav({ active }: { active: NavKey | null }) {
  const locked = useLiveLock();
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-bg px-2 lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key} className="relative">
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  transition={spring.indicator}
                  aria-hidden="true"
                  className="absolute -top-px left-1/2 h-[3px] w-7 -translate-x-1/2 bg-fg"
                />
              )}
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={locked && !isActive}
                tabIndex={locked && !isActive ? -1 : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                  isActive ? "text-fg" : "text-muted hover:text-fg",
                  locked && !isActive && "pointer-events-none opacity-40",
                )}
              >
                <NavIcon name={item.key} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { NavIcon, type NavKey } from "./NavIcon";
import { NAV_ITEMS } from "./navItems";

/** Desktop (≥1024px) slim left rail. Same order as the bottom bar. */
export function NavRail({ active }: { active: NavKey | null }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col items-center gap-2 border-r border-hair px-3 py-4 lg:flex"
    >
      <Link
        href="/"
        className="mb-2 flex h-12 w-[72px] items-center justify-center font-display text-[22px] font-bold tracking-[-0.04em]"
        aria-label="Near Poker Agent home"
      >
        np{"♠︎"}
      </Link>
      <ul className="flex flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key} className="relative">
              {isActive && (
                <motion.span
                  layoutId="rail-indicator"
                  transition={spring.indicator}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-btn bg-sel"
                />
              )}
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-[60px] w-[72px] flex-col items-center justify-center gap-1 rounded-btn font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                  isActive ? "text-onsel" : "text-muted hover:text-fg",
                )}
              >
                <NavIcon name={item.key} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <ThemeToggle className="mt-auto" />
      <SignOutButton />
    </nav>
  );
}

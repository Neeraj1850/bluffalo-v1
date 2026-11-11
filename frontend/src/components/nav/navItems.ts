import type { NavKey } from "./NavIcon";

export type NavItem = { key: NavKey; label: string; href: string; match: string[] };

/** Practise a strategy free → play it live → tune it. Each mode keeps its own sessions. */
export const NAV_ITEMS: NavItem[] = [
  { key: "practice", label: "Practice", href: "/practice", match: ["/practice", "/sandbox"] },
  { key: "live", label: "Live", href: "/live", match: ["/live", "/game", "/results", "/deploy", "/lobby"] },
  { key: "strategy", label: "Strategy", href: "/strategy", match: ["/strategy"] },
  { key: "wallet", label: "Wallet", href: "/wallet", match: ["/wallet"] },
];

/** Screens that show the mobile bottom bar. Focused flows (table, deploy, results) stay full-screen. */
export const BOTTOM_NAV_ROUTES = ["/practice", "/live", "/strategy", "/wallet"];

export function activeNavKey(pathname: string): NavKey | null {
  const item = NAV_ITEMS.find((i) => i.match.some((m) => pathname.startsWith(m)));
  return item?.key ?? null;
}

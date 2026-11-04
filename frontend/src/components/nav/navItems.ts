import type { NavKey } from "./NavIcon";

export type NavItem = { key: NavKey; label: string; href: string; match: string[] };

export const NAV_ITEMS: NavItem[] = [
  { key: "lobby", label: "Lobby", href: "/lobby", match: ["/lobby"] },
  { key: "strategy", label: "Strategy", href: "/strategy", match: ["/strategy", "/sandbox", "/deploy"] },
  { key: "live", label: "Live", href: "/game", match: ["/game"] },
  { key: "history", label: "History", href: "/history", match: ["/history"] },
  // No dedicated wallet screen yet: cash-out lives on the results screen.
  { key: "wallet", label: "Wallet", href: "/results", match: ["/results"] },
];

/** Screens that show the mobile bottom bar. Focused flows stay full-screen. */
export const BOTTOM_NAV_ROUTES = ["/lobby", "/strategy", "/history"];

export function activeNavKey(pathname: string): NavKey | null {
  const item = NAV_ITEMS.find((i) => i.match.some((m) => pathname.startsWith(m)));
  return item?.key ?? null;
}

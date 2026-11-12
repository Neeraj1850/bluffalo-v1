import type { NavKey } from "./NavIcon";

export type NavItem = { key: NavKey; label: string; href: string; match: string[] };

export const NAV_ITEMS: NavItem[] = [
  { key: "lobby", label: "Lobby", href: "/lobby", match: ["/lobby"] },
  { key: "strategy", label: "Strategy", href: "/strategy", match: ["/strategy", "/sandbox", "/deploy"] },
  { key: "market", label: "Market", href: "/market", match: ["/market"] },
  { key: "live", label: "Live", href: "/game", match: ["/game", "/results"] },
  { key: "history", label: "History", href: "/history", match: ["/history"] },
  { key: "profile", label: "Profile", href: "/profile", match: ["/profile"] },
  { key: "wallet", label: "Wallet", href: "/wallet", match: ["/wallet"] },
];

/** Screens that show the mobile bottom bar. Focused flows stay full-screen. */
export const BOTTOM_NAV_ROUTES = ["/lobby", "/strategy", "/market", "/history", "/profile"];

/** The mobile bar holds five; Live and Wallet are reached from the screens themselves. */
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((i) => i.key !== "live" && i.key !== "wallet");

export function showsBottomNav(pathname: string): boolean {
  return pathname !== "/market/sim" && BOTTOM_NAV_ROUTES.some((r) => pathname.startsWith(r));
}

export function activeNavKey(pathname: string): NavKey | null {
  const item = NAV_ITEMS.find((i) => i.match.some((m) => pathname.startsWith(m)));
  return item?.key ?? null;
}

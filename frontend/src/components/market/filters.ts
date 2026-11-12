import { signed } from "@/lib/format";
import type { MarketListing, MarketStrategy } from "@/lib/market/types";

export type MarketFilter = "all" | "under" | "rising" | "mine";

export const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "under", label: "Under fair" },
  { key: "rising", label: "Rising" },
  { key: "mine", label: "Mine" },
];

export function filterStrategies(list: MarketStrategy[], f: MarketFilter): MarketStrategy[] {
  if (f === "under") return list.filter((s) => s.price < s.fair);
  if (f === "rising") return list.filter((s) => s.change > 0);
  if (f === "mine") return list.filter((s) => s.you || s.owned > 0);
  return list;
}

/** Best record first: rated before unrated, then net won, then most hands, then price. */
export const leaderboard = (list: MarketStrategy[]) =>
  [...list].sort(
    (a, b) => Number(b.rated) - Number(a.rated) || b.net - a.net || b.hands - a.hands || b.price - a.price,
  );

/** "▲ +1.2" / "▼ −0.8" / "±0.0" — never color alone. */
export const changeLabel = (change: number) => `${change > 0 ? "▲ " : change < 0 ? "▼ " : ""}${signed(change)}`;

/** Seats for sale right now across every listing of one strategy. */
export const seatsListed = (listings: MarketListing[], tokenId: string) =>
  listings.filter((l) => l.tokenId === tokenId).reduce((n, l) => n + l.amount, 0);

/** "14:05" for a ticker row. */
export const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

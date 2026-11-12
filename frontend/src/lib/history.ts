export type HistoryFilter = "today" | "week" | "all";

export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
];

const DAY = 24 * 60 * 60 * 1000;

/** Is a hand played at `at` inside the range? Hands without a timestamp (older records) only show under "All". */
export function inRange(at: number | undefined, filter: HistoryFilter, now = Date.now()) {
  if (filter === "all") return true;
  if (!at) return false;
  if (filter === "week") return at >= now - 7 * DAY;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return at >= midnight.getTime();
}

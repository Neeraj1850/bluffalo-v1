const MINUS = "−";

/** "12.5" — trims to the given decimals. */
export function amount(value: number, decimals = 1) {
  return Math.abs(value).toFixed(decimals);
}

/** Always signed: "+6.0", "−3.0", "±0.0". Never relies on color. */
export function signed(value: number, decimals = 1) {
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "±";
  return `${sign}${amount(value, decimals)}`;
}

export function near(value: number, decimals = 1) {
  return `${amount(value, decimals)} GNEAR`;
}

export function percent(part: number, whole: number) {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago"; "earlier" when the time is unknown. */
export function ago(at: number, now = Date.now()) {
  if (!at) return "earlier";
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

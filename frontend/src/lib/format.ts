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
  return `${amount(value, decimals)} NEAR`;
}

export function percent(part: number, whole: number) {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

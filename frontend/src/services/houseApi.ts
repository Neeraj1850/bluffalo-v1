/** Client wrappers for house-economics endpoints (tables, quote extras). */

export type TableStatus = { id: string; open: boolean; reason?: string; maxBuyIn: number };
export type TablesResponse = { tables: TableStatus[]; house: { balance: number } };

export type HouseQuote = {
  fee: number;
  tableFee: number;
  currency: "NEAR";
  expiresAt: number;
  buyIn: number;
  maxBuyIn: number;
};

export const TABLE_CLOSED = "table_closed";

export class TableClosedError extends Error {
  readonly code = TABLE_CLOSED;
  constructor(message = "This table is closed right now.") {
    super(message);
    this.name = "TableClosedError";
  }
}

export async function fetchTables(f: typeof fetch = fetch): Promise<TablesResponse> {
  const res = await f("/api/tables");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    house: { balance: Number(data.house?.balance ?? 0) },
  };
}

export async function fetchQuote(tableId: string, f: typeof fetch = fetch): Promise<HouseQuote> {
  const res = await f(`/api/agent/quote?tableId=${encodeURIComponent(tableId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === TABLE_CLOSED) throw new TableClosedError(data.error);
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return normalizeQuote(data);
}

/** Fill the newer fields defensively: older servers may omit them. */
export function normalizeQuote(q: Partial<HouseQuote> & { fee: number; buyIn: number }): HouseQuote {
  return {
    fee: q.fee ?? 0,
    tableFee: q.tableFee ?? 0,
    currency: "NEAR",
    expiresAt: q.expiresAt ?? 0,
    buyIn: q.buyIn,
    maxBuyIn: q.maxBuyIn ?? 0,
  };
}

/** True for any error the server tagged table_closed (deploy, play, quote). */
export function isTableClosed(err: unknown): boolean {
  if (err instanceof TableClosedError) return true;
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === TABLE_CLOSED;
}

/** Message-based fallback for errors whose code was dropped by a wrapper (e.g. /api/play). */
export function looksTableClosed(message: string | null | undefined): boolean {
  return !!message && /table[ _]closed|table is closed/i.test(message);
}

// ---------------------------------------------------------------------------
// Pure house math, shared by the screens.
// ---------------------------------------------------------------------------

/** Shown buy-in, never above the table's max (0 / missing max = no clamp). */
export function clampBuyIn(buyIn: number, maxBuyIn: number | undefined): number {
  return maxBuyIn && maxBuyIn > 0 ? Math.min(buyIn, maxBuyIn) : buyIn;
}

/** What leaves the playing balance at deploy: buy-in + table fee. */
export function deployTotal(buyIn: number, tableFee: number | undefined): number {
  return Math.round((buyIn + (tableFee ?? 0)) * 100) / 100;
}

/** The hand's rake (0 when absent). Accepts any hand shape; older records have no `rake`. */
export function rakeOf(hand: unknown): number {
  const r = hand && typeof hand === "object" ? (hand as { rake?: unknown }).rake : undefined;
  return typeof r === "number" && r > 0 ? r : 0;
}

/**
 * Net for the hand after the house's rake. `net` from the server is the
 * chip result before rake; rake only ever comes out of a pot the agent won.
 */
export function netAfterRake(hand: { net: number }): number {
  return Math.round((hand.net - rakeOf(hand)) * 100) / 100;
}

/** Stack after the hand: the server's `stackAfter` is before rake; the payout settles net of it. */
export function stackAfterRake(hand: { stackAfter: number }): number {
  return Math.max(0, Math.round((hand.stackAfter - rakeOf(hand)) * 100) / 100);
}

export const rakeLabel = (rake: number) => `Rake −${rake.toFixed(1)}`;

/** Shapes the /api/market routes return. Prices are GNEAR (1 testnet NEAR = 1000 GNEAR). */

export type Why = { rows: { label: string; value: string; note?: string }[]; sentence: string };

export type MarketStrategy = {
  tokenId: string;
  title: string;
  creator: string;
  /** The creator is the caller. */
  you: boolean;
  supply: number;
  maxSupply: number;
  hands: number;
  net: number;
  /** Fraction, e.g. 0.04 = +4%. */
  roi: number;
  wins: number;
  /** hands >= 100 */
  rated: boolean;
  /** Quoted GNEAR. */
  price: number;
  prev: number;
  fair: number;
  /** price − prev */
  change: number;
  why: Why;
  /** Recent prices, oldest → newest. */
  spark: number[];
  lowestAsk: number | null;
  /** The caller's seats. */
  owned: number;
};

export type MarketListing = {
  tokenId: string;
  seller: string;
  /** NPC name, "you", or the account. */
  sellerName: string;
  sellerKind: "npc" | "player" | "you";
  amount: number;
  /** GNEAR */
  priceEach: number;
  memo: string;
};

export type Npc = {
  key: "scout" | "bookie" | "tilt";
  name: string;
  account: string;
  /** GNEAR */
  cash: number;
  closed: boolean;
  offline?: boolean;
};

export type MarketEvent = {
  id: number;
  /** ISO */
  at: string;
  /** Display name. */
  actor: string;
  kind: string;
  tokenId: string | null;
  title: string | null;
  /** Short, e.g. "BUY 1 × shark @ 12.0". */
  action: string;
  reason: string | null;
  chatId: string | null;
  tx: string | null;
};

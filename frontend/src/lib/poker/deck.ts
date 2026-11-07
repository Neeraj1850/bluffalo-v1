import type { Card, Rank, Suit } from "@/lib/cards";

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS: Suit[] = ["s", "h", "d", "c"];

export function freshDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

const SEED = /^[0-9a-f]{32}$/;

/**
 * sfc32 seeded from a 128-bit hex seed. Deterministic on purpose: once the
 * seed is revealed, anyone can re-deal the hand and check it.
 */
export function rng(seedHex: string): () => number {
  if (!SEED.test(seedHex)) throw new Error("Seed must be 32 lowercase hex characters");
  let [a, b, c, d] = [0, 8, 16, 24].map((i) => parseInt(seedHex.slice(i, i + 8), 16) >>> 0);
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of a fresh deck, driven by the seed. */
export function shuffle(seedHex: string): Card[] {
  const next = rng(seedHex);
  const deck = freshDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

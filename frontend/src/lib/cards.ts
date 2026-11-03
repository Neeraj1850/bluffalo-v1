export type Suit = "s" | "h" | "d" | "c";
export type Rank = "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";

export type Card = { rank: Rank; suit: Suit };

/** Monochrome suits: spades and clubs solid, hearts and diamonds outlined. */
export const SUIT_GLYPH: Record<Suit, string> = {
  s: "♠",
  h: "♡",
  d: "♢",
  c: "♣",
};

const SUIT_NAME: Record<Suit, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

const RANK_NAME: Record<Rank, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  "10": "ten",
  "9": "nine",
  "8": "eight",
  "7": "seven",
  "6": "six",
  "5": "five",
  "4": "four",
  "3": "three",
  "2": "two",
};

/** Parse shorthand like "Qs", "10h", "Ad". */
export function parseCard(code: string): Card {
  const suit = code.slice(-1).toLowerCase() as Suit;
  const rank = code.slice(0, -1).toUpperCase() as Rank;
  if (!(suit in SUIT_GLYPH) || !(rank in RANK_NAME)) {
    throw new Error(`Invalid card code: ${code}`);
  }
  return { rank, suit };
}

export const cards = (...codes: string[]) => codes.map(parseCard);

export function cardName(card: Card) {
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;
}

/** Short visible form, e.g. "9♣". */
export function cardShort(card: Card) {
  return `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

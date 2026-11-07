import type { Card } from "@/lib/cards";
import { shuffle } from "./deck";

/**
 * Commit-reveal for the deal. Before the hand: publish sha256(seed). After:
 * reveal the seed. Anyone can hash it, re-shuffle, and compare the cards.
 * Uses WebCrypto, so it runs the same in the browser and on the server.
 */

export async function commitment(seedHex: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seedHex));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type DealProof = {
  seed: string;
  commitment: string;
  /** [agent, house] hole cards and the five board cards as played. */
  hole: [Card[], Card[]];
  board: Card[];
};

export type DealCheck = { ok: true } | { ok: false; reason: string };

const same = (a: Card[], b: Card[]) =>
  a.length === b.length && a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit);

export async function verifyDeal({ seed, commitment: committed, hole, board }: DealProof): Promise<DealCheck> {
  let deck: Card[];
  try {
    deck = shuffle(seed);
  } catch {
    return { ok: false, reason: "Seed is malformed" };
  }
  if ((await commitment(seed)) !== committed) {
    return { ok: false, reason: "Seed doesn't match the commitment published before the hand" };
  }
  // Same deal order as the engine: agent, house, agent, house, then the board.
  if (!same(hole[0], [deck[0], deck[2]]) || !same(hole[1], [deck[1], deck[3]]) || !same(board, deck.slice(4, 9))) {
    return { ok: false, reason: "Cards don't match the deck this seed produces" };
  }
  return { ok: true };
}

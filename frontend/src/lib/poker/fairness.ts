import type { Card } from "@/lib/cards";
import { shuffle } from "./deck";

/**
 * Commit-reveal for the deal. Before the hand the server publishes
 * sha256(serverSeed). Only then does the player's browser add its own seed,
 * and the deck is shuffled from sha256(serverSeed:playerSeed) — so the
 * server can't shop for a favourable seed and the player can't either.
 * After the hand the server seed is revealed; anyone can check the hash and
 * re-deal the cards. WebCrypto, so it runs the same in browser and server.
 */

export async function commitment(seedHex: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seedHex));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The deck seed both sides contributed to. */
export async function mixSeed(serverSeed: string, playerSeed: string): Promise<string> {
  return (await commitment(`${serverSeed}:${playerSeed}`)).slice(0, 32);
}

export function newSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type DealProof = {
  /** The server's seed, revealed after the hand. */
  seed: string;
  /** sha256 of the server seed, published before the hand. */
  commitment: string;
  /** The player's seed, sent after the commitment. */
  playerSeed: string;
  /** [agent, house] hole cards and the five board cards as played. */
  hole: [Card[], Card[]];
  board: Card[];
};

export type DealCheck = { ok: true } | { ok: false; reason: string };

const same = (a: Card[], b: Card[]) =>
  a.length === b.length && a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit);

const SEED = /^[0-9a-f]{32}$/;

export async function verifyDeal({ seed, commitment: committed, playerSeed, hole, board }: DealProof): Promise<DealCheck> {
  let deck: Card[];
  try {
    if (!SEED.test(seed) || !SEED.test(playerSeed)) throw new Error("malformed");
    deck = shuffle(await mixSeed(seed, playerSeed));
  } catch {
    return { ok: false, reason: "Seed is malformed" };
  }
  if ((await commitment(seed)) !== committed) {
    return { ok: false, reason: "Seed doesn't match the commitment published before the hand" };
  }
  // Same deal order as the engine: agent, house, agent, house, then the board.
  if (!same(hole[0], [deck[0], deck[2]]) || !same(hole[1], [deck[1], deck[3]]) || !same(board, deck.slice(4, 9))) {
    return { ok: false, reason: "Cards don't match the deck these seeds produce" };
  }
  return { ok: true };
}

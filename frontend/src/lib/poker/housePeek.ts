import { cardName, cardShort, type Card } from "@/lib/cards";
import { holeLabel } from "./agent";
import { shuffle } from "./deck";
import { commitment, mixSeed } from "./fairness";
import type { HousePrompt } from "./record";

export type PeekCheck = { ok: boolean; reason: string; hash: string };

/** Escape for a RegExp. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every way the prompt builders could render the player's hole: "Ah" (show()),
 * "A♥" (cardShort), "ace of hearts", both concatenated orders ("AhKh"), and
 * holeLabel ("Ace and king, suited"). Short codes must stand alone so "Ah" in
 * a word doesn't count.
 */
function leaks(prompt: string, [a, b]: Card[]): string | null {
  const text = prompt.toLowerCase();
  const alone = (code: string) => new RegExp(`(?<![0-9a-z])${esc(code.toLowerCase())}(?![0-9a-z])`).test(text);
  for (const c of [a, b]) {
    for (const form of [c.rank + c.suit, cardShort(c)]) if (alone(form)) return form;
    if (text.includes(cardName(c).toLowerCase())) return cardName(c);
  }
  for (const form of [a.rank + a.suit + b.rank + b.suit, b.rank + b.suit + a.rank + a.suit]) if (alone(form)) return form;
  const label = holeLabel([a, b]).toLowerCase();
  return text.includes(label) ? holeLabel([a, b]) : null;
}

/**
 * Proves the house never saw the player's cards. Derives the player's hole from
 * the revealed seeds (same deal order as the engine: agent gets deck[0], deck[2]),
 * then for each house prompt checks (a) sha256(prompt) is the stored requestHash —
 * which the caller compares to NEAR AI's TEE-signed request_hash — and
 * (b) none of the player's cards appear in it. Runs in the browser (WebCrypto).
 */
export async function housePeek(prompts: HousePrompt[], seed: string, playerSeed: string): Promise<PeekCheck[]> {
  const deck = shuffle(await mixSeed(seed, playerSeed));
  const hole = [deck[0], deck[2]];
  return Promise.all(
    prompts.map(async ({ prompt, requestHash }) => {
      const hash = await commitment(prompt);
      if (hash !== requestHash) return { ok: false, hash, reason: "Prompt doesn't match its recorded hash" };
      const leak = leaks(prompt, hole);
      if (leak) return { ok: false, hash, reason: `Prompt contains your card (${leak})` };
      return { ok: true, hash, reason: "Your cards are absent" };
    }),
  );
}

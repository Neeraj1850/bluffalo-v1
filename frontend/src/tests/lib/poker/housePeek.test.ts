import { describe, expect, it } from "vitest";
import { cardShort, type Card } from "@/lib/cards";
import { shuffle } from "@/lib/poker/deck";
import { commitment, mixSeed } from "@/lib/poker/fairness";
import { housePeek } from "@/lib/poker/housePeek";

const SEED = "00112233445566778899aabbccddeeff";
const PLAYER = "ffeeddccbbaa99887766554433221100";

async function prompt(userText: string) {
  const body = JSON.stringify({ model: "m", messages: [{ role: "user", content: userText }] });
  return { street: "PRE-FLOP" as const, prompt: body, requestHash: await commitment(body) };
}

describe("housePeek", async () => {
  const deck = shuffle(await mixSeed(SEED, PLAYER));
  const show = (c: Card) => c.rank + c.suit;
  const [mine, house] = [[deck[0], deck[2]], [deck[1], deck[3]]];

  it("passes a prompt with only the house's own cards", async () => {
    const [r] = await housePeek([await prompt(`Your cards: ${house.map(show).join(" ")}`)], SEED, PLAYER);
    expect(r.ok).toBe(true);
  });

  it.each([
    ["show()", (c: Card[]) => c.map(show).join(" ")],
    ["glyphs", (c: Card[]) => c.map(cardShort).join(" ")],
    ["concatenated", (c: Card[]) => c.map(show).join("")],
  ])("fails when the player's cards appear (%s)", async (_, render) => {
    const [r] = await housePeek([await prompt(`Opponent has ${render(mine)}`)], SEED, PLAYER);
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toContain("contains your card");
  });

  it("fails a tampered prompt on the hash", async () => {
    const p = await prompt(`Your cards: ${house.map(show).join(" ")}`);
    const [r] = await housePeek([{ ...p, prompt: p.prompt.replace("Your", "My") }], SEED, PLAYER);
    expect(r).toMatchObject({ ok: false, reason: "Prompt doesn't match its recorded hash" });
  });
});

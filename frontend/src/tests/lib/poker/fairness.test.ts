import { describe, expect, it } from "vitest";
import { shuffle } from "@/lib/poker/deck";
import { commitment, mixSeed, newSeed, verifyDeal, type DealProof } from "@/lib/poker/fairness";

const SEED = "00112233445566778899aabbccddeeff";
const PLAYER = "ffeeddccbbaa99887766554433221100";

async function proof(seed = SEED, playerSeed = PLAYER): Promise<DealProof> {
  const d = shuffle(await mixSeed(seed, playerSeed));
  return { seed, commitment: await commitment(seed), playerSeed, hole: [[d[0], d[2]], [d[1], d[3]]], board: d.slice(4, 9) };
}

describe("commitment", () => {
  it("is the sha256 hex of the seed", async () => {
    // printf %s 00112233445566778899aabbccddeeff | shasum -a 256
    expect(await commitment(SEED)).toBe("5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720");
  });
});

describe("mixSeed", () => {
  it("is 128 bits derived from both seeds", async () => {
    const mixed = await mixSeed(SEED, PLAYER);
    expect(mixed).toMatch(/^[0-9a-f]{32}$/);
    expect(mixed).toBe((await commitment(`${SEED}:${PLAYER}`)).slice(0, 32));
  });

  it("deals different cards for the same server seed when the player seed differs", async () => {
    // So a server that shops for a good seed still can't predict the deck.
    const a = shuffle(await mixSeed(SEED, PLAYER));
    const b = shuffle(await mixSeed(SEED, newSeed()));
    expect(a).not.toEqual(b);
  });
});

describe("newSeed", () => {
  it("makes 128-bit hex seeds that differ", () => {
    const a = newSeed();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newSeed()).not.toBe(a);
  });
});

describe("verifyDeal", () => {
  it("accepts an honest deal", async () => {
    expect(await verifyDeal(await proof())).toEqual({ ok: true });
  });

  it("rejects a server seed swapped after the commitment", async () => {
    const p = await proof();
    const r = await verifyDeal({ ...p, seed: "ffeeddccbbaa99887766554433221100" });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/commitment/) });
  });

  it("rejects a deal that ignored the player's seed", async () => {
    const p = await proof();
    const d = shuffle(SEED); // server dealt from its own seed alone
    const r = await verifyDeal({ ...p, hole: [[d[0], d[2]], [d[1], d[3]]], board: d.slice(4, 9) });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Cards/) });
  });

  it("rejects cards that the seeds didn't deal", async () => {
    const p = await proof();
    const r = await verifyDeal({ ...p, hole: [p.hole[1], p.hole[0]] });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Cards/) });
  });

  it("rejects malformed seeds", async () => {
    const p = await proof();
    expect(await verifyDeal({ ...p, seed: "nope" })).toMatchObject({ ok: false });
    expect(await verifyDeal({ ...p, playerSeed: "nope" })).toMatchObject({ ok: false });
  });
});

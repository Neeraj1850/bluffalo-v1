import { describe, expect, it } from "vitest";
import { shuffle } from "@/lib/poker/deck";
import { commitment, newSeed, verifyDeal, type DealProof } from "@/lib/poker/fairness";

const SEED = "00112233445566778899aabbccddeeff";

async function proof(seed = SEED): Promise<DealProof> {
  const d = shuffle(seed);
  return { seed, commitment: await commitment(seed), hole: [[d[0], d[2]], [d[1], d[3]]], board: d.slice(4, 9) };
}

describe("commitment", () => {
  it("is the sha256 hex of the seed", async () => {
    // printf %s 00112233445566778899aabbccddeeff | shasum -a 256
    expect(await commitment(SEED)).toBe("5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720");
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

  it("rejects a seed swapped after the commitment", async () => {
    const p = await proof();
    const r = await verifyDeal({ ...p, seed: "ffeeddccbbaa99887766554433221100" });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/commitment/) });
  });

  it("rejects cards that the seed didn't deal", async () => {
    const p = await proof();
    const r = await verifyDeal({ ...p, hole: [p.hole[1], p.hole[0]] });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Cards/) });
  });

  it("rejects a malformed seed", async () => {
    const p = await proof();
    expect(await verifyDeal({ ...p, seed: "nope" })).toMatchObject({ ok: false });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/deal/route";
import { commitment } from "@/lib/poker/fairness";
import { createDeal, takeSeed } from "@/lib/server/deals";
import { useFakeBackend } from "@/tests/helpers/backend";

// Expiry and the SQL itself are tested against the real models in backend/tests.
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

beforeEach(() => {
  const { seedSession } = useFakeBackend();
  seedSession(A);
  seedSession(B);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("deal store", () => {
  it("commits to a seed it reveals later", async () => {
    const deal = await createDeal(A);
    const revealed = await takeSeed(deal.handId, A);
    expect(revealed).not.toBeNull();
    expect(await commitment(revealed!.seed)).toBe(deal.commitment);
  });

  it("reveals each seed only once", async () => {
    const { handId } = await createDeal(A);
    expect(await takeSeed(handId, A)).not.toBeNull();
    expect(await takeSeed(handId, A)).toBeNull();
  });

  it("never hands a seed to another session", async () => {
    const { handId } = await createDeal(A);
    expect(await takeSeed(handId, B)).toBeNull();
    expect(await takeSeed(handId, A)).not.toBeNull();
  });

  it("returns null for unknown hands", async () => {
    expect(await takeSeed("nope", A)).toBeNull();
  });
});

describe("POST /api/deal", () => {
  it("returns a hand id and commitment but never the seed", async () => {
    const body = await (await POST(new Request("http://x/api/deal", { method: "POST" }))).json();
    expect(Object.keys(body).sort()).toEqual(["commitment", "handId"]);
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/);
  });
});

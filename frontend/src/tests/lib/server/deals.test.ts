import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/deal/route";
import { commitment } from "@/lib/poker/fairness";
import { createDeal, takeSeed } from "@/lib/server/deals";

describe("deal store", () => {
  afterEach(() => vi.useRealTimers());

  it("commits to a seed it reveals later", async () => {
    const deal = await createDeal();
    const revealed = takeSeed(deal.handId);
    expect(revealed).not.toBeNull();
    expect(await commitment(revealed!.seed)).toBe(deal.commitment);
  });

  it("reveals each seed only once", async () => {
    const { handId } = await createDeal();
    expect(takeSeed(handId)).not.toBeNull();
    expect(takeSeed(handId)).toBeNull();
  });

  it("returns null for unknown hands", () => {
    expect(takeSeed("nope")).toBeNull();
  });

  it("expires deals that were never played", async () => {
    vi.useFakeTimers();
    const { handId } = await createDeal();
    vi.advanceTimersByTime(11 * 60_000);
    expect(takeSeed(handId)).toBeNull();
  });
});

describe("POST /api/deal", () => {
  it("returns a hand id and commitment but never the seed", async () => {
    const body = await (await POST()).json();
    expect(Object.keys(body).sort()).toEqual(["commitment", "handId"]);
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/);
  });
});

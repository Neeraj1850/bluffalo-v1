import { describe, expect, it, vi } from "vitest";
import { CLAIM_AFTER_MS, claimExpired, parkedHands, parkUnsettled } from "@/lib/server/timeouts";

describe("unsettled hands", () => {
  it("claims a parked hand only after the on-chain timeout, then forgets it", async () => {
    const claim = vi.fn().mockResolvedValue("TX");
    parkUnsettled("aaaa0001", 0);
    expect(await claimExpired(CLAIM_AFTER_MS - 1, claim)).toEqual([]);
    expect(claim).not.toHaveBeenCalled();
    expect(await claimExpired(CLAIM_AFTER_MS, claim)).toEqual(["aaaa0001"]);
    expect(parkedHands()).not.toContain("aaaa0001");
  });

  it("keeps a hand whose claim failed, to retry later", async () => {
    parkUnsettled("aaaa0002", 0);
    expect(await claimExpired(CLAIM_AFTER_MS, vi.fn().mockRejectedValue(new Error("rpc down")))).toEqual([]);
    expect(parkedHands()).toContain("aaaa0002");
  });
});

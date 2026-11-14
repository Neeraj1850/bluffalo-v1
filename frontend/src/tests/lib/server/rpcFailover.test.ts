import { describe, expect, it, vi } from "vitest";
import { failover, isRpcOutage } from "@/lib/server/near";

const rateLimited = new Error('{"jsonrpc": "2.0", "error": {"code": -429, "message": "Rate limits exceeded."}}');

describe("RPC failover", () => {
  it("moves to the next RPC on a rate limit, then sticks with it", async () => {
    const a = { view: vi.fn().mockRejectedValue(rateLimited) };
    const b = { view: vi.fn().mockResolvedValue("ok") };
    const p = failover([a, b]);
    expect(await p.view()).toBe("ok");
    expect(await p.view()).toBe("ok");
    expect(a.view).toHaveBeenCalledTimes(1);
    expect(b.view).toHaveBeenCalledTimes(2);
  });

  it("keeps a contract error as is, without trying other RPCs", async () => {
    const panic = new Error("Smart contract panicked: unsupported");
    const a = { view: vi.fn().mockRejectedValue(panic) };
    const b = { view: vi.fn() };
    await expect(failover([a, b]).view()).rejects.toBe(panic);
    expect(b.view).not.toHaveBeenCalled();
  });

  it("throws the last outage when every RPC is down", async () => {
    const p = failover([{ view: vi.fn().mockRejectedValue(rateLimited) }, { view: vi.fn().mockRejectedValue(new Error("fetch failed")) }]);
    await expect(p.view()).rejects.toThrow("fetch failed");
  });

  it("tells outages from contract errors", () => {
    expect(isRpcOutage(new Error("x", { cause: rateLimited }))).toBe(true);
    expect(isRpcOutage(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRpcOutage(new Error("account bob.testnet does not exist (UNKNOWN_ACCOUNT)"))).toBe(false);
    expect(isRpcOutage(new Error("balance 4290000 too low"))).toBe(false);
  });
});

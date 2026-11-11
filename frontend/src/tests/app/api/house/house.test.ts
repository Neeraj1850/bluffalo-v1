import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/house/route";
import { POST as sweep } from "@/app/api/house/sweep/route";
import { ChainError } from "@/lib/server/near";

const house = vi.hoisted(() => ({ houseStatus: vi.fn(), sweepHouse: vi.fn() }));
vi.mock("@/lib/server/house", async (orig) => ({ ...(await orig<object>()), ...house }));

const call = (token?: string) =>
  sweep(new Request("http://x/api/house/sweep", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeEach(() => {
  vi.stubEnv("BACKEND_TOKEN", "secret");
  house.houseStatus.mockReset().mockResolvedValue({ operator: { low: false }, house: { low: false } });
  house.sweepHouse.mockReset().mockResolvedValue({ skipped: "contract_outdated", balance: "1" });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/house", () => {
  it("returns the balances", async () => {
    expect(await (await GET()).json()).toEqual({ operator: { low: false }, house: { low: false } });
  });

  it("answers 503 chain_down", async () => {
    house.houseStatus.mockRejectedValueOnce(new ChainError());
    expect((await GET()).status).toBe(503);
  });
});

describe("POST /api/house/sweep", () => {
  it("requires the backend token", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    vi.stubEnv("BACKEND_TOKEN", "");
    expect((await call("")).status).toBe(401);
    expect(house.sweepHouse).not.toHaveBeenCalled();
  });

  it("sweeps and reports the result", async () => {
    const res = await call("secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "contract_outdated", balance: "1" });
  });

  it("answers 503 chain_down", async () => {
    house.sweepHouse.mockRejectedValueOnce(new ChainError());
    expect((await call("secret")).status).toBe(503);
  });
});

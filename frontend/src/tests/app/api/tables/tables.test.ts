import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tables/route";
import { ChainError } from "@/lib/server/near";

const chain = vi.hoisted(() => ({ houseBalance: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

beforeEach(() => chain.houseBalance.mockReset().mockResolvedValue(5000));

describe("GET /api/tables", () => {
  it("lists real-money tables with open state and max buy-in, and the house balance", async () => {
    const body = await (await GET()).json();
    expect(body.house).toEqual({ balance: 5000 });
    expect(body.tables.find((t: { id: string }) => t.id === "back-room")).toEqual({ id: "back-room", open: true, maxBuyIn: 50 }); // 1% of the house
    expect(body.tables.some((t: { id: string }) => t.id === "kitchen")).toBe(false);
    // the vault (min buy-in 250) needs a 25000 house before 1% covers it: closed
    expect(body.tables.filter((t: { open: boolean }) => !t.open).length).toBeGreaterThan(0);
  });

  it("answers 503 chain_down", async () => {
    chain.houseBalance.mockRejectedValueOnce(new ChainError());
    expect((await GET()).status).toBe(503);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/market/import/route";
import { useFakeBackend } from "@/tests/helpers/backend";

const row = { id: "s1", name: "House Rock", params: { aggression: 20 }, salt: "ab".repeat(16), params_hash: "cd".repeat(32), mint_tx: "TX" };
const call = (body: unknown, token = "test-token") =>
  POST(new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));

let be: ReturnType<typeof useFakeBackend>;
beforeEach(() => {
  be = useFakeBackend();
  vi.stubEnv("NPC_BOOKIE", "bookie.op.testnet:ed25519:b");
  vi.stubEnv("NEAR_MARKET_ID", "market.op.testnet");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/market/import", () => {
  it("needs the backend token", async () => {
    expect((await call({ rows: [row] }, "nope")).status).toBe(401);
    expect(be.strategies.size).toBe(0);
  });

  it("registers rows under Bookie once, skipping names already there", async () => {
    expect(await (await call({ rows: [row] })).json()).toEqual({ added: ["s1"] });
    expect(be.strategies.get("s1")).toMatchObject({ creator_account: "bookie.op.testnet", contract_id: "market.op.testnet", salt: row.salt });
    expect(await (await call({ rows: [row] })).json()).toEqual({ added: [] });
  });
});

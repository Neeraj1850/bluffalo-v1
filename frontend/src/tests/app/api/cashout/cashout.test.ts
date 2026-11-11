import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAgent } from "@/app/api/agent/route";
import { POST as quote } from "@/app/api/cashout/quote/route";
import { POST as cashout } from "@/app/api/cashout/route";
import { GET as status } from "@/app/api/cashout/status/route";
import { ChainError } from "@/lib/server/near";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({
  balanceOf: vi.fn(),
  balanceYocto: vi.fn(),
  accountExists: vi.fn(),
  withdrawTo: vi.fn(),
  txStatus: vi.fn(),
}));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const NO_AGENT = "00000000-0000-4000-8000-00000000000d";
const TX = "5FhvXbueuEkM6KJMsND752Uk4Fder6z2QPjJ5UdSSnBs";
const headers = (id: string) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const post = (route: (r: Request) => Promise<Response>, body: unknown, id = ME) =>
  route(new Request("http://x/api", { method: "POST", headers: headers(id), body: JSON.stringify(body) }));

beforeEach(() => {
  const { seedSession } = useFakeBackend();
  seedSession(ME, "did:privy:me", "a1.op.testnet", "ed25519:agentkey");
  seedSession(GUEST);
  seedSession(NO_AGENT, "did:privy:new");
  chain.balanceOf.mockReset().mockResolvedValue(49);
  chain.balanceYocto.mockReset().mockResolvedValue(49_000_000_000_000_000_000_000n);
  chain.accountExists.mockReset().mockResolvedValue(true);
  chain.withdrawTo.mockReset().mockResolvedValue(TX);
  chain.txStatus.mockReset().mockResolvedValue("confirmed");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/agent", () => {
  it("returns the agent account and its on-chain balance", async () => {
    const res = await getAgent(new Request("http://x/api/agent", { headers: headers(ME) }));
    expect(await res.json()).toEqual({ account: "a1.op.testnet", balance: 49, inHand: false });
  });

  it("returns no agent for a fresh session, without touching the chain", async () => {
    const res = await getAgent(new Request("http://x/api/agent", { headers: headers(GUEST) }));
    expect(await res.json()).toEqual({ account: null, balance: 0, inHand: false });
    expect(chain.balanceOf).not.toHaveBeenCalled();
  });
});

describe("POST /api/cashout/quote", () => {
  it("quotes the whole on-chain balance, scaled back to testnet NEAR", async () => {
    const res = await post(quote, { receiver: "you.testnet" });
    expect(await res.json()).toMatchObject({ id: "you.testnet", send: 49, receive: 0.049, receiveAsset: "test NEAR" });
    expect(chain.withdrawTo).not.toHaveBeenCalled();
  });

  it("refuses an empty balance", async () => {
    chain.balanceYocto.mockResolvedValueOnce(0n);
    expect((await post(quote, { receiver: "you.testnet" })).status).toBe(409);
  });
});

describe("POST /api/cashout", () => {
  it("sends the exact on-chain balance, signed with the agent's own key", async () => {
    const res = await post(cashout, { receiver: "you.testnet", amount: 999999 });
    expect(await res.json()).toEqual({ id: TX });
    // The browser's "amount" is ignored; the chain decides.
    expect(chain.withdrawTo).toHaveBeenCalledWith("a1.op.testnet", "ed25519:agentkey", "you.testnet", 49_000_000_000_000_000_000_000n);
  });

  it.each([
    ["a signed-out player", GUEST, { receiver: "you.testnet" }, 401],
    ["a player without an agent", NO_AGENT, { receiver: "you.testnet" }, 409],
    ["a malformed destination", ME, { receiver: "Not An Account" }, 400],
    ["a missing destination", ME, {}, 400],
  ])("refuses %s", async (_, id, body, code) => {
    expect((await post(cashout, body, id)).status).toBe(code);
    expect(chain.withdrawTo).not.toHaveBeenCalled();
  });

  it("refuses a destination that doesn't exist on testnet", async () => {
    chain.accountExists.mockResolvedValueOnce(false);
    const res = await post(cashout, { receiver: "nobody.testnet" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/doesn’t exist/);
    expect(chain.withdrawTo).not.toHaveBeenCalled();
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.withdrawTo.mockRejectedValueOnce(new ChainError());
    const res = await post(cashout, { receiver: "you.testnet" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
  });
});

describe("GET /api/cashout/status", () => {
  const get = (tx: string, id = ME) => status(new Request(`http://x/api/cashout/status?tx=${tx}`, { headers: headers(id) }));

  it("reports the network's status for the agent's transaction", async () => {
    expect(await (await get(TX)).json()).toEqual({ status: "confirmed" });
    expect(chain.txStatus).toHaveBeenCalledWith(TX, "a1.op.testnet");
  });

  it("rejects malformed hashes and sessions without an agent", async () => {
    expect((await get("not-a-hash")).status).toBe(404);
    expect((await get(TX, GUEST)).status).toBe(404);
  });
});

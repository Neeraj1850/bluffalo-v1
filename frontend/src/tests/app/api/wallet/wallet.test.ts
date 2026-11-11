import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as stop } from "@/app/api/agent/stop/route";
import { GET as quote } from "@/app/api/agent/quote/route";
import { GET as getWallet } from "@/app/api/wallet/route";
import { POST as fund } from "@/app/api/wallet/fund/route";
import { POST as withdraw } from "@/app/api/wallet/withdraw/route";
import { ChainError, toYocto } from "@/lib/server/near";
import { SESSION_COOKIE, sessionWallet } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({
  createWallet: vi.fn(),
  walletBalanceYocto: vi.fn(),
  accountExists: vi.fn(),
  fundFromOperator: vi.fn(),
  sendFromWallet: vi.fn(),
  gasPriceYocto: vi.fn(),
  balanceYocto: vi.fn(),
  withdrawTo: vi.fn(),
  houseBalance: vi.fn(),
  operatorBalanceYocto: vi.fn(),
}));
vi.mock("@/lib/server/near", async (orig) => ({
  ...(await orig<object>()),
  ...chain,
}));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const NEW = "00000000-0000-4000-8000-00000000000d";
const WALLET = "ab".repeat(32);
const headers = (id: string) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const get = (route: (r: Request) => Promise<Response>, url: string, id = ME) =>
  route(new Request(url, { headers: headers(id) }));
const post = (route: (r: Request) => Promise<Response>, body: unknown, id = ME) =>
  route(
    new Request("http://x/api", {
      method: "POST",
      headers: headers(id),
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  chain.houseBalance.mockReset().mockResolvedValue(10000); // 5 NEAR on-chain
  const { seedSession, seedWallet } = useFakeBackend();
  seedSession(ME, "did:privy:me", "a1.op.testnet", "ed25519:agentkey");
  seedWallet(ME, WALLET, "ed25519:walletkey");
  seedSession(GUEST);
  seedSession(NEW, "did:privy:new");
  chain.createWallet.mockReset().mockReturnValue({
    accountId: "cd".repeat(32),
    privateKey: "ed25519:fresh",
  });
  chain.walletBalanceYocto.mockReset().mockResolvedValue(toYocto(120));
  chain.accountExists.mockReset().mockResolvedValue(true);
  chain.fundFromOperator.mockReset().mockResolvedValue("FUND_TX");
  chain.sendFromWallet.mockReset().mockResolvedValue("SEND_TX");
  chain.gasPriceYocto.mockReset().mockResolvedValue(100_000_000n);
  chain.balanceYocto.mockReset().mockResolvedValue(toYocto(73.5));
  chain.withdrawTo.mockReset().mockResolvedValue("STOP_TX");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/wallet", () => {
  it("returns the wallet and what it can spend, in table NEAR", async () => {
    const res = await get(getWallet, "http://x/api/wallet");
    expect(await res.json()).toEqual({ account: WALLET, balance: 120 });
    expect(chain.createWallet).not.toHaveBeenCalled();
  });

  it("creates and stores a wallet on first use, never returning its key", async () => {
    chain.walletBalanceYocto.mockResolvedValueOnce(0n);
    const res = await get(getWallet, "http://x/api/wallet", NEW);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ account: "cd".repeat(32), balance: 0 });
    expect(text).not.toContain("fresh");
    expect(await sessionWallet(NEW)).toEqual({
      account: "cd".repeat(32),
      key: "ed25519:fresh",
    });
    await get(getWallet, "http://x/api/wallet", NEW);
    expect(chain.createWallet).toHaveBeenCalledTimes(1);
  });

  it("requires sign-in", async () => {
    expect((await get(getWallet, "http://x/api/wallet", GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.walletBalanceYocto.mockRejectedValueOnce(new ChainError());
    const res = await get(getWallet, "http://x/api/wallet");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
  });
});

describe("POST /api/wallet/fund", () => {
  // The faucet's cooldown is wall-clock based: start every case well past it.
  let clock = Date.parse("2026-11-11T00:00:00Z");
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    clock += 60 * 60_000;
    vi.setSystemTime(clock);
    chain.walletBalanceYocto.mockResolvedValue(0n);
    chain.operatorBalanceYocto.mockResolvedValue(10n ** 25n); // 10 testnet NEAR
  });
  afterEach(() => vi.useRealTimers());

  it("tops up an empty wallet from the operator", async () => {
    const res = await post(fund, {});
    expect(await res.json()).toEqual({ tx: "FUND_TX", amount: 100 });
    expect(chain.fundFromOperator).toHaveBeenCalledWith(WALLET, 10n ** 23n);
  });

  it("tops up a returning wallet that already exists on-chain but is low", async () => {
    chain.accountExists.mockResolvedValue(true);
    chain.walletBalanceYocto.mockResolvedValueOnce(toYocto(3));
    expect((await post(fund, {})).status).toBe(200);
  });

  it("refuses a wallet that already has enough GNEAR, saying how much", async () => {
    chain.walletBalanceYocto.mockResolvedValueOnce(toYocto(85));
    const res = await post(fund, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "enough_funds", error: expect.stringContaining("85.00 GNEAR") });
    expect(chain.fundFromOperator).not.toHaveBeenCalled();
  });

  it("allows one top-up per cooldown, then points to the public faucet", async () => {
    expect((await post(fund, {})).status).toBe(200);
    const again = await post(fund, {});
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: "cooldown" });
    expect(chain.fundFromOperator).toHaveBeenCalledTimes(1);
  });

  it("says the faucet is empty instead of draining the operator", async () => {
    chain.operatorBalanceYocto.mockResolvedValueOnce(10n ** 24n); // exactly the reserve
    const res = await post(fund, {});
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "faucet_empty" });
    expect(chain.fundFromOperator).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect((await post(fund, {}, GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails, and doesn't start the cooldown", async () => {
    chain.fundFromOperator.mockRejectedValueOnce(new ChainError());
    const res = await post(fund, {});
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
    expect((await post(fund, {})).status).toBe(200);
  });
});

describe("POST /api/wallet/withdraw", () => {
  it("sends everything available when no amount is given", async () => {
    const res = await post(withdraw, { receiver: "you.testnet" });
    expect(await res.json()).toEqual({ tx: "SEND_TX" });
    expect(chain.sendFromWallet).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "you.testnet", toYocto(120));
  });

  it("sends the amount asked for, scaled to on-chain yocto", async () => {
    await post(withdraw, { receiver: "you.testnet", amount: 20 });
    expect(chain.sendFromWallet).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "you.testnet", 20n * 10n ** 21n);
  });

  it("refuses more than the wallet holds", async () => {
    const res = await post(withdraw, { receiver: "you.testnet", amount: 121 });
    expect(res.status).toBe(402);
    expect(chain.sendFromWallet).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid account", { receiver: "Not An Account" }],
    ["a bad amount", { receiver: "you.testnet", amount: -1 }],
  ])("refuses %s", async (_, body) => {
    expect((await post(withdraw, body)).status).toBe(400);
    expect(chain.sendFromWallet).not.toHaveBeenCalled();
  });

  it("refuses an account that doesn't exist on testnet", async () => {
    chain.accountExists.mockResolvedValueOnce(false);
    expect((await post(withdraw, { receiver: "nobody.testnet" })).status).toBe(400);
  });

  it("refuses an empty wallet", async () => {
    chain.walletBalanceYocto.mockResolvedValueOnce(0n);
    expect((await post(withdraw, { receiver: "you.testnet" })).status).toBe(409);
  });

  it("requires sign-in", async () => {
    expect((await post(withdraw, { receiver: "you.testnet" }, GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.sendFromWallet.mockRejectedValueOnce(new ChainError());
    const res = await post(withdraw, { receiver: "you.testnet" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
  });
});

describe("GET /api/agent/quote", () => {
  it("quotes the real gas cost and the table's buy-in", async () => {
    const res = await get(quote, "http://x/api/agent/quote?tableId=back-room");
    const body = await res.json();
    // 1e8 yocto/gas × 10 Tgas = 1e21 yocto = 0.001 NEAR on-chain = 1 table NEAR
    expect(body).toMatchObject({ fee: 1, currency: "NEAR", buyIn: 50, tableFee: 1, maxBuyIn: 100 });
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("clamps the buy-in to the house's exposure cap", async () => {
    chain.houseBalance.mockResolvedValueOnce(4000); // 1% = 40
    const body = await (await get(quote, "http://x/api/agent/quote?tableId=back-room")).json();
    expect(body).toMatchObject({ buyIn: 40, maxBuyIn: 40, tableFee: 0.8 });
  });

  it("answers 503 table_closed when the house is below its floor", async () => {
    chain.houseBalance.mockResolvedValueOnce(1999); // floor: 1% must cover the 20 min buy-in
    const res = await get(quote, "http://x/api/agent/quote?tableId=back-room");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Table closed — the house is rebalancing", code: "table_closed" });
  });

  it("refuses a practice table", async () => {
    expect((await get(quote, "http://x/api/agent/quote?tableId=kitchen")).status).toBe(400);
  });

  it("requires sign-in", async () => {
    expect((await get(quote, "http://x/api/agent/quote?tableId=back-room", GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.gasPriceYocto.mockRejectedValueOnce(new ChainError());
    expect((await get(quote, "http://x/api/agent/quote?tableId=back-room")).status).toBe(503);
  });
});

describe("POST /api/agent/stop", () => {
  it("returns the agent's whole contract balance to the player's wallet", async () => {
    const res = await post(stop, {});
    expect(await res.json()).toEqual({ tx: "STOP_TX", amount: 73.5 });
    expect(chain.withdrawTo).toHaveBeenCalledWith("a1.op.testnet", "ed25519:agentkey", WALLET, toYocto(73.5));
  });

  it("refuses when there's no agent", async () => {
    expect((await post(stop, {}, NEW)).status).toBe(409);
  });

  it("refuses when the agent holds nothing", async () => {
    chain.balanceYocto.mockResolvedValueOnce(0n);
    expect((await post(stop, {})).status).toBe(409);
    expect(chain.withdrawTo).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect((await post(stop, {}, GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.withdrawTo.mockRejectedValueOnce(new ChainError());
    expect((await post(stop, {})).status).toBe(503);
  });
});

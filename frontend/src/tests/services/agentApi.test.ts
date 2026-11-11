import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/data/strategy";
import {
  ApiError,
  deployAgent,
  fetchAgent,
  fetchHands,
  fetchLiveHand,
  fetchWallet,
  getFeeQuote,
  getVerification,
  SignedOutError,
  stopAgent,
  testnetCashout,
  withdrawFromWallet,
} from "@/services/agentApi";

const req = { tableId: "back-room", params: getPreset("shark").params!, stack: 50, button: 0 as const };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchLiveHand", () => {
  it("commits the deal, then plays that hand", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ handId: "0123abcd", commitment: "c1" }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) =>
        json({ id: "#0123abcd", proof: { commitment: "c1", playerSeed: JSON.parse(String(init.body)).playerSeed } }),
      );
    const hand = await fetchLiveHand(req, f);
    expect(hand.id).toBe("#0123abcd");
    expect(f.mock.calls.map(([url]) => url)).toEqual(["/api/deal", "/api/play"]);
    const sent = JSON.parse(f.mock.calls[1][1].body);
    expect(sent).toEqual({ ...req, handId: "0123abcd", playerSeed: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it("rejects a hand whose seed wasn't the committed one", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ handId: "0123abcd", commitment: "c1" }))
      .mockResolvedValueOnce(json({ proof: { commitment: "other" } }));
    await expect(fetchLiveHand(req, f)).rejects.toThrow("commitment");
  });

  it("rejects a hand that didn't use our seed", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ handId: "0123abcd", commitment: "c1" }))
      .mockResolvedValueOnce(json({ proof: { commitment: "c1", playerSeed: "0".repeat(32) } }));
    await expect(fetchLiveHand(req, f)).rejects.toThrow("commitment");
  });

  it("surfaces the server's error message", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ error: "Unknown table" }, 400));
    await expect(fetchLiveHand(req, f)).rejects.toThrow("Unknown table");
  });
});

describe("fetchHands", () => {
  it("returns the recorded hands", async () => {
    const f = vi.fn().mockResolvedValue(json({ hands: [{ id: "#a" }] }));
    expect(await fetchHands(f)).toEqual([{ id: "#a" }]);
    expect(f).toHaveBeenCalledWith("/api/hands");
  });

  it("throws when the archive can't be loaded", async () => {
    await expect(fetchHands(vi.fn().mockResolvedValue(json({}, 500)))).rejects.toThrow("500");
  });
});

describe("deployAgent", () => {
  const dreq = { tableId: "back-room", buyIn: 50, preset: "shark" as const, params: req.params, limits: { stopLoss: 25, takeProfit: 60, maxHands: 100 } };

  it("asks the server for the table only — the server sets the buy-in", async () => {
    const f = vi.fn().mockResolvedValue(json({ agentAccount: "a1.op.testnet", confirmedAt: 1 }));
    expect(await deployAgent(dreq, f)).toEqual({ agentAccount: "a1.op.testnet", confirmedAt: 1 });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tableId: "back-room" });
  });

  it("reports failures without claiming funds moved", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: "NEAR testnet isn't reachable right now." }, 503));
    await expect(deployAgent(dreq, f)).rejects.toMatchObject({ message: "NEAR testnet isn't reachable right now.", fundsMoved: false });
    await expect(deployAgent(dreq, vi.fn().mockResolvedValue(json({}, 500)))).rejects.toBeInstanceOf(ApiError);
  });

  it("flags a 402 as insufficient funds", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: "Not enough balance", code: "insufficient_funds" }, 402));
    await expect(deployAgent(dreq, f)).rejects.toMatchObject({ code: "insufficient_funds", fundsMoved: false });
    const bare = vi.fn().mockResolvedValue(json({}, 402));
    await expect(deployAgent(dreq, bare)).rejects.toMatchObject({ code: "insufficient_funds" });
  });

  it("passes through the deposit tx and buy-in", async () => {
    const body = { agentAccount: "a1.op.testnet", depositTx: "TX", buyIn: 50, confirmedAt: 2 };
    expect(await deployAgent(dreq, vi.fn().mockResolvedValue(json(body)))).toEqual(body);
  });
});

describe("testnet cash-out", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("quotes, submits to the destination account, and reads the status", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ id: "you.testnet", send: 49, fee: 0.001, receive: 0.049, receiveAsset: "test NEAR", expiresAt: 1 }))
      .mockResolvedValueOnce(json({ id: "TXHASH" }))
      .mockResolvedValueOnce(json({ status: "confirmed" }));
    vi.stubGlobal("fetch", f);
    const q = await testnetCashout.getCashoutQuote("you.testnet");
    expect(q.receive).toBe(0.049);
    expect(await testnetCashout.submitCashout(q.id)).toEqual({ id: "TXHASH" });
    expect(await testnetCashout.getCashoutStatus("TXHASH")).toBe("confirmed");
    expect(f.mock.calls.map(([url]) => url)).toEqual(["/api/cashout/quote", "/api/cashout", "/api/cashout/status?tx=TXHASH"]);
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ receiver: "you.testnet" });
  });

  it("surfaces the server's reason, e.g. a missing account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "nobody.testnet doesn’t exist on NEAR testnet" }, 400)));
    await expect(testnetCashout.getCashoutQuote("nobody.testnet")).rejects.toThrow("doesn’t exist");
  });
});

describe("fetchAgent", () => {
  it("returns the agent account and on-chain balance", async () => {
    const f = vi.fn().mockResolvedValue(json({ account: "a1.op.testnet", balance: 49 }));
    expect(await fetchAgent(f)).toEqual({ account: "a1.op.testnet", balance: 49 });
  });
});

describe("getFeeQuote", () => {
  it("asks the server for the table's fee and buy-in", async () => {
    const quote = { fee: 0, currency: "NEAR", expiresAt: 5, buyIn: 50 };
    const f = vi.fn().mockResolvedValue(json(quote));
    expect(await getFeeQuote({ tableId: "back room" }, f)).toEqual(quote);
    expect(f).toHaveBeenCalledWith("/api/agent/quote?tableId=back%20room");
  });

  it("throws when no quote is available", async () => {
    await expect(getFeeQuote({ tableId: "x" }, vi.fn().mockResolvedValue(json({ error: "Unknown table" }, 400)))).rejects.toThrow(
      "Unknown table",
    );
  });
});

describe("getVerification", () => {
  it("reads the server's status", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "verified" }));
    expect(await getVerification("#ab", f)).toBe("verified");
    expect(f).toHaveBeenCalledWith("/api/hands/verify?id=%23ab");
  });

  it("never reports verified for an unknown answer", async () => {
    expect(await getVerification("#ab", vi.fn().mockResolvedValue(json({ status: "yes" })))).toBe("unavailable");
    await expect(getVerification("#ab", vi.fn().mockResolvedValue(json({}, 500)))).rejects.toThrow();
  });
});

describe("wallet", () => {
  it("reads the deposit account and balance", async () => {
    const f = vi.fn().mockResolvedValue(json({ account: "ab".repeat(32), balance: 12.5 }));
    expect(await fetchWallet(f)).toEqual({ account: "ab".repeat(32), balance: 12.5 });
    expect(f).toHaveBeenCalledWith("/api/wallet");
  });

  it("tells signed-out apart from errors", async () => {
    await expect(fetchWallet(vi.fn().mockResolvedValue(json({}, 401)))).rejects.toBeInstanceOf(SignedOutError);
    await expect(fetchWallet(vi.fn().mockResolvedValue(json({ error: "RPC down" }, 503)))).rejects.toThrow("RPC down");
  });

  it("withdraws to a receiver", async () => {
    const f = vi.fn().mockResolvedValue(json({ tx: "TX1" }));
    expect(await withdrawFromWallet({ receiver: "you.testnet", amount: 5 }, f)).toEqual({ tx: "TX1" });
    expect(f.mock.calls[0][0]).toBe("/api/wallet/withdraw");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ receiver: "you.testnet", amount: 5 });
    await expect(withdrawFromWallet({ receiver: "x.testnet" }, vi.fn().mockResolvedValue(json({ error: "Nope" }, 400)))).rejects.toThrow("Nope");
  });

  it("stops the agent and returns its balance", async () => {
    const f = vi.fn().mockResolvedValue(json({ tx: "TX2", amount: 48 }));
    expect(await stopAgent(f)).toEqual({ tx: "TX2", amount: 48 });
    expect(f.mock.calls[0][0]).toBe("/api/agent/stop");
    expect(f.mock.calls[0][1].method).toBe("POST");
  });
});

describe("fetchTables", () => {
  it("reads /api/tables", async () => {
    const { fetchTables } = await import("@/services/agentApi");
    const body = { tables: [{ id: "back-room", open: true, maxBuyIn: 100 }], house: { balance: 5000 } };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    expect(await fetchTables(f)).toEqual(body);
    expect(f).toHaveBeenCalledWith("/api/tables");
  });
});

import { describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/data/strategy";
import { ApiError, deployAgent, fetchHands, fetchLiveHand } from "@/services/agentApi";

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
});

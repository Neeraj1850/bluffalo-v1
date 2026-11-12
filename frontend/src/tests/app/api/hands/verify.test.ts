import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as verify } from "@/app/api/hands/verify/route";
import { commitment } from "@/lib/poker/fairness";
import { ChainError } from "@/lib/server/near";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({ getHand: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({
  ...(await orig<object>()),
  ...chain,
}));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const SEED = "0123456789abcdef0123456789abcdef";
const check = (id: string, as = ME) =>
  verify(
    new Request(`http://x/api/hands/verify?id=${id}`, {
      headers: { cookie: `${SESSION_COOKIE}=${as}` },
    }),
  );
const hand = async (over: object = {}) => ({
  player: "a1.op.testnet",
  commitment: await commitment(SEED),
  status: "Settled",
  server_seed: SEED,
  player_seed: "ff",
  ...over,
});

beforeEach(() => {
  const { seedSession } = useFakeBackend();
  seedSession(ME, "did:privy:me");
  seedSession(GUEST);
  chain.getHand.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/hands/verify", () => {
  it("verifies a settled hand whose seed matches its commitment", async () => {
    chain.getHand.mockResolvedValueOnce(await hand());
    expect(await (await check("0123abcd")).json()).toEqual({
      status: "verified",
    });
    expect(chain.getHand).toHaveBeenCalledWith("0123abcd", undefined);
  });

  it("also requires the player's seed to match its commitment (contract v2)", async () => {
    const PLAYER = "fedcba9876543210fedcba9876543210";
    chain.getHand.mockResolvedValueOnce(await hand({ player_seed: PLAYER, player_commitment: await commitment(PLAYER) }));
    expect(await (await check("0123abcd")).json()).toEqual({ status: "verified" });
    chain.getHand.mockResolvedValueOnce(await hand({ player_seed: PLAYER, player_commitment: await commitment(SEED) }));
    expect(await (await check("0123abcd")).json()).toEqual({ status: "unavailable" });
  });

  it("reads a hand from the contract it was played on, but only our own contracts", async () => {
    chain.getHand.mockResolvedValueOnce(await hand());
    await check("0123abcd&contract=npk-63o824.testnet");
    expect(chain.getHand).toHaveBeenCalledWith("0123abcd", "npk-63o824.testnet");
    expect((await check("0123abcd&contract=evil.testnet")).status).toBe(400);
  });

  it("is pending while the hand is only committed", async () => {
    chain.getHand.mockResolvedValueOnce(await hand({ status: "Committed", server_seed: null }));
    expect(await (await check("0123abcd")).json()).toEqual({
      status: "pending",
    });
  });

  it.each([
    ["the contract has no such hand", null],
    ["the seed doesn't match", { server_seed: "deadbeef" }],
    ["the hand was cancelled", { status: "Cancelled", server_seed: null }],
  ])("is unavailable when %s", async (_, over) => {
    chain.getHand.mockResolvedValueOnce(over === null ? null : await hand(over));
    expect(await (await check("0123abcd")).json()).toEqual({
      status: "unavailable",
    });
  });

  it("refuses a malformed id", async () => {
    expect((await check("../x")).status).toBe(400);
  });

  it("requires sign-in", async () => {
    expect((await check("0123abcd", GUEST)).status).toBe(401);
  });

  it("answers 503 chain_down when testnet fails", async () => {
    chain.getHand.mockRejectedValueOnce(new ChainError());
    expect((await check("0123abcd")).status).toBe(503);
  });
});

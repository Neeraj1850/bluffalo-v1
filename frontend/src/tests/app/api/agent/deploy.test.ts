import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/deploy/route";
import { ChainError, toYocto } from "@/lib/server/near";
import { SESSION_COOKIE, sessionAgent, sessionAgentKey } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({
  createAgentAccount: vi.fn(),
  depositFromWallet: vi.fn(),
  walletBalanceYocto: vi.fn(),
  sendFromWallet: vi.fn(),
  houseBalance: vi.fn(),
}));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const BROKE = "00000000-0000-4000-8000-00000000000e";
const WALLET = "ab".repeat(32);
const deploy = (body: unknown, id = ME) =>
  POST(new Request("http://x/api/agent/deploy", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${id}` }, body: JSON.stringify(body) }));

beforeEach(() => {
  const { seedSession, seedWallet } = useFakeBackend();
  seedSession(ME, "did:privy:me");
  seedWallet(ME, WALLET, "ed25519:walletkey");
  seedSession(GUEST);
  seedSession(BROKE, "did:privy:broke");
  chain.createAgentAccount.mockReset().mockResolvedValue({ accountId: "a1b2c3d4.op.testnet", privateKey: "ed25519:agentkey" });
  chain.depositFromWallet.mockReset().mockResolvedValue("DEPOSIT_TX");
  chain.walletBalanceYocto.mockReset().mockResolvedValue(toYocto(120));
  chain.sendFromWallet.mockReset().mockResolvedValue("FEE_TX");
  chain.houseBalance.mockReset().mockResolvedValue(10000);
  vi.stubEnv("NEAR_OPERATOR_ID", "op.testnet");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/agent/deploy", () => {
  it("creates an agent account funded from the player's wallet and remembers it", async () => {
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      agentAccount: "a1b2c3d4.op.testnet",
      depositTx: "DEPOSIT_TX",
      buyIn: 50,
    });
    // the table's buy-in, set by the server, signed by the player's wallet
    expect(chain.depositFromWallet).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "a1b2c3d4.op.testnet", 50);
    expect(await sessionAgent(ME)).toBe("a1b2c3d4.op.testnet");
    expect(await sessionAgentKey(ME)).toBe("ed25519:agentkey");
  });

  it("charges the 2% table fee to the treasury after the agent is funded", async () => {
    const body = await (await deploy({ tableId: "back-room" })).json();
    expect(body).toMatchObject({ tableFee: 1, feeTx: "FEE_TX" });
    expect(chain.sendFromWallet).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "op.testnet", toYocto(1));
    expect(chain.depositFromWallet.mock.invocationCallOrder[0]).toBeLessThan(chain.sendFromWallet.mock.invocationCallOrder[0]);
  });

  it("answers 402 when the wallet covers the buy-in but not the table fee", async () => {
    chain.walletBalanceYocto.mockResolvedValueOnce(toYocto(50.5));
    expect((await deploy({ tableId: "back-room" })).status).toBe(402);
    expect(chain.createAgentAccount).not.toHaveBeenCalled();
  });

  it("keeps the funded agent even if the fee transfer fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chain.sendFromWallet.mockRejectedValueOnce(new ChainError());
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(200);
    expect((await res.json()).feeTx).toBeNull();
    expect(await sessionAgent(ME)).toBe("a1b2c3d4.op.testnet");
  });

  it("clamps the buy-in to the exposure cap, and closes the table below the house floor", async () => {
    chain.houseBalance.mockResolvedValueOnce(4000); // 1% = 40
    expect((await (await deploy({ tableId: "back-room" })).json()).buyIn).toBe(40);
    chain.houseBalance.mockResolvedValueOnce(1000);
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("table_closed");
  });

  it("never returns the agent's key to the browser", async () => {
    const body = JSON.stringify(await (await deploy({ tableId: "back-room" })).json());
    expect(body).not.toContain("agentkey");
    expect(body).not.toContain("walletkey");
  });

  it("requires sign-in", async () => {
    expect((await deploy({ tableId: "back-room" }, GUEST)).status).toBe(401);
    expect(chain.createAgentAccount).not.toHaveBeenCalled();
  });

  it.each([["the practice table", "kitchen"], ["an unknown table", "casino"]])("refuses %s", async (_, tableId) => {
    expect((await deploy({ tableId })).status).toBe(400);
  });

  it("answers 402 insufficient_funds when the wallet holds less than the buy-in", async () => {
    chain.walletBalanceYocto.mockResolvedValueOnce(toYocto(49.99));
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "Not enough playing balance — deposit first",
      code: "insufficient_funds",
    });
    expect(chain.createAgentAccount).not.toHaveBeenCalled();
  });

  it("answers 402 when the player has no wallet yet", async () => {
    expect((await deploy({ tableId: "back-room" }, BROKE)).status).toBe(402);
    expect(chain.createAgentAccount).not.toHaveBeenCalled();
  });

  it("answers 503 chain_down when testnet fails, and stores nothing", async () => {
    chain.depositFromWallet.mockRejectedValueOnce(new ChainError());
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
    expect(await sessionAgent(ME)).toBeNull();
  });
});

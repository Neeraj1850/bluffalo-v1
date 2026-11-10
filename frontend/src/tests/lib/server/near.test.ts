import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFunctionRaw = vi.fn();
const createSubAccount = vi.fn();
const callFunction = vi.fn();
vi.mock("near-api-js", () => ({
  Account: class {
    callFunctionRaw = callFunctionRaw;
    createSubAccount = createSubAccount;
    provider = { callFunction };
  },
  JsonRpcProvider: class {},
  KeyPair: { fromString: () => ({ getPublicKey: () => "ed25519:pub" }) },
}));

const near = await import("@/lib/server/near");

beforeEach(() => {
  vi.stubEnv("NEAR_RPC_URL", "http://rpc.test");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  vi.stubEnv("NEAR_OPERATOR_ID", "op.testnet");
  vi.stubEnv("NEAR_OPERATOR_KEY", "ed25519:secret");
  callFunctionRaw.mockReset().mockResolvedValue({ transaction: { hash: "TX1" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("amounts", () => {
  it("scales table NEAR down 1000× into yoctoNEAR", () => {
    expect(near.toYocto(50)).toBe(5n * 10n ** 22n); // 0.05 NEAR
    expect(near.toYocto(0.5)).toBe(5n * 10n ** 20n);
    expect(near.toYocto(12.34)).toBe(1234n * 10n ** 19n);
  });

  it("round-trips back to table NEAR", () => {
    for (const n of [0, 0.5, 1, 49.5, 53.25, 1000]) expect(near.fromYocto(near.toYocto(n))).toBe(n);
    expect(near.fromYocto("5000000000000000000000000")).toBe(5000);
  });
});

describe("contract calls", () => {
  it("commits a hand with the stack as stake and returns the tx hash", async () => {
    expect(await near.commitHand("0123abcd", "a1.op.testnet", "c".repeat(64), 50)).toBe("TX1");
    expect(callFunctionRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "poker.testnet",
        methodName: "commit_hand",
        args: { hand_id: "0123abcd", player: "a1.op.testnet", commitment: "c".repeat(64), stake: "50000000000000000000000" },
        deposit: 0n,
      }),
    );
  });

  it("settles with both seeds and the ending stack as payout", async () => {
    await near.settleHand("0123abcd", "s".repeat(32), "p".repeat(32), 53.5);
    expect(callFunctionRaw.mock.calls[0][0]).toMatchObject({
      methodName: "settle_hand",
      args: { server_seed: "s".repeat(32), player_seed: "p".repeat(32), payout: "53500000000000000000000" },
    });
  });

  it("attaches the scaled buy-in when funding an agent", async () => {
    await near.depositFor("a1.op.testnet", 50);
    expect(callFunctionRaw.mock.calls[0][0]).toMatchObject({ methodName: "deposit_for", deposit: 5n * 10n ** 22n });
  });

  it("creates agents as sub-accounts of the operator", async () => {
    createSubAccount.mockResolvedValueOnce({});
    const id = await near.createAgentAccount();
    expect(id).toMatch(/^a[0-9a-f]{8}\.op\.testnet$/);
    expect(createSubAccount.mock.calls[0][0]).toMatchObject({ accountOrPrefix: id.split(".")[0], publicKey: "ed25519:pub" });
  });

  it("reads balances in table NEAR", async () => {
    callFunction.mockResolvedValueOnce("53500000000000000000000");
    expect(await near.balanceOf("a1.op.testnet")).toBe(53.5);
  });

  it("turns any chain failure into a ChainError", async () => {
    callFunctionRaw.mockRejectedValueOnce(new Error("Smart contract panicked: Player balance is too low"));
    await expect(near.commitHand("0123abcd", "a1", "c".repeat(64), 50)).rejects.toBeInstanceOf(near.ChainError);
  });

  it("refuses to run without configuration", async () => {
    vi.stubEnv("NEAR_OPERATOR_KEY", "");
    await expect(near.depositFor("a1", 1)).rejects.toThrow("NEAR_OPERATOR_KEY");
  });
});

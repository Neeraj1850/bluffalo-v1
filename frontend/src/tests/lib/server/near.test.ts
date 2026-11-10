import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFunctionRaw = vi.fn();
const signAndSendTransaction = vi.fn();
const callFunction = vi.fn();
const viewAccount = vi.fn();
const viewTransactionStatus = vi.fn();
const constructed: unknown[][] = [];
vi.mock("near-api-js", () => ({
  Account: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
    callFunctionRaw = callFunctionRaw;
    signAndSendTransaction = signAndSendTransaction;
    provider = { callFunction, viewAccount, viewTransactionStatus };
  },
  JsonRpcProvider: class {},
  KeyPair: { fromRandom: () => ({ getPublicKey: () => "ed25519:pub", toString: () => "ed25519:secret-agent" }) },
  actions: {
    createAccount: () => ({ kind: "createAccount" }),
    transfer: (amount: bigint) => ({ kind: "transfer", amount }),
    addFunctionCallAccessKey: (key: string, receiverId: string, methods: string[], allowance: bigint) => ({
      kind: "addFunctionCallAccessKey",
      key,
      receiverId,
      methods,
      allowance,
    }),
  },
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
        waitUntil: "EXECUTED_OPTIMISTIC",
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

  it("creates agents whose only key can call withdraw_to on the poker contract", async () => {
    signAndSendTransaction.mockResolvedValueOnce({});
    const { accountId, privateKey } = await near.createAgentAccount();
    expect(accountId).toMatch(/^a[0-9a-f]{8}\.op\.testnet$/);
    expect(privateKey).toBe("ed25519:secret-agent");
    const tx = signAndSendTransaction.mock.calls[0][0];
    expect(tx.receiverId).toBe(accountId);
    expect(tx.actions).toEqual([
      { kind: "createAccount" },
      { kind: "transfer", amount: 2n * 10n ** 22n },
      { kind: "addFunctionCallAccessKey", key: "ed25519:pub", receiverId: "poker.testnet", methods: ["withdraw_to"], allowance: 5n * 10n ** 22n },
    ]);
    // No full-access key is ever added.
    expect(tx.actions.map((a: { kind: string }) => a.kind)).not.toContain("addFullAccessKey");
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

describe("cash-out", () => {
  it("signs withdraw_to as the agent, with the agent's own key, for the exact amount", async () => {
    const hash = await near.withdrawTo("a1.op.testnet", "ed25519:agentkey", "you.testnet", 49_000_000_000_000_000_000_000n);
    expect(hash).toBe("TX1");
    expect(constructed.at(-1)?.[0]).toBe("a1.op.testnet");
    expect(constructed.at(-1)?.[2]).toBe("ed25519:agentkey");
    expect(callFunctionRaw.mock.calls[0][0]).toMatchObject({
      contractId: "poker.testnet",
      methodName: "withdraw_to",
      args: { receiver_id: "you.testnet", amount: "49000000000000000000000" },
      gas: 10_000_000_000_000n,
    });
  });

  it("reads the exact on-chain balance", async () => {
    callFunction.mockResolvedValueOnce("49000000000000000000123");
    expect(await near.balanceYocto("a1")).toBe(49_000_000_000_000_000_000_123n);
  });

  it("tells a missing account from an outage", async () => {
    viewAccount.mockResolvedValueOnce({ amount: "1" });
    expect(await near.accountExists("you.testnet")).toBe(true);
    viewAccount.mockRejectedValueOnce(Object.assign(new Error("does not exist"), { name: "AccountDoesNotExistError" }));
    expect(await near.accountExists("nobody.testnet")).toBe(false);
    viewAccount.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(near.accountExists("you.testnet")).rejects.toBeInstanceOf(near.ChainError);
  });

  it.each([
    [{ SuccessValue: "" }, "confirmed"],
    [{ Failure: { ActionError: {} } }, "failed"],
    ["Started", "submitted"],
  ])("maps transaction status %j to %s", async (status, expected) => {
    viewTransactionStatus.mockResolvedValueOnce({ status });
    expect(await near.txStatus("TX1", "a1")).toBe(expected);
  });
});

describe("isAccountId", () => {
  it.each(["you.testnet", "a1b2c3d4.npoker-op-43b602.testnet", "my_name-1.testnet", "f".repeat(64)])("accepts %s", (id) => {
    expect(near.isAccountId(id)).toBe(true);
  });

  it.each(["", "a", "You.testnet", "has space.testnet", "-x.testnet", "x..testnet", "x".repeat(65), 42])("rejects %j", (id) => {
    expect(near.isAccountId(id)).toBe(false);
  });
});

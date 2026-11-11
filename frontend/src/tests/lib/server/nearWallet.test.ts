import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callFunctionRaw = vi.fn();
const signAndSendTransaction = vi.fn();
const callFunction = vi.fn();
const viewAccount = vi.fn();
const viewGasPrice = vi.fn();
const constructed: unknown[][] = [];
vi.mock("near-api-js", () => ({
  Account: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
    callFunctionRaw = callFunctionRaw;
    signAndSendTransaction = signAndSendTransaction;
    provider = { callFunction, viewAccount, viewGasPrice };
  },
  JsonRpcProvider: class {},
  KeyPair: {
    fromRandom: () => ({
      getPublicKey: () => ({ data: new Uint8Array(32).fill(0xab) }),
      toString: () => "ed25519:wallet-secret",
    }),
  },
  actions: { transfer: (amount: bigint) => ({ kind: "transfer", amount }) },
}));

const near = await import("@/lib/server/near");

beforeEach(() => {
  vi.stubEnv("NEAR_RPC_URL", "http://rpc.test");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  vi.stubEnv("NEAR_OPERATOR_ID", "op.testnet");
  vi.stubEnv("NEAR_OPERATOR_KEY", "ed25519:secret");
  for (const f of [callFunctionRaw, signAndSendTransaction, callFunction, viewAccount, viewGasPrice]) f.mockReset();
  callFunctionRaw.mockResolvedValue({ transaction: { hash: "TX1" } });
  signAndSendTransaction.mockResolvedValue({ transaction: { hash: "TX2" } });
  constructed.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("deposit wallets", () => {
  it("creates an implicit account named by the hex of its public key", () => {
    expect(near.createWallet()).toEqual({
      accountId: "ab".repeat(32),
      privateKey: "ed25519:wallet-secret",
    });
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it("reports the balance less the reserve, and 0 for an account never funded", async () => {
    viewAccount.mockResolvedValueOnce({ amount: 10n ** 23n }); // 0.1 NEAR
    expect(await near.walletBalanceYocto("ab")).toBe(10n ** 23n - near.WALLET_RESERVE);
    viewAccount.mockResolvedValueOnce({ amount: 10n ** 21n });
    expect(await near.walletBalanceYocto("ab")).toBe(0n);
    viewAccount.mockRejectedValueOnce(Object.assign(new Error("nope"), { name: "AccountDoesNotExistError" }));
    expect(await near.walletBalanceYocto("ab")).toBe(0n);
    viewAccount.mockRejectedValueOnce(new Error("down"));
    await expect(near.walletBalanceYocto("ab")).rejects.toBeInstanceOf(near.ChainError);
  });

  it("deposits for an agent signed by the wallet's own key", async () => {
    expect(await near.depositFromWallet("ab", "ed25519:wk", "a1.op.testnet", 50)).toBe("TX1");
    expect(constructed.at(-1)).toEqual(["ab", expect.anything(), "ed25519:wk"]);
    expect(callFunctionRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "poker.testnet",
        methodName: "deposit_for",
        args: { account_id: "a1.op.testnet" },
        deposit: near.toYocto(50),
      }),
    );
  });

  it("sends NEAR out of the wallet", async () => {
    expect(await near.sendFromWallet("ab", "ed25519:wk", "you.testnet", 5n)).toBe("TX2");
    expect(signAndSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: "you.testnet",
        actions: [{ kind: "transfer", amount: 5n }],
      }),
    );
    signAndSendTransaction.mockRejectedValueOnce(new Error("down"));
    await expect(near.sendFromWallet("ab", "ed25519:wk", "you.testnet", 5n)).rejects.toBeInstanceOf(near.ChainError);
  });

  it("reads the gas price", async () => {
    viewGasPrice.mockResolvedValueOnce({ gas_price: "100000000" });
    expect(await near.gasPriceYocto()).toBe(100_000_000n);
  });

  it("reads a hand from the contract", async () => {
    callFunction.mockResolvedValueOnce({ status: "Settled" });
    expect(await near.getHand("0123abcd")).toEqual({ status: "Settled" });
    expect(callFunction).toHaveBeenCalledWith({
      contractId: "poker.testnet",
      method: "get_hand",
      args: { hand_id: "0123abcd" },
    });
    callFunction.mockResolvedValueOnce(null);
    expect(await near.getHand("x")).toBeNull();
  });
});

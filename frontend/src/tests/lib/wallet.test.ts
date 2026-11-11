import { describe, expect, it, vi } from "vitest";
import { fromSaved } from "@/lib/store/setup";
import { createWalletStore } from "@/lib/store/useWallet";
import { depositReceived, toTestnet, withdrawProblem } from "@/lib/wallet";
import { SignedOutError } from "@/services/agentApi";

describe("wallet helpers", () => {
  it("converts table NEAR to testnet NEAR", () => {
    expect(toTestnet(100)).toBeCloseTo(0.1);
  });

  it("announces a deposit only once the balance rises", () => {
    expect(depositReceived(null, 5)).toBeNull();
    expect(depositReceived(5, 5)).toBeNull();
    expect(depositReceived(5, 4)).toBeNull();
    expect(depositReceived(5, 105)).toBe(100);
  });

  it("validates withdrawals", () => {
    expect(withdrawProblem("", "", 10)).toMatch(/testnet account/);
    expect(withdrawProblem("you.testnet", "", null)).toMatch(/Waiting/);
    expect(withdrawProblem("you.testnet", "", 0)).toMatch(/empty/);
    expect(withdrawProblem("you.testnet", "", 10)).toBeNull();
    expect(withdrawProblem("you.testnet", "-1", 10)).toMatch(/above zero/);
    expect(withdrawProblem("you.testnet", "11", 10)).toMatch(/You have/);
    expect(withdrawProblem("you.testnet", "10", 10)).toBeNull();
  });
});

describe("wallet store", () => {
  it("loads, shares and refreshes the balance", async () => {
    const load = vi.fn().mockResolvedValueOnce({ account: "a", balance: 1 }).mockResolvedValueOnce({ account: "a", balance: 3 });
    const store = createWalletStore(load);
    const seen = vi.fn();
    store.subscribe(seen);
    expect(store.getState().loading).toBe(true);
    await store.refresh();
    expect(store.getState()).toMatchObject({ wallet: { balance: 1 }, loading: false, error: null });
    await store.refresh();
    expect(store.getState().wallet?.balance).toBe(3);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent refreshes", async () => {
    const load = vi.fn().mockResolvedValue({ account: "a", balance: 1 });
    const store = createWalletStore(load);
    await Promise.all([store.refresh(), store.refresh()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps the last balance on an error, clears it when signed out", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ account: "a", balance: 2 })
      .mockRejectedValueOnce(new Error("RPC down"))
      .mockRejectedValueOnce(new SignedOutError());
    const store = createWalletStore(load);
    await store.refresh();
    await store.refresh();
    expect(store.getState()).toMatchObject({ wallet: { balance: 2 }, error: "RPC down" });
    await store.refresh();
    expect(store.getState()).toMatchObject({ wallet: null, signedOut: true });
  });
});

describe("saved setup", () => {
  it("ignores the stale demo balance from older saves", () => {
    const s = fromSaved({ balance: 120, tableId: "vault" });
    expect(s.tableId).toBe("vault");
    expect("balance" in s).toBe(false);
  });
});

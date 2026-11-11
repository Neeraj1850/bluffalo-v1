import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { houseStatus, houseTargetYocto, sweepHouse } from "@/lib/server/house";
import { ChainError, ContractOutdatedError } from "@/lib/server/near";

const chain = vi.hoisted(() => ({ houseBalanceYocto: vi.fn(), operatorBalanceYocto: vi.fn(), withdrawHouse: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const NEAR = 10n ** 24n;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEAR_OPERATOR_ID", "op.testnet");
  chain.houseBalanceYocto.mockReset().mockResolvedValue(8n * NEAR);
  chain.operatorBalanceYocto.mockReset().mockResolvedValue(3n * NEAR);
  chain.withdrawHouse.mockReset().mockResolvedValue("SWEEP_TX");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("houseTargetYocto", () => {
  it("defaults to 5 NEAR on-chain and reads HOUSE_TARGET", () => {
    expect(houseTargetYocto()).toBe(5n * NEAR);
    vi.stubEnv("HOUSE_TARGET", "2.5");
    expect(houseTargetYocto()).toBe(25n * 10n ** 23n);
  });
});

describe("houseStatus", () => {
  it("reports both balances with no low flags when healthy", async () => {
    const s = await houseStatus();
    expect(s.operator).toEqual({ account: "op.testnet", balance: (3n * NEAR).toString(), balanceNear: 3, low: false });
    expect(s.house).toMatchObject({ balance: (8n * NEAR).toString(), balanceTable: 8000, low: false });
    expect(s.house.closedTables).not.toContain("back-room");
    expect(warn).not.toHaveBeenCalledWith("[house] low balance: operator", expect.anything());
  });

  it("flags and logs a low operator and a house below a table's floor", async () => {
    chain.operatorBalanceYocto.mockResolvedValueOnce(NEAR / 2n);
    chain.houseBalanceYocto.mockResolvedValueOnce(NEAR); // 1000 table NEAR < back-room floor 2000
    const s = await houseStatus();
    expect(s.operator.low).toBe(true);
    expect(s.house.low).toBe(true);
    expect(s.house.closedTables).toContain("back-room");
    expect(s.house.closedTables.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith("[house] low balance: operator", expect.any(String));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[house\] low balance: house/));
  });
});

describe("sweepHouse", () => {
  it("withdraws everything above the target", async () => {
    expect(await sweepHouse()).toEqual({ swept: (3n * NEAR).toString(), tx: "SWEEP_TX", balance: (5n * NEAR).toString() });
    expect(chain.withdrawHouse).toHaveBeenCalledWith(3n * NEAR);
  });

  it("skips when the house is at or below the target", async () => {
    chain.houseBalanceYocto.mockResolvedValueOnce(5n * NEAR);
    expect(await sweepHouse()).toEqual({ skipped: "below_target", balance: (5n * NEAR).toString() });
    expect(chain.withdrawHouse).not.toHaveBeenCalled();
  });

  it("skips gracefully when the deployed contract has no withdraw_house", async () => {
    chain.withdrawHouse.mockRejectedValueOnce(new ContractOutdatedError("withdraw_house"));
    expect(await sweepHouse()).toMatchObject({ skipped: "contract_outdated" });
  });

  it("passes chain outages through", async () => {
    chain.withdrawHouse.mockRejectedValueOnce(new ChainError());
    await expect(sweepHouse()).rejects.toBeInstanceOf(ChainError);
  });
});

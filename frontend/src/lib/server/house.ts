import { TABLES } from "@/lib/data/tables";
import { houseFloor } from "./economics";
import { ContractOutdatedError, fromYocto, houseBalanceYocto, operatorBalanceYocto, withdrawHouse } from "./near";

const NEAR = 10n ** 24n;
/** Below this the operator can't pay gas or fund new agent accounts for long. */
export const OPERATOR_LOW_YOCTO = NEAR; // 1 NEAR on-chain

/** HOUSE_TARGET (on-chain NEAR, default 5): what the house keeps; anything above it is profit to sweep. */
export function houseTargetYocto(): bigint {
  const n = Number(process.env.HOUSE_TARGET);
  const near = Number.isFinite(n) && n >= 0 && process.env.HOUSE_TARGET !== "" && process.env.HOUSE_TARGET !== undefined ? n : 5;
  return BigInt(Math.round(near * 1000)) * 10n ** 21n;
}

export type HouseStatus = {
  operator: { account: string; balance: string; balanceNear: number; low: boolean };
  /** House money in the contract: yocto, and table NEAR. */
  house: { balance: string; balanceTable: number; target: string; low: boolean; closedTables: string[] };
};

/** Operator and house balances, with low-balance flags. Logs `[house] low balance` when either is low. */
export async function houseStatus(): Promise<HouseStatus> {
  const [op, house] = await Promise.all([operatorBalanceYocto(), houseBalanceYocto()]);
  const table = fromYocto(house);
  const real = TABLES.filter((t) => t.mode === "real");
  const closedTables = real.filter((t) => table < houseFloor(t)).map((t) => t.id);
  // Low: below the floor of even the smallest real table, i.e. every table is closed.
  const low = table < Math.min(...real.map(houseFloor));
  const status: HouseStatus = {
    operator: {
      account: process.env.NEAR_OPERATOR_ID ?? "",
      balance: op.toString(),
      balanceNear: Number(op / 10n ** 20n) / 10_000,
      low: op < OPERATOR_LOW_YOCTO,
    },
    house: { balance: house.toString(), balanceTable: table, target: houseTargetYocto().toString(), low, closedTables },
  };
  if (status.operator.low) console.warn("[house] low balance: operator", status.operator.balance);
  if (status.house.low) console.warn(`[house] low balance: house ${table} below every table floor`);
  return status;
}

export type SweepResult =
  | { swept: string; tx: string; balance: string }
  | { skipped: "below_target" | "contract_outdated"; balance: string };

/** Move house money above HOUSE_TARGET to the operator (treasury). */
export async function sweepHouse(): Promise<SweepResult> {
  const balance = await houseBalanceYocto();
  const excess = balance - houseTargetYocto();
  if (excess <= 0n) return { skipped: "below_target", balance: balance.toString() };
  try {
    const tx = await withdrawHouse(excess);
    return { swept: excess.toString(), tx, balance: (balance - excess).toString() };
  } catch (e) {
    if (e instanceof ContractOutdatedError) return { skipped: "contract_outdated", balance: balance.toString() };
    throw e;
  }
}

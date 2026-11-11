/** 1 table NEAR = 0.001 testnet NEAR. */
export const TABLE_PER_TESTNET = 1000;

export const FAUCET_URL = "https://near-faucet.io/";

export const toTestnet = (table: number) => table / TABLE_PER_TESTNET;

/** NEAR account id (named or 64-hex implicit). */
export const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** How much arrived since the sheet opened; null until something has. */
export function depositReceived(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null) return null;
  const delta = current - baseline;
  return delta > 1e-9 ? delta : null;
}

/** Why a withdrawal can't be sent yet, or null when it can. Amount empty = everything. */
export function withdrawProblem(receiver: string, amountText: string, balance: number | null): string | null {
  if (!ACCOUNT_ID.test(receiver.trim())) return "Enter a NEAR testnet account, e.g. you.testnet";
  if (balance === null) return "Waiting for your balance…";
  if (balance <= 0) return "Your balance is empty.";
  if (amountText.trim() === "") return null;
  const n = Number(amountText);
  if (!Number.isFinite(n) || n <= 0) return "Enter an amount above zero.";
  if (n > balance + 1e-9) return `You have ${balance.toFixed(2)} NEAR.`;
  return null;
}

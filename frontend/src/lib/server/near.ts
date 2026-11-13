import { Account, actions, JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";

/**
 * The poker contract on NEAR testnet (contracts/poker). Server-only: signs
 * with the operator key, which commits/settles hands and funds agents.
 */

/** Table NEAR (2 decimals) → yoctoNEAR on-chain. Testnet scale: on-chain NEAR = table NEAR ÷ 1000. */
export function toYocto(amount: number): bigint {
  // table cents × 10^24 / (100 × 1000) = cents × 10^19
  return BigInt(Math.round(amount * 100)) * 10n ** 19n;
}

/** yoctoNEAR on-chain → table NEAR. */
export function fromYocto(yocto: bigint | string): number {
  return Number(BigInt(yocto) / 10n ** 19n) / 100;
}

export const CHAIN_DOWN_MESSAGE = "NEAR testnet isn't reachable right now. Try again in a minute.";

/** The chain couldn't be reached or refused the call. The hand must not be played. */
export class ChainError extends Error {
  constructor(cause?: unknown) {
    super(CHAIN_DOWN_MESSAGE, { cause });
    this.name = "ChainError";
    // The player sees a generic message; operators need the real reason.
    if (process.env.NODE_ENV !== "test") console.error("[near]", cause instanceof Error ? cause.message : cause);
  }
}

const GAS = 30_000_000_000_000n;
// Wait until the call has executed (we learn success or the panic), not for full
// finality — that cuts each transaction from ~9s to ~1–2s on testnet.
const WAIT = "EXECUTED_OPTIMISTIC" as const;
// Views must read at the same level: with the default "final" they lag ~2 blocks, so a
// balance read right after a settle still shows the stake locked (≈0 when it staked all).
const LATEST = { finality: "optimistic" } as const;
/** What each new agent account gets for its own storage and cash-out gas. */
const AGENT_FUNDING = 2n * 10n ** 22n; // 0.02 NEAR
/**
 * Most the agent's key may spend on gas over its lifetime. NEAR checks a
 * transaction against ~10× the gas price for its prepaid gas, so a 10 Tgas
 * withdraw needs ~0.011 NEAR of allowance even though it burns far less.
 */
const AGENT_GAS_ALLOWANCE = 5n * 10n ** 22n; // 0.05 NEAR
/** The only contract method an agent's key can call. */
export const AGENT_METHODS = ["withdraw_to"];

function config() {
  const { NEAR_RPC_URL, NEAR_CONTRACT_ID, NEAR_OPERATOR_ID, NEAR_OPERATOR_KEY } = process.env;
  if (!NEAR_RPC_URL || !NEAR_CONTRACT_ID || !NEAR_OPERATOR_ID || !NEAR_OPERATOR_KEY) {
    throw new Error("NEAR_RPC_URL / NEAR_CONTRACT_ID / NEAR_OPERATOR_ID / NEAR_OPERATOR_KEY are not set");
  }
  return { rpc: NEAR_RPC_URL, contract: NEAR_CONTRACT_ID, operatorId: NEAR_OPERATOR_ID, key: NEAR_OPERATOR_KEY };
}

const g = globalThis as typeof globalThis & { __npOperator?: Account };

function operator() {
  const c = config();
  g.__npOperator ??= new Account(c.operatorId, new JsonRpcProvider({ url: c.rpc }), c.key as KeyPairString);
  return { account: g.__npOperator, ...c };
}

/** Run a chain call; any failure becomes a ChainError. Returns the transaction hash. */
export async function send(
  methodName: string,
  args: Record<string, unknown>,
  deposit = 0n,
  contractId?: string,
): Promise<string> {
  const { account, contract } = operator();
  try {
    const res = await account.callFunctionRaw({
      contractId: contractId ?? contract,
      methodName,
      args,
      deposit,
      gas: GAS,
      waitUntil: WAIT,
    });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

/** A view call on any contract. */
export async function view<T>(method: string, args: Record<string, unknown>, contractId: string): Promise<T> {
  const { account } = operator();
  try {
    return (await account.provider.callFunction({ contractId, method, args })) as T;
  } catch (e) {
    throw new ChainError(e);
  }
}

/** A fresh agent account id under the operator: a<8 hex>.<operator>. */
export const newAgentId = () => `a${crypto.randomUUID().slice(0, 8)}.${config().operatorId}`;

/**
 * A fresh sub-account for an agent (a<id>.<operator>) whose only key is a
 * function-call key for the poker contract's `withdraw_to` — no full-access
 * key, so the account can't send NEAR any other way. Returns the key so the
 * server can store it; it must never reach a browser.
 */
export async function createAgentAccount(accountId = newAgentId()): Promise<{ accountId: string; privateKey: string }> {
  const { account, contract } = operator();
  const key = KeyPair.fromRandom("ed25519");
  try {
    await account.signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actions.createAccount(),
        actions.transfer(AGENT_FUNDING),
        actions.addFunctionCallAccessKey(key.getPublicKey(), contract, AGENT_METHODS, AGENT_GAS_ALLOWANCE),
      ],
      waitUntil: WAIT,
    });
  } catch (e) {
    throw new ChainError(e);
  }
  return { accountId, privateKey: key.toString() };
}

/** Fund an agent's playing balance in the contract (table NEAR). */
export function depositFor(agent: string, amount: number) {
  return send("deposit_for", { account_id: agent }, toYocto(amount));
}

/** Before the deal: lock the agent's stack and a matching house stack, record both seeds' hashes. */
export function commitHand(handId: string, agent: string, commitment: string, playerCommitment: string, stack: number) {
  return send("commit_hand", {
    hand_id: handId,
    player: agent,
    commitment,
    player_commitment: playerCommitment,
    stake: toYocto(stack).toString(),
  });
}

/** After the hand: reveal both seeds; the agent's balance becomes its ending stack. */
export function settleHand(handId: string, serverSeed: string, playerSeed: string, stackAfter: number) {
  return send("settle_hand", {
    hand_id: handId,
    server_seed: serverSeed,
    player_seed: playerSeed,
    payout: toYocto(stackAfter).toString(),
  });
}

/**
 * Close a hand left unsettled past the contract's timeout: the player gets the
 * whole pot. Nobody (not even the operator) can close a hand before then.
 */
export function claimTimeout(handId: string) {
  return send("claim_timeout", { hand_id: handId });
}

/** The agent's balance in the contract, exactly, in yoctoNEAR. */
export async function balanceYocto(agent: string): Promise<bigint> {
  const { account, contract } = operator();
  try {
    const raw = await account.provider.callFunction({ contractId: contract, method: "balance_of", args: { account_id: agent }, blockQuery: LATEST });
    return BigInt(String(raw ?? "0"));
  } catch (e) {
    throw new ChainError(e);
  }
}

/** The agent's balance in the contract (table NEAR). */
export async function balanceOf(agent: string): Promise<number> {
  return fromYocto(await balanceYocto(agent));
}

// Class names are minified in production builds, so match the message too.
function isMissingAccount(e: unknown): boolean {
  const err = e as Error | undefined;
  return err?.name === "AccountDoesNotExistError" || /does not exist/i.test(err?.message ?? "");
}

/** Whether an account exists on the network (a cash-out destination must). */
export async function accountExists(accountId: string): Promise<boolean> {
  const { account } = operator();
  try {
    await account.provider.viewAccount({ accountId });
    return true;
  } catch (e) {
    // "Account doesn't exist" is an answer, not an outage.
    if (isMissingAccount(e)) return false;
    throw new ChainError(e);
  }
}

/** 10 Tgas covers one withdraw_to with room to spare (it burns ~0.3 Tgas). */
const WITHDRAW_GAS = 10_000_000_000_000n;

/**
 * Cash out: the agent signs `withdraw_to` with its own withdraw-only key, sending
 * `amount` yoctoNEAR of its contract balance to `receiver`. Returns the tx hash.
 */
export async function withdrawTo(agent: string, agentKey: string, receiver: string, amount: bigint): Promise<string> {
  const { account: operatorAccount, contract } = operator();
  const agentAccount = new Account(agent, operatorAccount.provider, agentKey as KeyPairString);
  try {
    const res = await agentAccount.callFunctionRaw({
      contractId: contract,
      methodName: "withdraw_to",
      args: { receiver_id: receiver, amount: amount.toString() },
      gas: WITHDRAW_GAS,
      waitUntil: WAIT,
    });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

export type TxStatus = "submitted" | "confirmed" | "failed";

/** Where a transaction stands, from the network's own record. */
export async function txStatus(hash: string, sender: string): Promise<TxStatus> {
  const { account } = operator();
  try {
    const res = await account.provider.viewTransactionStatus({ txHash: hash, accountId: sender, waitUntil: "NONE" });
    const status = res.status as Record<string, unknown> | string | undefined;
    if (status && typeof status === "object" && "Failure" in status) return "failed";
    if (status && typeof status === "object" && "SuccessValue" in status) return "confirmed";
    return "submitted";
  } catch (e) {
    throw new ChainError(e);
  }
}

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A valid NEAR account id: named (you.testnet) or implicit (64 hex). */
export function isAccountId(id: unknown): id is string {
  return typeof id === "string" && id.length >= 2 && id.length <= 64 && ACCOUNT_ID.test(id);
}

// ----- Player deposit wallets ---------------------------------------------

/**
 * Kept back in every deposit wallet: its storage (~0.002 NEAR for an implicit
 * account with one key) plus prepaid gas for its own deposits and withdrawals.
 */
// Kept back for storage and gas: NEAR checks the balance against prepaid gas at a pessimistic
// price (~0.01 NEAR for a 10 Tgas call), so the reserve must cover more than the gas burnt.
export const WALLET_RESERVE = 15n * 10n ** 21n; // 0.015 NEAR
/** Gas an operator createAgentAccount + a wallet deposit_for burn, together, with headroom. */
export const DEPLOY_GAS = 10_000_000_000_000n; // 10 Tgas

/**
 * A new custodial deposit wallet: an ed25519 keypair whose implicit account id
 * is the hex of its public key. No transaction — the account comes into being
 * the first time someone sends NEAR to it. The key must never reach a browser.
 */
export function createWallet(): { accountId: string; privateKey: string } {
  const key = KeyPair.fromRandom("ed25519");
  const accountId = Buffer.from(key.getPublicKey().data).toString("hex");
  return { accountId, privateKey: key.toString() };
}

/** What a wallet can spend, in yoctoNEAR: its balance less the reserve. 0 if it was never funded. */
export async function walletBalanceYocto(accountId: string): Promise<bigint> {
  const { account } = operator();
  try {
    const view = await account.provider.viewAccount({ accountId });
    const available = BigInt(view.amount) - WALLET_RESERVE;
    return available > 0n ? available : 0n;
  } catch (e) {
    if (isMissingAccount(e)) return 0n;
    throw new ChainError(e);
  }
}

function walletAccount(wallet: string, key: string) {
  return new Account(wallet, operator().account.provider, key as KeyPairString);
}

/** `account` (a custodial wallet or NPC, signing with `key`) calls a contract method. Returns the tx hash. */
export async function callAs(
  account: string,
  key: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit = 0n,
  gas = GAS,
): Promise<string> {
  try {
    const res = await walletAccount(account, key).callFunctionRaw({ contractId, methodName, args, deposit, gas, waitUntil: WAIT });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

/** The wallet funds an agent's playing balance in the contract (table NEAR). Returns the tx hash. */
export function depositFromWallet(wallet: string, key: string, agent: string, amount: number): Promise<string> {
  return callAs(wallet, key, operator().contract, "deposit_for", { account_id: agent }, toYocto(amount), DEPLOY_GAS);
}

/**
 * Operator seeds a deposit wallet with testnet NEAR, creating the implicit
 * account on first transfer. A testnet-only faucet for players without tokens.
 * Returns the tx hash.
 */
export async function fundFromOperator(receiver: string, yocto: bigint): Promise<string> {
  const { account } = operator();
  try {
    const res = await account.signAndSendTransaction({
      receiverId: receiver,
      actions: [actions.transfer(yocto)],
      waitUntil: WAIT,
    });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

/** Plain NEAR transfer out of a wallet (yoctoNEAR). Returns the tx hash. */
export async function sendFromWallet(wallet: string, key: string, receiver: string, yocto: bigint): Promise<string> {
  try {
    const res = await walletAccount(wallet, key).signAndSendTransaction({
      receiverId: receiver,
      actions: [actions.transfer(yocto)],
      waitUntil: WAIT,
    });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

/** The network's current gas price, in yoctoNEAR per gas unit. */
export async function gasPriceYocto(): Promise<bigint> {
  const { account } = operator();
  try {
    const res = await (account.provider as JsonRpcProvider).viewGasPrice();
    return BigInt(res.gas_price);
  } catch (e) {
    throw new ChainError(e);
  }
}

export type ChainHand = {
  player: string;
  commitment: string;
  /** sha256 of the player's seed, bound before the deal (contract v2 hands). */
  player_commitment?: string;
  /** Each side's locked stake and the agent's payout, yoctoNEAR (U128 strings). */
  stake?: string;
  payout?: string | null;
  status: "Committed" | "Settled" | "Cancelled" | "TimedOut";
  server_seed: string | null;
  player_seed: string | null;
};

/** A hand's on-chain record (commitment, status, revealed seeds), or null if the contract has none. */
export async function getHand(handId: string, contractId?: string): Promise<ChainHand | null> {
  const { account, contract } = operator();
  try {
    const raw = await account.provider.callFunction({
      contractId: contractId ?? contract,
      method: "get_hand",
      args: { hand_id: handId },
    });
    return (raw as ChainHand | null | undefined) ?? null;
  } catch (e) {
    throw new ChainError(e);
  }
}

// ----- House treasury -----------------------------------------------------

/** House money in the contract, exactly, in yoctoNEAR. */
export async function houseBalanceYocto(): Promise<bigint> {
  const { account, contract } = operator();
  try {
    const raw = await account.provider.callFunction({ contractId: contract, method: "house_balance", args: {}, blockQuery: LATEST });
    return BigInt(String(raw ?? "0"));
  } catch (e) {
    throw new ChainError(e);
  }
}

/** House money in the contract (table NEAR). */
export async function houseBalance(): Promise<number> {
  return fromYocto(await houseBalanceYocto());
}

/** The operator account's own NEAR (pays gas and funds agent accounts), in yoctoNEAR. */
export async function operatorBalanceYocto(): Promise<bigint> {
  const { account, operatorId } = operator();
  try {
    const view = await account.provider.viewAccount({ accountId: operatorId });
    return BigInt(view.amount);
  } catch (e) {
    throw new ChainError(e);
  }
}

/** The deployed contract predates a method we called (e.g. `withdraw_house`). */
export class ContractOutdatedError extends Error {
  constructor(readonly method: string) {
    super(`The deployed contract has no ${method} method`);
    this.name = "ContractOutdatedError";
  }
}

function isMethodNotFound(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    const err = x as Error;
    if (err.name === "ContractMethodNotFoundError" || /MethodNotFound/.test(String(err.message ?? ""))) return true;
  }
  return false;
}

/** Move `amount` yoctoNEAR of house profit from the contract to the operator. Returns the tx hash. */
export async function withdrawHouse(amount: bigint): Promise<string> {
  const { account, contract } = operator();
  try {
    const res = await account.callFunctionRaw({
      contractId: contract,
      methodName: "withdraw_house",
      args: { amount: amount.toString() },
      gas: GAS,
      waitUntil: WAIT,
    });
    return res.transaction.hash;
  } catch (e) {
    if (isMethodNotFound(e)) throw new ContractOutdatedError("withdraw_house");
    throw new ChainError(e);
  }
}

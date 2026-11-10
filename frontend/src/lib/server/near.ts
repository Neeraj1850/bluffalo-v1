import { Account, actions, JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";

/**
 * The poker contract on NEAR testnet (contracts/poker). Server-only: signs
 * with the operator key, which commits/settles hands and funds agents.
 */

/** Testnet scale: on-chain NEAR = table NEAR ÷ 1000, so the faucet budget goes a long way. */
export const CHAIN_SCALE = 1000;

/** Table NEAR (2 decimals) → yoctoNEAR on-chain. */
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
  }
}

const GAS = 30_000_000_000_000n;
// Wait until the call has executed (we learn success or the panic), not for full
// finality — that cuts each transaction from ~9s to ~1–2s on testnet.
const WAIT = "EXECUTED_OPTIMISTIC" as const;
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
async function send(methodName: string, args: Record<string, unknown>, deposit = 0n): Promise<string> {
  const { account, contract } = operator();
  try {
    const res = await account.callFunctionRaw({ contractId: contract, methodName, args, deposit, gas: GAS, waitUntil: WAIT });
    return res.transaction.hash;
  } catch (e) {
    throw new ChainError(e);
  }
}

/**
 * A fresh sub-account for an agent (a<id>.<operator>) whose only key is a
 * function-call key for the poker contract's `withdraw_to` — no full-access
 * key, so the account can't send NEAR any other way. Returns the key so the
 * server can store it; it must never reach a browser.
 */
export async function createAgentAccount(): Promise<{ accountId: string; privateKey: string }> {
  const { account, operatorId, contract } = operator();
  const accountId = `a${crypto.randomUUID().slice(0, 8)}.${operatorId}`;
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

/** Before the deal: lock the agent's stack and a matching house stack, record the seed hash. */
export function commitHand(handId: string, agent: string, commitment: string, stack: number) {
  return send("commit_hand", { hand_id: handId, player: agent, commitment, stake: toYocto(stack).toString() });
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

/** The agent's balance in the contract, exactly, in yoctoNEAR. */
export async function balanceYocto(agent: string): Promise<bigint> {
  const { account, contract } = operator();
  try {
    const raw = await account.provider.callFunction({ contractId: contract, method: "balance_of", args: { account_id: agent } });
    return BigInt(String(raw ?? "0"));
  } catch (e) {
    throw new ChainError(e);
  }
}

/** The agent's balance in the contract (table NEAR). */
export async function balanceOf(agent: string): Promise<number> {
  return fromYocto(await balanceYocto(agent));
}

/** Whether an account exists on the network (a cash-out destination must). */
export async function accountExists(accountId: string): Promise<boolean> {
  const { account } = operator();
  try {
    await account.provider.viewAccount({ accountId });
    return true;
  } catch (e) {
    // "Account doesn't exist" is an answer, not an outage.
    if ((e as Error)?.name === "AccountDoesNotExistError") return false;
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

export function explorerTx(hash: string) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

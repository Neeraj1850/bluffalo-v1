import { Account, JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";

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
/** What each new agent account gets for its own storage. */
const AGENT_STORAGE = 10n ** 22n; // 0.01 NEAR

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

/** A fresh sub-account for an agent (a<id>.<operator>), controlled by the operator on testnet. */
export async function createAgentAccount(): Promise<string> {
  const { account, operatorId, key } = operator();
  const prefix = `a${crypto.randomUUID().slice(0, 8)}`;
  try {
    await account.createSubAccount({
      accountOrPrefix: prefix,
      publicKey: KeyPair.fromString(key as KeyPairString).getPublicKey(),
      nearToTransfer: AGENT_STORAGE,
    });
  } catch (e) {
    throw new ChainError(e);
  }
  return `${prefix}.${operatorId}`;
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

/** The agent's balance in the contract (table NEAR). */
export async function balanceOf(agent: string): Promise<number> {
  const { account, contract } = operator();
  try {
    const raw = await account.provider.callFunction({ contractId: contract, method: "balance_of", args: { account_id: agent } });
    return fromYocto(String(raw ?? "0"));
  } catch (e) {
    throw new ChainError(e);
  }
}

export function explorerTx(hash: string) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

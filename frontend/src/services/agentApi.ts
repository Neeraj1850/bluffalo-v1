import type { Limits, PresetKey, StrategyParams } from "@/lib/data/strategy";
import { newSeed } from "@/lib/poker/fairness";
import type { HandMode, LiveHand } from "@/lib/poker/record";
import type { Run } from "@/lib/poker/runs";
import type { TestedAgent } from "@/lib/poker/tested";
import type { MarketEvent, MarketListing, MarketStrategy, Npc } from "@/lib/market/types";

/**
 * The frontend talks to the agent backend only through this interface.
 * Every call hits the real server (NEAR testnet). Each step that moves money
 * has its own call and its own state, so the UI can never show "confirmed"
 * for a quote.
 */

export type DeployRequest = {
  tableId: string;
  buyIn: number;
  preset: PresetKey;
  params: StrategyParams;
  limits: Limits;
  /** Licensed strategy (market token id); the server plays its sealed params. */
  strategyId?: string;
};

/** `buyIn` is what the server will move from the wallet to the agent (table NEAR). */
export type FeeQuote = {
  fee: number;
  currency: "NEAR";
  expiresAt: number;
  buyIn: number;
  /** Flat table fee charged at deploy (TABLE_FEE_PCT of the buy-in). */
  tableFee?: number;
  /** Most the house will take as a buy-in right now (exposure cap). */
  maxBuyIn?: number;
};

export type DeployResult = {
  /** The agent's own account that now holds the buy-in. */
  agentAccount: string;
  depositTx?: string;
  buyIn?: number;
  tableFee?: number;
  /** The table-fee transfer to the treasury (null if it couldn't be charged). */
  feeTx?: string | null;
  confirmedAt: number;
};

export type Verification = "verified" | "pending" | "unavailable";

export type CashoutQuote = {
  id: string;
  send: number;
  fee: number;
  receive: number;
  receiveAsset: string;
  expiresAt: number;
};

export type CashoutStatus = "submitted" | "confirmed" | "failed";

export interface AgentApi {
  getFeeQuote(req: DeployRequest): Promise<FeeQuote>;
  deployAgent(req: DeployRequest): Promise<DeployResult>;
  getVerification(handId: string, contract?: string): Promise<Verification>;
  /** Cash out the agent's whole balance to a NEAR testnet account (`receiver`). */
  getCashoutQuote(receiver: string): Promise<CashoutQuote>;
  submitCashout(quoteId: string): Promise<{ id: string }>;
  getCashoutStatus(id: string): Promise<CashoutStatus>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    /** Whether any funds moved. The UI must say so either way. */
    readonly fundsMoved: boolean,
    /** Machine-readable reason from the server, e.g. "insufficient_funds". */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Live hands — real today: the deal is committed first, then the server
// plays the hand and reveals the seed.
// ---------------------------------------------------------------------------

export type HandRequest = {
  tableId: string;
  params: StrategyParams;
  preset?: PresetKey;
  /** The play session (practice run or live sitting) this hand belongs to. */
  runId?: string;
  stack: number;
  button: 0 | 1;
};

async function post<T>(f: typeof fetch, url: string, body?: unknown): Promise<T> {
  const res = await f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function fetchLiveHand(req: HandRequest, f: typeof fetch = fetch): Promise<LiveHand> {
  const deal = await post<{ handId: string; commitment: string }>(f, "/api/deal");
  // Our share of the shuffle, chosen only after the server has committed to its own.
  const playerSeed = newSeed();
  const hand = await post<LiveHand>(f, "/api/play", { ...req, handId: deal.handId, playerSeed });
  // The server must reveal the seed it committed to, and use ours.
  if (hand.proof?.commitment !== deal.commitment || hand.proof?.playerSeed !== playerSeed) {
    throw new Error("Hand doesn’t match its commitment");
  }
  return hand;
}

/** This player's hands of one mode, newest first (recorded by the server). */
export async function fetchHands(mode: HandMode = "real", run?: string, f: typeof fetch = fetch): Promise<LiveHand[]> {
  const res = await f(`/api/hands?mode=${mode}${run ? `&run=${run}` : ""}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()).hands;
}

/** Strategies this player has tested in practice, with their record (most recent first). */
export async function fetchTestedAgents(f: typeof fetch = fetch): Promise<TestedAgent[]> {
  const res = await f("/api/agents/tested");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()).agents;
}

/** Stopped playing: free this player's table so they can sit at another. Best effort. */
export function leaveTable(f: typeof fetch = fetch): Promise<void> {
  return f("/api/table/leave", { method: "POST" }).then(
    () => undefined,
    () => undefined,
  );
}

/** This player's play sessions of one mode, newest first. */
export async function fetchRuns(mode: HandMode, f: typeof fetch = fetch): Promise<Run[]> {
  const res = await f(`/api/runs?mode=${mode}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()).runs;
}

/** Live TEE attestation of the agent model (NEAR AI Cloud). */
export type Attestation = {
  verified: boolean;
  model: string;
  signer?: string;
  signatureKind?: "provider_tee" | "gateway";
  detail?: string;
  verifyUrl: string;
};

/** Verify that the agent's decisions run in an attested TEE. Never throws. */
export async function fetchAttestation(chatIds: string[] = [], f: typeof fetch = fetch): Promise<Attestation> {
  try {
    const res = await f(chatIds.length ? `/api/verify?chats=${chatIds.map(encodeURIComponent).join(",")}` : "/api/verify");
    return (await res.json()) as Attestation;
  } catch {
    return { verified: false, model: "", detail: "unreachable", verifyUrl: "https://cloud.near.ai/verify" };
  }
}

async function getJson<T>(f: typeof fetch, url: string): Promise<T> {
  const res = await f(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Network fee and server-set buy-in for a table. */
export function getFeeQuote(req: Pick<DeployRequest, "tableId">, f: typeof fetch = fetch): Promise<FeeQuote> {
  return getJson<FeeQuote>(f, `/api/agent/quote?tableId=${encodeURIComponent(req.tableId)}`);
}

/**
 * POST that moves money: errors become ApiError. The server answers with an
 * error before anything is signed, so fundsMoved is false unless it says otherwise.
 */
async function postMoney<T>(f: typeof fetch, url: string, body: unknown): Promise<T> {
  const res = await f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.code ?? (res.status === 402 ? "insufficient_funds" : undefined);
    throw new ApiError(data.error ?? "The network didn’t accept the request.", data.fundsMoved === true, code);
  }
  return data as T;
}

/** Moves the buy-in from the player's wallet to a new agent account on NEAR testnet. A license plays its sealed strategy. */
export function deployAgent(
  req: Pick<DeployRequest, "tableId"> & { strategyId?: string },
  f: typeof fetch = fetch,
): Promise<DeployResult> {
  return postMoney<DeployResult>(f, "/api/agent/deploy", { tableId: req.tableId, strategyId: req.strategyId });
}

/** Server-side fair-deal check for a hand without a local proof. */
export async function getVerification(handId: string, contract?: string, f: typeof fetch = fetch): Promise<Verification> {
  const q = `id=${encodeURIComponent(handId)}${contract ? `&contract=${encodeURIComponent(contract)}` : ""}`;
  const data = await getJson<{ status: Verification }>(f, `/api/hands/verify?${q}`);
  return data.status === "verified" || data.status === "pending" ? data.status : "unavailable";
}

/** The player's deposit wallet on NEAR testnet and its balance (table NEAR). */
export type Wallet = { account: string; balance: number };

export class SignedOutError extends Error {
  constructor() {
    super("Sign in to see your balance.");
    this.name = "SignedOutError";
  }
}

export async function fetchWallet(f: typeof fetch = fetch): Promise<Wallet> {
  const res = await f("/api/wallet");
  if (res.status === 401) throw new SignedOutError();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as Wallet;
}

/** Testnet faucet: have the operator seed an empty deposit wallet with a little NEAR. */
export function fundWallet(f: typeof fetch = fetch): Promise<{ tx: string }> {
  return post<{ tx: string }>(f, "/api/wallet/fund");
}

/** Send wallet funds to a testnet account; omit `amount` to send everything. */
export function withdrawFromWallet(
  req: { receiver: string; amount?: number },
  f: typeof fetch = fetch,
): Promise<{ tx: string }> {
  return post<{ tx: string }>(f, "/api/wallet/withdraw", req);
}

/** Take the agent off the table and return its on-chain balance to the wallet. */
export function stopAgent(f: typeof fetch = fetch): Promise<{ tx: string; amount: number }> {
  return post<{ tx: string; amount: number }>(f, "/api/agent/stop");
}

/** Which real-money tables are open, and their current max buy-in (table NEAR). */
export type TablesStatus = {
  tables: { id: string; open: boolean; reason?: string; maxBuyIn: number }[];
  house: { balance: number };
};

export function fetchTables(f: typeof fetch = fetch): Promise<TablesStatus> {
  return getJson<TablesStatus>(f, "/api/tables");
}

export const txUrl = (tx: string) => `https://testnet.nearblocks.io/txns/${tx}`;
export const addressUrl = (account: string) => `https://testnet.nearblocks.io/address/${account}`;

/** The agent's account and real balance in the contract (table NEAR). */
export async function fetchAgent(
  f: typeof fetch = fetch,
): Promise<{ account: string | null; balance: number; inHand?: boolean }> {
  const res = await f("/api/agent");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Real cash-out on NEAR testnet: the server reads the agent's on-chain balance
 * and the agent signs withdraw_to with its own key. NEAR testnet only.
 */
export const testnetCashout = {
  getCashoutQuote(receiver: string): Promise<CashoutQuote> {
    return post<CashoutQuote>(fetch, "/api/cashout/quote", { receiver });
  },
  /** The quote id is the destination account. */
  submitCashout(quoteId: string): Promise<{ id: string }> {
    return post<{ id: string }>(fetch, "/api/cashout", { receiver: quoteId });
  },
  async getCashoutStatus(id: string): Promise<CashoutStatus> {
    const res = await fetch(`/api/cashout/status?tx=${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data.status;
  },
};

// ---------------------------------------------------------------------------
// Strategy market — sealed strategies sold as licenses (seats). Prices in GNEAR.
// ---------------------------------------------------------------------------

export type MarketSnapshot = {
  contract: string;
  strategies: MarketStrategy[];
  listings: MarketListing[];
  npcs: Npc[];
  events: MarketEvent[];
};
export type MarketDetail = {
  strategy: MarketStrategy;
  listings: MarketListing[];
  events: MarketEvent[];
  hands: { handId: string; net: number; commitTx: string | null; settleTx: string | null }[];
};
export type MarketProof = { verified: number; total: number; mismatches: string[] };
export type MyLicenses = { licenses: { tokenId: string; title: string; seats: number }[]; published: string[] };
export type PublishRequest = { name: string; params: StrategyParams; seats: 10 | 25 | 100; price: number };
export type TradeRequest =
  | { op: "buy"; tokenId: string; seller: string; maxPrice: number }
  | { op: "list"; tokenId: string; amount: number; price: number }
  | { op: "delist"; tokenId: string };

export const fetchMarket = (f: typeof fetch = fetch) => getJson<MarketSnapshot>(f, "/api/market");
export const fetchMarketStrategy = (id: string, f: typeof fetch = fetch) =>
  getJson<MarketDetail>(f, `/api/market/${encodeURIComponent(id)}`);
export const fetchMarketProof = (id: string, f: typeof fetch = fetch) =>
  getJson<MarketProof>(f, `/api/market/${encodeURIComponent(id)}/proof`);
export const fetchMyLicenses = (f: typeof fetch = fetch) => getJson<MyLicenses>(f, "/api/market/mine");
/** Mint the seats and list them. Throws ApiError (fundsMoved false when nothing was sent). */
export const publishStrategy = (req: PublishRequest, f: typeof fetch = fetch) =>
  postMoney<{ tokenId: string; tx: string }>(f, "/api/market/publish", req);
/** Buy, list or delist. 402 → code insufficient_funds, 409 → price_moved / busy. */
export const tradeLicense = (req: TradeRequest, f: typeof fetch = fetch) =>
  postMoney<{ tx: string }>(f, "/api/market/trade", req);

export const agentApi: AgentApi = {
  getFeeQuote: (req) => getFeeQuote(req),
  deployAgent: (req) => deployAgent(req),
  getVerification: (id, contract) => getVerification(id, contract),
  ...testnetCashout,
};

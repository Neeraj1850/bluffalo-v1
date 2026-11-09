import type { Limits, PresetKey, StrategyParams } from "@/lib/data/strategy";
import { newSeed } from "@/lib/poker/fairness";
import type { LiveHand } from "@/lib/poker/record";

/**
 * The frontend talks to the agent backend only through this interface.
 * `mockAgentApi` stands in until the real service exists — swap the export
 * at the bottom of this file. Each step that moves money has its own call
 * and its own state, so the UI can never show "confirmed" for a quote.
 */

export type DeployRequest = {
  tableId: string;
  buyIn: number;
  preset: PresetKey;
  params: StrategyParams;
  limits: Limits;
};

export type FeeQuote = { fee: number; currency: "NEAR"; expiresAt: number };

export type DeployResult = {
  /** The agent's own account that now holds the buy-in. */
  agentAccount: string;
  confirmedAt: number;
};

export type Verification = "verified" | "pending" | "unavailable";

export type Chain = "NEAR" | "Ethereum" | "Solana" | "Base";

export type CashoutQuote = {
  id: string;
  chain: Chain;
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
  getVerification(handId: string): Promise<Verification>;
  getCashoutQuote(chain: Chain, amount: number): Promise<CashoutQuote>;
  submitCashout(quoteId: string): Promise<{ id: string }>;
  getCashoutStatus(id: string): Promise<CashoutStatus>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    /** Whether any funds moved. The UI must say so either way. */
    readonly fundsMoved: boolean,
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

/** This player's real-money hands, newest first (recorded by the server). */
export async function fetchHands(f: typeof fetch = fetch): Promise<LiveHand[]> {
  const res = await f("/api/hands");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()).hands;
}

// ---------------------------------------------------------------------------
// Mock implementation — demo only. Add ?fail=deploy, ?fail=quote,
// ?fail=cashout or ?verify=pending|unavailable to the URL to try other paths.
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function flag(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Demo-only conversion rates; a real quote comes from the cross-chain router. */
const MOCK_RATES: Record<Chain, { asset: string; rate: number; fee: number }> = {
  NEAR: { asset: "NEAR", rate: 1, fee: 0.001 },
  Ethereum: { asset: "ETH", rate: 0.0011, fee: 0.0004 },
  Solana: { asset: "SOL", rate: 0.021, fee: 0.0001 },
  Base: { asset: "USDC", rate: 3.1, fee: 0.05 },
};

const cashouts = new Map<string, number>();

export const mockAgentApi: AgentApi = {
  async getFeeQuote() {
    await wait(900);
    if (flag("fail") === "quote") throw new ApiError("Fee quote unavailable", false);
    return { fee: 0.0025, currency: "NEAR", expiresAt: Date.now() + 60_000 };
  },

  async deployAgent() {
    await wait(1800);
    if (flag("fail") === "deploy") {
      throw new ApiError("The network didn’t accept the request.", false);
    }
    return { agentAccount: "agent-7f3a.poker.near", confirmedAt: Date.now() };
  },

  async getVerification() {
    await wait(1200);
    const v = flag("verify");
    if (v === "pending" || v === "unavailable") return v;
    return "verified";
  },

  async getCashoutQuote(chain, amount) {
    await wait(800);
    const r = MOCK_RATES[chain];
    const receive = Math.max(0, amount * r.rate - r.fee);
    return {
      id: `q_${Date.now()}`,
      chain,
      send: amount,
      fee: r.fee,
      receive,
      receiveAsset: r.asset,
      expiresAt: Date.now() + 30_000,
    };
  },

  async submitCashout() {
    await wait(1200);
    if (flag("fail") === "cashout") {
      throw new ApiError("The transfer couldn’t be submitted.", false);
    }
    const id = `co_${Date.now()}`;
    cashouts.set(id, Date.now());
    return { id };
  },

  async getCashoutStatus(id) {
    await wait(600);
    const started = cashouts.get(id);
    if (!started) return "failed";
    return Date.now() - started > 1800 ? "confirmed" : "submitted";
  },
};

export const agentApi: AgentApi = mockAgentApi;

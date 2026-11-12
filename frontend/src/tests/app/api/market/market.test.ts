import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as publish } from "@/app/api/market/publish/route";
import { POST as trade } from "@/app/api/market/trade/route";
import { POST as tick } from "@/app/api/market/tick/route";
import type { MarketEvent, MarketListing, MarketStrategy, Npc, Why } from "@/lib/market/types";
import { busyWallets, clearMarketCache } from "@/lib/server/market";
import { toYocto } from "@/lib/server/near";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

// The chain is mocked: views answer from `chainState`, writes return fake hashes.
const chain = vi.hoisted(() => ({ send: vi.fn(), callAs: vi.fn(), view: vi.fn(), walletBalanceYocto: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const WALLET = "ab".repeat(32);
const SELLER = "seller.testnet";
const params = { aggression: 65, bluff: 30, position: 85, sizing: 60 };
const req = (body: unknown, id = ME) =>
  new Request("http://x", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${id}` }, body: JSON.stringify(body) });

let state: { listings: unknown[]; strategies: unknown[]; bal: Record<string, number> };
let be: ReturnType<typeof useFakeBackend>;

beforeEach(() => {
  clearMarketCache();
  busyWallets.clear();
  vi.stubEnv("NEAR_MARKET_ID", "market.op.testnet");
  vi.stubEnv("NEAR_AI_API_KEY", "");
  be = useFakeBackend();
  be.seedSession(ME, `did:privy:${crypto.randomUUID()}`); // fresh user: in-memory daily caps don't carry over
  be.seedWallet(ME, WALLET, "ed25519:walletkey");
  be.seedSession(GUEST);
  state = {
    strategies: [{ token_id: "s1", creator_id: SELLER, title: "Shark", params_hash: "0".repeat(64), royalty_bps: 1000, max_supply: 10, minted: "10", supply: "10" }],
    listings: [{ token_id: "s1", seller_id: SELLER, amount: 2, price_each: toYocto(12).toString(), memo: "" }],
    bal: { [`${SELLER}/s1`]: 5 },
  };
  chain.view.mockReset().mockImplementation(async (method: string, args: { account_id?: string; token_ids?: string[] }) => {
    if (method === "strategies") return state.strategies;
    if (method === "listings") return state.listings;
    if (method === "mt_batch_balance_of") return args.token_ids!.map((t) => String(state.bal[`${args.account_id}/${t}`] ?? 0));
    throw new Error(method);
  });
  chain.send.mockReset().mockResolvedValue("MINT_TX");
  chain.callAs.mockReset().mockResolvedValue("WALLET_TX");
  chain.walletBalanceYocto.mockReset().mockResolvedValue(toYocto(100));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/market/publish", () => {
  const good = { name: "Shark", params, seats: 10, price: 12 };

  it("needs sign-in", async () => {
    expect((await publish(req(good, GUEST))).status).toBe(401);
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("validates name, params, seats and price", async () => {
    for (const bad of [{ ...good, name: "" }, { ...good, name: "x".repeat(33) }, { ...good, params: { ...params, bluff: 101 } }, { ...good, seats: 7 }, { ...good, price: 0 }]) {
      expect((await publish(req(bad))).status).toBe(400);
    }
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("mints to the creator, lists every seat, keeps params secret", async () => {
    const res = await publish(req(good));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ tokenId: expect.stringMatching(/^s[0-9a-f]{8}$/), tx: "MINT_TX" });
    expect(JSON.stringify(body)).not.toContain("bluff");
    const [method, args, deposit, contract] = chain.send.mock.calls[0];
    expect([method, contract, deposit]).toEqual(["mint", "market.op.testnet", 10n ** 22n]);
    expect(args).toMatchObject({ token_id: body.tokenId, owner_id: WALLET, amount: "10", royalty_bps: 1000, max_supply: 10 });
    expect(args.params_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(chain.callAs).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "market.op.testnet", "list", expect.objectContaining({ amount: "10", price_each: toYocto(12).toString() }), 1n);
    expect(be.strategies.get(body.tokenId)).toMatchObject({ params, params_hash: args.params_hash });
  });

  it("caps publishing at 3 a day", async () => {
    for (let i = 0; i < 3; i++) expect((await publish(req({ ...good, name: `S${i}` }))).status).toBe(200);
    expect((await publish(req({ ...good, name: "S4" }))).status).toBe(429);
  });
});

describe("POST /api/market/trade", () => {
  const buy = { op: "buy", tokenId: "s1", seller: SELLER, maxPrice: 12 };

  it("buys at the listing price, recorded without params", async () => {
    const res = await trade(req(buy));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tx: "WALLET_TX" });
    expect(chain.callAs).toHaveBeenCalledWith(WALLET, "ed25519:walletkey", "market.op.testnet", "buy", { token_id: "s1", seller_id: SELLER, amount: "1" }, toYocto(12), expect.any(BigInt));
    expect(be.events[0]).toMatchObject({ kind: "sale", account: WALLET, counterparty: SELLER });
  });

  it("answers 409 price_moved when the ask is above maxPrice", async () => {
    const res = await trade(req({ ...buy, maxPrice: 11 }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("price_moved");
    expect(chain.callAs).not.toHaveBeenCalled();
  });

  it("filters stale listings (seller no longer holds the seats)", async () => {
    state.bal[`${SELLER}/s1`] = 1;
    expect((await (await trade(req(buy))).json()).code).toBe("price_moved");
  });

  it("answers 402 when the wallet can't pay", async () => {
    chain.walletBalanceYocto.mockResolvedValue(toYocto(5));
    const res = await trade(req(buy));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("insufficient_funds");
    expect(chain.callAs).not.toHaveBeenCalled();
  });

  it("refuses a second trade while one is in flight", async () => {
    let release!: (v: string) => void;
    chain.callAs.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = trade(req(buy));
    await vi.waitFor(() => expect(chain.callAs).toHaveBeenCalled());
    const second = await trade(req(buy));
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("busy");
    release("TX");
    expect((await first).status).toBe(200);
  });
});

describe("POST /api/market/tick", () => {
  const authed = () => new Request("http://x", { method: "POST", headers: { authorization: "Bearer test-token" } });

  it("needs the backend token", async () => {
    expect((await tick(new Request("http://x", { method: "POST" }))).status).toBe(401);
  });

  it("records prices, keeps under 5 transactions, and Scout goes offline without NEAR AI", async () => {
    vi.stubEnv("NPC_SCOUT", "scout.op.testnet:ed25519:s");
    vi.stubEnv("NPC_BOOKIE", "bookie.op.testnet:ed25519:b");
    vi.stubEnv("NPC_TILT", "tilt.op.testnet:ed25519:t");
    // Many cheap listings: the brokers want to buy everything.
    state.strategies = Array.from({ length: 8 }, (_, i) => ({ ...(state.strategies[0] as object), token_id: `t${i}` }));
    state.listings = state.strategies.map((s) => ({ token_id: (s as { token_id: string }).token_id, seller_id: SELLER, amount: 1, price_each: toYocto(1).toString(), memo: "" }));
    for (let i = 0; i < 8; i++) state.bal[`${SELLER}/t${i}`] = 1;
    const res = await tick(authed());
    const { actions } = await res.json();
    expect(actions).toBeLessThanOrEqual(5);
    expect(chain.callAs.mock.calls.length).toBe(actions);
    expect(be.events.some((e) => e.kind === "price")).toBe(true);
    expect(be.events.some((e) => e.kind === "npc" && e.reason === "Scout is offline")).toBe(true);
    expect(chain.callAs.mock.calls.every(([who]) => who !== "scout.op.testnet")).toBe(true);
  });
});

it("market types compile", () => {
  const why: Why = { rows: [], sentence: "" };
  const s = { why } as MarketStrategy;
  const l: Partial<MarketListing> = { sellerKind: "npc" };
  const n: Partial<Npc> = { key: "scout" };
  const e: Partial<MarketEvent> = { chatId: null };
  expect([s.why, l, n, e]).toHaveLength(4);
});

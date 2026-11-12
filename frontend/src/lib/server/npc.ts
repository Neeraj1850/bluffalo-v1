import { npcDecide, type BrokerKey, type MarketView, type NpcState } from "@/lib/market/rules";
import { backend } from "./backend";
import {
  balances,
  buy,
  cashOf,
  gnear,
  liveListings,
  list,
  recordEvent,
  recordPrices,
  npcSigners,
  underCap,
  type ChainListing,
  type Signer,
} from "./market";
import { toYocto } from "./near";
import { chatJsonId, hasNearAiKey, MODELS } from "./nearai";

/**
 * The market's NPCs, one tick at a time: Bookie and Tilt follow rules.npcDecide;
 * Scout asks NEAR AI to pick at most one buy, then hard checks it. Every trade
 * is recorded with its reason. At most MAX_TX transactions per tick.
 */

const MAX_TX = 5;
const LAZY_EVERY = 10 * 60 * 1000;
const SCOUT_CANDIDATES = 8;
const SCOUT_MAX_SHARE = 0.25;

const g = globalThis as typeof globalThis & { __npNpc?: { last: number; running: boolean } };
// ponytail: per-process tick clock, a second instance would tick on its own
const clock = (g.__npNpc ??= { last: 0, running: false });

/** Whether a lazy tick is due (and claim it). */
export function tickDue(now = Date.now()): boolean {
  if (clock.running || now - clock.last < LAZY_EVERY) return false;
  clock.last = now;
  return true;
}

const cheapest = (listings: ChainListing[], tokenId: string, not: string) =>
  listings
    .filter((l) => l.token_id === tokenId && l.seller_id !== not)
    .sort((a, b) => (BigInt(a.price_each) < BigInt(b.price_each) ? -1 : 1))[0];

/** Run one tick. Returns how many transactions it sent. */
export async function runTick(): Promise<number> {
  if (clock.running) return 0;
  clock.running = true;
  clock.last = Date.now();
  let sent = 0;
  try {
    const rows = await recordPrices();
    const ids = rows.map((r) => r.s.token_id);
    const npcs = npcSigners();

    const trade = async (n: Signer & { name: string }, kind: "buy" | "list", tokenId: string, price: number, reason: string, chatId?: string) => {
      const listings = await liveListings();
      if (kind === "buy") {
        const l = cheapest(listings, tokenId, n.account);
        if (!l || BigInt(l.price_each) > toYocto(price)) return;
        const tx = await buy(n, tokenId, l.seller_id, BigInt(l.price_each));
        sent++;
        await recordEvent({ strategy_id: tokenId, kind: "sale", account: n.account, counterparty: l.seller_id, price_yocto: l.price_each, amount: 1, reason, chat_id: chatId, tx });
      } else {
        const [held] = await balances(n.account, [tokenId]);
        if (!held) return;
        const tx = await list(n, tokenId, held, price);
        sent++;
        await recordEvent({ strategy_id: tokenId, kind: "list", account: n.account, price_yocto: toYocto(price).toString(), amount: held, reason, tx });
      }
    };

    for (const n of npcs.filter((x) => x.npc !== "scout")) {
      for (let k = 0; k < 2 && sent < MAX_TX; k++) {
        const listings = await liveListings();
        const held = await balances(n.account, ids);
        const state: NpcState = {
          key: n.npc as BrokerKey,
          cash: await cashOf(n.account),
          holdings: Object.fromEntries(ids.map((id, i) => [id, held[i]])),
          listings: Object.fromEntries(
            listings.filter((l) => l.seller_id === n.account).map((l) => [l.token_id, gnear(l.price_each)]),
          ),
        };
        const market: MarketView = rows.map((r) => ({
          tokenId: r.s.token_id,
          price: r.price,
          prev: r.prev,
          fair: r.fair,
          listed: listings.filter((l) => l.token_id === r.s.token_id && l.seller_id !== n.account).reduce((s, l) => s + l.amount, 0),
        }));
        const a = npcDecide(state, market, Math.random);
        if (a.kind === "none" || !a.tokenId || a.price === undefined) break;
        await trade(n, a.kind === "buy" ? "buy" : "list", a.tokenId, a.price, a.reason);
      }
    }

    const scout = npcs.find((x) => x.npc === "scout");
    if (scout && sent < MAX_TX) await scoutTurn(scout, rows, trade);

    await backend("/market/prune", { method: "POST" }).catch((e) => console.error("[npc] prune", e));
  } catch (e) {
    console.error("[npc] tick failed", e);
  } finally {
    clock.running = false;
  }
  return sent;
}

type Rows = Awaited<ReturnType<typeof recordPrices>>;

async function scoutTurn(
  scout: Signer & { name: string },
  rows: Rows,
  trade: (n: Signer & { name: string }, kind: "buy", id: string, price: number, reason: string, chatId?: string) => Promise<void>,
) {
  const offline = () => recordEvent({ strategy_id: null, kind: "npc", account: scout.account, reason: "Scout is offline" });
  if (!hasNearAiKey()) return offline();
  if (!underCap("scout-ai", Number(process.env.MARKET_AI_DAILY_CAP) || 150)) return;

  const cash = await cashOf(scout.account);
  const listings = await liveListings();
  const candidates = rows
    .map((r) => ({ r, ask: cheapest(listings, r.s.token_id, scout.account) }))
    .filter((c) => c.ask)
    .map((c) => ({ ...c, askG: gnear(c.ask!.price_each) }))
    .sort((a, b) => b.r.fair / b.askG - a.r.fair / a.askG)
    .slice(0, SCOUT_CANDIDATES);
  if (!candidates.length) return;

  let pick: { buy?: string | null; reason?: string };
  let chatId: string;
  try {
    const res = await chatJsonId<{ buy?: string | null; reason?: string }>({
      model: MODELS.agent,
      maxTokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You are Scout, a careful trader in a market for poker-strategy licenses. Buy at most one seat, only when it is clearly cheap for its record. " +
            'Answer JSON {"buy": tokenId or null, "reason": one short sentence}.',
        },
        {
          role: "user",
          content: JSON.stringify({
            cashGnear: cash,
            maxSpend: Math.floor(cash * SCOUT_MAX_SHARE * 100) / 100,
            offers: candidates.map((c) => ({
              tokenId: c.r.s.token_id,
              title: c.r.s.title,
              ask: c.askG,
              fairValue: Math.round(c.r.fair * 100) / 100,
              hands: c.r.ms.n,
              roi: c.r.ms.sumStake > 0 ? Math.round((c.r.ms.sumNet / c.r.ms.sumStake) * 1000) / 1000 : 0,
            })),
          }),
        },
      ],
    });
    pick = res.value ?? {};
    chatId = res.id;
  } catch {
    return offline();
  }

  const c = candidates.find((x) => x.r.s.token_id === pick.buy);
  // Hard checks: the model only proposes. Listed now, and at most a quarter of Scout's cash.
  const reason = `Scout: ${String(pick.reason ?? "").slice(0, 300)}`;
  // A pass is a decision too: show it in the feed with its TEE-signed chat id.
  if (!c || c.askG > cash * SCOUT_MAX_SHARE)
    return recordEvent({ strategy_id: null, kind: "npc", account: scout.account, reason: `${reason} (passed)`, chat_id: chatId });
  await trade(scout, "buy", c.r.s.token_id, c.askG, reason, chatId);
}

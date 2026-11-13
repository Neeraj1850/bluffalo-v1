import { NextResponse } from "next/server";
import { PRICE_MAX, PRICE_MIN } from "@/lib/market/rules";
import {
  balances,
  busyWallets,
  buy,
  BUY_GAS,
  CALL_GAS,
  gasReserveYocto,
  clearMarketCache,
  delist,
  gnear,
  list,
  liveListings,
  recordEvent,
  repriceStrategy,
  TOKEN_ID,
  underCap,
} from "@/lib/server/market";
import { ChainError, isAccountId, toYocto, walletBalanceYocto } from "@/lib/server/near";
import { sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

const DAILY_TRADES = 30;

/** Buy one seat, list seats, or delist — signed by the caller's custodial wallet. */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  const user = await sessionUser(session.id);
  if (!user) return reply({ error: "Sign in to trade" }, 401);

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const op = b?.op;
  const tokenId = b?.tokenId;
  if ((op !== "buy" && op !== "list" && op !== "delist") || typeof tokenId !== "string" || !TOKEN_ID.test(tokenId)) {
    return reply({ error: "Invalid trade", code: "invalid" }, 400);
  }
  const insufficient = (needYocto?: bigint) =>
    reply(
      {
        error: needYocto ? `Not enough in your wallet: this needs ${gnear(needYocto.toString()).toFixed(1)} GNEAR including the network fee. Deposit first.` : "Not enough in your wallet — deposit first",
        code: "insufficient_funds",
        fundsMoved: false,
      },
      402,
    );
  const wallet = await sessionWallet(session.id);
  if (!wallet) return insufficient();
  if (busyWallets.has(wallet.account)) return reply({ error: "Another trade is still going through", code: "busy" }, 409);
  if (!underCap(`trade:${user}`, DAILY_TRADES)) return reply({ error: `You can trade ${DAILY_TRADES} times a day`, code: "daily_cap" }, 429);

  busyWallets.add(wallet.account);
  try {
    const cash = await walletBalanceYocto(wallet.account);
    if (op === "buy") {
      const { seller, maxPrice } = b as { seller?: unknown; maxPrice?: unknown };
      if (!isAccountId(seller) || typeof maxPrice !== "number") return reply({ error: "Invalid trade", code: "invalid" }, 400);
      if (seller === wallet.account) return reply({ error: "That's your own listing", code: "invalid" }, 400);
      clearMarketCache(); // price from the chain now, not the 15 s cache
      const l = (await liveListings()).find((x) => x.token_id === tokenId && x.seller_id === seller);
      if (!l) return reply({ error: "That listing is gone", code: "price_moved" }, 409);
      const each = BigInt(l.price_each);
      if (each > toYocto(maxPrice)) {
        return reply({ error: `The price moved to ${gnear(l.price_each).toFixed(1)} GNEAR`, code: "price_moved", price: gnear(l.price_each) }, 409);
      }
      const need = each + gasReserveYocto(BUY_GAS);
      if (cash < need) return insufficient(need);
      const tx = await buy(wallet, tokenId, seller, each);
      await recordEvent({ strategy_id: tokenId, kind: "sale", account: wallet.account, counterparty: seller, price_yocto: l.price_each, amount: 1, tx });
      void repriceStrategy(tokenId);
      return reply({ tx });
    }
    if (cash < gasReserveYocto(CALL_GAS)) return insufficient(gasReserveYocto(CALL_GAS));
    if (op === "list") {
      const { amount, price } = b as { amount?: unknown; price?: unknown };
      if (!Number.isInteger(amount) || (amount as number) < 1 || typeof price !== "number" || !(price >= PRICE_MIN && price <= PRICE_MAX)) {
        return reply({ error: `List 1 or more seats at ${PRICE_MIN}–${PRICE_MAX} GNEAR`, code: "invalid" }, 400);
      }
      const [held] = await balances(wallet.account, [tokenId]);
      if ((amount as number) > held) return reply({ error: `You hold ${held} seat${held === 1 ? "" : "s"}`, code: "invalid" }, 400);
      const tx = await list(wallet, tokenId, amount as number, price);
      await recordEvent({ strategy_id: tokenId, kind: "list", account: wallet.account, amount: amount as number, price_yocto: toYocto(price).toString(), tx });
      void repriceStrategy(tokenId);
      return reply({ tx });
    }
    const tx = await delist(wallet, tokenId);
    await recordEvent({ strategy_id: tokenId, kind: "delist", account: wallet.account, tx });
    void repriceStrategy(tokenId);
    return reply({ tx });
  } catch (e) {
    // Backstop: the chain's own balance check is a funds problem, not an outage.
    if (e instanceof ChainError && /not enough balance/i.test(`${e.message} ${String(e.cause)}`)) return insufficient();
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  } finally {
    busyWallets.delete(wallet.account);
  }
}

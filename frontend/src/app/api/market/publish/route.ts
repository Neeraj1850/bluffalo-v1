import { NextResponse } from "next/server";
import { PARAMS } from "@/lib/data/strategy";
import { PRICE_MAX, PRICE_MIN } from "@/lib/market/rules";
import { commitment, newSeed } from "@/lib/poker/fairness";
import { backend, BackendError } from "@/lib/server/backend";
import { list, marketId, mint, recordEvent, underCap } from "@/lib/server/market";
import { ChainError, toYocto, walletBalanceYocto } from "@/lib/server/near";
import { parseParams } from "@/lib/server/play";
import { ensureSessionWallet, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

const SEATS = [10, 25, 100];
const DAILY_PUBLISHES = 3;

/**
 * Publish a sealed strategy: the params stay on the server (salted hash on-chain),
 * the operator mints the seats to the creator's wallet, and the wallet lists
 * them all at the creator's price. Never returns the params.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  const user = await sessionUser(session.id);
  if (!user) return reply({ error: "Sign in to publish a strategy" }, 401);

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (name.length < 1 || name.length > 32) return reply({ error: "Name must be 1–32 characters", code: "invalid" }, 400);
  const params = parseParams(b?.params);
  if (typeof params === "string") return reply({ error: params, code: "invalid" }, 400);
  const seats = Number(b?.seats);
  if (!SEATS.includes(seats)) return reply({ error: "Seats must be 10, 25 or 100", code: "invalid" }, 400);
  const price = b?.price;
  if (typeof price !== "number" || !(price >= PRICE_MIN && price <= PRICE_MAX)) {
    return reply({ error: `Price must be ${PRICE_MIN}–${PRICE_MAX} GNEAR`, code: "invalid" }, 400);
  }
  if (!underCap(`publish:${user}`, DAILY_PUBLISHES)) {
    return reply({ error: `You can publish ${DAILY_PUBLISHES} strategies a day`, code: "daily_cap" }, 429);
  }

  try {
    const wallet = await ensureSessionWallet(session.id);
    // The wallet signs the listing, so it needs gas money.
    if ((await walletBalanceYocto(wallet.account)) < 1n) {
      return reply({ error: "Deposit to your wallet first — listing needs a little gas", code: "insufficient_funds" }, 402);
    }
    const tokenId = `s${newSeed().slice(0, 8)}`;
    const salt = newSeed();
    const canonical = JSON.stringify(Object.fromEntries(PARAMS.map(({ key }) => [key, params[key]])));
    const paramsHash = await commitment(canonical + salt);
    try {
      await backend("/strategies", {
        method: "POST",
        body: {
          id: tokenId,
          creator_session_id: session.id,
          creator_account: wallet.account,
          name,
          params,
          salt,
          params_hash: paramsHash,
          contract_id: marketId(),
        },
      });
    } catch (e) {
      if (e instanceof BackendError && e.status === 409) return reply({ error: "That name is taken", code: "name_taken" }, 409);
      throw e;
    }
    const tx = await mint(tokenId, wallet.account, seats, name, paramsHash);
    await recordEvent({ strategy_id: tokenId, kind: "mint", account: wallet.account, amount: seats, tx });
    // Minted is final: if the listing fails the creator still holds the seats and can list them later.
    const listTx = await list(wallet, tokenId, seats, price).catch((e) => (console.error("[publish] list failed", tokenId, e), null));
    if (listTx) {
      await recordEvent({ strategy_id: tokenId, kind: "list", account: wallet.account, amount: seats, price_yocto: toYocto(price).toString(), tx: listTx });
    }
    return reply({ tokenId, tx });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down", fundsMoved: false }, 503);
    throw e;
  }
}

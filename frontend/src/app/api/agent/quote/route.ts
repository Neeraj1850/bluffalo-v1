import { NextResponse } from "next/server";
import { defaultBuyIn, TABLES } from "@/lib/data/tables";
import { tableFeeFor, TABLE_CLOSED, tableStatus } from "@/lib/server/economics";
import { ChainError, DEPLOY_GAS, fromYocto, gasPriceYocto, houseBalance } from "@/lib/server/near";
import { sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/** How long a quoted network fee holds (gas prices move slowly). */
const QUOTE_TTL_MS = 60_000;

/**
 * What deploying at a table costs: the buy-in, and the network fee — today's
 * gas price × the gas to create the agent account and fund it — and the flat
 * table fee. The buy-in is clamped to what the house can cover (exposure cap).
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to deploy an agent" }, 401);
  const table = TABLES.find((t) => t.id === new URL(request.url).searchParams.get("tableId"));
  if (!table || table.mode !== "real") return reply({ error: "Pick a real-money table" }, 400);
  try {
    const [price, house] = await Promise.all([gasPriceYocto(), houseBalance()]);
    const status = tableStatus(table, house);
    if (!status.open) return reply(TABLE_CLOSED, 503);
    // Round up to the table's 2 decimals so the fee is never shown as 0.
    const fee = Math.max(fromYocto(price * DEPLOY_GAS), 0.01);
    const buyIn = Math.min(defaultBuyIn(table), status.maxBuyIn);
    return reply({
      fee,
      tableFee: tableFeeFor(buyIn),
      currency: "NEAR",
      expiresAt: Date.now() + QUOTE_TTL_MS,
      buyIn,
      maxBuyIn: status.maxBuyIn,
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

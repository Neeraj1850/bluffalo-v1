import { NextResponse } from "next/server";
import { accountExists, ChainError, fundFromOperator } from "@/lib/server/near";
import { ensureSessionWallet, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/**
 * Testnet faucet: the operator seeds the player's empty deposit wallet with a
 * little NEAR so they can play without finding tokens elsewhere. Only for a
 * wallet that doesn't exist on-chain yet, so it can't be milked by repeat calls.
 */
// ponytail: fixed one-off top-up of an empty wallet. A player who withdraws can
// trigger it again; fine on testnet. Track "funded once" per session if the operator drains.
const FUND_YOCTO = 10n ** 23n; // 0.1 testnet NEAR = 100 table NEAR

export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to get testnet NEAR" }, 401);

  const wallet = await ensureSessionWallet(session.id);
  try {
    if (await accountExists(wallet.account)) {
      return reply({ error: "Your wallet already has testnet NEAR" }, 409);
    }
    const tx = await fundFromOperator(wallet.account, FUND_YOCTO);
    return reply({ tx });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

export const runtime = "nodejs";

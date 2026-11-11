import { NextResponse } from "next/server";
import { ChainError, fromYocto, walletBalanceYocto } from "@/lib/server/near";
import { ensureSessionWallet, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/**
 * The player's custodial NEAR testnet deposit wallet and what it can spend
 * (table NEAR). The wallet is created on the first call; its key stays here.
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to see your wallet" }, 401);
  const wallet = await ensureSessionWallet(session.id);
  try {
    return reply({ account: wallet.account, balance: fromYocto(await walletBalanceYocto(wallet.account)) });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

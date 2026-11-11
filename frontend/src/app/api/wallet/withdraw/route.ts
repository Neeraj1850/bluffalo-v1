import { NextResponse } from "next/server";
import { accountExists, ChainError, isAccountId, sendFromWallet, toYocto, walletBalanceYocto } from "@/lib/server/near";
import { sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

/**
 * Send NEAR out of the player's deposit wallet to their own testnet account.
 * `amount` is table NEAR; omitted means everything available.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to withdraw" }, 401);

  const body = await request.json().catch(() => null);
  const receiver = body?.receiver;
  if (!isAccountId(receiver)) return reply({ error: "Enter a NEAR testnet account, like you.testnet" }, 400);
  const amount = body?.amount;
  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) {
    return reply({ error: "Enter an amount above zero" }, 400);
  }
  const wallet = await sessionWallet(session.id);
  if (!wallet) return reply({ error: "Your wallet is empty" }, 409);

  try {
    if (!(await accountExists(receiver))) return reply({ error: `${receiver} doesn’t exist on NEAR testnet` }, 400);
    const available = await walletBalanceYocto(wallet.account);
    const yocto = amount === undefined ? available : toYocto(amount);
    if (available === 0n) return reply({ error: "Your wallet is empty" }, 409);
    if (yocto > available) return reply({ error: "That's more than your wallet holds", code: "insufficient_funds" }, 402);
    const tx = await sendFromWallet(wallet.account, wallet.key, receiver, yocto);
    return reply({ tx });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

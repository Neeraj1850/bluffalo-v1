import { NextResponse } from "next/server";
import { ChainError, fromYocto, fundFromOperator, operatorBalanceYocto, walletBalanceYocto } from "@/lib/server/near";
import { FAUCET_LOW_GNEAR as LOW_GNEAR } from "@/lib/wallet";
import { ensureSessionWallet, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/**
 * Testnet faucet: the operator tops up a player's deposit wallet so they can
 * play without finding tokens elsewhere. Any wallet below LOW qualifies — new
 * or returning — with a per-session cooldown so it can't be milked in a loop.
 */
const FUND_YOCTO = 10n ** 23n; // 0.1 testnet NEAR = 100 GNEAR
/** The operator keeps this much for gas, agent accounts and settling hands. */
const OPERATOR_RESERVE = 10n ** 24n; // 1 testnet NEAR
const COOLDOWN_MS = 10 * 60_000;

// ponytail: in-memory cooldown, resets on restart and isn't shared across instances.
// Move to the session row if the operator gets drained.
const lastFunded = new Map<string, number>();

export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to get testnet NEAR" }, 401);

  const since = Date.now() - (lastFunded.get(session.id) ?? 0);
  if (since < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - since) / 60_000);
    return reply({ error: `You just got a top-up. Try again in ${mins} min, or use the public faucet.`, code: "cooldown" }, 429);
  }

  const wallet = await ensureSessionWallet(session.id);
  try {
    const balance = fromYocto(await walletBalanceYocto(wallet.account));
    if (balance >= LOW_GNEAR) {
      return reply(
        { error: `You already have ${balance.toFixed(2)} GNEAR. The faucet tops up wallets under ${LOW_GNEAR} GNEAR.`, code: "enough_funds" },
        409,
      );
    }
    if ((await operatorBalanceYocto()) < FUND_YOCTO + OPERATOR_RESERVE) {
      return reply({ error: "Our faucet is out of testnet NEAR right now. Use the public faucet link below.", code: "faucet_empty" }, 503);
    }
    const tx = await fundFromOperator(wallet.account, FUND_YOCTO);
    lastFunded.set(session.id, Date.now());
    return reply({ tx, amount: fromYocto(FUND_YOCTO) });
  } catch (e) {
    if (e instanceof ChainError) {
      return reply({ error: "The faucet couldn't reach NEAR testnet. Try again in a minute, or use the public faucet.", code: "chain_down" }, 503);
    }
    throw e;
  }
}

export const runtime = "nodejs";

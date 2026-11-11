import { NextResponse } from "next/server";
import { balanceYocto, ChainError, fromYocto, withdrawTo } from "@/lib/server/near";
import { sessionAgent, sessionAgentKey, sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

/**
 * Stop the agent: it signs `withdraw_to` with its withdraw-only key, sending its
 * whole contract balance back to the player's deposit wallet. Amount in table NEAR.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to stop your agent" }, 401);
  const [agent, agentKey, wallet] = await Promise.all([
    sessionAgent(session.id),
    sessionAgentKey(session.id),
    sessionWallet(session.id),
  ]);
  if (!agent || !agentKey || !wallet) return reply({ error: "You have no agent running" }, 409);
  try {
    const yocto = await balanceYocto(agent);
    if (yocto === 0n) return reply({ error: "Your agent has nothing to return" }, 409);
    const tx = await withdrawTo(agent, agentKey, wallet.account, yocto);
    return reply({ tx, amount: fromYocto(yocto) });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

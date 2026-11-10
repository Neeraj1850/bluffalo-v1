import { NextResponse } from "next/server";
import { defaultBuyIn, TABLES } from "@/lib/data/tables";
import { ChainError, createAgentAccount, depositFor } from "@/lib/server/near";
import { sessionFrom, sessionUser, setSessionAgent, withSession } from "@/lib/server/sessions";

/**
 * Deploy an agent for real money: a fresh NEAR testnet sub-account, funded in
 * the poker contract with the table's buy-in (scaled for testnet). The account
 * is remembered server-side — the browser can't point play at someone else's.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to deploy an agent" }, 401);
  const body = await request.json().catch(() => null);
  const table = TABLES.find((t) => t.id === body?.tableId);
  if (!table || table.mode !== "real") return reply({ error: "Pick a real-money table" }, 400);

  try {
    const { accountId: agentAccount, privateKey } = await createAgentAccount();
    const depositTx = await depositFor(agentAccount, defaultBuyIn(table));
    await setSessionAgent(session.id, agentAccount, privateKey);
    return reply({ agentAccount, depositTx, confirmedAt: Date.now() });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

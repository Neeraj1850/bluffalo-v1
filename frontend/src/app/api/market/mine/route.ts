import { NextResponse } from "next/server";
import { balances, chainStrategies } from "@/lib/server/market";
import { ChainError } from "@/lib/server/near";
import { sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

/** The caller's license seats and the strategies they published. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to see your licenses" }, 401);
  const wallet = await sessionWallet(session.id);
  if (!wallet) return reply({ licenses: [], published: [] });
  try {
    const all = await chainStrategies();
    const seats = await balances(wallet.account, all.map((s) => s.token_id));
    return reply({
      licenses: all.flatMap((s, i) => (seats[i] > 0 ? [{ tokenId: s.token_id, title: s.title, seats: seats[i] }] : [])),
      published: all.filter((s) => s.creator_id === wallet.account).map((s) => s.token_id),
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

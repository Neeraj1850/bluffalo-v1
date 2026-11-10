import { NextResponse } from "next/server";
import { balanceOf, ChainError } from "@/lib/server/near";
import { sessionAgent, sessionFrom, withSession } from "@/lib/server/sessions";

/** This player's agent account and its real balance in the contract (table NEAR). */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  const account = await sessionAgent(session.id);
  if (!account) return reply({ account: null, balance: 0 });
  try {
    return reply({ account, balance: await balanceOf(account) });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

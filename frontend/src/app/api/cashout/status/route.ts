import { NextResponse } from "next/server";
import { ChainError, txStatus } from "@/lib/server/near";
import { sessionAgent, sessionFrom, withSession } from "@/lib/server/sessions";

/** Where this player's cash-out transaction stands, from the network's own record. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  const tx = new URL(request.url).searchParams.get("tx") ?? "";
  const agent = await sessionAgent(session.id);
  if (!agent || !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx)) return reply({ error: "Unknown transaction" }, 404);
  try {
    return reply({ status: await txStatus(tx, agent) });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

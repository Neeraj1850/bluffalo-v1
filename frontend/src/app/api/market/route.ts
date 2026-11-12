import { after, NextResponse } from "next/server";
import { marketId, npcRows, snapshot } from "@/lib/server/market";
import { ChainError } from "@/lib/server/near";
import { runTick, tickDue } from "@/lib/server/npc";
import { sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

/** The market: strategies with quotes, live listings, NPCs and the newest 30 events. Public. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  // NPCs trade lazily: at most one tick per 10 minutes, after the response is sent.
  if (tickDue()) after(() => runTick());
  try {
    const wallet = (await sessionUser(session.id)) ? await sessionWallet(session.id) : null;
    const [snap, npcs] = await Promise.all([snapshot(wallet?.account ?? null), npcRows()]);
    return reply({ contract: marketId(), strategies: snap.strategies, listings: snap.listings, npcs, events: snap.feed.slice(0, 30) });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

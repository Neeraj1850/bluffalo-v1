import { NextResponse } from "next/server";
import { snapshot, strategyEvents, strategyHands, TOKEN_ID } from "@/lib/server/market";
import { ChainError } from "@/lib/server/near";
import { sessionFrom, sessionUser, sessionWallet, withSession } from "@/lib/server/sessions";

/** One strategy: quote, listings, its events and its verified hands. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!TOKEN_ID.test(id)) return reply({ error: "Unknown strategy" }, 404);
  try {
    const wallet = (await sessionUser(session.id)) ? await sessionWallet(session.id) : null;
    const [events, hands] = await Promise.all([strategyEvents(id), strategyHands(id)]);
    const snap = await snapshot(wallet?.account ?? null, events);
    const strategy = snap.strategies.find((s) => s.tokenId === id);
    if (!strategy) return reply({ error: "Unknown strategy" }, 404);
    return reply({
      strategy,
      listings: snap.listings.filter((l) => l.tokenId === id),
      events: snap.feed.filter((e) => e.tokenId === id).slice(0, 50),
      hands: hands.map((h) => ({ handId: h.id, net: h.net, commitTx: h.chain?.commitTx ?? null, settleTx: h.chain?.settleTx ?? null })),
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}

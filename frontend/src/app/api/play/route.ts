import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { takeSeed } from "@/lib/server/deals";
import { recordHand } from "@/lib/server/hands";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** Play a hand committed with POST /api/deal. The response reveals the seed. */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  const req = parsePlayRequest(await request.json().catch(() => null));
  if (typeof req === "string") return reply({ error: req }, 400);

  const deal = await takeSeed(req.handId, session.id);
  if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

  const hand = await playHand(req, deal);
  // Real-money hands go in the archive; practice hands don't.
  if (getTable(req.tableId).mode === "real") await recordHand(session.id, hand);
  return reply(hand);
}

import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { takeSeed } from "@/lib/server/deals";
import { ServiceDownError } from "@/lib/server/decide";
import { recordHand } from "@/lib/server/hands";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/** Play a hand committed with POST /api/deal. The response reveals the seed. */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  const req = parsePlayRequest(await request.json().catch(() => null));
  if (typeof req === "string") return reply({ error: req }, 400);

  // Real money needs a signed-in player; practice is open to anyone.
  const real = getTable(req.tableId).mode === "real";
  if (real && !(await sessionUser(session.id))) return reply({ error: "Sign in to play for real money" }, 401);

  const deal = await takeSeed(req.handId, session.id);
  if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

  let hand;
  try {
    hand = await playHand(req, deal);
  } catch (e) {
    // The model is unavailable: stop the hand and say so — never play it with a stand-in.
    if (e instanceof ServiceDownError) return reply({ error: e.message, code: "service_down" }, 503);
    throw e;
  }
  // Real-money hands go in the archive; practice hands don't.
  if (real) await recordHand(session.id, hand);
  return reply(hand);
}

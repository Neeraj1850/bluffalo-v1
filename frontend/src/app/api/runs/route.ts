import { NextResponse } from "next/server";
import { runsOf } from "@/lib/poker/runs";
import { listHands } from "@/lib/server/hands";
import { sessionFrom, withSession } from "@/lib/server/sessions";

// ponytail: sessions are grouped on read from the newest WINDOW hands of a mode, so a very
// old session can drop off or show partial counts. Add a runs table if players exceed it.
const WINDOW = 500;

/** This player's play sessions of one mode (real money by default), newest first. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const mode = new URL(request.url).searchParams.get("mode") === "practice" ? "practice" : "real";
  return withSession(NextResponse.json({ runs: runsOf(await listHands(session.id, mode, WINDOW)) }), session);
}

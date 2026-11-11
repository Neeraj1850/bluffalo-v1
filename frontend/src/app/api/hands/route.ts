import { NextResponse } from "next/server";
import { EARLIER_RUN, handsOfRun } from "@/lib/poker/runs";
import { listHands } from "@/lib/server/hands";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/**
 * This player's hands, newest first: real money by default, or `?mode=practice`.
 * With `&run=<id>`, one session's hands in the order they were played.
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") === "practice" ? "practice" : "real";
  const run = params.get("run");
  if (run === null) return withSession(NextResponse.json({ hands: await listHands(session.id, mode) }), session);
  if (run !== EARLIER_RUN && !/^[0-9a-f]{8,32}$/.test(run)) {
    return withSession(NextResponse.json({ error: "Invalid run" }, { status: 400 }), session);
  }
  return withSession(NextResponse.json({ hands: handsOfRun(await listHands(session.id, mode, 500), run) }), session);
}

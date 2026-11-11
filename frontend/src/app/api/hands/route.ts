import { NextResponse } from "next/server";
import { listHands } from "@/lib/server/hands";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** This player's hands, newest first: real money by default, or `?mode=practice`. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const mode = new URL(request.url).searchParams.get("mode") === "practice" ? "practice" : "real";
  return withSession(NextResponse.json({ hands: await listHands(session.id, mode) }), session);
}

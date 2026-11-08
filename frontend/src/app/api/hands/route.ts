import { NextResponse } from "next/server";
import { listHands } from "@/lib/server/hands";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** This player's real-money hands, newest first. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  return withSession(NextResponse.json({ hands: await listHands(session.id) }), session);
}

import { NextResponse } from "next/server";
import { testedAgents } from "@/lib/poker/tested";
import { listHands } from "@/lib/server/hands";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** How many recent practice hands the tested-agent stats cover. */
const WINDOW = 500;

/** The strategies this player has tested in practice, with their record. Summaries only. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const hands = await listHands(session.id, "practice", WINDOW);
  return withSession(NextResponse.json({ agents: testedAgents(hands) }), session);
}

import { NextResponse } from "next/server";
import { leaveTable } from "@/lib/server/activeTable";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** The player stopped a test or a live sitting: they may sit at another table now. */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  leaveTable(session.id);
  return withSession(NextResponse.json({ ok: true }), session);
}

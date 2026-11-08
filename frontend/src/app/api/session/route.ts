import { NextResponse } from "next/server";
import { parseState, saveState, sessionFrom, withSession } from "@/lib/server/sessions";

/** The player's saved setup. */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  return withSession(NextResponse.json({ state: session.state }), session);
}

export async function PUT(request: Request) {
  const session = await sessionFrom(request);
  const state = parseState(await request.json().catch(() => null));
  if (typeof state === "string") return withSession(NextResponse.json({ error: state }, { status: 400 }), session);
  await saveState(session.id, state);
  return withSession(NextResponse.json({ ok: true }), session);
}

import { NextResponse } from "next/server";
import { createDeal } from "@/lib/server/deals";
import { sessionFrom, withSession } from "@/lib/server/sessions";

/** Commit to a hand before it's dealt. Returns the hash only — never the seed. */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  return withSession(NextResponse.json(await createDeal(session.id)), session);
}

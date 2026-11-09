import { NextResponse } from "next/server";
import { freshSession, withSession } from "@/lib/server/sessions";

/** Sign out: this browser gets a fresh anonymous session; the user's data stays with their account. */
export async function POST() {
  return withSession(NextResponse.json({ ok: true }), await freshSession());
}

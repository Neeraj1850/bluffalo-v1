import { NextResponse } from "next/server";

/** Liveness probe for the host (Railway restarts the service when this stops answering). */
export function GET() {
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";

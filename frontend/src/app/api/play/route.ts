import { NextResponse } from "next/server";
import { takeSeed } from "@/lib/server/deals";
import { parsePlayRequest, playHand } from "@/lib/server/play";

/** Play a hand committed with POST /api/deal. The response reveals the seed. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const req = parsePlayRequest(body);
  if (typeof req === "string") return NextResponse.json({ error: req }, { status: 400 });

  const deal = takeSeed(req.handId);
  if (!deal) return NextResponse.json({ error: "Unknown, expired or already played hand" }, { status: 404 });

  return NextResponse.json(await playHand(req, deal));
}

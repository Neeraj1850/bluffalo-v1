import { sweepStaleHands } from "@/lib/server/mcpPlay";

/**
 * Timeout sweep for abandoned MCP hands: a hand committed on-chain but left idle
 * on the external agent gets acted for (fold/check) and settled, so stakes are
 * never stuck. Meant for a cron; authorised with BACKEND_TOKEN as a Bearer token.
 */
const STALE_AFTER_MS = 2 * 60_000;

export async function POST(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!process.env.BACKEND_TOKEN || token !== process.env.BACKEND_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const swept = await sweepStaleHands(Date.now() - STALE_AFTER_MS);
  return Response.json({ swept });
}

export const runtime = "nodejs";

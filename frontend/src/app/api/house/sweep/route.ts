import { sweepHouse } from "@/lib/server/house";
import { ChainError } from "@/lib/server/near";

/**
 * Treasury sweep: withdraw house money above HOUSE_TARGET to the operator.
 * Meant for a cron; authorised with BACKEND_TOKEN as a Bearer token (like /api/mcp/sweep).
 * Answers {skipped:"contract_outdated"} if the deployed contract has no withdraw_house.
 */
export async function POST(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!process.env.BACKEND_TOKEN || token !== process.env.BACKEND_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await sweepHouse());
  } catch (e) {
    if (e instanceof ChainError) return Response.json({ error: e.message, code: "chain_down" }, { status: 503 });
    throw e;
  }
}

export const runtime = "nodejs";

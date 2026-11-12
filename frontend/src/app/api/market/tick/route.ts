import { runTick } from "@/lib/server/npc";

/** Run an NPC market tick now. For a cron; Bearer BACKEND_TOKEN (like /api/house/sweep). */
export async function POST(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!process.env.BACKEND_TOKEN || token !== process.env.BACKEND_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ actions: await runTick() });
}

export const runtime = "nodejs";

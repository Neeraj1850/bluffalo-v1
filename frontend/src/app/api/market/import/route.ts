import { backend } from "@/lib/server/backend";

type Row = { id: string; name: string; params: object; salt: string; params_hash: string; mint_tx?: string | null };

/**
 * Register already-minted house strategies (sealed params + salt) in this deployment's
 * backend, owned by the Bookie NPC session. For seeding a deployment whose backend the
 * seed script can't reach. Bearer BACKEND_TOKEN; skips names that already exist.
 */
export async function POST(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!process.env.BACKEND_TOKEN || token !== process.env.BACKEND_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookie = process.env.NPC_BOOKIE?.split(":")[0];
  const market = process.env.NEAR_MARKET_ID;
  const { rows } = (await request.json().catch(() => ({}))) as { rows?: Row[] };
  if (!bookie || !market || !Array.isArray(rows)) return Response.json({ error: "invalid" }, { status: 400 });

  const have = new Set((await backend<{ strategies: { name: string }[] }>("/strategies"))?.strategies.map((s) => s.name));
  const created = await backend<{ id: string }>("/sessions", { method: "POST", body: {} });
  const session = created && (await backend<{ id: string }>(`/sessions/${created.id}/user`, { method: "POST", body: { user_id: "npc:bookie" } }));
  if (!session) return Response.json({ error: "backend unavailable" }, { status: 503 });
  const added: string[] = [];
  for (const r of rows) {
    if (have.has(r.name)) continue;
    await backend("/strategies", {
      method: "POST",
      body: { ...r, creator_session_id: session.id, creator_account: bookie, contract_id: market },
    });
    added.push(r.id);
  }
  return Response.json({ added });
}

export const runtime = "nodejs";

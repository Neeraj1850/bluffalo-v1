import { backend } from "@/lib/server/backend";

type Row = {
  id: string;
  name: string;
  params: object;
  salt: string;
  params_hash: string;
  mint_tx?: string | null;
  /** Demo player short name ("ava"): creator = `<creator>.<operator>`. Absent = the Bookie NPC. */
  creator?: string;
};

/**
 * Register already-minted strategies (sealed params + salt) in this deployment's backend:
 * house library rows under the Bookie NPC, demo-player rows under their own accounts.
 * For seeding a deployment whose backend the seed scripts can't reach. Bearer
 * BACKEND_TOKEN; skips names that already exist.
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
  const operator = process.env.NEAR_OPERATOR_ID;
  const market = process.env.NEAR_MARKET_ID;
  const { rows } = (await request.json().catch(() => ({}))) as { rows?: Row[] };
  if (!bookie || !operator || !market || !Array.isArray(rows)) return Response.json({ error: "invalid" }, { status: 400 });
  if (rows.some((r) => r.creator !== undefined && !/^[a-z0-9]{1,16}$/.test(r.creator))) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const have = new Set((await backend<{ strategies: { name: string }[] }>("/strategies"))?.strategies.map((s) => s.name));
  const sessions = new Map<string, string>();
  const sessionFor = async (userId: string) => {
    if (sessions.has(userId)) return sessions.get(userId)!;
    const created = await backend<{ id: string }>("/sessions", { method: "POST", body: {} });
    const s = created && (await backend<{ id: string }>(`/sessions/${created.id}/user`, { method: "POST", body: { user_id: userId } }));
    if (!s) throw new Error("backend unavailable");
    sessions.set(userId, s.id);
    return s.id;
  };

  const added: string[] = [];
  try {
    for (const { creator, ...r } of rows) {
      if (have.has(r.name)) continue;
      const user = creator ? `demo:${creator}` : "npc:bookie";
      const account = creator ? `${creator}.${operator}` : bookie;
      await backend("/strategies", {
        method: "POST",
        body: { ...r, creator_session_id: await sessionFor(user), creator_account: account, contract_id: market },
      });
      added.push(r.id);
    }
  } catch {
    return Response.json({ error: "backend unavailable", added }, { status: 503 });
  }
  return Response.json({ added });
}

export const runtime = "nodejs";

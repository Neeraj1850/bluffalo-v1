import { vi } from "vitest";

/**
 * In-memory stand-in for the storage backend (`backend/`), installed as the
 * global fetch. Mirrors its rules: per-session data, a seed claimed once and
 * only by its session, 404 for unknown sessions. The real SQL is tested in
 * backend/tests with pytest. Requests to anything else go to `fallthrough`
 * (e.g. a fake NEAR AI).
 */
export const BACKEND = "http://backend.test";

export function useFakeBackend(fallthrough?: typeof fetch) {
  vi.stubEnv("BACKEND_URL", BACKEND);
  vi.stubEnv("BACKEND_TOKEN", "test-token");

  const sessions = new Map<string, Record<string, unknown>>();
  const users = new Map<string, string>(); // session id → Privy user id
  const agents = new Map<string, string>(); // session id → agent NEAR account
  const agentKeys = new Map<string, string>(); // session id → agent key
  const mcpTokens = new Map<string, string>(); // mcp token → session id
  const deals = new Map<string, { session: string; seed: string; commitment: string; played: boolean }>();
  const hands: { session: string; id: string; record: unknown }[] = [];
  type LiveRow = { session_id: string; status: string; to_act: number; updated_at: number; data: unknown };
  const liveHands = new Map<string, LiveRow>(); // hand_id → row
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fake = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (!url.startsWith(BACKEND)) {
      if (!fallthrough) throw new Error(`Unexpected request to ${url}`);
      return fallthrough(input, init);
    }
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer test-token") return json({}, 401);
    const path = url.slice(BACKEND.length);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const [, , sid, kind, handId, action] = path.split("/");

    if (path === "/sessions" && method === "POST") {
      const id = crypto.randomUUID();
      sessions.set(id, {});
      return json({ id }, 201);
    }

    // Live hands: addressed by hand_id, global (not per session). The path is
    // /live or /live/<hand_id>, so parse it on its own, not via the session split.
    if (path === "/live" || path.startsWith("/live?") || path.startsWith("/live/")) {
      if (path.startsWith("/live/") && method === "PUT") {
        const liveId = path.split("/")[2];
        if (!sessions.has(body.session_id)) return json({ detail: "Unknown session" }, 404);
        liveHands.set(liveId, body);
        return json({ ok: true });
      }
      if (path.startsWith("/live/") && method === "GET") {
        const h = liveHands.get(path.split("/")[2]);
        return h ? json({ data: h.data }) : json({ detail: "Unknown live hand" }, 404);
      }
      if (method === "GET") {
        const cutoff = Number(new URL(url).searchParams.get("cutoff"));
        const stale = [...liveHands.values()].filter(
          (h) => h.status === "active" && h.to_act === 0 && h.updated_at < cutoff,
        );
        return json({ hands: stale.map((h) => h.data) });
      }
    }

    if (sid === "by-token") {
      const owner = mcpTokens.get(kind);
      if (!owner) return json({ detail: "Unknown token" }, 404);
      return json({
        id: owner,
        user_id: users.get(owner) ?? null,
        agent_account: agents.get(owner) ?? null,
        agent_key: agentKeys.get(owner) ?? null,
      });
    }

    if (!sessions.has(sid)) return json({ detail: "Unknown session" }, 404);
    if (!kind && method === "GET") return json({ state: sessions.get(sid) });
    if (!kind && method === "PUT") {
      sessions.set(sid, body.state);
      return json({ ok: true });
    }
    if (kind === "user" && method === "GET") return json({ user_id: users.get(sid) ?? null });
    if (kind === "user" && method === "POST") {
      const existing = [...users].find(([, u]) => u === body.user_id)?.[0];
      const id = existing ?? sid;
      users.set(id, body.user_id);
      return json({ id, state: sessions.get(id) });
    }
    if (kind === "agent" && method === "GET") {
      return json({ account_id: agents.get(sid) ?? null, private_key: agentKeys.get(sid) ?? null });
    }
    if (kind === "agent" && method === "PUT") {
      agents.set(sid, body.account_id);
      if (body.private_key) agentKeys.set(sid, body.private_key);
      if (body.mcp_token) mcpTokens.set(body.mcp_token, sid);
      return json({ ok: true });
    }
    if (kind === "deals" && !handId) {
      deals.set(body.hand_id, { session: sid, seed: body.seed, commitment: body.commitment, played: false });
      return json({ ok: true }, 201);
    }
    if (kind === "deals" && action === "claim") {
      const d = deals.get(handId);
      if (!d || d.session !== sid || d.played) return json({ detail: "Unknown" }, 404);
      d.played = true;
      return json({ seed: d.seed, commitment: d.commitment });
    }
    if (kind === "hands" && method === "POST") {
      if (!hands.some((h) => h.id === body.id)) hands.unshift({ session: sid, id: body.id, record: body.record });
      return json({ ok: true }, 201);
    }
    if (kind === "hands") return json({ hands: hands.filter((h) => h.session === sid).map((h) => h.record) });
    return json({ detail: "Not found" }, 404);
  });

  vi.stubGlobal("fetch", fake);
  /** Create a session directly, as if a browser had visited before (optionally signed in). */
  const seedSession = (id: string, userId?: string, agent?: string, agentKey?: string) => {
    sessions.set(id, {});
    if (userId) users.set(id, userId);
    if (agent) agents.set(id, agent);
    if (agentKey) agentKeys.set(id, agentKey);
  };
  return { fake, seedSession };
}

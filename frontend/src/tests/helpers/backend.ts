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
  const agentStrategies = new Map<string, string>(); // session id → licensed strategy
  const strategies = new Map<string, Record<string, unknown>>(); // market strategies (with params)
  const events: Record<string, unknown>[] = []; // market events, newest first
  const stats: Record<string, unknown>[] = []; // /strategies/stats rows
  const mcpTokens = new Map<string, string>(); // mcp token → session id
  const wallets = new Map<string, { account_id: string; private_key: string }>(); // session id → deposit wallet
  const deals = new Map<string, { session: string; seed: string; commitment: string; played: boolean }>();
  const hands: { session: string; id: string; record: unknown }[] = [];
  type LiveRow = { session_id: string; status: string; to_act: number; updated_at: number; data: unknown };
  const liveHands = new Map<string, LiveRow>(); // hand_id → row
  type PendingRow = Record<string, unknown> & { hand_id: string; agent: string; revealed: boolean };
  const pending = new Map<string, PendingRow>(); // hand_id → row (one unrevealed per agent)
  const autoplay = new Map<string, { on: boolean; autoplay: unknown }>(); // session id → autoplay
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fake = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (!url.startsWith(BACKEND)) {
      if (!fallthrough) throw new Error(`Unexpected request to ${url}`);
      return fallthrough(input, init);
    }
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer test-token") return json({}, 401);
    const [path, query = ""] = url.slice(BACKEND.length).split("?");
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

    // Pending reveals (global, by hand id), joined with the deal's seed like the real backend.
    if (path === "/pending" && method === "GET") {
      const agent = new URLSearchParams(query).get("agent");
      const r = [...pending.values()].find((x) => x.agent === agent && !x.revealed);
      return json({ hand: r ? pendingOut(r) : null });
    }
    if (path.startsWith("/pending/")) {
      const [, , pid, verb] = path.split("/");
      const r = pending.get(pid);
      if (verb === "reveal") {
        if (!r || r.revealed) return json({ detail: "Unknown" }, 404);
        r.revealed = true;
        return json({ ok: true });
      }
      if (method === "PUT") {
        if (!sessions.has(body.session_id) || !deals.has(pid)) return json({ detail: "Unknown" }, 404);
        if (r || [...pending.values()].some((x) => x.agent === body.agent && !x.revealed)) return json({}, 409);
        pending.set(pid, { ...body, hand_id: pid, created_at: Date.now(), revealed: false });
        return json({ ok: true }, 201);
      }
      return r && !r.revealed ? json(pendingOut(r)) : json({ detail: "Unknown" }, 404);
    }
    if (path === "/autoplay") return json({ sessions: [...autoplay].filter(([, a]) => a.on).map(([id]) => id) });

    if (path === "/strategies" && method === "POST") {
      if (strategies.has(body.id) || [...strategies.values()].some((x) => x.name === body.name)) return json({}, 409);
      strategies.set(body.id, body);
      return json({ ok: true }, 201);
    }
    if (path === "/strategies" && method === "GET")
      return json({ strategies: [...strategies.values()].map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "params" && k !== "salt"))) });
    if (path === "/strategies/stats") return json({ stats });
    if (path.startsWith("/strategies/") && path.endsWith("/params")) {
      const st = strategies.get(sid);
      return st ? json({ params: st.params, salt: st.salt, params_hash: st.params_hash }) : json({}, 404);
    }
    if (path === "/market/events" && method === "POST") {
      const e = { id: events.length + 1, created_at: new Date().toISOString(), counterparty: null, price_yocto: null, amount: null, reason: null, chat_id: null, tx: null, ...body };
      events.unshift(e);
      return json({ id: e.id }, 201);
    }
    if (path === "/market/events") {
      const sidQ = new URLSearchParams(query).get("strategy_id");
      return json({ events: events.filter((e) => !sidQ || e.strategy_id === sidQ) });
    }
    if (path === "/market/prune") return json({ deleted: 0 });

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
      return json({ account_id: agents.get(sid) ?? null, private_key: agentKeys.get(sid) ?? null, strategy_id: agentStrategies.get(sid) ?? null });
    }
    if (kind === "agent" && method === "PUT") {
      agents.set(sid, body.account_id);
      if (body.private_key) agentKeys.set(sid, body.private_key);
      if (body.mcp_token) mcpTokens.set(body.mcp_token, sid);
      if (body.strategy_id) agentStrategies.set(sid, body.strategy_id);
      else agentStrategies.delete(sid);
      return json({ ok: true });
    }
    if (kind === "wallet" && method === "GET") return json(wallets.get(sid) ?? { account_id: null, private_key: null });
    if (kind === "wallet" && method === "PUT") {
      wallets.set(sid, {
        account_id: body.account_id,
        private_key: body.private_key,
      });
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
    if (kind === "autoplay" && method === "GET") return json(autoplay.get(sid) ?? { on: false, autoplay: null });
    if (kind === "autoplay" && method === "PUT") {
      autoplay.set(sid, { on: body.on ?? autoplay.get(sid)?.on ?? false, autoplay: body.autoplay ?? autoplay.get(sid)?.autoplay ?? null });
      return json({ ok: true });
    }
    if (kind === "hands" && method === "POST") {
      if (!hands.some((h) => h.id === body.id)) hands.unshift({ session: sid, id: body.id, record: body.record });
      return json({ ok: true }, 201);
    }
    if (kind === "hands") {
      const mode = new URLSearchParams(query).get("mode");
      const records = hands.filter((h) => h.session === sid).map((h) => h.record as { mode?: string });
      return json({ hands: records.filter((r) => !mode || (r.mode ?? "real") === mode) });
    }
    return json({ detail: "Not found" }, 404);
  });

  function pendingOut(r: PendingRow) {
    const d = deals.get(r.hand_id)!;
    return { ...r, revealed: undefined, seed: d.seed, commitment: d.commitment };
  }

  vi.stubGlobal("fetch", fake);
  /** Create a session directly, as if a browser had visited before (optionally signed in). */
  const seedSession = (id: string, userId?: string, agent?: string, agentKey?: string) => {
    sessions.set(id, {});
    if (userId) users.set(id, userId);
    if (agent) agents.set(id, agent);
    if (agentKey) agentKeys.set(id, agentKey);
  };
  /** Give a session a deposit wallet directly. */
  const seedWallet = (id: string, account: string, key: string) =>
    wallets.set(id, { account_id: account, private_key: key });
  /** Bind a session's agent to a market strategy, or give it an MCP token. */
  const seedAgentStrategy = (id: string, strategyId: string) => agentStrategies.set(id, strategyId);
  const seedMcpToken = (id: string, token: string) => mcpTokens.set(token, id);
  return { fake, pending, autoplay, seedSession, seedWallet, seedAgentStrategy, seedMcpToken, strategies, events, stats };
}

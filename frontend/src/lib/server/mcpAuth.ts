import { AsyncLocalStorage } from "node:async_hooks";
import { sessionByToken } from "./sessions";

/**
 * MCP auth: an external agent presents its `mcp_token` as a Bearer token on every
 * request. We resolve it to the deployed agent once per request and stash it in
 * async-local storage so each tool can read it without threading it through.
 */
export type McpAuth = { sessionId: string; agent: string; agentKey: string };

const context = new AsyncLocalStorage<McpAuth>();

/** Run `fn` with the request's resolved agent available to tools via `requireAuth`. */
export function withAuth<T>(auth: McpAuth, fn: () => T): T {
  return context.run(auth, fn);
}

/** The authenticated agent for the current MCP request. Throws if called outside one. */
export function requireAuth(): McpAuth {
  const auth = context.getStore();
  if (!auth) throw new Error("No authenticated agent on this request");
  return auth;
}

/** Resolve the Bearer token to a deployed agent, or null if missing/unknown/not deployed. */
export async function authFromRequest(request: Request): Promise<McpAuth | null> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token || !/^[0-9a-f]{32,64}$/.test(token)) return null;
  const s = await sessionByToken(token);
  if (!s?.agent || !s.agentKey) return null;
  return { sessionId: s.id, agent: s.agent, agentKey: s.agentKey };
}

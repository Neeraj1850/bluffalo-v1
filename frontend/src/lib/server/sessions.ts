import type { NextResponse } from "next/server";
import { backend } from "./backend";
import { createWallet } from "./near";

export const SESSION_COOKIE = "np_session";
const MAX_STATE_BYTES = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Session = { id: string; state: Record<string, unknown>; created: boolean };

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The caller's session from its cookie; a new one if missing or unknown. */
export async function sessionFrom(request: Request): Promise<Session> {
  const id = readCookie(request);
  if (id && UUID.test(id)) {
    const found = await backend<{ state: Record<string, unknown> }>(`/sessions/${id}`);
    if (found) return { id, state: found.state, created: false };
  }
  return freshSession();
}

/** Set the cookie on the response when the session is new (or switched). */
export function withSession<T extends NextResponse>(res: T, session: Session): T {
  if (session.created) {
    res.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

/** Untrusted input: must be a plain object and small. Returns it, or an error message. */
export function parseState(body: unknown): Record<string, unknown> | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "State must be a JSON object";
  if (JSON.stringify(body).length > MAX_STATE_BYTES) return "State is too large";
  return body as Record<string, unknown>;
}

/** The signed-in Privy user for this session, if any. */
export async function sessionUser(id: string): Promise<string | null> {
  return (await backend<{ user_id: string | null }>(`/sessions/${id}/user`))?.user_id ?? null;
}

/**
 * Tie the session to a signed-in user. Returns the session to use from now on —
 * the user's existing one if they've signed in before — and always resets the cookie.
 */
export async function linkUser(id: string, userId: string): Promise<Session> {
  const linked = await backend<{ id: string; state: Record<string, unknown> }>(`/sessions/${id}/user`, {
    method: "POST",
    body: { user_id: userId },
  });
  return { id: linked!.id, state: linked!.state, created: true };
}

/** A brand-new anonymous session (sign out). */
export async function freshSession(): Promise<Session> {
  const { id } = (await backend<{ id: string }>("/sessions", { method: "POST" }))!;
  return { id, state: {}, created: true };
}

/** The agent's NEAR account for this session (set by the server at deploy). */
export async function sessionAgent(id: string): Promise<string | null> {
  return (await backend<{ account_id: string | null }>(`/sessions/${id}/agent`))?.account_id ?? null;
}

/** The agent's withdraw-only key, for cash-outs. Server-side only. */
export async function sessionAgentKey(id: string): Promise<string | null> {
  return (await backend<{ private_key: string | null }>(`/sessions/${id}/agent`))?.private_key ?? null;
}

/** The market strategy the session's agent is licensed to, if any (its params stay server-side). */
export async function sessionAgentStrategy(id: string): Promise<string | null> {
  return (await backend<{ strategy_id?: string | null }>(`/sessions/${id}/agent`))?.strategy_id ?? null;
}

export async function setSessionAgent(id: string, accountId: string, privateKey: string, mcpToken?: string, strategyId?: string) {
  await backend(`/sessions/${id}/agent`, {
    method: "PUT",
    body: { account_id: accountId, private_key: privateKey, mcp_token: mcpToken, strategy_id: strategyId },
  });
}

export type TokenSession = { id: string; userId: string | null; agent: string | null; agentKey: string | null };

/** Resolve an external agent's MCP token to its session, or null. Server-side only. */
export async function sessionByToken(token: string): Promise<TokenSession | null> {
  const r = await backend<{ id: string; user_id: string | null; agent_account: string | null; agent_key: string | null }>(
    `/sessions/by-token/${token}`,
  );
  return r ? { id: r.id, userId: r.user_id, agent: r.agent_account, agentKey: r.agent_key } : null;
}

export async function saveState(id: string, state: Record<string, unknown>) {
  await backend(`/sessions/${id}`, { method: "PUT", body: { state } });
}

export type Wallet = { account: string; key: string };

/** The player's custodial deposit wallet (account + full-access key). Server-side only. */
export async function sessionWallet(id: string): Promise<Wallet | null> {
  const r = await backend<{ account_id: string | null; private_key: string | null }>(`/sessions/${id}/wallet`);
  return r?.account_id && r.private_key ? { account: r.account_id, key: r.private_key } : null;
}

export async function setSessionWallet(id: string, accountId: string, privateKey: string) {
  await backend(`/sessions/${id}/wallet`, { method: "PUT", body: { account_id: accountId, private_key: privateKey } });
}

/** The session's wallet, creating and storing a fresh one on first use. */
export async function ensureSessionWallet(id: string): Promise<Wallet> {
  const existing = await sessionWallet(id);
  if (existing) return existing;
  const { accountId, privateKey } = createWallet();
  await setSessionWallet(id, accountId, privateKey);
  return { account: accountId, key: privateKey };
}

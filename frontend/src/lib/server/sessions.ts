import type { NextResponse } from "next/server";
import { backend } from "./backend";

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
  const fresh = await backend<{ id: string }>("/sessions", { method: "POST" });
  return { id: fresh!.id, state: {}, created: true };
}

/** Set the cookie on the response when the session was just created. */
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

export async function saveState(id: string, state: Record<string, unknown>) {
  await backend(`/sessions/${id}`, { method: "PUT", body: { state } });
}

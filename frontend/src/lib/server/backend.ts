/**
 * The storage backend (`backend/`, FastAPI + Postgres). Server-side only:
 * it carries BACKEND_TOKEN, which must never reach the browser.
 */

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/** JSON request to the backend. Resolves null on 404; throws on any other failure. */
export async function backend<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}) {
  const url = process.env.BACKEND_URL;
  const token = process.env.BACKEND_TOKEN;
  if (!url || !token) throw new BackendError("BACKEND_URL / BACKEND_TOKEN are not set", 500);

  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new BackendError(`Backend ${method} ${path} failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

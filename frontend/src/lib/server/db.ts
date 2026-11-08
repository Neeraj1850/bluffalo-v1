import { Pool } from "pg";

/** The only thing the stores need from Postgres. Tests plug in PGlite. */
export type Db = {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

// On globalThis so dev reloads and separately bundled routes share one pool.
const g = globalThis as typeof globalThis & { __npDb?: Db };

export function db(): Db {
  if (!g.__npDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({ connectionString: url, max: 5 });
    g.__npDb = { query: async (text, params) => ({ rows: (await pool.query(text, params)).rows }) };
  }
  return g.__npDb;
}

/** Swap the connection (tests). */
export function setDb(next: Db) {
  g.__npDb = next;
}

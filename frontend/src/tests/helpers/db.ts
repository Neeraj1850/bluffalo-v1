import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { setDb } from "@/lib/server/db";

const SCHEMA = readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf8");

/** A fresh in-process Postgres with the real schema, wired in as the app's db. */
export async function useTestDb() {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  setDb({ query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query<T>(text, params)).rows }) });
  return pg;
}

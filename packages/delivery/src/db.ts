import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string, max = 10): { pool: Pool; db: Db } {
  const pool = new Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
  return { pool, db: drizzle(pool, { schema }) };
}

import "server-only";
import { Pool } from "pg";

// One pool per server process. The app signs in as fernway_app (db/migrations), never as the database owner.
const globalForPool = globalThis as unknown as { fernwayPool?: Pool };

export function db(): Pool {
  if (!globalForPool.fernwayPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPool.fernwayPool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForPool.fernwayPool;
}

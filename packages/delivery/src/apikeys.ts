// Fernway API keys: "fw_<prefix>_<secret>". Only the secret's SHA-256 is stored, compared in constant time; the prefix
// finds the row and names the key in lists. A key is shown once, when made. Revoked keys stop at once.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { apiKeys } from "./schema.js";

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
const pick = (n: number) => Array.from(randomBytes(n), (b) => ALPHA[b % 36]).join("");
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

export async function createApiKey(db: Db, accountId: number, label: string) {
  const prefix = pick(8);
  const secret = pick(32);
  await db.insert(apiKeys).values({ accountId, prefix, secretHash: hash(secret), label });
  return { key: `fw_${prefix}_${secret}`, prefix };
}

/** The account a key belongs to, or null (wrong shape, unknown, wrong secret, revoked). Notes when it was last used. */
export async function accountForKey(db: Db, raw: string | null | undefined): Promise<number | null> {
  const m = raw?.trim().match(/^fw_([a-z0-9]{8})_([a-z0-9]{32})$/);
  if (!m) return null;
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.prefix, m[1]!), isNull(apiKeys.revokedAt)));
  if (!row) return null;
  const given = Buffer.from(hash(m[2]!), "hex");
  if (!timingSafeEqual(given, Buffer.from(row.secretHash, "hex"))) return null;
  // At most once a minute, so a busy key doesn't write on every lead.
  await db.update(apiKeys).set({ lastUsedAt: sql`now()` })
    .where(and(eq(apiKeys.id, row.id), sql`(${apiKeys.lastUsedAt} is null or ${apiKeys.lastUsedAt} < now() - interval '1 minute')`));
  return row.accountId;
}

export async function revokeApiKey(db: Db, prefix: string): Promise<boolean> {
  const r = await db.update(apiKeys).set({ revokedAt: sql`now()` }).where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  return r.length > 0;
}

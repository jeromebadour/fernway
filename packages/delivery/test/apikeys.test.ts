import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountForKey, createApiKey, revokeApiKey } from "../src/apikeys.js";
import { apiKeys } from "../src/schema.js";
import { createDb, freshDatabase, seedAccount } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let accountId: number;

beforeAll(async () => {
  database = await freshDatabase("apikeys");
  app = createDb(database.appUrl, 2);
  const owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
  await owner.pool.end();
});
afterAll(async () => {
  await app.pool.end();
  await database.drop();
});

describe("API keys", () => {
  it("opens its own account, and keeps only a hash of the secret", async () => {
    const { key, prefix } = await createApiKey(app.db, accountId, "Website");
    expect(key).toMatch(/^fw_[a-z0-9]{8}_[a-z0-9]{32}$/);
    expect(await accountForKey(app.db, key)).toBe(accountId);
    expect(await accountForKey(app.db, `  ${key} `)).toBe(accountId);
    const [row] = await app.db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix));
    expect(JSON.stringify(row)).not.toContain(key.split("_")[2]);
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it("refuses a wrong secret, a wrong shape, nothing, and a revoked key", async () => {
    const { key, prefix } = await createApiKey(app.db, accountId, "To revoke");
    const wrong = key.slice(0, -4) + (key.endsWith("aaaa") ? "bbbb" : "aaaa");
    for (const k of [wrong, "fw_short_x", "", null, undefined, key.toUpperCase()]) expect(await accountForKey(app.db, k)).toBeNull();
    expect(await revokeApiKey(app.db, prefix)).toBe(true);
    expect(await accountForKey(app.db, key)).toBeNull();
    expect(await revokeApiKey(app.db, prefix)).toBe(false);
  });
});

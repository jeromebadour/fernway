import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { purgeExpired } from "../src/retention.js";
import { scans, shipments } from "../src/schema.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let accountId: number;
let n = 0;

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("retention");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
});
afterAll(async () => {
  ghl.server.close();
  await app.pool.end();
  await owner.pool.end();
  await database.drop();
});
beforeEach(async () => {
  ghl.reset();
  await owner.db.delete(shipments);
});

/** A signed lead, aged by `days` (as the owner: the app itself can't move a shipment's birth date). */
async function lead(email: string, days: number) {
  const { deps } = testDeps(app.db, fakeConnection());
  const r = await ingestLead(deps, accountId, { idempotencyKey: `keep-${++n}-xxxxxx`, source: "form", route: "trial", contact: { email } });
  if (!r.ok) throw new Error(r.problems.join());
  await deliverTry(deps, r.waybill.id, 1);
  await owner.db.update(shipments).set({ createdAt: sql`now() - make_interval(days => ${days})` }).where(eq(shipments.id, r.waybill.id));
  return r.waybill.id;
}

describe("30-day retention of the public forms' leads", () => {
  it("removes an old lead from GHL first, then from Fernway with its scans; a young one stays", async () => {
    const old = await lead("old@b.example", 31);
    const young = await lead("young@b.example", 2);
    const { deps } = testDeps(app.db, fakeConnection());
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 1, waiting: 0 });
    expect(ghl.deleted).toEqual(["opportunities/o_1", "contacts/c_1"]);
    expect(await app.db.select().from(shipments).where(eq(shipments.id, old))).toHaveLength(0);
    expect(await app.db.select().from(scans).where(eq(scans.shipmentId, old))).toHaveLength(0);
    expect(await app.db.select().from(shipments).where(eq(shipments.id, young))).toHaveLength(1);
  });

  it("keeps a lead whose GHL copy couldn't be removed, and tries again next run", async () => {
    const old = await lead("down@b.example", 40);
    ghl.deleteAnswers.push(503);
    const { deps } = testDeps(app.db, fakeConnection());
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 0, waiting: 1 });
    expect(await app.db.select().from(shipments).where(eq(shipments.id, old))).toHaveLength(1);
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 1, waiting: 0 });
  });

  it("keeps a lead while GHL is disconnected, and counts something already gone from GHL as removed", async () => {
    await lead("gone@b.example", 35);
    expect(await purgeExpired(testDeps(app.db, null).deps, accountId)).toEqual({ removed: 0, waiting: 1 });
    ghl.deleteAnswers.push(404, 404);
    expect(await purgeExpired(testDeps(app.db, fakeConnection()).deps, accountId)).toEqual({ removed: 1, waiting: 0 });
  });

  it("leaves the contact and opportunity in GHL that a newer lead still uses", async () => {
    await lead("same@b.example", 33);
    const newer = await lead("same@b.example", 1);
    const { deps } = testDeps(app.db, fakeConnection());
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 1, waiting: 0 });
    expect(ghl.deleted).toEqual([]);
    expect(await app.db.select().from(shipments).where(eq(shipments.id, newer))).toHaveLength(1);
  });
});

describe("retention and the message note", () => {
  it("removes an old lead's note from a contact a newer lead keeps", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    const r = await ingestLead(deps, accountId, { idempotencyKey: `note-keep-${++n}-x`, source: "form", route: "trial", contact: { email: "msg@b.example", message: "Old question" } });
    if (!r.ok) throw new Error();
    await deliverTry(deps, r.waybill.id, 1);
    await owner.db.update(shipments).set({ createdAt: sql`now() - make_interval(days => 40)` }).where(eq(shipments.id, r.waybill.id));
    await lead("msg@b.example", 1);
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 1, waiting: 0 });
    expect(ghl.deleted).toEqual(["contacts/c_1/notes/n_1"]);
  });
});

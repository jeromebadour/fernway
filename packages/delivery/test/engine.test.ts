import { MAX_TRIES, RETRY_WAITS_MS } from "@fernway/core";
import { asc, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead, resend, sweep } from "../src/engine.js";
import { scans, shipments } from "../src/schema.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let handle: ReturnType<typeof createDb>;
let accountId: number;
let n = 0;

const lead = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `form-${Date.now()}-${++n}`,
  source: "form",
  route: "trial",
  contact: { firstName: "Lena", lastName: "Hartmann", email: `lena${n}@northpine.dental`, companyName: "Northpine Dental" },
  ...over,
});

async function kinds(id: number) {
  const rows = await handle.db.select({ kind: scans.kind }).from(scans).where(eq(scans.shipmentId, id)).orderBy(asc(scans.id));
  return rows.map((r) => r.kind);
}
async function shipment(id: number) {
  const [s] = await handle.db.select().from(shipments).where(eq(shipments.id, id));
  return s!;
}

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("engine");
  // The engine runs as the app's own role, as it does on the box.
  handle = createDb(database.appUrl, 4);
  const owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
  await owner.pool.end();
});
afterAll(async () => {
  ghl.server.close();
  await handle.pool.end();
  await database.drop();
});
beforeEach(() => ghl.reset());

describe("picking up a lead", () => {
  it("checks it, numbers it and queues the first try at once", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waybill.number).toMatch(/^FW \d{2} \d{5}$/);
    expect(r.waybill.state).toBe("picked_up");
    expect(await kinds(r.waybill.id)).toEqual(["picked_up", "checked"]);
    expect(scheduled).toEqual([{ shipmentId: r.waybill.id, tryNumber: 1, delayMs: 0 }]);
  });

  it("makes one shipment of the same lead sent twice", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const input = lead();
    const a = await ingestLead(deps, accountId, input);
    const b = await ingestLead(deps, accountId, input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.duplicate).toBe(true);
    expect(b.waybill.number).toBe(a.waybill.number);
    expect(scheduled).toHaveLength(1);
  });

  it("refuses a lead GHL couldn't match, with a reason the sender can act on", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead({ contact: { firstName: "No Contact" } }));
    expect(r).toEqual({ ok: false, problems: ["contact: an email or a phone number, so GHL can match the contact"] });
    const bad = await ingestLead(deps, accountId, lead({ contact: { email: "not-an-email" } }));
    expect(bad.ok).toBe(false);
    const route = await ingestLead(deps, accountId, lead({ route: "nowhere" }));
    expect(route).toEqual({ ok: false, problems: ['route: no route called "nowhere"'] });
  });

  it("cleans a phone number for GHL", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead({ contact: { phone: "+1 (503) 555-0142" } }));
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect((await shipment(r.waybill.id)).contact.phone).toBe("+15035550142");
  });
});

describe("delivering", () => {
  it("signs for a lead on the first try: contact, then the route's stage", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("signed");
    const s = await shipment(r.waybill.id);
    expect(s.state).toBe("signed");
    expect(s.ghlContactId).toMatch(/^c_/);
    expect(s.ghlOpportunityId).toMatch(/^o_/);
    expect(await kinds(r.waybill.id)).toEqual(["picked_up", "checked", "handed", "signed"]);
    const [contactCall, oppCall] = ghl.requests;
    expect(contactCall!.body).toMatchObject({ locationId: "loc_fake", email: expect.any(String), tags: ["trial"] });
    expect(contactCall!.auth).toBe("Bearer token-0");
    expect(oppCall!.body).toMatchObject({ pipelineId: "pipe_sales", pipelineStageId: "stage_trial", contactId: s.ghlContactId });
  });

  it("signs for a contact-only route after the contact", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead({ route: "contact-only" }));
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("signed");
    expect(ghl.requests.map((q) => q.path)).toEqual(["contact"]);
  });

  it("waits and tries again when GHL says too many requests", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    ghl.fail("contact", { status: 429 });
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("waiting");
    const waiting = await shipment(r.waybill.id);
    expect(waiting.state).toBe("waiting");
    expect(waiting.nextTryAt).not.toBeNull();
    expect(scheduled.at(-1)).toEqual({ shipmentId: r.waybill.id, tryNumber: 2, delayMs: 30_000 });
    const [retry] = await handle.db.select().from(scans).where(eq(scans.kind, "retry_scheduled")).orderBy(asc(scans.id));
    expect(retry!.answerStatus).toBe(429);
    expect(retry!.note).toBe("try 2 of 8 in 30 s");
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("signed");
  });

  it("never makes a second contact: a try after a failed stage reuses the contact GHL already gave", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    ghl.fail("opportunity", { status: 503 });
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("waiting");
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("signed");
    expect(ghl.requests.filter((q) => q.path === "contact")).toHaveLength(1);
    expect(ghl.contacts.size).toBe(1);
    expect(ghl.opportunities.size).toBe(1);
  });

  it("never makes a second contact when GHL took the lead but its answer was lost", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    // The first answer arrives too late (GHL did the work); the retry upserts the same contact.
    ghl.fail("contact", { status: 200, delayMs: 400 });
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("waiting");
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("signed");
    expect(ghl.contacts.size).toBe(1);
  });

  it("holds a lead GHL refuses for its data, at once, with the reason", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    ghl.fail("contact", { status: 422, body: { message: "phone is invalid" } });
    scheduled.length = 0;
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("held");
    const s = await shipment(r.waybill.id);
    expect(s.state).toBe("held");
    expect(s.holdReason).toContain("GHL refused the contact (422)");
    expect(s.holdReason).toContain("phone is invalid");
    expect(scheduled).toEqual([]);
  });

  it("refreshes the token after a 401 and tries again", async () => {
    const conn = fakeConnection();
    const { deps } = testDeps(handle.db, conn);
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    ghl.fail("contact", { status: 401 });
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("waiting");
    expect(conn.refreshes).toBe(1);
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("signed");
    expect(ghl.requests.at(-2)!.auth).toBe("Bearer token-1");
  });

  it("tries 8 times over 24 h on the promised schedule, then returns the waybill", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    scheduled.length = 0;
    for (let t = 1; t <= MAX_TRIES; t++) {
      ghl.fail("contact", { status: 500 });
      expect(await deliverTry(deps, r.waybill.id, t)).toBe(t < MAX_TRIES ? "waiting" : "returned");
    }
    expect(scheduled.map((s) => s.delayMs)).toEqual([...RETRY_WAITS_MS]);
    const s = await shipment(r.waybill.id);
    expect(s.state).toBe("returned");
    expect(s.tries).toBe(8);
    const all = await kinds(r.waybill.id);
    expect(all.filter((k) => k === "retry_scheduled")).toHaveLength(7);
    expect(all.at(-1)).toBe("returned");
  });

  it("holds the lead, not the worker, when the account has no GHL connection", async () => {
    const { deps } = testDeps(handle.db, null);
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("held");
    expect((await shipment(r.waybill.id)).holdReason).toBe("GHL is not connected for this account");
    expect(ghl.requests).toHaveLength(0);
  });
});

describe("repeated, late and lost jobs", () => {
  it("does nothing for a try that already ran or isn't due", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("skipped");
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("signed");
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("skipped");
    expect(ghl.requests).toHaveLength(2);
  });

  it("puts overdue shipments back on the queue (the safety net if Redis lost them)", async () => {
    const owner = createDb(database.url, 1);
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    await owner.db.update(shipments).set({ nextTryAt: new Date(Date.now() - 10 * 60_000) }).where(eq(shipments.id, r.waybill.id));
    await owner.pool.end();
    scheduled.length = 0;
    expect(await sweep(deps)).toBeGreaterThanOrEqual(1);
    expect(scheduled).toContainEqual({ shipmentId: r.waybill.id, tryNumber: 1, delayMs: 0 });
  });

  it("resends a held waybill with a fresh set of tries, on the receipt", async () => {
    const { deps, scheduled } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, lead());
    if (!r.ok) throw new Error();
    ghl.fail("contact", { status: 400 });
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("held");
    scheduled.length = 0;
    expect(await resend(deps, r.waybill.id)).toBe(true);
    expect(scheduled).toEqual([{ shipmentId: r.waybill.id, tryNumber: 1, delayMs: 0 }]);
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("signed");
    expect(await kinds(r.waybill.id)).toEqual(["picked_up", "checked", "held", "resent", "handed", "signed"]);
    expect(await resend(deps, r.waybill.id)).toBe(false);
  });
});

describe("the receipt can't be rewritten", () => {
  it("lets the app add scans but never change or remove one", async () => {
    const app = new Client({ connectionString: database.appUrl });
    await app.connect();
    await expect(app.query("update scans set note = 'edited'")).rejects.toThrow(/permission denied/);
    await expect(app.query("delete from scans")).rejects.toThrow(/permission denied/);
    await app.end();
  });
});

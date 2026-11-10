import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { purgeExpired } from "../src/retention.js";
import { shipments } from "../src/schema.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let accountId: number;
let n = 0;
const slot = "2026-11-12T14:00:00.000Z";
const demo = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `demo-${++n}-xxxxxx`, source: "form", route: "demo", slot,
  contact: { firstName: "Mara", lastName: "Okafor", email: `mara${n}@harborline.example` }, ...over,
});

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("booking");
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
beforeEach(() => ghl.reset());

describe("booking a demo", () => {
  it("needs a time on a booking route, and refuses one on a route that books nothing", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    const none = await ingestLead(deps, accountId, demo({ slot: undefined }));
    expect(none).toEqual({ ok: false, problems: ["slot: a time for the meeting"] });
    const wrong = await ingestLead(deps, accountId, demo({ route: "trial" }));
    expect(wrong.ok).toBe(false);
    const bad = await ingestLead(deps, accountId, demo({ slot: "next tuesday" }));
    expect(bad.ok).toBe(false);
  });

  it("books the meeting between the contact and the opportunity, once, even when a later step is retried", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    ghl.fail("opportunity", { status: 503 });
    const r = await ingestLead(deps, accountId, demo());
    if (!r.ok) throw new Error(r.problems.join());
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("waiting");
    expect(await deliverTry(deps, r.waybill.id, 2)).toBe("signed");
    expect(ghl.requests.map((q) => q.path)).toEqual(["contact", "appointment", "opportunity", "opportunity"]);
    expect(ghl.appointments).toHaveLength(1);
    expect(ghl.appointments[0]).toMatchObject({ calendarId: "cal_demo", contactId: "c_1", startTime: slot, locationId: "loc_fake", title: "Demo · Mara Okafor" });
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, r.waybill.id));
    expect(s!.ghlAppointmentId).toBe("a_1");
  });

  it("holds the lead with GHL's reason when the time is no longer free", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    ghl.fail("appointment", { status: 422, body: { message: "The slot you have selected is no longer available." } });
    const r = await ingestLead(deps, accountId, demo());
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("held");
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, r.waybill.id));
    expect(s!.holdReason).toContain("GHL refused the appointment (422)");
    expect(s!.holdReason).toContain("no longer available");
  });

  it("reads free times as one sorted list, skipping anything in GHL's answer that isn't a day", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    ghl.setFreeSlots({
      "2026-11-13": { slots: ["2026-11-13T09:00:00-05:00"] },
      "2026-11-12": { slots: ["2026-11-12T15:30:00-05:00", "2026-11-12T09:00:00-05:00"] },
    });
    const from = new Date("2026-11-12T00:00:00Z");
    const to = new Date("2026-11-14T00:00:00Z");
    expect(await deps.ghl.freeSlots(fakeConnection(), "cal_demo", from, to)).toEqual([
      "2026-11-12T09:00:00-05:00", "2026-11-12T15:30:00-05:00", "2026-11-13T09:00:00-05:00",
    ]);
    expect(ghl.freeSlotAsks[0]).toEqual({ startDate: String(from.getTime()), endDate: String(to.getTime()), timezone: "UTC" });
  });

  it("removes the meeting from GHL's calendar when the lead's 30 days are up", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    const r = await ingestLead(deps, accountId, demo());
    if (!r.ok) throw new Error();
    await deliverTry(deps, r.waybill.id, 1);
    await owner.db.update(shipments).set({ createdAt: sql`now() - make_interval(days => 31)` }).where(eq(shipments.id, r.waybill.id));
    expect(await purgeExpired(deps, accountId)).toEqual({ removed: 1, waiting: 0 });
    expect(ghl.deleted[0]).toBe("calendars/events/a_1");
  });
});

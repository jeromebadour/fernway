// Alert emails against a real database: who hears, how often, what the email says, retries and giving up.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALERT_WAITS_MIN, mondayAt8, noteLeadAlerts, noteWeeklyAlerts, sendDueAlerts, weekView } from "../src/alerts.js";
import { keyFrom } from "../src/crypto.js";
import type { Mail } from "../src/mail.js";
import { signUp } from "../src/people.js";
import { alerts, routes, scans, shipments, users } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

const KEY = keyFrom("b".repeat(64));
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let n = 0;
let box: Mail[] = [];
let failNext = 0;
const send = async (m: Mail) => { if (failNext > 0) { failNext--; return { ok: false, why: "Resend answered 503: busy" }; } box.push(m); return { ok: true }; };
const ctx = () => ({ db: app.db, send, key: KEY, appUrl: "https://fernway.test" });

beforeAll(async () => {
  database = await freshDatabase("alerts");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
});
beforeEach(async () => { box = []; failNext = 0; await app.db.delete(alerts); await owner.db.delete(shipments); });
afterAll(async () => {
  await app.pool.end();
  await owner.pool.end();
  await database.drop();
});

async function account(o: { confirmed?: boolean; held?: boolean; returned?: boolean; weekly?: boolean; tz?: string } = {}) {
  const email = `maya${++n}@harborphysio.com`;
  const r = await signUp(app.db, { email, name: "Maya Lindqvist", company: `Harbor Physio ${n}`, password: "northpine-2026!", timeZone: o.tz ?? "Europe/London" });
  if (!r.ok) throw new Error(r.problems.join());
  await app.db.update(users).set({
    emailConfirmedAt: o.confirmed === false ? null : new Date(), emailHeld: o.held ?? true, emailReturned: o.returned ?? true, emailWeekly: o.weekly ?? false,
  }).where(eq(users.id, r.userId));
  const [route] = await app.db.insert(routes).values({ accountId: r.accountId, key: "booking", label: "Booking requests" }).returning();
  return { ...r, email, routeId: route!.id };
}
async function lead(a: { accountId: number; routeId: number }, state: "held" | "returned" | "signed", at = new Date()) {
  const [s] = await app.db.insert(shipments).values({
    accountId: a.accountId, routeId: a.routeId, waybillYear: 26, waybillSeq: 50000 + ++n, idempotencyKey: `alert-${n}-xxxxxx`, source: "form",
    contact: { firstName: "Tom", lastName: "Whitfield", email: "tom@cedarlanevets.com" }, state,
    holdReason: state === "held" ? '{"message":"The email address is invalid"}' : null, createdAt: at, updatedAt: at,
  }).returning();
  return s!;
}

describe("who hears about a held or returned lead", () => {
  it("each confirmed person who kept that email on, once per lead, however many runs", async () => {
    const a = await account();
    const s = await lead(a, "held");
    expect(await noteLeadAlerts(app.db, [])).toBe(1);
    expect(await noteLeadAlerts(app.db, [])).toBe(0);
    expect(await sendDueAlerts(ctx())).toEqual({ sent: 1, failed: 0, gaveUp: 0 });
    expect(await sendDueAlerts(ctx())).toEqual({ sent: 0, failed: 0, gaveUp: 0 });
    // Resent and held again: still one email for that lead.
    await app.db.update(shipments).set({ state: "held", updatedAt: new Date() }).where(eq(shipments.id, s.id));
    expect(await noteLeadAlerts(app.db, [])).toBe(0);
    expect(box).toHaveLength(1);
  });

  it("not an unconfirmed address, not someone who turned it off, not a skipped account, not a signed lead, not old news", async () => {
    const unconfirmed = await account({ confirmed: false }); await lead(unconfirmed, "held");
    const off = await account({ held: false }); await lead(off, "held");
    const onlyHeldOff = await account({ held: false }); await lead(onlyHeldOff, "returned");
    const skipped = await account(); await lead(skipped, "held");
    const fine = await account(); await lead(fine, "signed");
    const old = await account(); await lead(old, "held", new Date(Date.now() - 3 * 86_400_000));
    expect(await noteLeadAlerts(app.db, [skipped.accountId])).toBe(1);
    const [row] = await app.db.select().from(alerts);
    expect(row).toMatchObject({ userId: onlyHeldOff.userId, kind: "returned" });
  });
});

describe("what the emails say", () => {
  it("held: the waybill, the lead, the route, when, and GHL's reason in words; the receipt link; how to turn it off", async () => {
    const a = await account();
    await app.db.update(users).set({ dateStyle: "iso", clock: "24h" }).where(eq(users.id, a.userId));
    const s = await lead(a, "held", new Date("2026-11-10T13:05:00Z"));
    await app.db.update(shipments).set({ updatedAt: new Date() }).where(eq(shipments.id, s.id));
    await noteLeadAlerts(app.db, []);
    await sendDueAlerts(ctx());
    const m = box[0]!;
    expect(m.to).toBe(a.email);
    expect(m.subject).toBe(`Held: FW 26 ${String(s.waybillSeq).padStart(5, "0")} needs you`);
    expect(m.text).toMatch(/Lead\s+Tom Whitfield/);
    expect(m.text).toMatch(/Route\s+Booking requests/);
    expect(m.text).toMatch(/GHL said\s+The email address is invalid/);
    expect(m.text).toMatch(/Held\s+\d{4}-\d{2}-\d{2}, \d{2}:\d{2}/);
    expect(m.text).toMatch(/Open the receipt: https:\/\/fernway\.test\/track\/\S+/);
    expect(m.text).toContain("Turn it off in Preferences: https://fernway.test/account/preferences");
    expect(m.html).not.toContain("{\"message\"");
  });

  it("returned: GHL's last answer", async () => {
    const a = await account();
    const s = await lead(a, "returned");
    await app.db.insert(scans).values({ shipmentId: s.id, kind: "retry_scheduled", try: 8, answerStatus: 503 });
    await noteLeadAlerts(app.db, []);
    await sendDueAlerts(ctx());
    expect(box[0]!.subject).toMatch(/^Returned: FW 26 \d{5} went unanswered$/);
    expect(box[0]!.text).toMatch(/Last answer\s+503/);
  });
});

describe("sending", () => {
  it("a failed send waits longer each time and gives up after 8 tries, never sending twice", async () => {
    const a = await account();
    await lead(a, "held");
    await noteLeadAlerts(app.db, []);
    failNext = 99;
    for (let t = 1; t <= 8; t++) {
      await owner.db.update(alerts).set({ nextAt: sql`now() - interval '1 second'` });
      const r = await sendDueAlerts(ctx());
      expect(r).toEqual(t < 8 ? { sent: 0, failed: 1, gaveUp: 0 } : { sent: 0, failed: 0, gaveUp: 1 });
      const [row] = await app.db.select().from(alerts);
      expect(row!.tries).toBe(t);
      if (t < 8) expect(row!.nextAt.getTime() - Date.now()).toBeGreaterThan(ALERT_WAITS_MIN[t - 1]! * 60_000 - 5_000);
    }
    const [row] = await app.db.select().from(alerts);
    expect(row).toMatchObject({ sentAt: null, lastError: "Resend answered 503: busy" });
    expect(row!.givenUpAt).not.toBeNull();
    expect(box).toHaveLength(0);
  });

  it("a lead removed before its email goes is given up quietly", async () => {
    const a = await account();
    const s = await lead(a, "held");
    await noteLeadAlerts(app.db, []);
    await app.db.delete(shipments).where(eq(shipments.id, s.id));
    expect(await app.db.select().from(alerts)).toHaveLength(0);
  });
});

describe("Monday's summary", () => {
  it("knows each person's Monday 08:00 in their own zone", () => {
    expect(mondayAt8(new Date("2026-11-16T08:30:00Z"), "Europe/London")).toEqual({ week: "2026-11-16", due: true });
    expect(mondayAt8(new Date("2026-11-16T08:30:00Z"), "Europe/Istanbul")).toEqual({ week: "2026-11-16", due: false });
    expect(mondayAt8(new Date("2026-11-16T05:10:00Z"), "Europe/Istanbul")).toEqual({ week: "2026-11-16", due: true });
    expect(mondayAt8(new Date("2026-11-16T03:00:00Z"), "America/New_York")).toEqual({ week: "2026-11-09", due: false });
    expect(mondayAt8(new Date("2026-11-21T12:00:00Z"), "UTC")).toEqual({ week: "2026-11-16", due: false });
  });

  it("is noted once a week for people who want it, and counts last week's leads by where they ended", async () => {
    const a = await account({ weekly: true, tz: "Europe/London" });
    await account({ weekly: false, tz: "Europe/London" });
    const monday = new Date("2026-11-16T08:20:00Z");
    expect(await noteWeeklyAlerts(app.db, monday)).toBe(1);
    expect(await noteWeeklyAlerts(app.db, new Date("2026-11-16T08:40:00Z"))).toBe(0);
    for (const st of ["signed", "signed", "held", "returned"] as const) await lead(a, st, new Date("2026-11-11T10:00:00Z"));
    await lead(a, "signed", new Date("2026-11-16T09:00:00Z"));
    const v = await weekView(app.db, a.accountId, "2026-11-09", "Europe/London");
    expect(v).toMatchObject({ signed: 2, held: 1, returned: 1 });
    await sendDueAlerts(ctx());
    expect(box.at(-1)!.subject).toBe("Last week: 2 signed for, 1 held, 1 returned");
    expect(box.at(-1)!.text).toMatch(/Signed for\s+2/);
  });
});

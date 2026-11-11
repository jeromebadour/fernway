// The customer console's data against a real database: scoped to one account, counted right, resend audited.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditView, boardView, leadView, resendHeld, resendLead, syncLog } from "../src/console.js";
import { signUp } from "../src/people.js";
import { accounts, routes, scans, shipments } from "../src/schema.js";
import { createDb, freshDatabase, testDeps } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let mine: number, other: number, route: number, otherRoute: number, maya: number;
let seq = 0;

beforeAll(async () => {
  database = await freshDatabase("console");
  app = createDb(database.appUrl, 2);
  const [a] = await app.db.insert(accounts).values({ name: "Harbor Physio" }).returning();
  const [b] = await app.db.insert(accounts).values({ name: "Cedar Lane Vets" }).returning();
  mine = a!.id; other = b!.id;
  const [r] = await app.db.insert(routes).values({ accountId: mine, key: "booking", label: "Booking requests" }).returning();
  const [r2] = await app.db.insert(routes).values({ accountId: other, key: "booking", label: "Booking requests" }).returning();
  route = r!.id; otherRoute = r2!.id;
  const u = await signUp(app.db, { email: "maya@harborphysio.com", name: "Maya Lindqvist", company: "Harbor Physio (own)", password: "northpine-2026!" });
  if (!u.ok) throw new Error(u.problems.join());
  maya = u.userId;
});
afterAll(async () => {
  await app.pool.end();
  await database.drop();
});

async function lead(o: { account?: number; state: "signed" | "held" | "returned" | "waiting" | "in_transit"; reason?: string; name?: string; email?: string; tries?: number; firstTry?: boolean }) {
  const acc = o.account ?? mine;
  const [s] = await app.db.insert(shipments).values({
    accountId: acc, routeId: acc === mine ? route : otherRoute, waybillYear: 26, waybillSeq: 70000 + ++seq, idempotencyKey: `console-${seq}-xxxx`,
    source: "form", contact: { firstName: o.name ?? "Tom", lastName: "Whitfield", email: o.email ?? `tom${seq}@cedarlanevets.com`, companyName: "Cedar Lane" },
    state: o.state, tries: o.tries ?? 1, holdReason: o.state === "held" ? (o.reason ?? '{"message":"The email address is invalid"}') : null,
    createdAt: new Date(Date.now() - 60_000), nextTryAt: o.state === "waiting" ? new Date(Date.now() + 30_000) : null,
  }).returning();
  if (o.state === "signed") await app.db.insert(scans).values({ shipmentId: s!.id, kind: "signed", try: o.firstTry === false ? 2 : 1, at: new Date(Date.now() - 58_000) });
  return s!;
}

describe("the board", () => {
  it("counts this account's leads by where they are, 24 hours of signatures, the oldest waiting and the held reasons", async () => {
    await lead({ state: "signed" }); await lead({ state: "signed", firstTry: false }); await lead({ state: "waiting", tries: 3 });
    await lead({ state: "held" }); await lead({ state: "held" }); await lead({ state: "held", reason: '{"message":"Phone number is not valid"}' });
    await lead({ state: "returned" }); await lead({ state: "in_transit" });
    await lead({ account: other, state: "held" }); await lead({ account: other, state: "signed" });
    const b = await boardView(app.db, mine);
    expect(b).toMatchObject({ moving: 1, waiting: 1, held: 3, returned: 1, signed24h: 2, heldOrReturned24h: 4 });
    expect(b.firstTryShare).toBe(0.5);
    expect(b.medianSignMs).toBeGreaterThan(1000);
    expect(b.perHour).toHaveLength(24);
    expect(b.perHour.at(-1)!.signed).toBe(2);
    expect(b.holdReasons[0]).toMatchObject({ reason: "The email address is invalid", count: 2 });
    expect(b.oldestWaiting).toMatchObject({ waybill: expect.stringMatching(/^FW 26 7\d{4}$/) });
    expect(b.recent.every((r) => r.route === "Booking requests")).toBe(true);
    expect(b.recent).toHaveLength(8);
  });
});

describe("the sync log", () => {
  it("lists only this account's leads, filters by state, finds by waybill, name or email, pages by 15", async () => {
    const found = await lead({ state: "signed", name: "Ingrid", email: "ingrid.moss@fjordline.no" });
    const all = await syncLog(app.db, mine, {});
    expect(all.rows.every((r) => r.route === "Booking requests")).toBe(true);
    expect(all.total).toBe(9);
    expect(all.counts).toEqual({ moving: 1, waiting: 1, signed: 3, held: 3, returned: 1 });
    expect((await syncLog(app.db, mine, { state: "held" })).rows.map((r) => r.reason)).toContain("Phone number is not valid");
    const byWaybill = await syncLog(app.db, mine, { q: `FW 26 ${String(found.waybillSeq).padStart(5, "0")}` });
    expect(byWaybill.rows.map((r) => r.shipmentId)).toEqual([found.id]);
    expect((await syncLog(app.db, mine, { q: "INGRID" })).rows.map((r) => r.shipmentId)).toEqual([found.id]);
    expect((await syncLog(app.db, mine, { q: "fjordline.no" })).rows.map((r) => r.shipmentId)).toEqual([found.id]);
    expect((await syncLog(app.db, mine, { q: "100%_" })).total).toBe(0);
    for (let i = 0; i < 12; i++) await lead({ state: "signed" });
    const p2 = await syncLog(app.db, mine, { page: 2 });
    expect(p2).toMatchObject({ page: 2, pages: 2 });
    expect(p2.rows).toHaveLength(21 - 15);
    expect((await syncLog(app.db, mine, { page: 99 })).page).toBe(2);
  });
});

describe("one lead", () => {
  it("shows every scan with what was sent and answered; another account's lead is not found", async () => {
    const s = await lead({ state: "signed" });
    await app.db.insert(scans).values({ shipmentId: s.id, kind: "handed", step: "contact", try: 1, sent: { email: "x@y.z" }, answerStatus: 201, answerExcerpt: '{"contact":{"id":"c_1"}}', answerMs: 412 });
    const v = (await leadView(app.db, mine, s.id))!;
    expect(v.scans.find((c) => c.kind === "handed")).toMatchObject({ status: 201, ms: 412, sent: { email: "x@y.z" } });
    expect(v.contact.companyName).toBe("Cedar Lane");
    expect(await leadView(app.db, other, s.id)).toBeNull();
  });
});

describe("resend", () => {
  it("resends a held lead of this account and writes it to the audit log; never another account's, never a signed one", async () => {
    const { deps, scheduled } = testDeps(app.db, null);
    const me = { accountId: mine, userId: maya, name: "Maya Lindqvist" };
    const held = await lead({ state: "held" });
    const theirs = await lead({ account: other, state: "held" });
    const done = await lead({ state: "signed" });
    expect(await resendLead(deps, me, theirs.id)).toBe(false);
    expect(await resendLead(deps, me, done.id)).toBe(false);
    expect(await resendLead(deps, me, held.id)).toBe(true);
    const [after] = await app.db.select().from(shipments).where(eq(shipments.id, held.id));
    expect(after).toMatchObject({ state: "picked_up", tries: 0, holdReason: null });
    expect(scheduled.at(-1)).toMatchObject({ shipmentId: held.id, tryNumber: 1 });
    const log = await auditView(app.db, mine);
    expect(log.rows[0]).toMatchObject({ who: "Maya Lindqvist", action: "lead.resent", targetKind: "lead", detail: "The email address is invalid" });
    expect((await auditView(app.db, other)).total).toBe(0);
  });

  it("resends every held lead with the same reason, and only those, in one audit line", async () => {
    const { deps } = testDeps(app.db, null);
    const me = { accountId: mine, userId: maya, name: "Maya Lindqvist" };
    const before = (await syncLog(app.db, mine, { state: "held" })).rows;
    const phone = before.filter((r) => r.reason === "Phone number is not valid").length;
    const n = await resendHeld(deps, me, "Phone number is not valid");
    expect(n).toBe(phone);
    const left = (await syncLog(app.db, mine, { state: "held" })).rows;
    expect(left.some((r) => r.reason === "Phone number is not valid")).toBe(false);
    expect(left.length).toBe(before.length - phone);
    expect((await auditView(app.db, mine)).rows[0]).toMatchObject({ action: "leads.resent", detail: `${phone} held for: Phone number is not valid` });
  });
});

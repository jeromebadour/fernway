// Plan limits: what each account may use, and every gate that asks. Nothing a plan lacks is deleted; it is refused at
// setup, and paused if it was set up before.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeKey } from "../src/account.js";
import { ingestLead, type Deps } from "../src/engine.js";
import { noteHookEvents, saveHook } from "../src/hooks.js";
import { invite, saveRoute, type Manager } from "../src/manage.js";
import { signUp } from "../src/people.js";
import { entitlementFor, entitlementOf, notOnPlan, planNote } from "../src/plans.js";
import { accounts, routes, scans, shipments, webhookDeliveries, webhookEndpoints } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

const day = 86_400_000;
const now = new Date("2026-11-14T12:00:00Z");

describe("who gets what", () => {
  it("an account Fernway's operator made (no trial, no plan) carries everything", () => {
    const e = entitlementOf({ plan: null, billingStatus: null, trialEndsAt: null }, now);
    expect(e).toMatchObject({ kind: "house", team: null, leads: null });
    expect([...e.features].sort()).toEqual(["api", "bookings", "sheets", "webhooks"]);
  });

  it("a trial tries everything, and once over with no plan keeps only what Starter has", () => {
    const trial = entitlementOf({ plan: null, billingStatus: null, trialEndsAt: new Date(now.getTime() + day) }, now);
    expect(trial.kind).toBe("trial");
    expect(trial.features.size).toBe(4);
    const ended = entitlementOf({ plan: null, billingStatus: null, trialEndsAt: new Date(now.getTime() - day) }, now);
    expect(ended).toMatchObject({ kind: "ended", team: 2 });
    expect(ended.features.size).toBe(0);
  });

  it("each plan has what /pricing says", () => {
    const at = (plan: "starter" | "growth" | "scale") => entitlementOf({ plan, billingStatus: "active", trialEndsAt: new Date(now.getTime() - 30 * day) }, now);
    expect(at("starter")).toMatchObject({ kind: "plan", team: 2, leads: 500 });
    expect([...at("starter").features]).toEqual([]);
    expect(at("growth")).toMatchObject({ team: 5, leads: 5000 });
    expect([...at("growth").features]).toEqual(["bookings"]);
    expect(at("scale")).toMatchObject({ team: null, leads: 25000 });
    expect([...at("scale").features].sort()).toEqual(["api", "bookings", "sheets", "webhooks"]);
  });

  it("a payment being retried keeps the plan; a cancelled one falls back like an ended trial", () => {
    const past = new Date(now.getTime() - 30 * day);
    expect(entitlementOf({ plan: "growth", billingStatus: "past_due", trialEndsAt: past }, now).plan).toBe("growth");
    expect(entitlementOf({ plan: "growth", billingStatus: "canceled", trialEndsAt: past }, now).kind).toBe("ended");
  });

  it("a refusal names what is missing, the plan that has it, and where to pick it", () => {
    const starter = entitlementOf({ plan: "starter", billingStatus: "active", trialEndsAt: null }, now);
    expect(notOnPlan("api", starter)).toBe("The API is on the Scale plan. Starter doesn't include it: pick a plan in Plan and billing.");
    expect(notOnPlan("bookings", starter)).toBe("Bookings are on the Growth plan. Starter doesn't include it: pick a plan in Plan and billing.");
    const ended = entitlementOf({ plan: null, billingStatus: null, trialEndsAt: new Date(now.getTime() - day) }, now);
    expect(notOnPlan("webhooks", ended)).toBe("Webhooks out are on the Scale plan. Your trial has ended: pick a plan in Plan and billing.");
  });
});

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let starter: Manager;
let deps: Deps;
const KEY = Buffer.alloc(32, 7);

beforeAll(async () => {
  database = await freshDatabase("plans");
  app = createDb(database.appUrl, 2);
  const a = await signUp(app.db, { email: "owen@alderpike.roofing", name: "Owen Pike", company: "Alder & Pike Roofing", password: "alderpike-2026!" });
  if (!a.ok) throw new Error("sign-up");
  starter = { accountId: a.accountId, userId: a.userId, name: "Owen Pike", role: "owner" };
  // On Starter, paid, the trial behind it.
  await app.db.update(accounts).set({ plan: "starter", billingStatus: "active", trialEndsAt: new Date(Date.now() - day), periodStart: new Date(Date.now() - 5 * day), periodEnd: new Date(Date.now() + 25 * day) })
    .where(eq(accounts.id, a.accountId));
  deps = { db: app.db, ghl: {} as Deps["ghl"], connectionFor: async () => null, schedule: async () => {} } as unknown as Deps;
});
afterAll(async () => {
  await app.pool.end();
  await database.drop();
});

describe("the gates, on Starter", () => {
  it("a route can't get a calendar; one kept from the trial can still be renamed, and pauses its leads", async () => {
    const r = await saveRoute(app.db, starter, { key: "roof-check", label: "Roof checks", calendarId: "cal_roofs_0001" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems[0]).toBe("calendarId: Bookings are on the Growth plan. Starter doesn't include it: pick a plan in Plan and billing.");
    // A booking route made during the trial.
    const [kept] = await app.db.insert(routes).values({ accountId: starter.accountId, key: "booking", label: "Bookings", calendarId: "cal_roofs_0001" }).returning();
    expect((await saveRoute(app.db, starter, { label: "Roof checks", calendarId: "cal_roofs_0001" }, kept!.id)).ok).toBe(true);
    const sent = await ingestLead(deps, starter.accountId, { idempotencyKey: "plan-test-0001", source: "form", route: "booking", slot: "2026-11-20T16:00:00Z", contact: { email: "dana@example.com" } });
    expect(sent.ok).toBe(false);
    expect(!sent.ok && sent.problems[0]).toContain('route: "booking" books meetings. Bookings are on the Growth plan.');
    expect(await app.db.select().from(shipments).where(eq(shipments.accountId, starter.accountId))).toHaveLength(0);
  });

  it("a team stops at two, invites included", async () => {
    expect((await invite(app.db, starter, { email: "sara@alderpike.roofing", role: "member" })).ok).toBe(true);
    const third = await invite(app.db, starter, { email: "jonas@alderpike.roofing", role: "member" });
    expect(third).toEqual({ ok: false, problems: ["form: Starter takes 2 people, invites included. Move up in Plan and billing to add more."] });
  });

  it("an API key for code is refused; a key for WordPress is made", async () => {
    const api = await makeKey(app.db, starter.accountId, starter.userId, "Our app");
    expect(!api.ok && api.problems[0]).toBe("kind: The API is on the Scale plan. Starter doesn't include it: pick a plan in Plan and billing.");
    expect((await makeKey(app.db, starter.accountId, starter.userId, "Alder & Pike site", "wordpress")).ok).toBe(true);
    expect((await makeKey(app.db, starter.accountId, starter.userId, "Odd", "everything")).ok).toBe(false);
  });

  it("webhooks out can't be added, and one kept from the trial is paused, not removed", async () => {
    const r = await saveHook(app.db, KEY, starter, { label: "n8n", url: "https://hooks.example.com/fernway", events: ["lead.signed"] });
    expect(!r.ok && r.problems[0]).toBe("form: Webhooks out are on the Scale plan. Starter doesn't include it: pick a plan in Plan and billing.");
    // One made during the trial, and a lead signed for since.
    const [e] = await app.db.insert(webhookEndpoints).values({ accountId: starter.accountId, label: "n8n", url: "https://hooks.example.com/fernway", events: ["lead.signed"], secretSealed: "x", madeBy: "Owen Pike", createdAt: new Date(Date.now() - day) }).returning();
    const [route] = await app.db.insert(routes).values({ accountId: starter.accountId, key: "contact", label: "Contact" }).returning();
    await app.db.insert(shipments).values({ accountId: starter.accountId, routeId: route!.id, waybillYear: 26, waybillSeq: 90000, source: "form", idempotencyKey: "plan-test-0002", contact: { email: "dana@example.com" }, state: "signed" });
    await noteHookEvents({ db: app.db, key: KEY, appUrl: "https://fernway.test" } as Parameters<typeof noteHookEvents>[0]);
    expect(await app.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, e!.id))).toHaveLength(0);
    expect(await app.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, e!.id))).toHaveLength(1);
    // On Scale, the same event is delivered.
    await app.db.update(accounts).set({ plan: "scale" }).where(eq(accounts.id, starter.accountId));
    await noteHookEvents({ db: app.db, key: KEY, appUrl: "https://fernway.test" } as Parameters<typeof noteHookEvents>[0]);
    expect(await app.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, e!.id))).toHaveLength(1);
    await app.db.update(accounts).set({ plan: "starter" }).where(eq(accounts.id, starter.accountId));
  });

  it("past the month's leads, the owner hears it; under, nothing", async () => {
    expect(await planNote(app.db, starter.accountId)).toBeNull();
    const [route] = await app.db.select().from(routes).where(eq(routes.key, "contact"));
    for (let i = 0; i < 501; i++) {
      const [s] = await app.db.insert(shipments).values({ accountId: starter.accountId, routeId: route!.id, waybillYear: 26, waybillSeq: 91000 + i, source: "form", idempotencyKey: `plan-over-${String(i).padStart(4, "0")}`, contact: { email: `p${i}@example.com` }, state: "signed" }).returning({ id: shipments.id });
      await app.db.insert(scans).values({ shipmentId: s!.id, kind: "signed", try: 1, at: new Date(Date.now() - 60_000) });
    }
    expect(await planNote(app.db, starter.accountId)).toMatchObject({ kind: "over", plan: "starter", leads: 500 });
  });

  it("a trial that ended with no plan is said so", async () => {
    await app.db.update(accounts).set({ plan: null, billingStatus: null }).where(eq(accounts.id, starter.accountId));
    expect((await entitlementFor(app.db, starter.accountId)).kind).toBe("ended");
    expect(await planNote(app.db, starter.accountId)).toEqual({ kind: "ended" });
  });
});

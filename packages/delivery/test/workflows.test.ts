// Fernway inside GHL's workflows, against a real database: a workflow's trigger is kept, changed and removed as GHL
// says; each held, returned or signed lead reaches the triggers that want it once, with the sub-account's token, and
// never the workflow that sent it; "Track with Fernway" makes one waybill per contact per run.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keyFrom } from "../src/crypto.js";
import { ghlConnections, routes, shipments, triggerSends, workflowTriggers } from "../src/schema.js";
import { actionFields, eventsFrom, noteTriggerSends, sendDueTriggers, subscribe, trackFromWorkflow } from "../src/workflows.js";
import { createDb, fakeConnection, freshDatabase, seedAccount, testDeps } from "./support.js";

const GHL = "https://services.leadconnectorhq.com";
const key = keyFrom("0000000000000000000000000000000000000000000000000000000000000001");
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;

const sub = (eventType: string, id: string, extra: Record<string, unknown> = {}) => ({
  triggerData: { id, key: "fernway_lead", eventType, targetUrl: `${GHL}/workflows-marketplace/triggers/execute/app/${id}`, filters: [], ...extra },
  extras: { locationId: "loc_north", workflowId: `wf_${id}`, companyId: "cmp" },
  meta: { key: "fernway_lead", version: "1.0" },
});

beforeAll(async () => {
  database = await freshDatabase("workflows");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
  await app.db.insert(ghlConnections).values({ accountId: acc, locationId: "loc_north", companyId: "cmp", scopes: "x", accessTokenEnc: "x", refreshTokenEnc: "y", expiresAt: new Date(Date.now() + 3_600_000) });
});
afterAll(async () => { await app.pool.end(); await database.drop(); });

describe("the trigger's subscription", () => {
  it("reads the Event filter, all three when none is picked", () => {
    expect(eventsFrom([])).toEqual(["held", "returned", "signed"]);
    expect(eventsFrom([{ field: "event", value: ["held", "returned"] }])).toEqual(["held", "returned"]);
    expect(eventsFrom([{ id: "event", value: "signed" }])).toEqual(["signed"]);
    expect(eventsFrom([{ field: "event", value: ["nonsense"] }])).toEqual(["held", "returned", "signed"]);
  });

  it("keeps, changes and removes a workflow's trigger as GHL says", async () => {
    expect(await subscribe(app.db, sub("CREATED", "t1"), GHL)).toEqual({ ok: true, action: "kept" });
    expect(await subscribe(app.db, sub("UPDATED", "t1", { filters: [{ field: "event", value: ["held"] }] }), GHL)).toEqual({ ok: true, action: "changed" });
    const [t] = await app.db.select().from(workflowTriggers).where(eq(workflowTriggers.id, "t1"));
    expect(t).toMatchObject({ accountId: acc, workflowId: "wf_t1", events: ["held"] });
    expect(await subscribe(app.db, sub("DELETED", "t1"), GHL)).toEqual({ ok: true, action: "removed" });
    expect(await app.db.select().from(workflowTriggers)).toEqual([]);
  });

  it("refuses an address off GHL's own API, an unknown sub-account and a malformed body", async () => {
    const away = sub("CREATED", "t2"); away.triggerData.targetUrl = "https://attacker.example/steal";
    expect(await subscribe(app.db, away, GHL)).toEqual({ ok: false, why: "address" });
    const stranger = sub("CREATED", "t3"); stranger.extras.locationId = "loc_nobody";
    expect(await subscribe(app.db, stranger, GHL)).toEqual({ ok: false, why: "not-connected" });
    expect(await subscribe(app.db, { triggerData: {} }, GHL)).toEqual({ ok: false, why: "body" });
  });
});

describe("Track with Fernway", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    data: { route: "trial", email: "ana@northpine.example", firstName: "Ana", phone: "", ...over },
    extras: { locationId: "loc_north", contactId: "c_ana", workflowId: "wf_track" },
    meta: { key: "track_with_fernway", version: "1.0" },
  });

  it("lists only the routes that need no meeting time", async () => {
    const f = await actionFields(app.db, { data: {}, extras: { locationId: "loc_north" } });
    expect(JSON.stringify(f)).toContain('"value":"trial"');
    expect(JSON.stringify(f)).toContain('"value":"contact-only"');
    expect(JSON.stringify(f)).not.toContain('"value":"demo"');
    expect(JSON.stringify(await actionFields(app.db, { extras: { locationId: "loc_nobody" } }))).toContain('"options":[]');
  });

  it("makes one waybill per contact per run, remembering the workflow", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    const at = new Date("2026-11-11T10:00:00Z");
    const a = await trackFromWorkflow(deps, body(), key, "https://fw.test", at);
    expect(a).toMatchObject({ ok: true, state: "picked_up", duplicate: false });
    if (!a.ok) throw new Error("not tracked");
    expect(a.receipt).toMatch(/^https:\/\/fw\.test\/track\//);
    expect(await trackFromWorkflow(deps, body(), key, "https://fw.test", new Date(at.getTime() + 60_000))).toMatchObject({ ok: true, waybill: a.waybill, duplicate: true });
    expect(await trackFromWorkflow(deps, body(), key, "https://fw.test", new Date(at.getTime() + 11 * 60_000))).toMatchObject({ ok: true, duplicate: false });
    const mine = await app.db.select().from(shipments).where(eq(shipments.source, "workflow"));
    expect(mine.map((s) => s.viaWorkflow)).toEqual(["wf_track", "wf_track"]);
  });

  it("says which field names it got when the call's shape doesn't fit, never their values", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    const r = await trackFromWorkflow(deps, { email: "secret@x.example", locationId: "loc_north", meta: { key: "k" } }, key, "https://fw.test");
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (r.ok) throw new Error("accepted");
    expect(r.problems.at(-1)).toBe("received: {email,locationId,meta:{key}}");
    expect(JSON.stringify(r)).not.toContain("secret@x.example");
  });

  it("refuses an unknown sub-account, an unknown route and a contact without email or phone", async () => {
    const { deps } = testDeps(app.db, fakeConnection());
    expect(await trackFromWorkflow(deps, { ...body(), extras: { locationId: "loc_nobody" } }, key, "https://fw.test")).toMatchObject({ ok: false, status: 404 });
    expect(await trackFromWorkflow(deps, body({ route: "nowhere" }), key, "https://fw.test")).toMatchObject({ ok: false, status: 422 });
    expect(await trackFromWorkflow(deps, body({ email: "" }), key, "https://fw.test")).toMatchObject({ ok: false, status: 422 });
  });
});

describe("firing", () => {
  it("sends each wanted arrival once, with the token, never to the workflow that made the lead", async () => {
    await subscribe(app.db, sub("CREATED", "held-only", { filters: [{ field: "event", value: ["held"] }] }), GHL);
    await subscribe(app.db, sub("CREATED", "everything"), GHL);
    // The workflow "wf_track" sent its own leads (above); its trigger must not fire on them.
    const loop = sub("CREATED", "track"); loop.extras.workflowId = "wf_track";
    await subscribe(app.db, loop, GHL);
    // Leads made before a trigger existed don't count; these arrive after.
    const [route] = await app.db.select({ id: routes.id }).from(routes).where(and(eq(routes.accountId, acc), eq(routes.key, "trial")));
    const made = await app.db.insert(shipments).values([
      { accountId: acc, routeId: route!.id, waybillYear: 26, waybillSeq: 70001, idempotencyKey: "wf-held-1", source: "form", contact: { email: "h@x.example" }, state: "held", holdReason: "Email is invalid", ghlContactId: "c_h" },
      { accountId: acc, routeId: route!.id, waybillYear: 26, waybillSeq: 70002, idempotencyKey: "wf-signed-1", source: "form", contact: { email: "s@x.example" }, state: "signed" },
    ]).returning();
    await app.db.update(shipments).set({ state: "signed", updatedAt: new Date() }).where(eq(shipments.source, "workflow"));

    await noteTriggerSends(app.db);
    expect(await noteTriggerSends(app.db)).toBe(0);
    const noted = await app.db.select({ t: triggerSends.triggerId, s: triggerSends.shipmentId, e: triggerSends.event }).from(triggerSends);
    const has = (t: string, s: number, e: string) => noted.some((n) => n.t === t && n.s === s && n.e === e);
    expect(has("held-only", made[0]!.id, "held")).toBe(true);
    expect(has("held-only", made[1]!.id, "signed")).toBe(false);
    expect(has("everything", made[1]!.id, "signed")).toBe(true);
    expect(noted.filter((n) => n.t === "track").map((n) => n.s).sort()).toEqual([made[0]!.id, made[1]!.id].sort());
    expect(noted.filter((n) => n.t === "everything").length).toBe(4);

    const calls: { url: string; auth: string | null; body: Record<string, string> }[] = [];
    const conn = fakeConnection();
    const r = await sendDueTriggers({
      db: app.db, key, appUrl: "https://fw.test", connectionFor: async () => conn,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(r).toEqual({ sent: noted.length, failed: 0, gaveUp: 0 });
    const held = calls.find((c) => c.url.endsWith("/held-only"))!;
    expect(held.auth).toBe("Bearer token-0");
    expect(held.body).toMatchObject({ event: "held", waybill: "FW 26 70001", reason: "Email is invalid", contactId: "c_h", email: "h@x.example", route: "Trial" });
    expect(held.body.receipt).toMatch(/^https:\/\/fw\.test\/track\//);
    expect((await sendDueTriggers({ db: app.db, key, appUrl: "x", connectionFor: async () => conn })).sent).toBe(0);
  });

  it("retries a refused call, then gives up; a trigger GHL no longer has is given up at once", async () => {
    await app.db.update(triggerSends).set({ sentAt: null, tries: 0, nextAt: new Date(0) });
    const conn = fakeConnection();
    let status = 503;
    const fetch503 = (async (url: string) => new Response("", { status: url.endsWith("/everything") ? 404 : status })) as typeof fetch;
    let t = new Date();
    const step = () => sendDueTriggers({ db: app.db, key, appUrl: "x", connectionFor: async () => conn, fetch: fetch503, now: () => t });
    const first = await step();
    expect(first.gaveUp).toBe(4);
    expect(first.failed).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) { t = new Date(t.getTime() + 61 * 60_000); await step(); }
    const all = await app.db.select().from(triggerSends);
    expect(all.every((s) => s.givenUpAt !== null)).toBe(true);
    expect(Math.max(...all.map((s) => s.tries))).toBe(5);
    status = 200;
  });

  it("a 401 refreshes the token and tries once more", async () => {
    await app.db.update(triggerSends).set({ sentAt: null, givenUpAt: null, tries: 0, nextAt: new Date(0) });
    const conn = fakeConnection();
    const f = (async (_u: string, init: RequestInit) => new Response("", { status: new Headers(init.headers).get("authorization") === "Bearer token-0" ? 401 : 200 })) as typeof fetch;
    const r = await sendDueTriggers({ db: app.db, key, appUrl: "x", connectionFor: async () => conn, fetch: f });
    expect(r.gaveUp + r.failed).toBe(0);
    expect(conn.refreshes).toBeGreaterThan(0);
  });
});

// Signed webhooks out against a real database and a real receiving server: an endpoint only on a public https address
// (CI's host aside); each lead event noted once per endpoint that asked for it; every call signed so the receiver can
// check it; a refusal tried again on the leads' clock with the same body; a private network refused at connect time.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { keyFrom } from "../src/crypto.js";
import { ingestLead } from "../src/engine.js";
import {
  endpointUrl, forgetOldDeliveries, hookView, noteHookEvents, post, privateAddress, removeHook, resendHook, saveHook, sendDueHooks, sign, testHook, verify,
} from "../src/hooks.js";
import { auditLog, leadScores, shipments, webhookDeliveries } from "../src/schema.js";
import { createDb, freshDatabase, seedAccount, testDeps } from "./support.js";

const key = keyFrom("ab".repeat(32));
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;
let server: Server;
let base: string;
const heard: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
const answers: number[] = [];
const owner = () => ({ accountId: acc, userId: null, name: "Lena Hartmann", role: "owner" as const });
const ctx = () => ({ db: app.db, key, appUrl: "https://fernway.test", insecureHosts: ["127.0.0.1"], timeoutMs: 2000 });
let secret = "";
let hookId = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { heard.push({ headers: req.headers, body }); res.writeHead(answers.shift() ?? 200, { "content-type": "application/json" }); res.end('{"received":true}'); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  database = await freshDatabase("hooks");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
});
afterAll(async () => { server.close(); await app.pool.end(); await database.drop(); });
beforeEach(() => { heard.length = 0; answers.length = 0; });

async function send(k: string) {
  const r = await ingestLead(testDeps(app.db, null).deps, acc, { idempotencyKey: `hook-${k}-0001`, source: "form", route: "trial", contact: { firstName: "Lena", email: `${k}@northpine.com`, message: "Trial please" } });
  if (!r.ok) throw new Error(r.problems.join(", "));
  return r.waybill;
}

describe("addresses", () => {
  it("takes only public https addresses (the hosts CI names aside), and knows a private network", () => {
    expect(endpointUrl("https://hooks.example.com/fernway#x")).toEqual({ ok: true, url: "https://hooks.example.com/fernway" });
    expect(endpointUrl("http://hooks.example.com/")).toMatchObject({ ok: false });
    expect(endpointUrl("https://user:pw@hooks.example.com/")).toMatchObject({ ok: false });
    expect(endpointUrl("https://127.0.0.1/x")).toMatchObject({ ok: false });
    expect(endpointUrl("https://localhost/x")).toMatchObject({ ok: false });
    expect(endpointUrl("https://[::1]/x")).toMatchObject({ ok: false });
    expect(endpointUrl("http://127.0.0.1:4010/hook", ["127.0.0.1"])).toMatchObject({ ok: true });
    for (const ip of ["10.0.0.5", "172.20.1.1", "192.168.1.9", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(privateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "84.247.145.118", "2606:4700::1111"]) expect(privateAddress(ip), ip).toBe(false);
  });

  it("refuses at connect time a host that resolves to a private network", async () => {
    const a = await post("https://localhost:9/x", {}, "{}", { timeoutMs: 1000 });
    expect(a).toMatchObject({ status: null, refused: "it resolves to a private or local network" });
  });
});

describe("signatures", () => {
  it("signs the time and the body; a changed body, another secret or an old time fails", () => {
    const h = sign("whsec_x", '{"a":1}', 1_800_000_000);
    expect(verify("whsec_x", '{"a":1}', h, 1_800_000_100)).toBe(true);
    expect(verify("whsec_x", '{"a":2}', h, 1_800_000_100)).toBe(false);
    expect(verify("whsec_y", '{"a":1}', h, 1_800_000_100)).toBe(false);
    expect(verify("whsec_x", '{"a":1}', h, 1_800_000_400)).toBe(false);
    expect(verify("whsec_x", '{"a":1}', "nonsense")).toBe(false);
  });
});

describe("endpoints and deliveries", () => {
  it("makes an endpoint, its secret shown once and kept sealed; a member may not; audited", async () => {
    expect(await saveHook(app.db, key, { ...owner(), role: "member" }, { label: "n8n", url: `${base}/hook`, events: ["lead.signed"] }, ["127.0.0.1"])).toMatchObject({ ok: false });
    expect(await saveHook(app.db, key, owner(), { label: "", url: "ftp://x", events: [] })).toEqual({ ok: false, problems: ["label: a name, up to 80 characters", "url: an https:// address (Fernway signs every call, and sends it encrypted)", "events: at least one event"] });
    const r = await saveHook(app.db, key, owner(), { label: "n8n", url: `${base}/hook`, events: ["lead.picked_up", "lead.signed", "lead.held", "lead.scored", "nonsense"] }, ["127.0.0.1"]);
    expect(r).toMatchObject({ ok: true, secret: expect.stringMatching(/^whsec_[\w-]{32}$/) });
    secret = (r as { secret: string }).secret;
    hookId = (r as { id: number }).id;
    const v = await hookView(app.db, acc);
    expect(v.endpoints[0]).toMatchObject({ label: "n8n", events: ["lead.picked_up", "lead.signed", "lead.held", "lead.scored"] });
    expect(JSON.stringify(v)).not.toContain(secret);
    expect(await app.db.select().from(auditLog).where(eq(auditLog.action, "hook.made"))).toHaveLength(1);
  });

  it("notes each event once, sends it signed with the lead, and the receiver can check it", async () => {
    const wb = await send("first");
    expect(await noteHookEvents(ctx())).toBe(1);
    expect(await noteHookEvents(ctx())).toBe(0);
    expect(await sendDueHooks(ctx())).toEqual({ delivered: 1, retry: 0, failed: 0 });
    const h = heard[0]!;
    expect(h.headers["fernway-event"]).toBe("lead.picked_up");
    expect(verify(secret, h.body, String(h.headers["fernway-signature"]))).toBe(true);
    const body = JSON.parse(h.body);
    expect(body).toMatchObject({ type: "lead.picked_up", data: { waybill: wb.number, state: "picked_up", route: { key: "trial", label: "Trial" }, source: "form",
      contact: { firstName: "Lena", email: "first@northpine.com", message: "Trial please" }, score: null } });
    expect(body.id).toBe(h.headers["fernway-delivery"]);
    expect(body.data.receipt).toMatch(/^https:\/\/fernway\.test\/track\//);
    // Signed for, then scored: two more events; returned was not asked for.
    await app.db.update(shipments).set({ state: "signed", updatedAt: new Date() }).where(eq(shipments.id, wb.id));
    await app.db.insert(leadScores).values({ shipmentId: wb.id, accountId: acc, state: "scored", score: 4, summary: "Wants a trial.", signals: ["Clear need"], scoredAt: new Date() });
    expect(await noteHookEvents(ctx())).toBe(2);
    await sendDueHooks(ctx());
    const types = heard.map((x) => JSON.parse(x.body).type).sort();
    expect(types).toEqual(["lead.picked_up", "lead.scored", "lead.signed"]);
    expect(JSON.parse(heard.find((x) => JSON.parse(x.body).type === "lead.scored")!.body).data.score).toEqual({ score: 4, summary: "Wants a trial.", signals: ["Clear need"] });
  });

  it("tries a refused call again on the leads' clock with the same body, and keeps what came back", async () => {
    await send("second");
    await noteHookEvents(ctx());
    answers.push(503);
    expect(await sendDueHooks(ctx())).toEqual({ delivered: 0, retry: 1, failed: 0 });
    const [d] = await app.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.state, "waiting"));
    expect(d).toMatchObject({ tries: 1, lastStatus: 503, lastAnswer: '{"received":true}' });
    expect(d!.nextAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    await app.db.update(webhookDeliveries).set({ nextAt: new Date(0) }).where(eq(webhookDeliveries.id, d!.id));
    expect(await sendDueHooks(ctx())).toMatchObject({ delivered: 1 });
    expect(heard[0]!.body).toBe(heard[1]!.body);
  });

  it("gives up after the last try; Resend starts it again; a test goes out at once", async () => {
    await send("third");
    await noteHookEvents(ctx());
    for (let i = 0; i < 8; i++) {
      answers.push(500);
      await app.db.update(webhookDeliveries).set({ nextAt: new Date(0) }).where(eq(webhookDeliveries.state, "waiting"));
      await sendDueHooks(ctx());
    }
    const [failed] = await app.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.state, "failed"));
    expect(failed).toMatchObject({ tries: 8, lastStatus: 500 });
    expect(await resendHook(ctx(), { ...owner(), role: "member" }, failed!.id)).toBe(false);
    expect(await resendHook(ctx(), owner(), failed!.id)).toBe(true);
    expect(await sendDueHooks(ctx())).toMatchObject({ delivered: 1 });
    const t = await testHook(ctx(), owner(), hookId);
    expect(t).toMatchObject({ ok: true, delivered: true, status: 200 });
    expect(JSON.parse(heard.at(-1)!.body)).toMatchObject({ type: "fernway.test", data: { message: "A test from Fernway, sent by Lena Hartmann." } });
    const v = await hookView(app.db, acc);
    expect(v.endpoints[0]!.day.delivered).toBeGreaterThanOrEqual(5);
    expect(v.deliveries[0]).toMatchObject({ event: "fernway.test", state: "delivered", status: 200 });
  });

  it("allows five endpoints, removes one with its deliveries, and forgets deliveries after 30 days", async () => {
    for (let i = 2; i <= 5; i++) expect(await saveHook(app.db, key, owner(), { label: `Hook ${i}`, url: `https://hooks${i}.example.com/x`, events: ["lead.held"] })).toMatchObject({ ok: true });
    expect(await saveHook(app.db, key, owner(), { label: "Sixth", url: "https://six.example.com/x", events: ["lead.held"] })).toMatchObject({ ok: false, problems: ["form: at most 5 endpoints; remove one first"] });
    await app.db.update(webhookDeliveries).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(webhookDeliveries.event, "fernway.test"));
    expect(await forgetOldDeliveries(app.db)).toBe(1);
    expect(await removeHook(app.db, owner(), hookId)).toBe(true);
    expect(await app.db.select().from(webhookDeliveries)).toHaveLength(0);
  });
});

// Signed webhooks out (plan step 8). An account adds up to five endpoints of its own, each with the events it wants.
// Every lead event becomes one delivery per endpoint, its body fixed when noted (so a retry sends the same bytes and a
// receiver can drop a repeat by its id), signed with the endpoint's secret the way Stripe signs its own:
//
//   Fernway-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
//
// A delivery is tried again on the leads' own clock (8 tries over 24 hours) and kept 30 days with what was sent and
// what came back. Endpoints must be https and public: an address that resolves to a private or local network is
// refused at the moment of connecting (not only when made), so no endpoint can reach inside Fernway's box.
import type { LeadContact } from "./schema.js";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { formatWaybill, RETRY_WAITS_MS } from "@fernway/core";
import type { Db } from "./db.js";
import { audit, type Actor } from "./console.js";
import { open, seal } from "./crypto.js";
import type { Role } from "./schema.js";
import { hookEvents, leadScores, routes, shipments, webhookDeliveries, webhookEndpoints, type HookEvent } from "./schema.js";
import { readable, trackToken } from "./track.js";

export const MAX_ENDPOINTS = 5;
export const HOOK_TIMEOUT_MS = 10_000;
export const KEEP_DELIVERIES_DAYS = 30;
/** How old a signature may be before a receiver should refuse it (the docs' examples use this). */
export const SIGNATURE_TOLERANCE_S = 300;

export const hookWords: Record<HookEvent | "fernway.test", string> = {
  "lead.picked_up": "Picked up", "lead.signed": "Signed for", "lead.held": "Held", "lead.returned": "Returned", "lead.scored": "Scored",
  "fernway.test": "Test",
};

// ---------------------------------------------------------------------------------------------------------------
// Signing (also what a receiver does, in the docs).

export function sign(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

/** What a receiver checks: the signature matches the body and is no older than the tolerance. */
export function verify(secret: string, body: string, header: string, now = Math.floor(Date.now() / 1000), tolerance = SIGNATURE_TOLERANCE_S): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > tolerance) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

// ---------------------------------------------------------------------------------------------------------------
// Where a webhook may go.

/** Addresses that are not the public internet: loopback, private, link-local, carrier NAT, multicast, unspecified. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9")
    || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

/** An endpoint's address as kept, or why not: https only (http only for the hosts CI names), no user or password. */
export function endpointUrl(input: string, insecureHosts: string[] = []): { ok: true; url: string } | { ok: false; why: string } {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return { ok: false, why: "an address like https://hooks.example.com/fernway" }; }
  const allowed = insecureHosts.includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && allowed)) return { ok: false, why: "an https:// address (Fernway signs every call, and sends it encrypted)" };
  if (u.username || u.password) return { ok: false, why: "an address without a user name or password in it" };
  if (!allowed && (u.hostname === "localhost" || (isIP(u.hostname.replace(/^\[|\]$/g, "")) && privateAddress(u.hostname.replace(/^\[|\]$/g, ""))))) {
    return { ok: false, why: "a public address (not a private or local network)" };
  }
  u.hash = "";
  return { ok: true, url: u.toString() };
}

export type PostAnswer = { status: number | null; body: string; ms: number; refused?: string };

/** POSTs a body, refusing at connect time any address that resolves to a private network (unless CI names the host). */
export function post(url: string, headers: Record<string, string>, body: string, opts: { timeoutMs?: number; insecureHosts?: string[] } = {}): Promise<PostAnswer> {
  const started = performance.now();
  const u = new URL(url);
  const allowed = (opts.insecureHosts ?? []).includes(u.hostname);
  const done = (a: Omit<PostAnswer, "ms">): PostAnswer => ({ ...a, ms: Math.round(performance.now() - started) });
  return new Promise((resolve) => {
    let refused: string | undefined;
    const lookup = (host: string, o: object, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => {
      dnsLookup(host, { ...o, all: true }, (err, addrs) => {
        if (err) return cb(err, "");
        const list = addrs as { address: string; family: number }[];
        if (!allowed && list.some((x) => privateAddress(x.address))) {
          refused = "it resolves to a private or local network";
          return cb(new Error(refused), "");
        }
        if ((o as { all?: boolean }).all) return cb(null, list);
        return cb(null, list[0]!.address, list[0]!.family);
      });
    };
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(u, {
      method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body).toString() }, lookup: lookup as never, timeout: opts.timeoutMs ?? HOOK_TIMEOUT_MS,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => { if (text.length < 2000) text += c; });
      res.on("end", () => resolve(done({ status: res.statusCode ?? null, body: text.slice(0, 300) })));
      res.on("error", () => resolve(done({ status: res.statusCode ?? null, body: text.slice(0, 300) })));
    });
    req.on("timeout", () => { req.destroy(new Error(`no answer in ${(opts.timeoutMs ?? HOOK_TIMEOUT_MS) / 1000} s`)); });
    req.on("error", (e) => resolve(done({ status: null, body: refused ? `refused: ${refused}` : e.message.slice(0, 300), refused })));
    req.end(body);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Endpoints (owners and admins).

export type HookDraft = { id?: number; label: string; url: string; events: string[] };
export type HookResult = { ok: true; id: number; secret?: string } | { ok: false; problems: string[] };

/** Makes an endpoint (its secret shown once, in the answer) or changes one (its secret stays). Audited. */
export async function saveHook(db: Db, key: Buffer, m: Actor & { role: Role }, d: HookDraft, insecureHosts: string[] = []): Promise<HookResult> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may change webhooks"] };
  const problems: string[] = [];
  const label = String(d.label ?? "").trim();
  if (label.length < 1 || label.length > 80) problems.push("label: a name, up to 80 characters");
  const u = endpointUrl(String(d.url ?? ""), insecureHosts);
  if (!u.ok) problems.push(`url: ${u.why}`);
  const events = hookEvents.filter((e) => (d.events ?? []).includes(e));
  if (events.length === 0) problems.push("events: at least one event");
  if (problems.length) return { ok: false, problems };
  const url = (u as { url: string }).url;
  if (d.id === undefined) {
    const [{ n }] = await db.select({ n: count() }).from(webhookEndpoints).where(eq(webhookEndpoints.accountId, m.accountId)) as [{ n: number }];
    if (n >= MAX_ENDPOINTS) return { ok: false, problems: [`form: at most ${MAX_ENDPOINTS} endpoints; remove one first`] };
    const secret = newSecret();
    const [h] = await db.insert(webhookEndpoints).values({ accountId: m.accountId, label, url, events, secretSealed: seal(key, secret), madeBy: m.name.slice(0, 80) }).returning({ id: webhookEndpoints.id });
    await audit(db, m, "hook.made", { kind: "hook", id: label.slice(0, 80) }, `${new URL(url).host} · ${events.map((e) => hookWords[e]).join(", ")}`);
    return { ok: true, id: h!.id, secret };
  }
  const [h] = await db.update(webhookEndpoints).set({ label, url, events }).where(and(eq(webhookEndpoints.id, d.id), eq(webhookEndpoints.accountId, m.accountId))).returning({ id: webhookEndpoints.id });
  if (!h) return { ok: false, problems: ["form: that endpoint is not in this account"] };
  await audit(db, m, "hook.changed", { kind: "hook", id: label.slice(0, 80) }, `${new URL(url).host} · ${events.map((e) => hookWords[e]).join(", ")}`);
  return { ok: true, id: h.id };
}

export async function removeHook(db: Db, m: Actor & { role: Role }, id: number): Promise<boolean> {
  if (m.role !== "owner" && m.role !== "admin") return false;
  const [h] = await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.accountId, m.accountId))).returning({ label: webhookEndpoints.label });
  if (!h) return false;
  await audit(db, m, "hook.removed", { kind: "hook", id: h.label.slice(0, 80) }, "no more calls; its deliveries are gone with it");
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Noting events, and the body each one carries.

export type HookPayload = {
  id: string; type: HookEvent | "fernway.test"; created: string;
  data: {
    waybill: string; state: string; route: { key: string; label: string }; source: string; receipt: string; reason: string | null;
    contact: LeadContact; ghl: { contactId: string | null; opportunityId: string | null };
    score: { score: number; summary: string | null; signals: string[] } | null; pickedUpAt: string; updatedAt: string;
  } | { message: string };
};

type Ctx = { db: Db; key: Buffer; appUrl: string };

function bodyFor(c: Ctx, id: string, type: HookEvent, s: typeof shipments.$inferSelect, route: { key: string; label: string },
  sc: { score: number | null; summary: string | null; signals: string[] } | null): HookPayload {
  // Every field the lead came with, the address as its own object; empty strings left out.
  const contact = Object.fromEntries(Object.entries(s.contact).filter(([k, v]) => (typeof v === "string" && v !== "") || (k === "address" && v && typeof v === "object"))) as LeadContact;
  return {
    id, type, created: new Date().toISOString(),
    data: {
      waybill: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), state: s.state, route, source: s.source,
      receipt: `${c.appUrl}/track/${trackToken(c.key, s.id)}`, reason: readable(s.holdReason), contact,
      ghl: { contactId: s.ghlContactId, opportunityId: s.ghlOpportunityId },
      score: sc?.score ? { score: sc.score, summary: sc.summary, signals: sc.signals } : null,
      pickedUpAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
    },
  };
}

/** Notes each lead event (since the endpoint was made, within two days) for each endpoint that asked for it, once. */
export async function noteHookEvents(c: Ctx, skipAccounts: number[] = []): Promise<number> {
  const due = (await c.db.execute<{ endpoint_id: string; account_id: string; shipment_id: string; event: HookEvent }>(sql`
    select e.id endpoint_id, e.account_id, s.id shipment_id, ev.event
    from webhook_endpoints e
    join shipments s on s.account_id = e.account_id and s.updated_at > now() - interval '2 days'
    cross join lateral (values
      ('lead.picked_up', s.created_at >= e.created_at),
      ('lead.signed', s.state = 'signed' and s.updated_at >= e.created_at),
      ('lead.held', s.state = 'held' and s.updated_at >= e.created_at),
      ('lead.returned', s.state = 'returned' and s.updated_at >= e.created_at),
      ('lead.scored', exists (select 1 from lead_scores ls where ls.shipment_id = s.id and ls.state = 'scored' and ls.scored_at >= e.created_at))
    ) ev(event, happened)
    where ev.happened and ev.event = any (e.events)
      ${skipAccounts.length ? sql`and e.account_id not in (${sql.join(skipAccounts.map((a) => sql`${a}`), sql`, `)})` : sql``}
      and not exists (select 1 from webhook_deliveries d where d.endpoint_id = e.id and d.shipment_id = s.id and d.event = ev.event)
    limit 500`)).rows;
  let made = 0;
  for (const d of due) {
    const [row] = await c.db.select({ s: shipments, rk: routes.key, rl: routes.label, score: leadScores.score, summary: leadScores.summary, signals: leadScores.signals, scState: leadScores.state })
      .from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId)).leftJoin(leadScores, eq(leadScores.shipmentId, shipments.id))
      .where(eq(shipments.id, Number(d.shipment_id)));
    if (!row) continue;
    const id = `evt_${randomBytes(12).toString("base64url")}`;
    const payload = bodyFor(c, id, d.event, row.s, { key: row.rk, label: row.rl }, row.scState === "scored" ? { score: row.score, summary: row.summary, signals: row.signals ?? [] } : null);
    const r = await c.db.insert(webhookDeliveries).values({ endpointId: Number(d.endpoint_id), accountId: Number(d.account_id), event: d.event, shipmentId: row.s.id, body: JSON.stringify(payload) })
      .onConflictDoNothing().returning({ id: webhookDeliveries.id });
    made += r.length;
  }
  return made;
}

// ---------------------------------------------------------------------------------------------------------------
// Sending.

export type HookRun = { delivered: number; retry: number; failed: number };
type SendCtx = Ctx & { insecureHosts?: string[]; timeoutMs?: number };

async function deliver(c: SendCtx, d: typeof webhookDeliveries.$inferSelect, e: typeof webhookEndpoints.$inferSelect): Promise<PostAnswer> {
  const body = d.body;
  return post(e.url, {
    "content-type": "application/json", "user-agent": "Fernway-Webhooks/1 (+https://fernway.jeromebadour.com/docs/webhooks)",
    "fernway-signature": sign(open(c.key, e.secretSealed), body), "fernway-event": d.event, "fernway-delivery": (JSON.parse(body) as HookPayload).id,
  }, body, { insecureHosts: c.insecureHosts, timeoutMs: c.timeoutMs });
}

async function settle(c: SendCtx, d: typeof webhookDeliveries.$inferSelect, a: PostAnswer, run?: HookRun) {
  const ok = a.status !== null && a.status >= 200 && a.status < 300;
  const tries = d.tries + 1;
  const wait = RETRY_WAITS_MS[tries - 1];
  const state = ok ? "delivered" : wait === undefined || a.refused || d.event === "fernway.test" ? "failed" : "waiting";
  await c.db.update(webhookDeliveries).set({
    state, tries, lastStatus: a.status, lastAnswer: a.body.slice(0, 300), lastMs: a.ms,
    ...(ok ? { deliveredAt: sql`now()` } : state === "waiting" ? { nextAt: new Date(Date.now() + wait!) } : {}),
  }).where(eq(webhookDeliveries.id, d.id));
  if (run) { if (ok) run.delivered++; else if (state === "waiting") run.retry++; else run.failed++; }
  return state;
}

/** Sends what is due, up to 50 at a time. */
export async function sendDueHooks(c: SendCtx): Promise<HookRun> {
  const run: HookRun = { delivered: 0, retry: 0, failed: 0 };
  const due = await c.db.select({ d: webhookDeliveries, e: webhookEndpoints }).from(webhookDeliveries).innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(and(eq(webhookDeliveries.state, "waiting"), lte(webhookDeliveries.nextAt, sql`now()`))).orderBy(webhookDeliveries.nextAt).limit(50);
  for (const { d, e } of due) {
    // Taken by this run only.
    const [mine] = await c.db.update(webhookDeliveries).set({ nextAt: sql`now() + interval '2 minutes'` })
      .where(and(eq(webhookDeliveries.id, d.id), eq(webhookDeliveries.state, "waiting"), lte(webhookDeliveries.nextAt, sql`now()`))).returning({ id: webhookDeliveries.id });
    if (!mine) continue;
    await settle(c, d, await deliver(c, d, e), run);
  }
  return run;
}

/** Sends a test to one endpoint now and says what came back. */
export async function testHook(c: SendCtx, m: Actor & { role: Role }, id: number): Promise<{ ok: true; delivered: boolean; status: number | null; answer: string; ms: number } | { ok: false; problems: string[] }> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may send a test"] };
  const [e] = await c.db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.accountId, m.accountId)));
  if (!e) return { ok: false, problems: ["form: that endpoint is not in this account"] };
  const payload: HookPayload = { id: `evt_${randomBytes(12).toString("base64url")}`, type: "fernway.test", created: new Date().toISOString(), data: { message: `A test from Fernway, sent by ${m.name}.` } };
  const [d] = await c.db.insert(webhookDeliveries).values({ endpointId: e.id, accountId: e.accountId, event: "fernway.test", body: JSON.stringify(payload) }).returning();
  const a = await deliver(c, d!, e);
  const state = await settle(c, d!, a);
  return { ok: true, delivered: state === "delivered", status: a.status, answer: a.body, ms: a.ms };
}

/** Sends a failed delivery again, as a fresh first try (the same body, so the receiver still sees one id). */
export async function resendHook(c: SendCtx, m: Actor & { role: Role }, deliveryId: number): Promise<boolean> {
  if (m.role !== "owner" && m.role !== "admin") return false;
  const [d] = await c.db.update(webhookDeliveries).set({ state: "waiting", tries: 0, nextAt: sql`now()` })
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.accountId, m.accountId), eq(webhookDeliveries.state, "failed"), sql`${webhookDeliveries.shipmentId} is not null`))
    .returning({ id: webhookDeliveries.id });
  if (!d) return false;
  await audit(c.db, m, "hook.resent", { kind: "hook", id: `delivery ${d.id}` }, "sent again as a fresh first try");
  return true;
}

export async function forgetOldDeliveries(db: Db): Promise<number> {
  const r = await db.delete(webhookDeliveries).where(sql`${webhookDeliveries.createdAt} < now() - make_interval(days => ${KEEP_DELIVERIES_DAYS})`).returning({ id: webhookDeliveries.id });
  return r.length;
}

// ---------------------------------------------------------------------------------------------------------------
// The console's part.

export type HookView = {
  endpoints: { id: number; label: string; url: string; host: string; events: HookEvent[]; madeBy: string; createdAt: string;
    day: { delivered: number; waiting: number; failed: number }; lastAt: string | null; lastStatus: number | null }[];
  deliveries: { id: number; endpointId: number; endpoint: string; event: HookEvent | "fernway.test"; waybill: string | null; shipmentId: number | null;
    state: "waiting" | "delivered" | "failed"; tries: number; status: number | null; ms: number | null; answer: string | null; payload: unknown; at: string; nextAt: string | null }[];
};

export async function hookView(db: Db, accountId: number): Promise<HookView> {
  const eps = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.accountId, accountId)).orderBy(webhookEndpoints.createdAt);
  const day = await db.select({ e: webhookDeliveries.endpointId, state: webhookDeliveries.state, n: count() }).from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.accountId, accountId), gte(webhookDeliveries.createdAt, sql`now() - interval '24 hours'`)))
    .groupBy(webhookDeliveries.endpointId, webhookDeliveries.state);
  const last = eps.length ? await db.select({ e: webhookDeliveries.endpointId, at: sql<string>`max(coalesce(${webhookDeliveries.deliveredAt}, ${webhookDeliveries.createdAt}))`,
    status: sql<number | null>`(array_agg(${webhookDeliveries.lastStatus} order by ${webhookDeliveries.id} desc))[1]` })
    .from(webhookDeliveries).where(inArray(webhookDeliveries.endpointId, eps.map((e) => e.id))).groupBy(webhookDeliveries.endpointId) : [];
  const list = await db.select({ d: webhookDeliveries, s: shipments, label: webhookEndpoints.label }).from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId)).leftJoin(shipments, eq(shipments.id, webhookDeliveries.shipmentId))
    .where(eq(webhookDeliveries.accountId, accountId)).orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id)).limit(15);
  const n = (id: number, st: string) => Number(day.find((x) => x.e === id && x.state === st)?.n ?? 0);
  return {
    endpoints: eps.map((e) => {
      const l = last.find((x) => Number(x.e) === e.id);
      return {
        id: e.id, label: e.label, url: e.url, host: new URL(e.url).host, events: e.events, madeBy: e.madeBy, createdAt: e.createdAt.toISOString(),
        day: { delivered: n(e.id, "delivered"), waiting: n(e.id, "waiting"), failed: n(e.id, "failed") },
        lastAt: l?.at ? new Date(l.at).toISOString() : null, lastStatus: l?.status === null || l?.status === undefined ? null : Number(l.status),
      };
    }),
    deliveries: list.map(({ d, s, label }) => ({
      id: d.id, endpointId: d.endpointId, endpoint: label, event: d.event, waybill: s ? formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }) : null, shipmentId: d.shipmentId,
      state: d.state, tries: d.tries, status: d.lastStatus, ms: d.lastMs, answer: d.lastAnswer, payload: JSON.parse(d.body) as unknown, at: (d.deliveredAt ?? d.createdAt).toISOString(),
      nextAt: d.state === "waiting" ? d.nextAt.toISOString() : null,
    })),
  };
}


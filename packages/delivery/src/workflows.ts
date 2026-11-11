// Fernway inside GHL's workflows.
//
// Trigger "Fernway lead": a GHL workflow that starts when one of the sub-account's leads is held, returned or signed
// for. GHL tells Fernway when such a trigger is made, changed or deleted (subscribe) and gives the address to call; a
// lead's arrival is noted once per trigger (noteTriggerSends) and sent there, retried a few times (sendDueTriggers).
//
// Action "Track with Fernway": a GHL workflow sends one of its contacts through a Fernway route (trackFromWorkflow)
// and gets the waybill and the public receipt back as workflow values.
//
// GHL signs neither call, so both carry a header only GHL's app settings and Fernway know (checked in the web app).
// The sub-account is found by GHL's locationId, which must be a connected account. A trigger's address must be on
// GHL's own API host, because the sub-account's GHL token goes with it.
import { formatWaybill } from "@fernway/core";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.js";
import { ingestLead, type Deps } from "./engine.js";
import type { GhlConnection } from "./ghl.js";
import { ghlConnections, routes, shipments, triggerEvents, triggerSends, workflowTriggers, type TriggerEvent } from "./schema.js";
import { trackToken } from "./track.js";

export const WORKFLOW_TRIGGER_KEY = "fernway_lead";
export const WORKFLOW_ACTION_KEY = "track_with_fernway";

async function accountAt(db: Db, locationId: string): Promise<number | null> {
  const [c] = await db.select({ accountId: ghlConnections.accountId }).from(ghlConnections).where(eq(ghlConnections.locationId, locationId));
  return c?.accountId ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The trigger's subscription: GHL says a workflow made, changed or deleted a "Fernway lead" trigger.

const id = z.string().trim().min(1).max(120);
const subscription = z.object({
  triggerData: z.object({
    id,
    key: z.string().max(80).optional(),
    eventType: z.enum(["CREATED", "UPDATED", "DELETED"]),
    targetUrl: z.string().url().max(500).optional(),
    filters: z.array(z.object({ field: z.string().optional(), id: z.string().optional(), value: z.unknown() }).passthrough()).max(20).optional(),
  }).passthrough(),
  extras: z.object({ locationId: id, workflowId: id.optional(), companyId: z.string().optional() }).passthrough(),
}).passthrough();

/** The arrivals a trigger's "Event" filter picked; all three when it picked none. */
export function eventsFrom(filters: { field?: string; id?: string; value: unknown }[] | undefined): TriggerEvent[] {
  const f = filters?.find((x) => (x.field ?? x.id) === "event");
  const raw = Array.isArray(f?.value) ? f.value : f?.value === undefined || f.value === null || f.value === "" ? [] : [f.value];
  const picked = triggerEvents.filter((e) => raw.map(String).includes(e));
  return picked.length ? picked : [...triggerEvents];
}

export type Subscribed = { ok: true; action: "kept" | "changed" | "removed" } | { ok: false; why: "body" | "not-connected" | "address" };

/** Keeps what GHL said about a workflow's trigger. `ghlApi` is the only origin a trigger's address may point at. */
export async function subscribe(db: Db, body: unknown, ghlApi: string): Promise<Subscribed> {
  const p = subscription.safeParse(body);
  if (!p.success) return { ok: false, why: "body" };
  const { triggerData: t, extras } = p.data;
  if (t.eventType === "DELETED") {
    await db.delete(workflowTriggers).where(eq(workflowTriggers.id, t.id));
    return { ok: true, action: "removed" };
  }
  const accountId = await accountAt(db, extras.locationId);
  if (accountId === null) return { ok: false, why: "not-connected" };
  if (!t.targetUrl || new URL(t.targetUrl).origin !== new URL(ghlApi).origin) return { ok: false, why: "address" };
  const row = { accountId, locationId: extras.locationId, workflowId: extras.workflowId ?? "unknown", events: eventsFrom(t.filters), targetUrl: t.targetUrl };
  const made = await db.insert(workflowTriggers).values({ id: t.id, ...row })
    .onConflictDoUpdate({ target: workflowTriggers.id, set: { ...row, updatedAt: sql`now()` } })
    .returning({ created: sql<boolean>`xmax = 0` });
  return { ok: true, action: made[0]?.created ? "kept" : "changed" };
}

// ---------------------------------------------------------------------------------------------------------------
// Firing: each held, returned or signed lead is noted once for each trigger that wants it, then sent.

/**
 * Notes the arrivals each trigger hasn't had yet: leads of its account that reached a state it wants after the trigger
 * was made (a new workflow does not get yesterday's leads) and in the last two days, except the leads its own workflow
 * sent (so "Track with Fernway" in a workflow started by "Fernway lead" can't loop).
 */
export async function noteTriggerSends(db: Db): Promise<number> {
  const made = await db.execute(sql`
    insert into trigger_sends (trigger_id, shipment_id, event)
    select t.id, s.id, s.state
    from workflow_triggers t
    join shipments s on s.account_id = t.account_id
    where s.state in ('held', 'returned', 'signed')
      and s.state = any (t.events)
      and s.updated_at >= t.created_at
      and s.updated_at > now() - interval '2 days'
      and s.via_workflow is distinct from t.workflow_id
    on conflict do nothing`);
  return made.rowCount ?? 0;
}

export const TRIGGER_WAITS_MIN = [1, 5, 15, 60];

/** What a "Fernway lead" trigger hands the workflow (the sample GHL's trigger settings are made from). */
export type TriggerPayload = {
  event: TriggerEvent; waybill: string; receipt: string; route: string; reason: string;
  contactId: string; email: string; phone: string; firstName: string; lastName: string; company: string; at: string;
};

export type SendDeps = {
  db: Db;
  connectionFor(accountId: number): Promise<GhlConnection | null>;
  key: Buffer;
  appUrl: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

/** Sends what is due; a refused or unreachable call waits and tries again, up to five tries, then gives up. */
export async function sendDueTriggers(d: SendDeps, limit = 50): Promise<{ sent: number; failed: number; gaveUp: number }> {
  const now = d.now?.() ?? new Date();
  const due = await d.db.select({ send: triggerSends, t: workflowTriggers, s: shipments, route: routes.label })
    .from(triggerSends)
    .innerJoin(workflowTriggers, eq(workflowTriggers.id, triggerSends.triggerId))
    .innerJoin(shipments, eq(shipments.id, triggerSends.shipmentId))
    .innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(and(isNull(triggerSends.sentAt), isNull(triggerSends.givenUpAt), lte(triggerSends.nextAt, now)))
    .orderBy(triggerSends.nextAt).limit(limit);
  const out = { sent: 0, failed: 0, gaveUp: 0 };
  for (const { send, t, s, route } of due) {
    const c = s.contact;
    const payload: TriggerPayload = {
      event: send.event, waybill: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }),
      receipt: `${d.appUrl}/track/${trackToken(d.key, s.id)}`, route, reason: s.holdReason ?? "",
      contactId: s.ghlContactId ?? "", email: c.email ?? "", phone: c.phone ?? "", firstName: c.firstName ?? "",
      lastName: c.lastName ?? "", company: c.companyName ?? "", at: s.updatedAt.toISOString(),
    };
    let status: number | null = null;
    const conn = await d.connectionFor(t.accountId).catch(() => null);
    if (conn) {
      const call = async () => (d.fetch ?? fetch)(t.targetUrl, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28", Authorization: `Bearer ${await conn.accessToken()}` },
        body: JSON.stringify(payload),
      }).then((r) => r.status, () => null);
      status = await call();
      if (status === 401) { await conn.refresh().catch(() => {}); status = await call(); }
    }
    const tries = send.tries + 1;
    if (status !== null && status >= 200 && status < 300) {
      await d.db.update(triggerSends).set({ tries, sentAt: now, lastStatus: status }).where(eq(triggerSends.id, send.id));
      out.sent++;
      continue;
    }
    // The workflow's trigger is gone in GHL (or the sub-account no longer connected): nothing more will reach it.
    const gone = status === 404 || status === 410 || !conn;
    const wait = TRIGGER_WAITS_MIN[tries - 1];
    if (gone || wait === undefined) {
      await d.db.update(triggerSends).set({ tries, givenUpAt: now, lastStatus: status }).where(eq(triggerSends.id, send.id));
      out.gaveUp++;
    } else {
      await d.db.update(triggerSends).set({ tries, lastStatus: status, nextAt: new Date(now.getTime() + wait * 60_000) }).where(eq(triggerSends.id, send.id));
      out.failed++;
    }
  }
  return out;
}

/** Sent and given-up trigger calls go after 30 days. */
export async function forgetOldTriggerSends(db: Db): Promise<number> {
  const r = await db.execute(sql`delete from trigger_sends where coalesce(sent_at, given_up_at) < now() - interval '30 days'`);
  return r.rowCount ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The action "Track with Fernway".

const extras = z.object({ locationId: id, contactId: z.string().max(120).optional(), workflowId: z.string().max(120).optional() }).passthrough();
const str = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const action = z.object({
  data: z.object({
    route: z.string().trim().min(1).max(40),
    email: str(320), phone: str(40), firstName: str(80), lastName: str(80), company: str(120), message: str(2000),
  }).passthrough(),
  extras,
}).passthrough();

/** The fields of the action's settings in GHL: the account's routes that need no meeting time, as a list to pick from. */
export async function actionFields(db: Db, body: unknown): Promise<{ inputs: unknown[] } | null> {
  const p = z.object({ extras }).passthrough().safeParse(body);
  if (!p.success) return null;
  const accountId = await accountAt(db, p.data.extras.locationId);
  const mine = accountId === null ? [] : await db.select({ key: routes.key, label: routes.label }).from(routes)
    .where(and(eq(routes.accountId, accountId), isNull(routes.calendarId))).orderBy(routes.label);
  return {
    inputs: [{
      section: "Route",
      fields: [{
        field: "route", title: "Fernway route", fieldType: "select", required: true,
        options: mine.map((r) => ({ label: r.label, value: r.key })),
      }],
    }],
  };
}

export type Tracked =
  | { ok: true; waybill: string; receipt: string; state: string; duplicate: boolean }
  | { ok: false; status: 400 | 404 | 422; problems: string[] };

/**
 * Sends a workflow's contact through a Fernway route. The same contact sent by the same workflow within ten minutes
 * is the same waybill (GHL may run an action again after a slow answer); later, it is a new lead.
 */
export async function trackFromWorkflow(deps: Deps, body: unknown, key: Buffer, appUrl: string, now = new Date()): Promise<Tracked> {
  const p = action.safeParse(body);
  if (!p.success) return { ok: false, status: 400, problems: p.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).slice(0, 5) };
  const { data, extras: x } = p.data;
  const accountId = await accountAt(deps.db, x.locationId);
  if (accountId === null) return { ok: false, status: 404, problems: ["location: this sub-account is not connected to Fernway"] };
  const bucket = Math.floor(now.getTime() / 600_000);
  const who = x.contactId || data.email || data.phone || "anyone";
  const r = await ingestLead(deps, accountId, {
    idempotencyKey: `workflow:${x.workflowId ?? "none"}:${who}:${bucket}`.slice(0, 200),
    source: "workflow",
    route: data.route,
    contact: {
      ...(data.email && { email: data.email }), ...(data.phone && { phone: data.phone }),
      ...(data.firstName && { firstName: data.firstName }), ...(data.lastName && { lastName: data.lastName }),
      ...(data.company && { companyName: data.company }), ...(data.message && { message: data.message }),
    },
  }, { viaWorkflow: x.workflowId });
  if (!r.ok) return { ok: false, status: 422, problems: r.problems };
  return { ok: true, waybill: r.waybill.number, receipt: `${appUrl}/track/${trackToken(key, r.waybill.id)}`, state: r.waybill.state, duplicate: r.duplicate };
}

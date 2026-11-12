// The customer console's data: the delivery board, the sync log, one lead with everything sent and answered, resend
// (one lead, or every held lead with the same reason) and the audit log. Everything is scoped to one account: a lead
// of another account is "not found", never shown.
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { formatWaybill, parseWaybill } from "@fernway/core";
import type { Db } from "./db.js";
import { resend, type Deps } from "./engine.js";
import { auditLog, routes, scans, shipments, type AuditAction, type AuditTarget, type LeadContact, type ShipmentState } from "./schema.js";
import { readable } from "./track.js";

const number = (s: { waybillYear: number; waybillSeq: number }) => formatWaybill({ year: s.waybillYear, seq: s.waybillSeq });

// ---------------------------------------------------------------------------------------------------------------
// The board.

export type BoardView = {
  moving: number; waiting: number; held: number; returned: number;
  signed24h: number; signedToday: number; heldOrReturned24h: number;
  oldestWaiting: { shipmentId: number; waybill: string; since: string; tries: number; nextAt: string | null } | null;
  firstTryShare: number | null; medianSignMs: number | null;
  perHour: { hour: string; signed: number; held: number }[];
  holdReasons: { reason: string; count: number; latest: string }[];
  recent: { shipmentId: number; waybill: string; who: string; route: string; state: ShipmentState; at: string; tries: number }[];
};

export async function boardView(db: Db, accountId: number): Promise<BoardView> {
  const mine = eq(shipments.accountId, accountId);
  const byState = await db.select({ state: shipments.state, n: count() }).from(shipments).where(mine).groupBy(shipments.state);
  const n = (...k: ShipmentState[]) => byState.filter((r) => k.includes(r.state)).reduce((a, r) => a + r.n, 0);

  // Each lead's first signature, for the last 24 hours: how many, how fast, on the first try or not.
  const signed = await db.execute<{ id: number; at: Date; ms: number; first_try: boolean }>(sql`
    select s.id, min(sc.at) as at,
      extract(epoch from (min(sc.at) - s.created_at)) * 1000 as ms,
      bool_and(coalesce(sc.try, 1) = 1) as first_try
    from ${shipments} s join ${scans} sc on sc.shipment_id = s.id and sc.kind = 'signed'
    where s.account_id = ${accountId}
    group by s.id
    having min(sc.at) > now() - interval '24 hours'`);
  const rows = signed.rows;
  const ms = rows.map((r) => Number(r.ms)).sort((a, b) => a - b);
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);

  const ended = await db.select({ n: count() }).from(shipments)
    .where(and(mine, inArray(shipments.state, ["held", "returned"]), gte(shipments.updatedAt, sql`now() - interval '24 hours'`)));

  const [oldest] = await db.select().from(shipments)
    .where(and(mine, inArray(shipments.state, ["picked_up", "in_transit", "waiting"])))
    .orderBy(asc(shipments.createdAt)).limit(1);

  // 24 hourly bars: signed and held/returned per hour, ending with the current hour.
  const hours = await db.execute<{ hour: Date; signed: number; held: number }>(sql`
    with h as (select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as hour)
    select h.hour,
      (select count(*) from (select s.id from ${shipments} s join ${scans} sc on sc.shipment_id = s.id and sc.kind = 'signed'
         where s.account_id = ${accountId} group by s.id having date_trunc('hour', min(sc.at)) = h.hour) x)::int as signed,
      (select count(*) from ${shipments} s where s.account_id = ${accountId} and s.state in ('held', 'returned')
         and date_trunc('hour', s.updated_at) = h.hour)::int as held
    from h order by h.hour`);

  const reasons = await db.select({ reason: shipments.holdReason, n: count(), latest: sql<Date>`max(${shipments.updatedAt})` })
    .from(shipments).where(and(mine, eq(shipments.state, "held"), isNotNull(shipments.holdReason)))
    .groupBy(shipments.holdReason).orderBy(desc(count())).limit(6);

  const recent = await db.select({ s: shipments, route: routes.label }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(mine).orderBy(desc(shipments.updatedAt)).limit(8);

  return {
    moving: n("picked_up", "in_transit"), waiting: n("waiting"), held: n("held"), returned: n("returned"),
    signed24h: rows.length,
    signedToday: rows.filter((r) => new Date(r.at) >= startOfDay).length,
    heldOrReturned24h: ended[0]?.n ?? 0,
    oldestWaiting: oldest ? {
      shipmentId: oldest.id, waybill: number(oldest), since: oldest.createdAt.toISOString(), tries: oldest.tries,
      nextAt: oldest.nextTryAt?.toISOString() ?? null,
    } : null,
    firstTryShare: rows.length ? rows.filter((r) => r.first_try).length / rows.length : null,
    medianSignMs: ms.length ? ms[Math.floor(ms.length / 2)]! : null,
    perHour: hours.rows.map((h) => ({ hour: new Date(h.hour).toISOString(), signed: Number(h.signed), held: Number(h.held) })),
    holdReasons: reasons.map((r) => ({ reason: readable(r.reason) ?? "No reason given", count: r.n, latest: new Date(r.latest).toISOString() })),
    recent: recent.map(({ s, route }) => ({
      shipmentId: s.id, waybill: number(s), who: personOf(s.contact), route, state: s.state, at: s.updatedAt.toISOString(), tries: s.tries,
    })),
  };
}

export const personOf = (c: LeadContact) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone || "No name";

// ---------------------------------------------------------------------------------------------------------------
// The sync log: every lead, newest first, 15 a page, with filters.

export const LOG_PAGE = 15;
export const logStates = ["moving", "waiting", "signed", "held", "returned"] as const;
export type LogState = (typeof logStates)[number];
const statesOf: Record<LogState, ShipmentState[]> = {
  moving: ["picked_up", "in_transit"], waiting: ["waiting"], signed: ["signed"], held: ["held"], returned: ["returned"],
};

export type LogRow = { shipmentId: number; waybill: string; who: string; email: string | null; company: string | null; route: string;
  source: string; state: ShipmentState; tries: number; at: string; updatedAt: string; reason: string | null; lastStatus: number | null };

export async function syncLog(db: Db, accountId: number, f: { q?: string; state?: LogState; route?: string; page?: number }) {
  const where = [eq(shipments.accountId, accountId)];
  if (f.state) where.push(inArray(shipments.state, statesOf[f.state]));
  if (f.route) where.push(eq(routes.key, f.route));
  const q = f.q?.trim();
  if (q) {
    const wb = parseWaybill(q);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(wb
      ? and(eq(shipments.waybillYear, wb.year), eq(shipments.waybillSeq, wb.seq))!
      : or(ilike(sql`${shipments.contact}->>'email'`, like), ilike(sql`${shipments.contact}->>'firstName'`, like),
          ilike(sql`${shipments.contact}->>'lastName'`, like), ilike(sql`${shipments.contact}->>'companyName'`, like),
          ilike(sql`${shipments.contact}->>'phone'`, like))!);
  }
  const [total] = await db.select({ n: count() }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId)).where(and(...where));
  const pages = Math.max(1, Math.ceil((total?.n ?? 0) / LOG_PAGE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const rows = await db.select({
    s: shipments, route: routes.label,
    lastStatus: sql<number | null>`(select ${scans.answerStatus} from ${scans} where ${scans.shipmentId} = ${shipments.id} and ${scans.answerStatus} is not null order by ${scans.at} desc limit 1)`,
  }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId)).where(and(...where))
    .orderBy(desc(shipments.createdAt), desc(shipments.id)).limit(LOG_PAGE).offset((page - 1) * LOG_PAGE);
  const counts = await db.select({ state: shipments.state, n: count() }).from(shipments).where(eq(shipments.accountId, accountId)).groupBy(shipments.state);
  return {
    total: total?.n ?? 0, page, pages,
    counts: Object.fromEntries(logStates.map((k) => [k, counts.filter((c) => statesOf[k].includes(c.state)).reduce((a, c) => a + c.n, 0)])) as Record<LogState, number>,
    rows: rows.map(({ s, route, lastStatus }): LogRow => ({
      shipmentId: s.id, waybill: number(s), who: personOf(s.contact), email: s.contact.email ?? null, company: s.contact.companyName ?? null,
      route, source: s.source, state: s.state, tries: s.tries, at: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
      reason: readable(s.holdReason), lastStatus: lastStatus === null ? null : Number(lastStatus),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// One lead: the whole contact, and every scan with what was sent and what GHL answered.

export type LeadView = {
  shipmentId: number; waybill: string; state: ShipmentState; source: string; route: { key: string; label: string };
  contact: LeadContact; idempotencyKey: string; tries: number; createdAt: string; nextTryAt: string | null; reason: string | null;
  meeting: string | null; ghl: { contactId: string | null; opportunityId: string | null; noteId: string | null; appointmentId: string | null };
  scans: { id: number; kind: string; step: string | null; at: string; try: number | null; status: number | null; ms: number | null;
    sent: unknown; answer: string | null; note: string | null }[];
};

export async function leadView(db: Db, accountId: number, shipmentId: number): Promise<LeadView | null> {
  const [r] = await db.select({ s: shipments, route: routes }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(and(eq(shipments.id, shipmentId), eq(shipments.accountId, accountId)));
  if (!r) return null;
  const list = await db.select().from(scans).where(eq(scans.shipmentId, shipmentId)).orderBy(asc(scans.at), asc(scans.id));
  const s = r.s;
  return {
    shipmentId: s.id, waybill: number(s), state: s.state, source: s.source, route: { key: r.route.key, label: r.route.label },
    contact: s.contact, idempotencyKey: s.idempotencyKey, tries: s.tries, createdAt: s.createdAt.toISOString(),
    nextTryAt: s.nextTryAt?.toISOString() ?? null, reason: readable(s.holdReason), meeting: s.bookingStart?.toISOString() ?? null,
    ghl: { contactId: s.ghlContactId, opportunityId: s.ghlOpportunityId, noteId: s.ghlNoteId, appointmentId: s.ghlAppointmentId },
    scans: list.map((c) => ({
      id: c.id, kind: c.kind, step: c.step, at: c.at.toISOString(), try: c.try, status: c.answerStatus, ms: c.answerMs,
      sent: c.sent, answer: c.answerExcerpt, note: readable(c.note),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Resend and the audit log.

// userId is null for someone acting from inside GHL (no Fernway sign-in), and for GHL itself.
export type Actor = { accountId: number; userId: number | null; name: string };

export async function audit(db: Db, a: Actor, action: AuditAction, target: { kind: AuditTarget; id: string } | null, detail = "") {
  await db.insert(auditLog).values({
    accountId: a.accountId, userId: a.userId, who: a.name.slice(0, 80), action,
    targetKind: target?.kind ?? null, targetId: target?.id ?? null, detail: detail.slice(0, 300),
  });
}

/** Resends one held or returned lead of this account. */
export async function resendLead(deps: Deps, a: Actor, shipmentId: number): Promise<boolean> {
  const [s] = await deps.db.select().from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.accountId, a.accountId)));
  if (!s) return false;
  const ok = await resend(deps, s.id, `resent by ${a.name}`);
  if (ok) await audit(deps.db, a, "lead.resent", { kind: "lead", id: number(s) }, readable(s.holdReason) ?? (s.state === "returned" ? "returned after 8 tries" : ""));
  return ok;
}

/** Resends every held lead of this account that GHL refused for the same reason, at most 500 at a time. */
export async function resendHeld(deps: Deps, a: Actor, reason: string): Promise<number> {
  const held = await deps.db.select().from(shipments)
    .where(and(eq(shipments.accountId, a.accountId), eq(shipments.state, "held"))).limit(2000);
  const same = held.filter((s) => (readable(s.holdReason) ?? "No reason given") === reason).slice(0, 500);
  let n = 0;
  for (const s of same) if (await resend(deps, s.id, `resent by ${a.name} with every lead held for the same reason`)) n++;
  if (n) await audit(deps.db, a, "leads.resent", null, `${n} held for: ${reason}`);
  return n;
}

export const AUDIT_PAGE = 15;
export const auditGroups = { leads: ["lead.", "leads."], routes: ["route."], ghl: ["ghl."], team: ["member.", "invite."], keys: ["key."], plan: ["plan."], forms: ["form."] } as const;
export type AuditGroup = keyof typeof auditGroups;

export async function auditView(db: Db, accountId: number, page = 1, group?: AuditGroup) {
  const where = and(eq(auditLog.accountId, accountId),
    group ? or(...auditGroups[group].map((p) => ilike(auditLog.action, `${p}%`))) : undefined);
  const [t] = await db.select({ n: count() }).from(auditLog).where(where);
  const pages = Math.max(1, Math.ceil((t?.n ?? 0) / AUDIT_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await db.select().from(auditLog).where(where)
    .orderBy(desc(auditLog.at), desc(auditLog.id)).limit(AUDIT_PAGE).offset((p - 1) * AUDIT_PAGE);
  return { total: t?.n ?? 0, page: p, pages, rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })) };
}

/** The account's lead id for a waybill number, so audit lines and links can point at the lead. */
export async function shipmentByWaybill(db: Db, accountId: number, waybill: string): Promise<number | null> {
  const w = parseWaybill(waybill);
  if (!w) return null;
  const [s] = await db.select({ id: shipments.id }).from(shipments)
    .where(and(eq(shipments.accountId, accountId), eq(shipments.waybillYear, w.year), eq(shipments.waybillSeq, w.seq)));
  return s?.id ?? null;
}

// The delivery engine. A lead becomes a shipment (picked up, checked), then travels to GHL in tries: the contact is
// upserted ("handed to GHL"), then the opportunity in the route's pipeline and stage ("signed for"). A failure GHL may
// get over (429, 5xx, no answer, an expired token) waits and tries again on the schedule in @fernway/core; one it
// won't (a 4xx about the data) is held at once with the reason. After the eighth try the waybill is returned.
//
// Rules that keep the landing page's promises true:
// - every try writes its scans in the same transaction that moves the shipment's state, so no path skips a receipt;
// - the same lead (idempotency key) is one shipment; the contact and opportunity are upserts, and an id GHL already
//   gave us is never asked for again, so no retry makes a duplicate;
// - a try only runs if the shipment is where that try expects it to be, so a repeated or late job does nothing.
import { formatWaybill, waitBeforeTry, MAX_TRIES } from "@fernway/core";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import type { GhlAnswer, GhlClient, GhlConnection } from "./ghl.js";
import { checkLead } from "./lead.js";
import { routes, scans, shipments, type LeadContact, type ScanKind } from "./schema.js";

export type Deps = {
  db: Db;
  ghl: GhlClient;
  /** The GHL connection for an account, or null if it isn't connected. */
  connectionFor(accountId: number): Promise<GhlConnection | null>;
  /** Puts try `tryNumber` of a shipment on the queue after `delayMs`. */
  schedule(shipmentId: number, tryNumber: number, delayMs: number): Promise<void>;
  /** 1 in production. The Break it demo and the tests run the 24 h schedule faster; waits shrink by this factor. */
  timeScale?: number;
};

export type Waybill = { id: number; number: string; state: string };

export type IngestResult =
  | { ok: true; waybill: Waybill; duplicate: boolean }
  | { ok: false; problems: string[] };

const toWaybill = (s: { id: number; waybillYear: number; waybillSeq: number; state: string }): Waybill => ({
  id: s.id,
  number: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }),
  state: s.state,
});

/** Picks up a lead: checks it, gives it a waybill number and puts its first try on the queue. */
export async function ingestLead(deps: Deps, accountId: number, input: unknown): Promise<IngestResult> {
  const checked = checkLead(input);
  if (!checked.ok) return checked;
  const { lead } = checked;

  const [route] = await deps.db
    .select({ id: routes.id })
    .from(routes)
    .where(and(eq(routes.accountId, accountId), eq(routes.key, lead.route)));
  if (!route) return { ok: false, problems: [`route: no route called "${lead.route}"`] };

  const result = await deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(shipments)
      .values({
        accountId,
        routeId: route.id,
        waybillYear: sql`(extract(year from now())::int % 100)`,
        waybillSeq: sql`nextval('waybill_seq')`,
        idempotencyKey: lead.idempotencyKey,
        source: lead.source,
        contact: lead.contact,
        state: "picked_up",
        nextTryAt: sql`now()`,
      })
      .onConflictDoNothing({ target: [shipments.accountId, shipments.idempotencyKey] })
      .returning();
    if (!created) {
      const [existing] = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.accountId, accountId), eq(shipments.idempotencyKey, lead.idempotencyKey)));
      return { shipment: existing!, duplicate: true };
    }
    await tx.insert(scans).values([
      { shipmentId: created.id, kind: "picked_up", note: `from ${lead.source}` },
      { shipmentId: created.id, kind: "checked", note: contactSummary(lead.contact) },
    ]);
    return { shipment: created, duplicate: false };
  });

  if (!result.duplicate) await deps.schedule(result.shipment.id, 1, 0);
  return { ok: true, waybill: toWaybill(result.shipment), duplicate: result.duplicate };
}

function contactSummary(c: LeadContact): string {
  return [c.email ? "email" : null, c.phone ? "phone" : null, c.companyName ? "company" : null]
    .filter(Boolean)
    .join(", ")
    .replace(/^/, "valid: ");
}

export type TryOutcome = "signed" | "waiting" | "held" | "returned" | "skipped";

/** Runs one try of one shipment. Safe to call twice: a try that isn't due does nothing and says "skipped". */
export async function deliverTry(deps: Deps, shipmentId: number, tryNumber: number): Promise<TryOutcome> {
  // Claim the try. A shipment left "in transit" for over two minutes (a worker died mid-try) can be claimed again
  // by the same try; anything else that doesn't match is a stale or repeated job.
  const claimed = await deps.db.transaction(async (tx) => {
    const [s] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update");
    if (!s) return null;
    const fresh = (s.state === "picked_up" || s.state === "waiting") && s.tries === tryNumber - 1;
    const stalled =
      s.state === "in_transit" && s.tries === tryNumber && s.updatedAt.getTime() < Date.now() - 120_000;
    if (!fresh && !stalled) return null;
    const [u] = await tx
      .update(shipments)
      .set({ state: "in_transit", tries: tryNumber, nextTryAt: null, updatedAt: sql`now()` })
      .where(eq(shipments.id, shipmentId))
      .returning();
    return u!;
  });
  if (!claimed) return "skipped";

  const [route] = await deps.db.select().from(routes).where(eq(routes.id, claimed.routeId));
  const conn = await deps.connectionFor(claimed.accountId);
  if (!conn) return hold(deps, shipmentId, tryNumber, "GHL is not connected for this account", null);

  let contactId = claimed.ghlContactId;
  if (!contactId) {
    const a = await deps.ghl.upsertContact(conn, claimed.contact, route!.tags);
    if (!a.ok) return failed(deps, conn, shipmentId, tryNumber, "contact", a);
    contactId = a.id;
    await deps.db.transaction(async (tx) => {
      await tx.update(shipments).set({ ghlContactId: a.id, updatedAt: sql`now()` }).where(eq(shipments.id, shipmentId));
      await tx.insert(scans).values(scan(shipmentId, "handed", tryNumber, "contact", a, `contact ${a.id}`));
    });
  }

  if (route!.pipelineId && route!.stageId && !claimed.ghlOpportunityId) {
    const name = [claimed.contact.firstName, claimed.contact.lastName].filter(Boolean).join(" ") ||
      claimed.contact.companyName || claimed.contact.email || claimed.contact.phone || "Lead";
    const a = await deps.ghl.upsertOpportunity(conn, {
      contactId,
      pipelineId: route!.pipelineId,
      stageId: route!.stageId,
      name: `${name} · ${route!.label}`,
    });
    if (!a.ok) return failed(deps, conn, shipmentId, tryNumber, "opportunity", a);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(shipments)
        .set({ ghlOpportunityId: a.id, state: "signed", holdReason: null, updatedAt: sql`now()` })
        .where(eq(shipments.id, shipmentId));
      await tx.insert(scans).values(scan(shipmentId, "signed", tryNumber, "opportunity", a, `${route!.label}: stage set`));
    });
    return "signed";
  }

  await deps.db.transaction(async (tx) => {
    await tx.update(shipments).set({ state: "signed", holdReason: null, updatedAt: sql`now()` }).where(eq(shipments.id, shipmentId));
    await tx.insert(scans).values({ shipmentId, kind: "signed", try: tryNumber, note: "contact in GHL; this route sets no stage" });
  });
  return "signed";
}

type Failure = Extract<GhlAnswer, { ok: false }> & { sent: object };

async function failed(deps: Deps, conn: GhlConnection, shipmentId: number, tryNumber: number, step: "contact" | "opportunity", a: Failure): Promise<TryOutcome> {
  if (a.next === "hold") {
    return hold(deps, shipmentId, tryNumber, `GHL refused the ${step} (${a.status ?? "no answer"}): ${a.excerpt.slice(0, 160)}`, { step, a });
  }
  // An expired token: refresh it now, so the next try goes out with a fresh one.
  if (a.next === "auth") await conn.refresh().catch(() => {});

  const wait = waitBeforeTry(tryNumber + 1);
  if (wait === null) {
    await deps.db.transaction(async (tx) => {
      await tx.update(shipments).set({ state: "returned", updatedAt: sql`now()` }).where(eq(shipments.id, shipmentId));
      await tx.insert(scans).values(
        scan(shipmentId, "returned", tryNumber, step, a, `${MAX_TRIES} tries over 24 h; GHL last answered ${a.status ?? "nothing"}`),
      );
    });
    return "returned";
  }

  const delay = Math.max(0, Math.round(wait * (deps.timeScale ?? 1)));
  await deps.db.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({ state: "waiting", nextTryAt: new Date(Date.now() + delay), updatedAt: sql`now()` })
      .where(eq(shipments.id, shipmentId));
    await tx.insert(scans).values(
      scan(shipmentId, "retry_scheduled", tryNumber, step, a, `try ${tryNumber + 1} of ${MAX_TRIES} in ${spell(wait)}`),
    );
  });
  await deps.schedule(shipmentId, tryNumber + 1, delay);
  return "waiting";
}

async function hold(deps: Deps, shipmentId: number, tryNumber: number, reason: string, from: { step: "contact" | "opportunity"; a: Failure } | null): Promise<TryOutcome> {
  await deps.db.transaction(async (tx) => {
    await tx.update(shipments).set({ state: "held", holdReason: reason, updatedAt: sql`now()` }).where(eq(shipments.id, shipmentId));
    await tx.insert(scans).values(
      from ? scan(shipmentId, "held", tryNumber, from.step, from.a, reason) : { shipmentId, kind: "held" as const, try: tryNumber, note: reason },
    );
  });
  return "held";
}

function scan(shipmentId: number, kind: ScanKind, tryNumber: number, step: "contact" | "opportunity", a: { status: number | null; excerpt: string; sent: object }, note: string) {
  return {
    shipmentId,
    kind,
    try: tryNumber,
    step,
    sent: a.sent,
    answerStatus: a.status,
    answerExcerpt: a.excerpt.slice(0, 500),
    note: note.slice(0, 300),
  };
}

function spell(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)} h`;
}

/** One-click resend of a held or returned waybill: a fresh set of eight tries, with the resend on the receipt. */
export async function resend(deps: Deps, shipmentId: number, note = "resent by hand"): Promise<boolean> {
  const ok = await deps.db.transaction(async (tx) => {
    const [s] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update");
    if (!s || (s.state !== "held" && s.state !== "returned")) return false;
    await tx
      .update(shipments)
      .set({ state: "picked_up", tries: 0, holdReason: null, nextTryAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(shipments.id, shipmentId));
    await tx.insert(scans).values({ shipmentId, kind: "resent", note });
    return true;
  });
  if (ok) await deps.schedule(shipmentId, 1, 0);
  return ok;
}

/**
 * The safety net, run every minute by the worker: anything due more than two minutes ago, or stuck in transit for
 * more than two, is put back on the queue. If Redis ever lost its queue, every shipment would still be delivered.
 */
export async function sweep(deps: Deps): Promise<number> {
  const due = await deps.db
    .select({ id: shipments.id, state: shipments.state, tries: shipments.tries })
    .from(shipments)
    .where(
      sql`(${inArray(shipments.state, ["picked_up", "waiting"])} and ${lt(shipments.nextTryAt, sql`now() - interval '2 minutes'`)})
          or (${eq(shipments.state, "in_transit")} and ${lt(shipments.updatedAt, sql`now() - interval '2 minutes'`)})`,
    )
    .limit(500);
  for (const s of due) await deps.schedule(s.id, s.state === "in_transit" ? s.tries : s.tries + 1, 0);
  return due.length;
}

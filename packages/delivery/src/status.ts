// The public status page's numbers, read from the real tables only: the delivery queue, GHL's answer times, and the
// box's own runs (deploys, backups, the off-box copy, restore tests). The demo account is left out everywhere: its leads
// only ever meet the stand-in GHL, so they would make GHL look faster than it is.
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { opsRuns, scans, shipments } from "./schema.js";

export type Run = { ok: boolean; at: string; detail: string };
export type RunKind = "deploy" | "backup" | "offsite" | "restore_test";
export type StatusView = {
  queue: { moving: number; oldestAt: string | null; signed24h: number; held24h: number; returned24h: number };
  ghl: { calls: number; timed: number; medianMs: number | null; p95Ms: number | null; answered2xx: number } | null;
  recent: { at: string; step: string | null; status: number | null; ms: number }[];
  runs: Record<RunKind, Run | null>;
};

const kinds: RunKind[] = ["deploy", "backup", "offsite", "restore_test"];

export async function statusView(db: Db, demoAccountId: number): Promise<StatusView> {
  const real = ne(shipments.accountId, demoAccountId);
  const day = sql`now() - interval '24 hours'`;

  const [q] = await db
    .select({ moving: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${shipments.createdAt})` })
    .from(shipments)
    .where(and(real, inArray(shipments.state, ["picked_up", "in_transit", "waiting"])));

  const ends = await db
    .select({ kind: scans.kind, n: sql<number>`count(*)::int` })
    .from(scans)
    .innerJoin(shipments, eq(shipments.id, scans.shipmentId))
    .where(and(real, inArray(scans.kind, ["signed", "held", "returned"]), sql`${scans.at} > ${day}`))
    .groupBy(scans.kind);
  const ended = (k: string) => ends.find((e) => e.kind === k)?.n ?? 0;

  // Every call to GHL writes a scan with its step (contact, note, appointment, opportunity), timed or not: calls made
  // before answer times were recorded still count as calls; the times come from the timed ones only.
  const called = and(real, isNotNull(scans.step), sql`${scans.at} > ${day}`);
  const timed = and(called, isNotNull(scans.answerMs));
  const [g] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      median: sql<number | null>`round(percentile_cont(0.5) within group (order by ${scans.answerMs}))::int`,
      p95: sql<number | null>`round(percentile_cont(0.95) within group (order by ${scans.answerMs}))::int`,
      timed: sql<number>`count(${scans.answerMs})::int`,
      ok: sql<number>`count(*) filter (where ${scans.answerStatus} between 200 and 299)::int`,
    })
    .from(scans)
    .innerJoin(shipments, eq(shipments.id, scans.shipmentId))
    .where(called);

  const recent = await db
    .select({ at: scans.at, step: scans.step, status: scans.answerStatus, ms: scans.answerMs })
    .from(scans)
    .innerJoin(shipments, eq(shipments.id, scans.shipmentId))
    .where(timed)
    .orderBy(desc(scans.at), desc(scans.id))
    .limit(8);

  const runs = {} as Record<RunKind, Run | null>;
  for (const k of kinds) {
    const [r] = await db.select().from(opsRuns).where(eq(opsRuns.kind, k)).orderBy(desc(opsRuns.at), desc(opsRuns.id)).limit(1);
    runs[k] = r ? { ok: r.ok, at: r.at.toISOString(), detail: r.detail } : null;
  }

  const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
  return {
    queue: { moving: q?.moving ?? 0, oldestAt: iso(q?.oldest ?? null), signed24h: ended("signed"), held24h: ended("held"), returned24h: ended("returned") },
    ghl: g && g.calls > 0 ? { calls: g.calls, timed: g.timed, medianMs: g.median, p95Ms: g.p95, answered2xx: g.ok } : null,
    recent: recent.map((r) => ({ at: r.at.toISOString(), step: r.step, status: r.status, ms: r.ms! })),
    runs,
  };
}

/** Every recorded deploy, newest first: which commit went live, and when. */
export async function deploys(db: Db): Promise<{ commit: string; at: string }[]> {
  const rows = await db.select().from(opsRuns).where(and(eq(opsRuns.kind, "deploy"), eq(opsRuns.ok, true))).orderBy(desc(opsRuns.at), desc(opsRuns.id));
  return rows.map((r) => ({ commit: r.detail, at: r.at.toISOString() }));
}

// The public tracking receipt: what a visitor may see about their own lead, reached only through a signed link.
// The link names one shipment and expires; nothing in it can be changed to reach another. The view shows the
// waybill, its route and every scan with what GHL answered, but never what was sent, GHL's ids, or the full email.
import { formatWaybill, parseWaybill } from "@fernway/core";
import { and, asc, eq, sql } from "drizzle-orm";
import { signValue, verifyValue } from "./crypto.js";
import type { Db } from "./db.js";
import { routes, scans, shipments, type ScanKind } from "./schema.js";

const TRACK_TTL = 30 * 24 * 60 * 60_000;

export const trackToken = (key: Buffer, shipmentId: number) => signValue(key, "track", { s: shipmentId }, TRACK_TTL);
export const readTrackToken = (key: Buffer, token: string | null | undefined) => verifyValue<{ s: number }>(key, "track", token)?.s ?? null;

/** "jerome@example.com" becomes "j•••@example.com": enough to recognise, not enough to copy. */
export function maskEmail(email: string | undefined): string | null {
  if (!email) return null;
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
}

export type TrackView = {
  number: string;
  state: string;
  pickedUpAt: string;
  route: string;
  consignee: { firstName: string | null; lastName: string | null; company: string | null; email: string | null };
  holdReason: string | null;
  /** The meeting time picked on a booking route (ISO), or null. */
  meeting: string | null;
  scans: { kind: ScanKind; step: string | null; at: string; try: number | null; status: number | null; note: string | null }[];
};

export async function trackView(db: Db, shipmentId: number): Promise<TrackView | null> {
  const [s] = await db
    .select({ shipment: shipments, routeLabel: routes.label })
    .from(shipments)
    .innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(eq(shipments.id, shipmentId));
  if (!s) return null;
  const rows = await db.select().from(scans).where(eq(scans.shipmentId, shipmentId)).orderBy(asc(scans.at), asc(scans.id));
  const c = s.shipment.contact;
  return {
    number: formatWaybill({ year: s.shipment.waybillYear, seq: s.shipment.waybillSeq }),
    state: s.shipment.state,
    pickedUpAt: s.shipment.createdAt.toISOString(),
    route: s.routeLabel,
    consignee: { firstName: c.firstName ?? null, lastName: c.lastName ?? null, company: c.companyName ?? null, email: maskEmail(c.email) },
    holdReason: s.shipment.holdReason,
    meeting: s.shipment.bookingStart ? s.shipment.bookingStart.toISOString() : null,
    scans: rows.map((r) => ({
      kind: r.kind,
      step: r.step,
      at: r.at.toISOString(),
      try: r.try,
      status: r.answerStatus,
      // GHL's own ids stay out of the public receipt; the reason a lead waits or is held stays in.
      note: r.kind === "handed" || r.kind === "signed" ? null : r.note,
    })),
  };
}

/**
 * Finds a waybill again from what the visitor knows: its number and the email they sent it with. Both must match a
 * lead of this account; anything else is "not found", the same answer whether the number exists or not.
 */
export async function findWaybill(db: Db, accountId: number, number: string, email: string): Promise<number | null> {
  const w = parseWaybill(number);
  const e = email.trim().toLowerCase();
  if (!w || !e) return null;
  const [s] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(
      eq(shipments.accountId, accountId), eq(shipments.waybillYear, w.year), eq(shipments.waybillSeq, w.seq),
      sql`${shipments.contact}->>'email' = ${e}`,
    ));
  return s?.id ?? null;
}

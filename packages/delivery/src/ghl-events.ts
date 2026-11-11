// What GHL tells Fernway by itself. GHL signs every webhook with its Ed25519 key (header X-GHL-Signature, base64, over
// the exact body); anything else is refused. Each event is kept once by its webhook id, with a summary in Fernway's
// words, and the leads it touches get a scan on their waybill: a deal moved, won or lost; a meeting moved or cancelled;
// a contact or deal deleted. An uninstall in GHL disconnects the account, as the owner's Disconnect would.
import { createHash, verify } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { auditLog, ghlConnections, ghlEvents, scans, shipments, type ScanKind } from "./schema.js";

/** GHL's published Ed25519 public key for X-GHL-Signature (marketplace docs, Webhook Integration Guide). */
export const GHL_WEBHOOK_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

/** True only for the exact body GHL signed. */
export function verifyGhl(rawBody: string, signature: string | null | undefined, publicKeyPem = GHL_WEBHOOK_KEY): boolean {
  if (!signature || signature.length > 200) return false;
  try {
    return verify(null, Buffer.from(rawBody, "utf8"), publicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

type Body = Record<string, unknown> & { type?: unknown; locationId?: unknown; companyId?: unknown; id?: unknown; webhookId?: unknown };
const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 120 ? v : null);

export type GhlHandled = { result: "done" | "repeat"; type: string; leads: number; summary: string };

/** Takes one verified event. Safe to call twice with the same event: the second does nothing. */
export async function handleGhlEvent(db: Db, raw: string, body: Body): Promise<GhlHandled> {
  const type = str(body.type) ?? "Unknown";
  const webhookId = str(body.webhookId) ?? createHash("sha256").update(raw).digest("hex");
  const location = str(body.locationId);
  const company = str(body.companyId);

  return db.transaction(async (tx) => {
    const [ev] = await tx.insert(ghlEvents).values({ webhookId, type: type.slice(0, 60), locationId: location }).onConflictDoNothing()
      .returning({ id: ghlEvents.id });
    if (!ev) return { result: "repeat" as const, type, leads: 0, summary: "" };

    // The Fernway accounts connected to that sub-account (or, for an agency-wide uninstall, to that agency).
    const conns = location
      ? await tx.select().from(ghlConnections).where(eq(ghlConnections.locationId, location))
      : company && type === "UNINSTALL" ? await tx.select().from(ghlConnections).where(eq(ghlConnections.companyId, company)) : [];
    const accounts = conns.map((c) => c.accountId);

    const mark = async (col: typeof shipments.ghlContactId | typeof shipments.ghlOpportunityId | typeof shipments.ghlAppointmentId, id: string | null, kind: ScanKind, note: string, detail?: object) => {
      if (!id || accounts.length === 0) return 0;
      const hit = await tx.select({ id: shipments.id }).from(shipments).where(and(inArray(shipments.accountId, accounts), eq(col, id)));
      if (hit.length === 0) return 0;
      await tx.insert(scans).values(hit.map((h) => ({
        shipmentId: h.id, kind, note: note.slice(0, 300), answerExcerpt: detail ? JSON.stringify(detail).slice(0, 500) : null,
      })));
      return hit.length;
    };

    let leads = 0;
    let summary = "Not used by Fernway";
    const appt = (body.appointment && typeof body.appointment === "object" ? body.appointment : {}) as Record<string, unknown>;
    switch (type) {
      case "OpportunityStageUpdate": {
        const stage = str(body.pipelineStageId);
        leads = await mark(shipments.ghlOpportunityId, str(body.id), "ghl_moved", `moved to stage ${stage ?? "unknown"}`, { pipelineId: str(body.pipelineId), pipelineStageId: stage });
        summary = "A deal moved to another stage";
        break;
      }
      case "OpportunityStatusUpdate": {
        const status = str(body.status) ?? "unknown";
        leads = await mark(shipments.ghlOpportunityId, str(body.id), "ghl_moved", `marked ${status}`, { status });
        summary = `A deal marked ${status}`;
        break;
      }
      case "OpportunityDelete":
        leads = await mark(shipments.ghlOpportunityId, str(body.id), "ghl_deleted", "deal deleted in GHL");
        summary = "A deal deleted";
        break;
      case "ContactDelete":
        leads = await mark(shipments.ghlContactId, str(body.id), "ghl_deleted", "contact deleted in GHL");
        summary = "A contact deleted";
        break;
      case "AppointmentUpdate": {
        const status = str(appt.appointmentStatus) ?? "updated";
        const start = str(appt.startTime);
        leads = await mark(shipments.ghlAppointmentId, str(appt.id), "ghl_changed", `meeting ${status}${start ? `, starts ${start}` : ""}`, { status, startTime: start });
        summary = `A meeting ${status}`;
        break;
      }
      case "AppointmentDelete":
        leads = await mark(shipments.ghlAppointmentId, str(appt.id), "ghl_deleted", "meeting deleted in GHL");
        summary = "A meeting deleted";
        break;
      case "UNINSTALL": {
        if (accounts.length) {
          await tx.delete(ghlConnections).where(inArray(ghlConnections.accountId, accounts));
          await tx.insert(auditLog).values(conns.map((c) => ({
            accountId: c.accountId, userId: null, who: "GHL", action: "ghl.disconnected" as const, targetKind: "ghl" as const, targetId: c.locationId,
            detail: "Fernway was uninstalled in GHL; its keys were forgotten",
          })));
        }
        summary = accounts.length ? "Fernway uninstalled in GHL: the account is disconnected" : "Fernway uninstalled in GHL";
        break;
      }
      case "INSTALL":
        summary = "Fernway installed in GHL";
        break;
    }
    await tx.update(ghlEvents).set({ accountId: accounts[0] ?? null, leads, summary }).where(eq(ghlEvents.id, ev.id));
    return { result: "done" as const, type, leads, summary };
  });
}

/** An account's latest events from GHL, for the console's GHL page. */
export async function ghlEventsFor(db: Db, accountId: number, limit = 10) {
  const rows = await db.select().from(ghlEvents).where(eq(ghlEvents.accountId, accountId)).orderBy(desc(ghlEvents.receivedAt), desc(ghlEvents.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, type: r.type, leads: r.leads, summary: r.summary, at: r.receivedAt.toISOString() }));
}

/** Events older than 30 days go (the Privacy Policy says so). */
export async function forgetOldGhlEvents(db: Db): Promise<number> {
  const gone = await db.delete(ghlEvents).where(sql`${ghlEvents.receivedAt} < now() - interval '30 days'`).returning({ id: ghlEvents.id });
  return gone.length;
}

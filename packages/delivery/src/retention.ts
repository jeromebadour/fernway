// Leads sent through Fernway's own public forms are kept 30 days (the forms and the Privacy page say so). Then the
// lead is removed from GHL first (its opportunity, then its contact) and only after that from Fernway, so nothing is
// left behind in GHL that Fernway has forgotten about. A contact or opportunity a newer lead still uses stays in GHL
// (the old lead's own note, its message, is removed from it). If GHL
// can't be reached, the lead is kept and tried again on the next run; it is never dropped from Fernway alone.
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { Deps } from "./engine.js";
import { shipments } from "./schema.js";

export const KEEP_DAYS = 30;

export type PurgeResult = { removed: number; waiting: number };

export async function purgeExpired(deps: Deps, accountId: number, keepDays = KEEP_DAYS): Promise<PurgeResult> {
  const cutoff = sql`now() - make_interval(days => ${keepDays})`;
  const old = await deps.db
    .select({ id: shipments.id, contactId: shipments.ghlContactId, opportunityId: shipments.ghlOpportunityId, noteId: shipments.ghlNoteId })
    .from(shipments)
    .where(and(eq(shipments.accountId, accountId), lt(shipments.createdAt, cutoff)))
    .limit(200);
  if (old.length === 0) return { removed: 0, waiting: 0 };

  const conn = await deps.connectionFor(accountId);
  let removed = 0;
  let waiting = 0;
  for (const s of old) {
    if (s.contactId || s.opportunityId) {
      if (!conn) { waiting += 1; continue; }
      // GHL gives a returning contact the same contact and opportunity, so a newer lead may still be using them.
      const stillUsed = async (col: typeof shipments.ghlContactId | typeof shipments.ghlOpportunityId, id: string) =>
        (await deps.db.select({ id: shipments.id }).from(shipments).where(and(
          eq(shipments.accountId, accountId), eq(col, id), ne(shipments.id, s.id), gte(shipments.createdAt, cutoff),
        )).limit(1)).length > 0;
      if (s.opportunityId && !(await stillUsed(shipments.ghlOpportunityId, s.opportunityId))
        && !(await deps.ghl.remove(conn, `opportunities/${s.opportunityId}`)).gone) { waiting += 1; continue; }
      const contactStays = !s.contactId || (await stillUsed(shipments.ghlContactId, s.contactId));
      // The message is this lead's alone: it goes even when a newer lead keeps the contact.
      if (contactStays && s.contactId && s.noteId
        && !(await deps.ghl.remove(conn, `contacts/${s.contactId}/notes/${s.noteId}`)).gone) { waiting += 1; continue; }
      if (!contactStays && !(await deps.ghl.remove(conn, `contacts/${s.contactId}`)).gone) { waiting += 1; continue; }
    }
    // Its scans go with it (on delete cascade).
    await deps.db.delete(shipments).where(eq(shipments.id, s.id));
    removed += 1;
  }
  return { removed, waiting };
}

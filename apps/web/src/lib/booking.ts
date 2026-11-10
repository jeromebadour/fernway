import "server-only";
import { routes } from "@fernway/delivery";
import { and, eq } from "drizzle-orm";
import { intake } from "./intake";
import { redis } from "./redis";

// Free meeting times for a booking form on the public site, read from the GHL calendar its route names.
// The page's list is kept 60 s (GHL's limits); the check at sending is always fresh.
const WINDOW_DAYS = 14;
const NOTICE_MS = 2 * 3_600_000;

async function routeCalendar(routeKey: string) {
  const { deps, accountId } = intake();
  const [r] = await deps.db.select({ calendarId: routes.calendarId }).from(routes)
    .where(and(eq(routes.accountId, accountId), eq(routes.key, routeKey)));
  if (!r?.calendarId) return null;
  const conn = await deps.connectionFor(accountId);
  if (!conn) return null;
  return { deps, conn, calendarId: r.calendarId };
}

export type SlotList = { ok: true; slots: string[] } | { ok: false; reason: "closed" | "unreachable" };

export async function freeTimes(routeKey: string): Promise<SlotList> {
  const cal = await routeCalendar(routeKey);
  if (!cal) return { ok: false, reason: "closed" };
  const key = `fernway:slots:${cal.calendarId}`;
  const cached = await redis().get(key);
  if (cached) return { ok: true, slots: JSON.parse(cached) as string[] };
  try {
    const from = new Date(Date.now() + NOTICE_MS);
    const slots = await cal.deps.ghl.freeSlots(cal.conn, cal.calendarId, from, new Date(from.getTime() + WINDOW_DAYS * 86_400_000));
    const iso = slots.map((s) => new Date(s).toISOString());
    await redis().set(key, JSON.stringify(iso), "EX", 60);
    return { ok: true, slots: iso };
  } catch (err) {
    console.error(`slots ${routeKey}: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, reason: "unreachable" };
  }
}

/** Is this exact time still free in GHL right now? Asked fresh, around that time only. */
export async function stillFree(routeKey: string, iso: string): Promise<boolean | null> {
  const cal = await routeCalendar(routeKey);
  const at = Date.parse(iso);
  if (!cal || Number.isNaN(at) || at < Date.now() + NOTICE_MS) return false;
  try {
    const slots = await cal.deps.ghl.freeSlots(cal.conn, cal.calendarId, new Date(at - 3_600_000), new Date(at + 3_600_000));
    return slots.some((s) => Date.parse(s) === at);
  } catch {
    return null;
  }
}

export async function forgetTimes(routeKey: string) {
  const cal = await routeCalendar(routeKey);
  if (cal) await redis().del(`fernway:slots:${cal.calendarId}`);
}

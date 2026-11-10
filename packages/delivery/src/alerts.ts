// Alert emails. Every minute the worker notes which people should hear about a lead held or returned (once per lead
// and person, only people who kept that email on and confirmed their address), and every hour whose Monday 08:00 it
// is; then it sends what is due, through the queue of rows in `alerts`, retrying with longer waits and giving up after
// 8 tries. Nothing is ever sent twice: a row is marked sent the moment the mail service takes it.
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { day, formatWaybill, stamp, type When } from "@fernway/core";
import type { Db } from "./db.js";
import { letter, type Mailer } from "./mail.js";
import { alerts, memberships, routes, scans, shipments, users, type AlertKind } from "./schema.js";
import { readable, trackToken } from "./track.js";

/** Notes held and returned leads of the last 2 days for each person who should hear; returns how many rows were made. */
export async function noteLeadAlerts(db: Db, skipAccounts: number[]): Promise<number> {
  const made = await db.execute(sql`
    insert into alerts (user_id, kind, shipment_id)
    select u.id, s.state, s.id
    from shipments s
    join memberships m on m.account_id = s.account_id
    join users u on u.id = m.user_id
    where s.state in ('held', 'returned')
      and s.updated_at > now() - interval '2 days'
      and u.email_confirmed_at is not null
      and ((s.state = 'held' and u.email_held) or (s.state = 'returned' and u.email_returned))
      ${skipAccounts.length ? sql`and s.account_id not in (${sql.join(skipAccounts.map((a) => sql`${a}`), sql`, `)})` : sql``}
    on conflict do nothing`);
  return made.rowCount ?? 0;
}

/** The Monday a moment falls in, as a date in that zone (YYYY-MM-DD), and whether that moment is Monday 08:00 to 08:59. */
export function mondayAt8(now: Date, timeZone: string): { week: string; due: boolean } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!);
  const monday = new Date(local.getTime() - back * 86_400_000);
  return { week: monday.toISOString().slice(0, 10), due: back === 0 && Number(parts.hour) === 8 };
}

/** Notes Monday's summary for each person whose own clock reads Monday 08:00 to 08:59 now. */
export async function noteWeeklyAlerts(db: Db, now = new Date()): Promise<number> {
  const people = await db.select({ id: users.id, tz: users.timeZone }).from(users)
    .where(and(eq(users.emailWeekly, true), isNotNull(users.emailConfirmedAt)));
  let n = 0;
  for (const p of people) {
    const m = mondayAt8(now, p.tz);
    if (!m.due) continue;
    const r = await db.insert(alerts).values({ userId: p.id, kind: "weekly", week: m.week }).onConflictDoNothing().returning({ id: alerts.id });
    n += r.length;
  }
  return n;
}

export const ALERT_WAITS_MIN = [1, 5, 15, 30, 60, 120, 240];

type Ctx = { db: Db; send: Mailer; key: Buffer; appUrl: string };

/** Sends what is due, up to 50 at a time. Returns what happened. */
export async function sendDueAlerts(c: Ctx): Promise<{ sent: number; failed: number; gaveUp: number }> {
  const due = await c.db.select().from(alerts)
    .where(and(isNull(alerts.sentAt), isNull(alerts.givenUpAt), lte(alerts.nextAt, sql`now()`))).orderBy(alerts.nextAt).limit(50);
  let sent = 0, failed = 0, gaveUp = 0;
  for (const a of due) {
    // Taken by this run only: a second worker never sends the same row.
    const [mine] = await c.db.update(alerts).set({ nextAt: sql`now() + interval '5 minutes'` })
      .where(and(eq(alerts.id, a.id), isNull(alerts.sentAt), lte(alerts.nextAt, sql`now()`))).returning({ id: alerts.id });
    if (!mine) continue;
    const mail = await compose(c, a.userId, a.kind, a.shipmentId, a.week);
    if (!mail) { await c.db.update(alerts).set({ givenUpAt: sql`now()`, lastError: "nothing left to tell (the lead or person is gone)" }).where(eq(alerts.id, a.id)); gaveUp++; continue; }
    const r = await c.send(mail).catch((e: Error) => ({ ok: false, why: e.message }));
    if (r.ok) { await c.db.update(alerts).set({ sentAt: sql`now()`, tries: a.tries + 1, lastError: null }).where(eq(alerts.id, a.id)); sent++; continue; }
    const tries = a.tries + 1;
    const wait = ALERT_WAITS_MIN[tries - 1];
    await c.db.update(alerts).set({
      tries, lastError: (r.why ?? "not sent").slice(0, 300),
      ...(wait === undefined ? { givenUpAt: sql`now()` } : { nextAt: sql`now() + make_interval(mins => ${wait})` }),
    }).where(eq(alerts.id, a.id));
    if (wait === undefined) gaveUp++; else failed++;
  }
  return { sent, failed, gaveUp };
}

/** The email for one alert, in the person's own date style and zone; null if there is nothing left to tell. */
export async function compose(c: Ctx, userId: number, kind: AlertKind, shipmentId: number | null, week: string | null) {
  const [u] = await c.db.select().from(users).where(eq(users.id, userId));
  if (!u) return null;
  const w: When = { dateStyle: u.dateStyle, clock: u.clock, timeZone: u.timeZone };
  const prefs = `${c.appUrl}/account/preferences`;

  if (kind === "weekly") {
    const [m] = await c.db.select({ accountId: memberships.accountId }).from(memberships).where(eq(memberships.userId, userId)).limit(1);
    if (!m || !week) return null;
    // Sent on this Monday, about the week before it.
    const last = new Date(Date.parse(`${week}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const v = await weekView(c.db, m.accountId, last, u.timeZone);
    const slow = v.slowest ? `${v.slowest.day}, ${v.slowest.medianMs} ms typical` : "no timed calls";
    return letter({
      to: u.email, subject: `Last week: ${v.signed.toLocaleString("en-US")} signed for, ${v.held} held, ${v.returned} returned`,
      title: `Your week in Fernway, from ${day(v.from, w, false)} to ${day(new Date(v.to.getTime() - 1), w)}.`,
      lines: [v.signed + v.held + v.returned === 0 ? "No leads reached Fernway last week." : "Each lead counts once, where it ended up by Sunday night."],
      rows: [["Signed for", v.signed.toLocaleString("en-US")], ["Held", String(v.held)], ["Returned", String(v.returned)], ["GHL's slowest day", slow]],
      button: "Open your account", url: `${c.appUrl}/account/billing`,
      foot: `Sent Mondays at 08:00 your time because Monday's summary is on. Turn it off in Preferences: ${prefs}`,
    });
  }

  const [s] = await c.db.select({ s: shipments, route: routes.label }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(eq(shipments.id, shipmentId!));
  if (!s) return null;
  const number = formatWaybill({ year: s.s.waybillYear, seq: s.s.waybillSeq });
  const receipt = `${c.appUrl}/track/${trackToken(c.key, s.s.id)}`;
  const who = [s.s.contact.firstName, s.s.contact.lastName].filter(Boolean).join(" ") || s.s.contact.email || s.s.contact.phone || "a lead";
  if (kind === "held") {
    return letter({
      to: u.email, subject: `Held: ${number} needs you`,
      title: `GHL refused ${number}, and waiting won't change its answer.`,
      lines: ["Fernway is holding the lead instead of trying again, so it waits until what GHL names below is fixed. Its receipt shows every try and GHL's own answer."],
      rows: [["Waybill", number], ["Lead", who], ["Route", s.route], ["Held", stamp(s.s.updatedAt, w)], ["GHL said", readable(s.s.holdReason) ?? "no reason given"]],
      button: "Open the receipt", url: receipt,
      foot: `Sent once per held lead because "A lead is held" is on. Turn it off in Preferences: ${prefs}`,
    });
  }
  const [last] = await c.db.select().from(scans).where(and(eq(scans.shipmentId, s.s.id), ne(scans.kind, "returned"), isNotNull(scans.try)))
    .orderBy(sql`${scans.at} desc`).limit(1);
  const answer = !last ? "no answer" : last.answerStatus === null ? "no answer in time" : `${last.answerStatus}`;
  return letter({
    to: u.email, subject: `Returned: ${number} went unanswered`,
    title: `${number} came back after 8 tries over 24 hours.`,
    lines: ["GHL was busy, down or silent each time. The lead is kept in Fernway, with every try on its receipt."],
    rows: [["Waybill", number], ["Lead", who], ["Route", s.route], ["Returned", stamp(s.s.updatedAt, w)], ["Last answer", answer]],
    button: "Open the receipt", url: receipt,
    foot: `Sent once per returned lead because "A lead is returned" is on. Turn it off in Preferences: ${prefs}`,
  });
}

/** The account's week (Monday 00:00 to the next, in the person's zone): leads by where they ended, and GHL's slowest day. */
export async function weekView(db: Db, accountId: number, mondayIso: string, timeZone: string) {
  const startOf = (iso: string) => {
    // Midnight of that date in the zone: the UTC moment whose local date is iso and local time 00:00.
    const guess = new Date(`${iso}T00:00:00Z`);
    const off = (d: Date) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
      return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - d.getTime();
    };
    return new Date(guess.getTime() - off(guess));
  };
  const from = startOf(mondayIso);
  const to = startOf(new Date(Date.parse(`${mondayIso}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
  const counts = await db.select({ state: shipments.state, n: sql<number>`count(*)::int` }).from(shipments)
    .where(and(eq(shipments.accountId, accountId), gte(shipments.createdAt, from), sql`${shipments.createdAt} < ${to.toISOString()}`, inArray(shipments.state, ["signed", "held", "returned"])))
    .groupBy(shipments.state);
  const n = (k: string) => counts.find((c) => c.state === k)?.n ?? 0;
  const days = await db.select({
    d: sql<string>`to_char(${scans.at} at time zone ${timeZone}, 'FMDay')`,
    median: sql<number>`percentile_cont(0.5) within group (order by ${scans.answerMs})::int`,
  }).from(scans).innerJoin(shipments, eq(shipments.id, scans.shipmentId))
    .where(and(eq(shipments.accountId, accountId), isNotNull(scans.answerMs), gte(scans.at, from), sql`${scans.at} < ${to.toISOString()}`))
    .groupBy(sql`1`);
  const slowest = days.sort((a, b) => b.median - a.median)[0];
  return { from, to, signed: n("signed"), held: n("held"), returned: n("returned"), slowest: slowest ? { day: slowest.d, medianMs: slowest.median } : null };
}

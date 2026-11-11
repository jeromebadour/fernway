// The operator console: Fernway's own view of the whole service. Staff only (a plain 404 for anyone else), and only
// with two-step sign-in on; every action asks for a fresh authenticator code and is written to the operator audit log.
// Watchers read the service's health; the worker turns a watcher that goes wrong into an incident, and clears it.
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { formatWaybill } from "@fernway/core";
import { syncSubscription, type BillingDeps } from "./billing.js";
import type { Db } from "./db.js";
import { accounts, incidents, operatorAudit, staff, users, type OperatorAction, type StaffRole } from "./schema.js";

type Problems = { ok: false; problems: string[] };
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const n = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------------------------------------------
// Staff.

export type Staff = { userId: number; name: string; role: StaffRole };

/** The signed-in person as staff, or null. Two-step sign-in must be on: without it, the operator console doesn't exist. */
export async function staffOf(db: Db, userId: number): Promise<Staff | null> {
  const [r] = await db.select({ role: staff.role, name: users.name, two: users.totpEnabledAt }).from(staff)
    .innerJoin(users, eq(users.id, staff.userId)).where(eq(staff.userId, userId));
  return r && r.two ? { userId, name: r.name, role: r.role } : null;
}

export async function note(db: Db, s: Staff, action: OperatorAction, o: { accountId?: number | null; target?: string | null; detail?: string } = {}) {
  await db.insert(operatorAudit).values({
    userId: s.userId, who: s.name.slice(0, 80), action, accountId: o.accountId ?? null, target: o.target?.slice(0, 80) ?? null, detail: (o.detail ?? "").slice(0, 300),
  });
}

export type StaffRow = { userId: number; name: string; email: string; role: StaffRole; twoStep: boolean; addedAt: string; addedBy: string | null; lastSeenAt: string | null };
export async function staffList(db: Db): Promise<StaffRow[]> {
  const r = await db.execute<{ id: string; name: string; email: string; role: StaffRole; two: boolean; added: Date; by: string | null; seen: Date | null }>(sql`
    select u.id, u.name, u.email, s.role, u.totp_enabled_at is not null two, s.added_at added, b.name by,
      (select max(last_seen_at) from sessions where user_id = u.id) seen
    from staff s join users u on u.id = s.user_id left join users b on b.id = s.added_by
    order by case s.role when 'owner' then 0 when 'support' then 1 else 2 end, s.added_at`);
  return r.rows.map((x) => ({ userId: n(x.id), name: x.name, email: x.email, role: x.role, twoStep: x.two, addedAt: iso(x.added)!, addedBy: x.by, lastSeenAt: iso(x.seen) }));
}

/** The owner adds staff by their Fernway email. They open the console once their two-step sign-in is on. */
export async function addStaff(db: Db, s: Staff, emailIn: unknown, role: unknown): Promise<{ ok: true } | Problems> {
  if (s.role !== "owner") return { ok: false, problems: ["form: only the owner changes staff"] };
  if (role !== "support" && role !== "viewer") return { ok: false, problems: ["role: support or viewer"] };
  const email = String(emailIn ?? "").trim().toLowerCase();
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email));
  if (!u) return { ok: false, problems: ["email: no Fernway account has this email; they sign up first"] };
  const [made] = await db.insert(staff).values({ userId: u.id, role, addedBy: s.userId }).onConflictDoNothing().returning({ id: staff.userId });
  if (!made) return { ok: false, problems: ["email: already staff"] };
  await note(db, s, "staff.added", { target: u.name, detail: `as ${role}` });
  return { ok: true };
}

export async function setStaffRole(db: Db, s: Staff, userId: number, role: unknown): Promise<{ ok: true } | Problems> {
  if (s.role !== "owner") return { ok: false, problems: ["form: only the owner changes staff"] };
  if (role !== "support" && role !== "viewer") return { ok: false, problems: ["role: support or viewer"] };
  if (userId === s.userId) return { ok: false, problems: ["form: the owner stays the owner"] };
  const [c] = await db.update(staff).set({ role }).where(and(eq(staff.userId, userId), sql`${staff.role} <> 'owner'`, sql`${staff.role} <> ${role}`)).returning({ id: staff.userId });
  if (!c) return { ok: false, problems: ["form: nothing to change"] };
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  await note(db, s, "staff.role", { target: u?.name ?? String(userId), detail: `now ${role}` });
  return { ok: true };
}

export async function removeStaff(db: Db, s: Staff, userId: number): Promise<{ ok: true } | Problems> {
  if (s.role !== "owner") return { ok: false, problems: ["form: only the owner changes staff"] };
  if (userId === s.userId) return { ok: false, problems: ["form: the owner stays the owner"] };
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const gone = await db.delete(staff).where(and(eq(staff.userId, userId), sql`${staff.role} <> 'owner'`)).returning({ id: staff.userId });
  if (gone.length === 0) return { ok: false, problems: ["form: not staff"] };
  await note(db, s, "staff.removed", { target: u?.name ?? String(userId) });
  return { ok: true };
}

export const OPS_PAGE = 15;
export async function operatorAuditView(db: Db, page = 1) {
  const [t] = await db.select({ n: count() }).from(operatorAudit);
  const pages = Math.max(1, Math.ceil((t?.n ?? 0) / OPS_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await db.select({ a: operatorAudit, account: accounts.name }).from(operatorAudit).leftJoin(accounts, eq(accounts.id, operatorAudit.accountId))
    .orderBy(desc(operatorAudit.at), desc(operatorAudit.id)).limit(OPS_PAGE).offset((p - 1) * OPS_PAGE);
  return { total: t?.n ?? 0, page: p, rows: rows.map(({ a, account }) => ({ ...a, account, at: a.at.toISOString() })) };
}

// ---------------------------------------------------------------------------------------------------------------
// The box and the watchers.

/** What only the running process can read: the machine, Redis, the worker's beat, the queue's own counts. */
export type BoxReading = {
  at: string;
  load1: number; cpus: number; memUsed: number; memTotal: number; diskUsed: number; diskTotal: number;
  redisBytes: number | null; webCommit: string; workerCommit: string | null; workerBeatAt: string | null;
  jobs: { waiting: number; active: number; delayed: number; failed: number; completed: number } | null;
};

export type WatchState = "ok" | "warn" | "down";
export const watcherLabels: Record<string, string> = {
  worker: "Worker", disk: "Disk", memory: "Memory", queue: "Queue", ghl_refusals: "GHL refusals", ghl_tokens: "GHL tokens",
  backup: "Nightly backup", restore_test: "Restore test", email: "Alert emails", payments: "Payments",
};
export type Watch = { key: string; label: string; state: WatchState; reading: string; limit: string };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ageMin = (d: Date | string | null, now: number) => (d ? Math.round((now - new Date(d).getTime()) / 60_000) : null);
const agoWords = (min: number) => (min < 60 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`);

/** Every watcher, read now. The box's watchers need a reading from the process; without one they are left out. */
export async function watch(db: Db, box: BoxReading | null, now = Date.now()): Promise<Watch[]> {
  const out: Watch[] = [];
  if (box) {
    const beat = box.workerBeatAt ? Math.round((now - Date.parse(box.workerBeatAt)) / 1000) : null;
    out.push({ key: "worker", label: "Worker", state: beat === null || beat > 60 ? "down" : "ok",
      reading: beat === null ? "no beat" : `beat ${beat} s ago`, limit: "a beat within 60 s" });
    const disk = pct(box.diskUsed, box.diskTotal);
    out.push({ key: "disk", label: "Disk", state: disk > 92 ? "down" : disk > 80 ? "warn" : "ok", reading: `${disk}% used`, limit: "under 80%" });
    const mem = pct(box.memUsed, box.memTotal);
    out.push({ key: "memory", label: "Memory", state: mem > 95 ? "down" : mem > 90 ? "warn" : "ok", reading: `${mem}% used`, limit: "under 90%" });
  }
  const r = (await db.execute<{
    overdue: string; oldest: Date | null; calls: string; refused: string; reconnect: string;
    backup_at: Date | null; backup_ok: boolean | null; restore_at: Date | null; restore_ok: boolean | null; gave_up: string; unpaid: string;
  }>(sql`
    select
      (select count(*) from shipments where state in ('picked_up', 'in_transit', 'waiting') and next_try_at < now() - interval '5 minutes') overdue,
      (select min(next_try_at) from shipments where state in ('picked_up', 'in_transit', 'waiting') and next_try_at < now() - interval '5 minutes') oldest,
      (select count(*) from scans where step is not null and at > now() - interval '1 hour') calls,
      (select count(*) from scans where step is not null and at > now() - interval '1 hour' and answer_status between 400 and 499 and answer_status not in (401, 408, 429)) refused,
      (select count(*) from ghl_connections where status <> 'connected') reconnect,
      (select at from ops_runs where kind = 'backup' order by at desc, id desc limit 1) backup_at,
      (select ok from ops_runs where kind = 'backup' order by at desc, id desc limit 1) backup_ok,
      (select at from ops_runs where kind = 'restore_test' order by at desc, id desc limit 1) restore_at,
      (select ok from ops_runs where kind = 'restore_test' order by at desc, id desc limit 1) restore_ok,
      (select count(*) from alerts where given_up_at > now() - interval '24 hours') gave_up,
      (select count(*) from accounts where billing_status in ('past_due', 'unpaid')) unpaid`)).rows[0]!;

  const overdue = n(r.overdue);
  const late = ageMin(r.oldest, now);
  out.push({ key: "queue", label: "Queue", state: overdue === 0 ? "ok" : late !== null && late > 30 ? "down" : "warn",
    reading: overdue === 0 ? "nothing overdue" : `${overdue} overdue, oldest ${late} min`, limit: "no try over 5 min late" });
  const calls = n(r.calls), refused = n(r.refused);
  const share = pct(refused, calls);
  out.push({ key: "ghl_refusals", label: "GHL refusals", state: calls >= 10 && share > 20 ? "warn" : "ok",
    reading: calls ? `${share}% of ${calls} calls, last hour` : "no calls, last hour", limit: "under 20% of 10 or more" });
  const reconnect = n(r.reconnect);
  out.push({ key: "ghl_tokens", label: "GHL tokens", state: reconnect ? "warn" : "ok",
    reading: reconnect ? `${reconnect} ${reconnect === 1 ? "account needs" : "accounts need"} reconnecting` : "every connection good", limit: "none refused" });
  const bAge = ageMin(r.backup_at, now);
  out.push({ key: "backup", label: "Nightly backup", state: r.backup_ok === false || bAge === null || bAge > 26 * 60 ? "down" : "ok",
    reading: bAge === null ? "never ran" : `${r.backup_ok ? "passed" : "failed"} ${agoWords(bAge)}`, limit: "passed within 26 h" });
  const tAge = ageMin(r.restore_at, now);
  out.push({ key: "restore_test", label: "Restore test", state: r.restore_ok === false || tAge === null || tAge > 8 * 1440 ? "warn" : "ok",
    reading: tAge === null ? "never ran" : `${r.restore_ok ? "passed" : "failed"} ${agoWords(tAge)}`, limit: "passed within 8 days" });
  const gaveUp = n(r.gave_up);
  out.push({ key: "email", label: "Alert emails", state: gaveUp ? "warn" : "ok", reading: gaveUp ? `${gaveUp} given up, 24 h` : "none given up, 24 h", limit: "none given up" });
  const unpaid = n(r.unpaid);
  out.push({ key: "payments", label: "Payments", state: unpaid ? "warn" : "ok", reading: unpaid ? `${unpaid} past due` : "none past due", limit: "none past due" });
  return out;
}

/** Opens an incident for each watcher gone wrong (one per watcher), raises it when it gets worse, closes it when the
 *  watcher is fine again. Run every minute by the worker. */
export async function recordIncidents(db: Db, watches: Watch[]): Promise<{ opened: number; closed: number }> {
  let opened = 0, closed = 0;
  for (const w of watches) {
    if (w.state === "ok") {
      const c = await db.update(incidents).set({ closedAt: sql`now()` }).where(and(eq(incidents.watcher, w.key), isNull(incidents.closedAt))).returning({ id: incidents.id });
      closed += c.length;
      continue;
    }
    const made = await db.insert(incidents).values({ watcher: w.key, level: w.state, firstReading: w.reading.slice(0, 200), worstReading: w.reading.slice(0, 200) })
      .onConflictDoNothing().returning({ id: incidents.id });
    if (made.length) { opened++; continue; }
    // Already open: a warning that goes down is raised, and its reading kept as the worst.
    if (w.state === "down") {
      await db.update(incidents).set({ level: "down", worstReading: w.reading.slice(0, 200) })
        .where(and(eq(incidents.watcher, w.key), isNull(incidents.closedAt), eq(incidents.level, "warn")));
    }
  }
  return { opened, closed };
}

export type IncidentRow = { id: number; watcher: string; level: "warn" | "down"; openedAt: string; closedAt: string | null; first: string; worst: string;
  ackBy: string | null; ackAt: string | null; note: string | null };
export async function incidentsView(db: Db, page = 1) {
  const [t] = await db.select({ n: count() }).from(incidents);
  const pages = Math.max(1, Math.ceil((t?.n ?? 0) / OPS_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await db.select({ i: incidents, by: users.name }).from(incidents).leftJoin(users, eq(users.id, incidents.acknowledgedBy))
    .orderBy(sql`${incidents.closedAt} is not null`, desc(incidents.openedAt)).limit(OPS_PAGE).offset((p - 1) * OPS_PAGE);
  return {
    total: t?.n ?? 0, page: p,
    rows: rows.map(({ i, by }): IncidentRow => ({ id: i.id, watcher: i.watcher, level: i.level, openedAt: i.openedAt.toISOString(), closedAt: iso(i.closedAt),
      first: i.firstReading, worst: i.worstReading, ackBy: by, ackAt: iso(i.acknowledgedAt), note: i.note })),
  };
}

/** Staff say they're on it, with an optional note. Viewers only look. */
export async function acknowledge(db: Db, s: Staff, id: number, noteIn: unknown): Promise<{ ok: true } | Problems> {
  if (s.role === "viewer") return { ok: false, problems: ["form: viewers only look"] };
  const text = typeof noteIn === "string" ? noteIn.trim().slice(0, 500) : "";
  const [i] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!i) return { ok: false, problems: ["form: no such incident"] };
  if (i.acknowledgedAt && !text) return { ok: false, problems: ["note: already acknowledged; add a note to say more"] };
  await db.update(incidents).set(i.acknowledgedAt ? { note: text } : { acknowledgedBy: s.userId, acknowledgedAt: sql`now()`, note: text || null })
    .where(eq(incidents.id, id));
  await note(db, s, i.acknowledgedAt ? "incident.noted" : "incident.acknowledged", { target: `${watcherLabels[i.watcher] ?? i.watcher} #${i.id}`, detail: text });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// The overview, the queue, GHL, email.

export async function overviewView(db: Db) {
  const r = (await db.execute<{ accounts: string; paying: string; trial: string; people: string; leads24: string; signed24: string; held24: string; db_bytes: string; open: string }>(sql`
    select (select count(*) from accounts) accounts,
      (select count(*) from accounts where billing_status = 'active') paying,
      (select count(*) from accounts where plan is null and trial_ends_at > now()) trial,
      (select count(*) from users) people,
      (select count(*) from shipments where created_at > now() - interval '24 hours') leads24,
      (select count(*) from scans where kind = 'signed' and at > now() - interval '24 hours') signed24,
      (select count(*) from scans where kind in ('held', 'returned') and at > now() - interval '24 hours') held24,
      pg_database_size(current_database()) db_bytes,
      (select count(*) from incidents where closed_at is null) open`)).rows[0]!;
  const runs = await db.execute<{ kind: string; ok: boolean; at: Date; detail: string }>(sql`
    select distinct on (kind) kind, ok, at, detail from ops_runs order by kind, at desc, id desc`);
  return {
    accounts: n(r.accounts), paying: n(r.paying), trial: n(r.trial), people: n(r.people),
    leads24: n(r.leads24), signed24: n(r.signed24), held24: n(r.held24), dbBytes: n(r.db_bytes), openIncidents: n(r.open),
    runs: Object.fromEntries(runs.rows.map((x) => [x.kind, { ok: x.ok, at: iso(x.at)!, detail: x.detail }])) as Record<string, { ok: boolean; at: string; detail: string } | undefined>,
  };
}

export async function queueView(db: Db) {
  const states = await db.execute<{ state: string; n: string }>(sql`select state, count(*) n from shipments where state in ('picked_up', 'in_transit', 'waiting') group by state`);
  const due = (await db.execute<{ due: string; overdue: string; next: Date | null; oldest: Date | null }>(sql`
    select count(*) filter (where next_try_at <= now()) due, count(*) filter (where next_try_at < now() - interval '5 minutes') overdue,
      min(next_try_at) filter (where next_try_at > now()) next, min(created_at) oldest
    from shipments where state in ('picked_up', 'in_transit', 'waiting')`)).rows[0]!;
  const byAccount = await db.execute<{ id: string; name: string; moving: string; waiting: string; held: string }>(sql`
    select a.id, a.name, count(*) filter (where s.state in ('picked_up', 'in_transit')) moving, count(*) filter (where s.state = 'waiting') waiting,
      count(*) filter (where s.state = 'held') held
    from shipments s join accounts a on a.id = s.account_id where s.state in ('picked_up', 'in_transit', 'waiting', 'held')
    group by a.id order by count(*) desc limit 10`);
  const perHour = await db.execute<{ hour: Date; tries: string; signed: string }>(sql`
    with h as (select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as at)
    select h.at as hour, count(sc.id) filter (where sc.step is not null) tries, count(sc.id) filter (where sc.kind = 'signed') signed
    from h left join scans sc on sc.at >= h.at and sc.at < h.at + interval '1 hour' group by h.at order by h.at`);
  const st = (k: string) => n(states.rows.find((x) => x.state === k)?.n);
  return {
    pickedUp: st("picked_up"), inTransit: st("in_transit"), waiting: st("waiting"), due: n(due.due), overdue: n(due.overdue),
    nextAt: iso(due.next), oldestAt: iso(due.oldest),
    byAccount: byAccount.rows.map((x) => ({ id: n(x.id), name: x.name, moving: n(x.moving), waiting: n(x.waiting), held: n(x.held) })),
    perHour: perHour.rows.map((x) => ({ hour: iso(x.hour)!, tries: n(x.tries), signed: n(x.signed) })),
  };
}

export async function ghlView(db: Db) {
  const calls = (await db.execute<{ calls: string; ok: string; refused: string; failed: string; none: string; p50: number | null; p95: number | null }>(sql`
    select count(*) calls, count(*) filter (where answer_status between 200 and 299) ok, count(*) filter (where answer_status between 400 and 499) refused,
      count(*) filter (where answer_status >= 500) failed, count(*) filter (where answer_status is null) none,
      round(percentile_cont(0.5) within group (order by answer_ms)) p50, round(percentile_cont(0.95) within group (order by answer_ms)) p95
    from scans where step is not null and at > now() - interval '24 hours'`)).rows[0]!;
  const byStep = await db.execute<{ step: string; calls: string; p50: number | null; bad: string }>(sql`
    select step, count(*) calls, round(percentile_cont(0.5) within group (order by answer_ms)) p50, count(*) filter (where answer_status is null or answer_status >= 400) bad
    from scans where step is not null and at > now() - interval '24 hours' group by step order by count(*) desc`);
  const conns = await db.execute<{ id: string; name: string; location: string; status: string; expires: Date; refreshed: Date | null; error: string | null; calls: string; bad: string }>(sql`
    select a.id, a.name, c.location_id location, c.status, c.expires_at expires, c.refreshed_at refreshed, c.last_error error,
      (select count(*) from scans sc join shipments s on s.id = sc.shipment_id where s.account_id = a.id and sc.step is not null and sc.at > now() - interval '24 hours') calls,
      (select count(*) from scans sc join shipments s on s.id = sc.shipment_id where s.account_id = a.id and sc.step is not null and sc.at > now() - interval '24 hours'
        and (sc.answer_status is null or sc.answer_status >= 400)) bad
    from ghl_connections c join accounts a on a.id = c.account_id order by c.status <> 'connected' desc, a.id`);
  const reasons = await db.execute<{ reason: string; n: string; accounts: string }>(sql`
    select coalesce(substring(s.hold_reason from '"message"\\s*:\\s*"([^"]+)"'), s.hold_reason, 'No reason given') reason, count(*) n, count(distinct s.account_id) accounts
    from shipments s where s.state = 'held' group by 1 order by count(*) desc limit 8`);
  return {
    calls: n(calls.calls), ok: n(calls.ok), refused: n(calls.refused), failed: n(calls.failed), none: n(calls.none),
    p50: calls.p50 === null ? null : n(calls.p50), p95: calls.p95 === null ? null : n(calls.p95),
    byStep: byStep.rows.map((x) => ({ step: x.step, calls: n(x.calls), p50: x.p50 === null ? null : n(x.p50), bad: n(x.bad) })),
    connections: conns.rows.map((x) => ({ accountId: n(x.id), name: x.name, location: x.location, status: x.status as "connected" | "needs_reconnect",
      expiresAt: iso(x.expires)!, refreshedAt: iso(x.refreshed), error: x.error, calls: n(x.calls), bad: n(x.bad) })),
    reasons: reasons.rows.map((x) => ({ reason: x.reason, n: n(x.n), accounts: n(x.accounts) })),
  };
}

export async function emailView(db: Db) {
  const r = (await db.execute<{ sent: string; waiting: string; gave_up: string; held: string; returned: string; weekly: string; confirm: string; reset: string }>(sql`
    select count(*) filter (where sent_at > now() - interval '7 days') sent,
      count(*) filter (where sent_at is null and given_up_at is null) waiting,
      count(*) filter (where given_up_at > now() - interval '7 days') gave_up,
      count(*) filter (where kind = 'held' and sent_at > now() - interval '7 days') held,
      count(*) filter (where kind = 'returned' and sent_at > now() - interval '7 days') returned,
      count(*) filter (where kind = 'weekly' and sent_at > now() - interval '7 days') weekly,
      (select count(*) from email_links where purpose = 'confirm' and created_at > now() - interval '7 days') confirm,
      (select count(*) from email_links where purpose = 'reset' and created_at > now() - interval '7 days') reset
    from alerts`)).rows[0]!;
  const recent = await db.execute<{ id: string; kind: string; email: string; account: string | null; created: Date; sent: Date | null; gave_up: Date | null; tries: number; error: string | null; next: Date }>(sql`
    select al.id, al.kind, u.email, (select a.name from memberships m join accounts a on a.id = m.account_id where m.user_id = u.id limit 1) account,
      al.created_at created, al.sent_at sent, al.given_up_at gave_up, al.tries, al.last_error error, al.next_at next
    from alerts al join users u on u.id = al.user_id order by al.created_at desc, al.id desc limit 15`);
  return {
    sent7: n(r.sent), waiting: n(r.waiting), gaveUp7: n(r.gave_up), held7: n(r.held), returned7: n(r.returned), weekly7: n(r.weekly),
    confirm7: n(r.confirm), reset7: n(r.reset),
    recent: recent.rows.map((x) => ({ id: n(x.id), kind: x.kind, email: x.email, account: x.account, createdAt: iso(x.created)!, sentAt: iso(x.sent),
      gaveUpAt: iso(x.gave_up), tries: n(x.tries), error: x.error, nextAt: iso(x.next)! })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Accounts and Stripe.

export type AccountRow = { id: number; name: string; owner: string | null; ownerEmail: string | null; plan: string | null; billing: string | null;
  trialEndsAt: string | null; createdAt: string; people: number; leads30: number; held: number; ghl: "connected" | "needs_reconnect" | null };

export async function accountsView(db: Db, f: { q?: string; page?: number }) {
  const q = (f.q ?? "").trim().slice(0, 120);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = q ? sql`where a.name ilike ${like} or exists (select 1 from memberships m join users u on u.id = m.user_id where m.account_id = a.id and u.email ilike ${like})
    or ('AC ' || lpad(a.id::text, 6, '0')) ilike ${like}` : sql``;
  const [t] = (await db.execute<{ n: string }>(sql`select count(*) n from accounts a ${where}`)).rows;
  const total = n(t?.n);
  const page = Math.min(Math.max(1, f.page ?? 1), Math.max(1, Math.ceil(total / OPS_PAGE)));
  const rows = await db.execute<{ id: string; name: string; owner: string | null; email: string | null; plan: string | null; billing: string | null; trial: Date | null;
    created: Date; people: string; leads: string; held: string; ghl: string | null }>(sql`
    select a.id, a.name, o.name owner, o.email, a.plan, a.billing_status billing, a.trial_ends_at trial, a.created_at created,
      (select count(*) from memberships where account_id = a.id) people,
      (select count(*) from shipments where account_id = a.id and created_at > now() - interval '30 days') leads,
      (select count(*) from shipments where account_id = a.id and state = 'held') held,
      (select status from ghl_connections where account_id = a.id) ghl
    from accounts a left join lateral (select u.name, u.email from memberships m join users u on u.id = m.user_id where m.account_id = a.id and m.role = 'owner' limit 1) o on true
    ${where} order by a.id desc limit ${OPS_PAGE} offset ${(page - 1) * OPS_PAGE}`);
  return {
    q, total, page,
    rows: rows.rows.map((x): AccountRow => ({ id: n(x.id), name: x.name, owner: x.owner, ownerEmail: x.email, plan: x.plan, billing: x.billing, trialEndsAt: iso(x.trial),
      createdAt: iso(x.created)!, people: n(x.people), leads30: n(x.leads), held: n(x.held), ghl: x.ghl as AccountRow["ghl"] })),
  };
}

export async function accountDetail(db: Db, id: number) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!a) return null;
  const people = await db.execute<{ id: string; name: string; email: string; role: string; two: boolean; confirmed: boolean; seen: Date | null }>(sql`
    select u.id, u.name, u.email, m.role, u.totp_enabled_at is not null two, u.email_confirmed_at is not null confirmed,
      (select max(last_seen_at) from sessions where user_id = u.id) seen
    from memberships m join users u on u.id = m.user_id where m.account_id = ${id} order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at`);
  const leads = (await db.execute<{ total: string; d30: string; signed: string; held: string; returned: string; moving: string; last: Date | null }>(sql`
    select count(*) total, count(*) filter (where created_at > now() - interval '30 days') d30, count(*) filter (where state = 'signed') signed,
      count(*) filter (where state = 'held') held, count(*) filter (where state = 'returned') returned,
      count(*) filter (where state in ('picked_up', 'in_transit', 'waiting')) moving, max(created_at) last
    from shipments where account_id = ${id}`)).rows[0]!;
  const invoices = await db.execute<{ id: string; number: string | null; status: string; cents: number; currency: string; created: Date; plan: string | null }>(sql`
    select id, number, status, amount_cents cents, currency, created_at created, plan from stripe_invoices where account_id = ${id} order by created_at desc limit 6`);
  const events = await db.execute<{ id: string; type: string; at: Date }>(sql`select id, type, received_at at from stripe_events where account_id = ${id} order by received_at desc limit 6`);
  const conn = (await db.execute<{ location: string; status: string; expires: Date; error: string | null; connected: Date }>(sql`
    select location_id location, status, expires_at expires, last_error error, connected_at connected from ghl_connections where account_id = ${id}`)).rows[0];
  const routes = (await db.execute<{ n: string }>(sql`select count(*) n from routes where account_id = ${id}`)).rows[0]!;
  const recent = await db.execute<{ who: string; action: string; target: string | null; at: Date }>(sql`
    select who, action, target_id target, at from audit_log where account_id = ${id} order by at desc, id desc limit 5`);
  return {
    id: a.id, name: a.name, createdAt: a.createdAt.toISOString(), trialEndsAt: iso(a.trialEndsAt), plan: a.plan, billing: a.billingStatus,
    periodEnd: iso(a.periodEnd), cancelAtPeriodEnd: a.cancelAtPeriodEnd, stripeCustomer: a.stripeCustomerId, stripeSubscription: a.stripeSubscriptionId,
    people: people.rows.map((x) => ({ userId: n(x.id), name: x.name, email: x.email, role: x.role, twoStep: x.two, confirmed: x.confirmed, lastSeenAt: iso(x.seen) })),
    leads: { total: n(leads.total), d30: n(leads.d30), signed: n(leads.signed), held: n(leads.held), returned: n(leads.returned), moving: n(leads.moving), lastAt: iso(leads.last) },
    invoices: invoices.rows.map((x) => ({ id: x.id, number: x.number, status: x.status, cents: n(x.cents), currency: x.currency, createdAt: iso(x.created)!, plan: x.plan })),
    events: events.rows.map((x) => ({ id: x.id, type: x.type, at: iso(x.at)! })),
    ghl: conn ? { location: conn.location, status: conn.status, expiresAt: iso(conn.expires)!, error: conn.error, connectedAt: iso(conn.connected)! } : null,
    routes: n(routes.n),
    recent: recent.rows.map((x) => ({ who: x.who, action: x.action, target: x.target, at: iso(x.at)! })),
  };
}
export type AccountDetail = NonNullable<Awaited<ReturnType<typeof accountDetail>>>;

/** A trial account gets 7 more days. Not for an account already on a plan. */
export async function extendTrial(db: Db, s: Staff, accountId: number): Promise<{ ok: true; endsAt: string } | Problems> {
  if (s.role === "viewer") return { ok: false, problems: ["form: viewers only look"] };
  const [a] = await db.update(accounts).set({ trialEndsAt: sql`greatest(${accounts.trialEndsAt}, now()) + interval '7 days'` })
    .where(and(eq(accounts.id, accountId), isNull(accounts.plan))).returning({ ends: accounts.trialEndsAt, name: accounts.name });
  if (!a) return { ok: false, problems: ["form: only an account on its trial gets more days"] };
  await note(db, s, "account.trial_extended", { accountId, target: a.name, detail: `trial now ends ${a.ends!.toISOString().slice(0, 10)}` });
  return { ok: true, endsAt: a.ends!.toISOString() };
}

export async function stripeView(db: Db, page = 1) {
  const [t] = (await db.execute<{ n: string }>(sql`select count(*) n from stripe_events`)).rows;
  const total = n(t?.n);
  const p = Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / OPS_PAGE)));
  const rows = await db.execute<{ id: string; type: string; at: Date; account: string | null; account_id: string | null }>(sql`
    select e.id, e.type, e.received_at at, a.name account, e.account_id from stripe_events e left join accounts a on a.id = e.account_id
    order by e.received_at desc limit ${OPS_PAGE} offset ${(p - 1) * OPS_PAGE}`);
  const plans = await db.execute<{ plan: string | null; billing: string | null; n: string }>(sql`select plan, billing_status billing, count(*) n from accounts group by 1, 2`);
  const money = (await db.execute<{ paid: string; open: string }>(sql`
    select coalesce(sum(amount_cents) filter (where status = 'paid' and created_at > now() - interval '30 days'), 0) paid,
      coalesce(sum(amount_cents) filter (where status = 'open'), 0) open from stripe_invoices`)).rows[0]!;
  return {
    total, page: p,
    rows: rows.rows.map((x) => ({ id: x.id, type: x.type, at: iso(x.at)!, account: x.account, accountId: x.account_id ? n(x.account_id) : null })),
    plans: plans.rows.map((x) => ({ plan: x.plan, billing: x.billing, n: n(x.n) })),
    paid30Cents: n(money.paid), openCents: n(money.open),
  };
}

export const waybillOf = (y: number, s: number) => formatWaybill({ year: y, seq: s });

/** Reads the account's subscription again from Stripe and copies it over, as a webhook would: for a missed event. */
export async function syncAccount(deps: BillingDeps, s: Staff, accountId: number): Promise<{ ok: true; detail: string } | Problems> {
  if (s.role === "viewer") return { ok: false, problems: ["form: viewers only look"] };
  const [a] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a) return { ok: false, problems: ["form: no such account"] };
  if (!a.stripeSubscriptionId) return { ok: false, problems: ["form: this account has no subscription at Stripe"] };
  await syncSubscription(deps, a.stripeSubscriptionId);
  const [b] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
  const detail = `${b?.plan ? `${b.plan} plan` : "no plan"}, ${(b?.billingStatus ?? "no status").replace("_", " ")}${b?.periodEnd ? `, period to ${b.periodEnd.toISOString().slice(0, 10)}` : ""}`;
  await note(deps.db, s, "account.synced", { accountId, target: a.name, detail });
  return { ok: true, detail };
}

/** The machine as this process sees it: load, memory and the disk its files are on. In a container these are the box's. */
export async function machine(path = "/"): Promise<Pick<BoxReading, "load1" | "cpus" | "memUsed" | "memTotal" | "diskUsed" | "diskTotal">> {
  const os = await import("node:os");
  const { statfs } = await import("node:fs/promises");
  const fsInfo = await statfs(path);
  // MemAvailable (what can be had without swapping) is the honest "used", not free memory, which counts the page cache.
  let memUsed = os.totalmem() - os.freemem();
  try {
    const { readFile } = await import("node:fs/promises");
    const info = await readFile("/proc/meminfo", "utf8");
    const kb = (k: string) => Number(info.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? NaN) * 1024;
    if (Number.isFinite(kb("MemAvailable"))) memUsed = kb("MemTotal") - kb("MemAvailable");
  } catch { /* not Linux: free memory it is */ }
  return {
    load1: os.loadavg()[0] ?? 0, cpus: os.cpus().length, memUsed, memTotal: os.totalmem(),
    diskUsed: (fsInfo.blocks - fsInfo.bfree) * fsInfo.bsize, diskTotal: fsInfo.blocks * fsInfo.bsize,
  };
}

// The console's managing side: routes (what each form or key sends, and where GHL puts it), the GHL connection's
// health, and the team (invites by email, roles, removal). Owners and admins change things; members read. Every
// change is written to the audit log with who made it.
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type Actor } from "./console.js";
import type { Db } from "./db.js";
import { hashPassword } from "./people.js";
import { ghlConnections, invites, memberships, routes, sessions, users, type Role } from "./schema.js";

export type Manager = Actor & { role: Role };
type Problems = { ok: false; problems: string[] };
const problemsOf = (e: z.ZodError): Problems => ({ ok: false, problems: e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`) });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const canManage = (m: Manager) => m.role === "owner" || m.role === "admin";
const notAllowed: Problems = { ok: false, problems: ["form: only the account's owner or an admin can change this"] };

// ---------------------------------------------------------------------------------------------------------------
// Routes.

export const MAX_ROUTES = 30;
export type RouteRow = {
  id: number; key: string; label: string; tags: string[]; pipelineId: string | null; stageId: string | null; calendarId: string | null;
  leads30: number; signed30: number; held30: number; lastLeadAt: string | null; createdAt: string;
};

export async function routesView(db: Db, accountId: number): Promise<RouteRow[]> {
  const rows = await db.execute<{
    id: string; key: string; label: string; tags: string[]; pipeline_id: string | null; stage_id: string | null; calendar_id: string | null;
    created_at: Date; leads: string; signed: string; held: string; last: Date | null;
  }>(sql`
    select r.id, r.key, r.label, r.tags, r.pipeline_id, r.stage_id, r.calendar_id, r.created_at,
      count(s.id) filter (where s.created_at > now() - interval '30 days') leads,
      count(s.id) filter (where s.created_at > now() - interval '30 days' and s.state = 'signed') signed,
      count(s.id) filter (where s.created_at > now() - interval '30 days' and s.state in ('held', 'returned')) held,
      max(s.created_at) last
    from routes r left join shipments s on s.route_id = r.id
    where r.account_id = ${accountId}
    group by r.id order by r.created_at, r.id`);
  return rows.rows.map((r) => ({
    id: Number(r.id), key: r.key, label: r.label, tags: r.tags ?? [], pipelineId: r.pipeline_id, stageId: r.stage_id, calendarId: r.calendar_id,
    leads30: Number(r.leads), signed30: Number(r.signed), held30: Number(r.held),
    lastLeadAt: r.last ? new Date(r.last).toISOString() : null, createdAt: new Date(r.created_at).toISOString(),
  }));
}

const ghlId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, "a GHL id");
export const routeInput = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "letters, numbers and dashes, up to 40").optional(),
  label: z.string().trim().min(1, "a name for the route").max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(10, "10 tags at most").default([]),
  pipelineId: ghlId.nullable().default(null),
  stageId: ghlId.nullable().default(null),
  calendarId: ghlId.nullable().default(null),
}).strict().refine((v) => (v.pipelineId === null) === (v.stageId === null), { path: ["stageId"], message: "a pipeline and its stage go together" });

/** Makes a route (no id) or changes one. Its key never changes once made: forms and API calls already use it. */
export async function saveRoute(db: Db, m: Manager, input: unknown, id?: number): Promise<{ ok: true; id: number } | Problems> {
  if (!canManage(m)) return notAllowed;
  const parsed = routeInput.safeParse(input);
  if (!parsed.success) return problemsOf(parsed.error);
  const v = parsed.data;
  const tags = [...new Set(v.tags.map((t) => t.toLowerCase()))];
  const fields = { label: v.label, tags, pipelineId: v.pipelineId, stageId: v.stageId, calendarId: v.calendarId };

  if (id === undefined) {
    if (!v.key) return { ok: false, problems: ["key: a key for the route"] };
    const [n] = await db.select({ n: count() }).from(routes).where(eq(routes.accountId, m.accountId));
    if ((n?.n ?? 0) >= MAX_ROUTES) return { ok: false, problems: [`form: an account has ${MAX_ROUTES} routes at most`] };
    const [made] = await db.insert(routes).values({ accountId: m.accountId, key: v.key, ...fields }).onConflictDoNothing().returning({ id: routes.id });
    if (!made) return { ok: false, problems: [`key: this account already has a route called ${v.key}`] };
    await audit(db, m, "route.made", { kind: "route", id: v.key }, describe(fields));
    return { ok: true, id: made.id };
  }

  const [was] = await db.select().from(routes).where(and(eq(routes.id, id), eq(routes.accountId, m.accountId)));
  if (!was) return { ok: false, problems: ["form: that route is not in this account"] };
  if (v.key && v.key !== was.key) return { ok: false, problems: ["key: a route's key stays as it was made"] };
  const changed: string[] = [];
  if (was.label !== fields.label) changed.push(`name ${fields.label}`);
  if (was.tags.join(",") !== tags.join(",")) changed.push(`tags ${tags.join(", ") || "none"}`);
  if (was.pipelineId !== fields.pipelineId || was.stageId !== fields.stageId) changed.push(fields.stageId ? `stage ${fields.stageId}` : "no stage");
  if (was.calendarId !== fields.calendarId) changed.push(fields.calendarId ? `calendar ${fields.calendarId}` : "no calendar");
  if (changed.length === 0) return { ok: true, id };
  await db.update(routes).set(fields).where(eq(routes.id, id));
  await audit(db, m, "route.changed", { kind: "route", id: was.key }, changed.join("; "));
  return { ok: true, id };
}

const describe = (f: { label: string; tags: string[]; stageId: string | null; calendarId: string | null }) =>
  [f.label, f.tags.length ? `tags ${f.tags.join(", ")}` : "", f.stageId ? `stage ${f.stageId}` : "no stage", f.calendarId ? `calendar ${f.calendarId}` : ""]
    .filter(Boolean).join("; ");

// ---------------------------------------------------------------------------------------------------------------
// The GHL connection.

export type ConnectionView = {
  connected: boolean; status: "connected" | "needs_reconnect" | null; locationId: string | null; scopes: string[];
  connectedAt: string | null; refreshedAt: string | null; expiresAt: string | null; lastError: string | null;
  // GHL's answers to this account's calls in the last 24 hours.
  calls: { ok: number; refused: number; failed: number; none: number; medianMs: number | null; lastAt: string | null };
};

export async function connectionView(db: Db, accountId: number): Promise<ConnectionView> {
  const [c] = await db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
  const s = await db.execute<{ ok: string; refused: string; failed: string; none: string; median: number | null; last: Date | null }>(sql`
    select count(*) filter (where sc.answer_status between 200 and 299) ok,
      count(*) filter (where sc.answer_status between 400 and 499) refused,
      count(*) filter (where sc.answer_status >= 500) failed,
      count(*) filter (where sc.answer_status is null) none,
      percentile_cont(0.5) within group (order by sc.answer_ms) median,
      max(sc.at) last
    from scans sc join shipments sh on sh.id = sc.shipment_id
    where sh.account_id = ${accountId} and sc.step is not null and sc.at > now() - interval '24 hours'`);
  const r = s.rows[0]!;
  return {
    connected: !!c, status: c?.status ?? null, locationId: c?.locationId ?? null, scopes: c ? c.scopes.split(" ").filter(Boolean) : [],
    connectedAt: c?.connectedAt.toISOString() ?? null, refreshedAt: c?.refreshedAt?.toISOString() ?? null,
    expiresAt: c?.expiresAt.toISOString() ?? null, lastError: c?.lastError ?? null,
    calls: { ok: Number(r.ok), refused: Number(r.refused), failed: Number(r.failed), none: Number(r.none),
      medianMs: r.median === null ? null : Math.round(Number(r.median)), lastAt: r.last ? new Date(r.last).toISOString() : null },
  };
}

/** Forgets the account's GHL tokens. New leads are then held, with "GHL is not connected", until it is connected again. */
export async function disconnectGhl(db: Db, m: Manager): Promise<{ ok: true } | Problems> {
  if (!canManage(m)) return notAllowed;
  const gone = await db.delete(ghlConnections).where(eq(ghlConnections.accountId, m.accountId)).returning({ loc: ghlConnections.locationId });
  if (gone.length === 0) return { ok: false, problems: ["form: GHL is not connected"] };
  await audit(db, m, "ghl.disconnected", { kind: "ghl", id: gone[0]!.loc }, "tokens removed from Fernway");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// The team.

export const INVITE_DAYS = 7;
export const MAX_TEAM = 20;

export type TeamView = {
  members: { userId: number; name: string; email: string; role: Role; joinedAt: string; lastSeenAt: string | null; twoStep: boolean }[];
  invites: { id: number; email: string; role: "admin" | "member"; by: string | null; sentAt: string; expiresAt: string }[];
};

export async function teamView(db: Db, accountId: number): Promise<TeamView> {
  const members = await db.execute<{ id: string; name: string; email: string; role: Role; joined: Date; seen: Date | null; two: boolean }>(sql`
    select u.id, u.name, u.email, m.role, m.created_at joined, (select max(s.last_seen_at) from sessions s where s.user_id = u.id) seen,
      u.totp_enabled_at is not null two
    from memberships m join users u on u.id = m.user_id where m.account_id = ${accountId}
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at`);
  const open = await db.select({ i: invites, by: users.name }).from(invites).leftJoin(users, eq(users.id, invites.invitedBy))
    .where(and(eq(invites.accountId, accountId), isNull(invites.usedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, sql`now()`)))
    .orderBy(desc(invites.createdAt));
  return {
    members: members.rows.map((r) => ({ userId: Number(r.id), name: r.name, email: r.email, role: r.role, joinedAt: new Date(r.joined).toISOString(),
      lastSeenAt: r.seen ? new Date(r.seen).toISOString() : null, twoStep: r.two })),
    invites: open.map(({ i, by }) => ({ id: i.id, email: i.email, role: i.role, by, sentAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })),
  };
}

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("a real email address")),
  role: z.enum(["admin", "member"], "admin or member"),
}).strict();

/** An invite by email, valid 7 days. Admins invite members; the owner invites both. One account per person. */
export async function invite(db: Db, m: Manager, input: unknown): Promise<{ ok: true; id: number; token: string } | Problems> {
  if (!canManage(m)) return notAllowed;
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return problemsOf(parsed.error);
  const v = parsed.data;
  if (v.role === "admin" && m.role !== "owner") return { ok: false, problems: ["role: only the owner invites an admin"] };
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email));
  if (taken) return { ok: false, problems: ["email: already has a Fernway account; one person belongs to one account for now"] };
  const t = await teamView(db, m.accountId);
  if (t.members.length + t.invites.length >= MAX_TEAM) return { ok: false, problems: [`form: a team has ${MAX_TEAM} people at most, invites included`] };
  const token = randomBytes(32).toString("base64url");
  const [made] = await db.insert(invites).values({
    accountId: m.accountId, email: v.email, role: v.role, tokenHash: sha(token), invitedBy: m.userId,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  }).onConflictDoNothing().returning({ id: invites.id });
  if (!made) return { ok: false, problems: ["email: already invited; cancel that invite to send a new one"] };
  await audit(db, m, "member.invited", { kind: "invite", id: v.email }, `as ${v.role}`);
  return { ok: true, id: made.id, token };
}

export async function cancelInvite(db: Db, m: Manager, id: number): Promise<{ ok: true } | Problems> {
  if (!canManage(m)) return notAllowed;
  const [c] = await db.update(invites).set({ cancelledAt: sql`now()` })
    .where(and(eq(invites.id, id), eq(invites.accountId, m.accountId), isNull(invites.usedAt), isNull(invites.cancelledAt)))
    .returning({ email: invites.email });
  if (!c) return { ok: false, problems: ["form: that invite is no longer open"] };
  await audit(db, m, "invite.cancelled", { kind: "invite", id: c.email });
  return { ok: true };
}

/** What an invite link opens, while it is still good. */
export async function inviteFor(db: Db, token: string | null | undefined) {
  if (!token || token.length > 100) return null;
  const r = await db.execute<{ id: string; email: string; role: "admin" | "member"; account: string; by: string | null }>(sql`
    select i.id, i.email, i.role, a.name account, u.name by from invites i join accounts a on a.id = i.account_id
    left join users u on u.id = i.invited_by
    where i.token_hash = ${sha(token)} and i.used_at is null and i.cancelled_at is null and i.expires_at > now()`);
  const i = r.rows[0];
  return i ? { id: Number(i.id), email: i.email, role: i.role, accountName: i.account, by: i.by } : null;
}

export const joinInput = z.object({
  name: z.string().trim().min(1, "your name").max(80),
  password: z.string().min(10, "10 characters or more").max(200),
  timeZone: z.string().trim().min(1).max(64).optional(),
}).strict();

/** Joins through an invite: the person is made with the invited email (the link proves it) and the invited role. */
export async function acceptInvite(db: Db, token: string, input: unknown): Promise<{ ok: true; userId: number; accountId: number } | Problems> {
  const parsed = joinInput.safeParse(input);
  if (!parsed.success) return problemsOf(parsed.error);
  const v = parsed.data;
  const passwordHash = await hashPassword(v.password);
  const done = await db.transaction(async (tx) => {
    const [i] = await tx.update(invites).set({ usedAt: sql`now()` })
      .where(and(eq(invites.tokenHash, sha(token)), isNull(invites.usedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, sql`now()`)))
      .returning();
    if (!i) return null;
    const [u] = await tx.insert(users).values({ email: i.email, name: v.name, passwordHash, timeZone: v.timeZone ?? "UTC", emailConfirmedAt: sql`now()` })
      .onConflictDoNothing().returning({ id: users.id });
    if (!u) return "taken" as const;
    await tx.insert(memberships).values({ userId: u.id, accountId: i.accountId, role: i.role });
    return { userId: u.id, accountId: i.accountId, role: i.role };
  });
  if (done === null) return { ok: false, problems: ["form: this invite was used, cancelled or has run out; ask for a new one"] };
  if (done === "taken") return { ok: false, problems: ["form: that email already has a Fernway account; sign in with it instead"] };
  await audit(db, { accountId: done.accountId, userId: done.userId, name: v.name }, "member.joined", { kind: "member", id: String(done.userId) }, `as ${done.role}`);
  return { ok: true, userId: done.userId, accountId: done.accountId };
}

/** The owner makes someone an admin or a member. The owner's own role does not change here. */
export async function setRole(db: Db, m: Manager, userId: number, role: unknown): Promise<{ ok: true } | Problems> {
  if (m.role !== "owner") return { ok: false, problems: ["form: only the owner changes roles"] };
  if (role !== "admin" && role !== "member") return { ok: false, problems: ["role: admin or member"] };
  if (userId === m.userId) return { ok: false, problems: ["form: the owner stays the owner"] };
  const [c] = await db.update(memberships).set({ role })
    .where(and(eq(memberships.userId, userId), eq(memberships.accountId, m.accountId), sql`${memberships.role} <> 'owner'`, sql`${memberships.role} <> ${role}`))
    .returning({ userId: memberships.userId });
  if (!c) return { ok: false, problems: ["form: nothing to change"] };
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  await audit(db, m, "member.role", { kind: "member", id: String(userId) }, `${u?.name ?? "someone"} is now ${role}`);
  return { ok: true };
}

/** Removes someone from the team. Their Fernway sign-in goes with it, since a person belongs to one account. */
export async function removeMember(db: Db, m: Manager, userId: number): Promise<{ ok: true } | Problems> {
  if (!canManage(m)) return notAllowed;
  if (userId === m.userId) return { ok: false, problems: ["form: you can't remove yourself here"] };
  const [t] = await db.select({ role: memberships.role, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(memberships.accountId, m.accountId)));
  if (!t) return { ok: false, problems: ["form: that person is not in this team"] };
  if (t.role === "owner") return { ok: false, problems: ["form: the owner can't be removed"] };
  if (t.role === "admin" && m.role !== "owner") return { ok: false, problems: ["form: only the owner removes an admin"] };
  await db.transaction(async (tx) => {
    await tx.delete(memberships).where(and(eq(memberships.userId, userId), eq(memberships.accountId, m.accountId)));
    await tx.update(sessions).set({ endedAt: sql`now()`, endedWhy: "account_deleted" }).where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)));
    await tx.execute(sql`delete from users where id = ${userId} and not exists (select 1 from memberships where user_id = ${userId})`);
  });
  await audit(db, m, "member.removed", { kind: "member", id: String(userId) }, t.name);
  return { ok: true };
}

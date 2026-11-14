// The rest of the account area: two-step sign-in (an authenticator app, RFC 6238), changing the password, devices,
// API keys made in the app, preferences, the person's record, and deleting the account from Fernway, GHL and Stripe.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type Stripe from "stripe";
import { formatWaybill } from "@fernway/core";
import { createApiKey } from "./apikeys.js";
import { entitlementFor, notOnPlan } from "./plans.js";
import { open, seal } from "./crypto.js";
import type { Db } from "./db.js";
import type { Deps } from "./engine.js";
import type { GhlContact } from "./ghl.js";
import { hashPassword, passwordMatches } from "./people.js";
import { removeFromGhl } from "./retention.js";
import {
  accounts, apiKeys, clocks, dateStyles, ghlConnections, keyKinds, memberships, recoveryCodes, routes, sessions, shipments, stripeInvoices, users,
  type KeyKind,
  type Role,
} from "./schema.js";

type Problems = { ok: false; problems: string[] };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const password = z.string().min(10, "10 characters or more").max(200);

// ---------------------------------------------------------------------------------------------------------------
// Two-step sign-in: a 6-digit code from an authenticator app, every 30 seconds.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("not base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const STEP_SECONDS = 30;
export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/** The 6-digit code for one 30-second step (HMAC-SHA1, RFC 4226 and 6238). */
export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  const n = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

export const otpauthUri = (secretB32: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Fernway:${email}`)}?secret=${secretB32}&issuer=Fernway&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

/** Starts turning two-step on: a fresh secret, kept sealed as pending until a code from the app proves it was added. */
export async function beginTwoStep(db: Db, key: Buffer, userId: number): Promise<{ secret: string; uri: string }> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const secret = base32(randomBytes(20));
  await db.update(users).set({ totpPendingSealed: seal(key, secret) }).where(eq(users.id, userId));
  return { secret, uri: otpauthUri(secret, u!.email) };
}

const codeShape = z.string().transform((v) => v.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/, "the 6 digits the app shows"));

/** The step a code matches, from 30 s before to 30 s after now, and only if later than the last one accepted. */
function matchStep(secret: Buffer, code: string, lastStep: number | null, now = Date.now()): number | null {
  const here = stepAt(now);
  for (const s of [here, here - 1, here + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const want = Buffer.from(totpCode(secret, s));
    if (timingSafeEqual(want, Buffer.from(code.padEnd(6).slice(0, 6)))) return s;
  }
  return null;
}

const RECOVERY = 10;
const recoveryCode = () => {
  const raw = base32(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

/** Finishes turning two-step on with a code from the app: 10 recovery codes come back once; other devices sign out. */
export async function confirmTwoStep(db: Db, key: Buffer, userId: number, keepSessionId: number, codeIn: string): Promise<{ ok: true; recovery: string[] } | Problems> {
  const code = codeShape.safeParse(codeIn);
  if (!code.success) return { ok: false, problems: ["code: the 6 digits the app shows"] };
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.totpPendingSealed) return { ok: false, problems: ["code: start again; the QR code was replaced"] };
  const step = matchStep(fromBase32(open(key, u.totpPendingSealed)), code.data, null);
  if (step === null) return { ok: false, problems: ["code: that code doesn't match; check the app's clock and try the newest code"] };
  const recovery = Array.from({ length: RECOVERY }, recoveryCode);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSealed: u.totpPendingSealed, totpPendingSealed: null, totpEnabledAt: sql`now()`, totpLastStep: step }).where(eq(users.id, userId));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(recovery.map((c) => ({ userId, codeHash: sha(c) })));
    await endOthers(tx as unknown as Db, userId, keepSessionId, "two_step_changed");
  });
  return { ok: true, recovery };
}

/** Turns two-step off; the password proves it is the person. Other devices sign out. */
export async function turnOffTwoStep(db: Db, userId: number, keepSessionId: number, pw: string): Promise<{ ok: true } | Problems> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await passwordMatches(pw, u.passwordHash))) return { ok: false, problems: ["password: that isn't your current password"] };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSealed: null, totpPendingSealed: null, totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, userId));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await endOthers(tx as unknown as Db, userId, keepSessionId, "two_step_changed");
  });
  return { ok: true };
}

/** A new set of 10 recovery codes (the old ones stop working); the password proves it is the person. */
export async function newRecoveryCodes(db: Db, userId: number, pw: string): Promise<{ ok: true; recovery: string[] } | Problems> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await passwordMatches(pw, u.passwordHash))) return { ok: false, problems: ["password: that isn't your current password"] };
  if (!u.totpEnabledAt) return { ok: false, problems: ["two-step: it is off"] };
  const recovery = Array.from({ length: RECOVERY }, recoveryCode);
  await db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(recovery.map((c) => ({ userId, codeHash: sha(c) })));
  });
  return { ok: true, recovery };
}

/** The second step of signing in: a code from the app (each step once) or an unused recovery code (spent). */
export async function secondStep(db: Db, key: Buffer, userId: number, codeIn: string): Promise<"code" | "recovery" | null> {
  const given = codeIn.trim().toLowerCase();
  if (/^[a-z2-7]{5}-?[a-z2-7]{5}$/.test(given)) {
    const c = given.includes("-") ? given : `${given.slice(0, 5)}-${given.slice(5)}`;
    const [used] = await db.update(recoveryCodes).set({ usedAt: sql`now()` })
      .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, sha(c)), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    return used ? "recovery" : null;
  }
  const code = codeShape.safeParse(given);
  if (!code.success) return null;
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.totpSealed) return null;
  const step = matchStep(fromBase32(open(key, u.totpSealed)), code.data, u.totpLastStep);
  if (step === null) return null;
  // Only one sign-in gets each step, even two at the same moment.
  const [won] = await db.update(users).set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), sql`${users.totpLastStep} < ${step}`)))
    .returning({ id: users.id });
  return won ? "code" : null;
}

export async function recoveryLeft(db: Db, userId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Password and devices.

async function endOthers(db: Db, userId: number, keepSessionId: number, why: "password_changed" | "two_step_changed") {
  const r = await db.update(sessions).set({ endedAt: sql`now()`, endedWhy: why })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.endedAt)))
    .returning({ id: sessions.id });
  return r.length;
}

/** A new password: the current one first. Every other device signs out; this one stays signed in. */
export async function changePassword(db: Db, userId: number, keepSessionId: number, current: string, next: string): Promise<{ ok: true; signedOut: number } | Problems> {
  const p = password.safeParse(next);
  if (!p.success) return { ok: false, problems: [`next: ${p.error.issues[0]!.message}`] };
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await passwordMatches(current, u.passwordHash))) return { ok: false, problems: ["current: that isn't your current password"] };
  if (await passwordMatches(p.data, u.passwordHash)) return { ok: false, problems: ["next: that is the password you have now"] };
  const passwordHash = await hashPassword(p.data);
  const signedOut = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, passwordChangedAt: sql`now()` }).where(eq(users.id, userId));
    return endOthers(tx as unknown as Db, userId, keepSessionId, "password_changed");
  });
  return { ok: true, signedOut };
}

export type Device = { id: number; device: string; since: string; lastSeen: string; here: boolean; endedAt: string | null; endedWhy: string | null };

/** Signed-in devices, the most recent first, then the ones that ended in the last 30 days (at most 6). */
export async function listDevices(db: Db, userId: number, currentSessionId: number): Promise<Device[]> {
  const live = await db.select().from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt), gt(sessions.expiresAt, sql`now()`)))
    .orderBy(desc(sessions.lastSeenAt));
  const ended = await db.select().from(sessions)
    .where(and(eq(sessions.userId, userId), or(isNotNull(sessions.endedAt), sql`${sessions.expiresAt} <= now()`),
      sql`coalesce(${sessions.endedAt}, ${sessions.expiresAt}) > now() - interval '30 days'`))
    .orderBy(desc(sql`coalesce(${sessions.endedAt}, ${sessions.expiresAt})`)).limit(6);
  const view = (s: typeof live[number]): Device => ({
    id: s.id, device: s.device || "A browser", since: s.createdAt.toISOString(), lastSeen: s.lastSeenAt.toISOString(), here: s.id === currentSessionId,
    endedAt: (s.endedAt ?? (s.expiresAt <= new Date() ? s.expiresAt : null))?.toISOString() ?? null, endedWhy: s.endedWhy ?? (s.endedAt ? null : "expired"),
  });
  return [...live.map(view), ...ended.map(view)];
}

/** Signs out one other device of the same person. This device signs out with Sign out instead. */
export async function signOutDevice(db: Db, userId: number, currentSessionId: number, sessionId: number): Promise<boolean> {
  if (sessionId === currentSessionId) return false;
  const r = await db.update(sessions).set({ endedAt: sql`now()`, endedWhy: "signed_out_from_device" })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.endedAt)))
    .returning({ id: sessions.id });
  return r.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// API keys in the app: owners and admins.

export const MAX_KEYS = 20;
export type KeyRow = { prefix: string; label: string; kind: KeyKind; createdAt: string; madeBy: string | null; lastUsedAt: string | null; revokedAt: string | null };

export async function listKeys(db: Db, accountId: number): Promise<KeyRow[]> {
  const rows = await db.select({ k: apiKeys, name: users.name }).from(apiKeys).leftJoin(users, eq(users.id, apiKeys.madeBy))
    .where(eq(apiKeys.accountId, accountId)).orderBy(sql`${apiKeys.revokedAt} is not null`, desc(apiKeys.createdAt));
  return rows.map(({ k, name }) => ({
    prefix: k.prefix, label: k.label, kind: k.kind, createdAt: k.createdAt.toISOString(), madeBy: name ?? null,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null,
  }));
}

const label = z.string().trim().min(1, "a name for the key, like the site or app that uses it").max(80, "80 characters at most");

export async function makeKey(db: Db, accountId: number, userId: number, labelIn: unknown, kindIn: unknown = "api"): Promise<{ ok: true; key: string; prefix: string } | Problems> {
  const l = label.safeParse(labelIn);
  if (!l.success) return { ok: false, problems: [`label: ${l.error.issues[0]!.message}`] };
  const kind = keyKinds.find((k) => k === kindIn);
  if (!kind) return { ok: false, problems: ["kind: for your code, or for Fernway for WordPress"] };
  // A key for the account's own code is the API: on a plan with it. A WordPress key works on every plan.
  if (kind === "api") {
    const plan = await entitlementFor(db, accountId);
    if (!plan.features.has("api")) return { ok: false, problems: [`kind: ${notOnPlan("api", plan)}`] };
  }
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(apiKeys).where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)));
  if ((n?.n ?? 0) >= MAX_KEYS) return { ok: false, problems: [`label: an account holds ${MAX_KEYS} live keys at most; revoke one first`] };
  const made = await createApiKey(db, accountId, l.data, kind);
  await db.update(apiKeys).set({ madeBy: userId }).where(eq(apiKeys.prefix, made.prefix));
  return { ok: true, ...made };
}

/** Revokes one of the account's own keys; it stops at once. */
export async function revokeKey(db: Db, accountId: number, prefix: string): Promise<boolean> {
  const r = await db.update(apiKeys).set({ revokedAt: sql`now()` })
    .where(and(eq(apiKeys.accountId, accountId), eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  return r.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Preferences.

export const prefsInput = z.object({
  dateStyle: z.enum(dateStyles),
  clock: z.enum(clocks),
  emailHeld: z.boolean(),
  emailReturned: z.boolean(),
  emailWeekly: z.boolean(),
}).strict();
export type Prefs = z.infer<typeof prefsInput>;

export async function prefsOf(db: Db, userId: number): Promise<Prefs> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return { dateStyle: u!.dateStyle, clock: u!.clock, emailHeld: u!.emailHeld, emailReturned: u!.emailReturned, emailWeekly: u!.emailWeekly };
}

export async function savePrefs(db: Db, userId: number, input: unknown): Promise<{ ok: true } | Problems> {
  const p = prefsInput.safeParse(input);
  if (!p.success) return { ok: false, problems: ["form: the choices could not be read; reload the page"] };
  await db.update(users).set(p.data).where(eq(users.id, userId));
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Your record: what Fernway holds about the person, and what Fernway's own GHL holds, side by side.

export type RecordView = {
  person: { name: string; email: string; emailConfirmedAt: string | null; timeZone: string; createdAt: string; passwordChangedAt: string;
    twoStepSince: string | null; dateStyle: string; clock: string; emails: { held: boolean; returned: boolean; weekly: boolean } };
  account: { id: number; name: string; role: Role; plan: string | null; billingStatus: string | null; createdAt: string };
  counts: { devicesSignedIn: number; apiKeysLive: number; invoices: number };
  leads: { shipmentId: number; waybill: string; route: string; state: string; at: string; contactId: string | null }[];
};

/** Fernway's side. Leads are the ones the person sent through Fernway's own forms with this email. */
export async function recordView(db: Db, userId: number, accountId: number, siteAccountId: number): Promise<RecordView | null> {
  const [row] = await db.select({ u: users, a: accounts, m: memberships }).from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id)).innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(users.id, userId), eq(accounts.id, accountId)));
  if (!row) return null;
  const { u, a, m } = row;
  const [dev] = await db.select({ n: sql<number>`count(*)::int` }).from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt), gt(sessions.expiresAt, sql`now()`)));
  const [keys] = await db.select({ n: sql<number>`count(*)::int` }).from(apiKeys).where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)));
  const [inv] = await db.select({ n: sql<number>`count(*)::int` }).from(stripeInvoices).where(eq(stripeInvoices.accountId, accountId));
  const leads = await leadsOf(db, siteAccountId, u.email);
  return {
    person: {
      name: u.name, email: u.email, emailConfirmedAt: u.emailConfirmedAt?.toISOString() ?? null, timeZone: u.timeZone,
      createdAt: u.createdAt.toISOString(), passwordChangedAt: u.passwordChangedAt.toISOString(), twoStepSince: u.totpEnabledAt?.toISOString() ?? null,
      dateStyle: u.dateStyle, clock: u.clock, emails: { held: u.emailHeld, returned: u.emailReturned, weekly: u.emailWeekly },
    },
    account: { id: a.id, name: a.name, role: m.role, plan: a.plan, billingStatus: a.billingStatus, createdAt: a.createdAt.toISOString() },
    counts: { devicesSignedIn: dev?.n ?? 0, apiKeysLive: keys?.n ?? 0, invoices: inv?.n ?? 0 },
    leads,
  };
}

async function leadsOf(db: Db, siteAccountId: number, email: string) {
  const rows = await db.select({ s: shipments, r: routes.label }).from(shipments).innerJoin(routes, eq(routes.id, shipments.routeId))
    .where(and(eq(shipments.accountId, siteAccountId), sql`lower(${shipments.contact}->>'email') = ${email.toLowerCase()}`))
    .orderBy(desc(shipments.createdAt)).limit(50);
  return rows.map(({ s, r }) => ({
    shipmentId: s.id, waybill: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), route: r, state: s.state,
    at: s.createdAt.toISOString(), contactId: s.ghlContactId,
  }));
}

/** GHL's side, read live: each contact Fernway made for this person, as GHL holds it now. */
export async function ghlSide(deps: Deps, siteAccountId: number, contactIds: string[]): Promise<{ reached: true; contacts: GhlContact[] } | { reached: false }> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return { reached: true, contacts: [] };
  const conn = await deps.connectionFor(siteAccountId).catch(() => null);
  if (!conn) return { reached: false };
  try {
    const found = await Promise.all(ids.map((id) => deps.ghl.getContact(conn, id)));
    return { reached: true, contacts: found.filter((c): c is GhlContact => c !== null) };
  } catch {
    return { reached: false };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Deleting the account: GHL first, then Stripe, then Fernway, each step reported. A step that can't be done stops
// there, before anything in Fernway is removed, and says why; running it again carries on (each step is safe twice).

export type DeleteStep = { what: "ghl" | "stripe" | "fernway"; done: boolean; detail: string };
export type DeleteResult = { ok: true; steps: DeleteStep[] } | { ok: false; steps: DeleteStep[]; problems: string[] };

export async function deleteAccount(
  deps: Deps & { stripe: Stripe | null },
  who: { userId: number; accountId: number; role: Role },
  siteAccountId: number,
  confirmName: string,
): Promise<DeleteResult> {
  const { db } = deps;
  if (who.role !== "owner") return { ok: false, steps: [], problems: ["form: only the account's owner deletes it"] };
  const [a] = await db.select().from(accounts).where(eq(accounts.id, who.accountId));
  if (!a) return { ok: false, steps: [], problems: ["form: the account is already gone"] };
  if (confirmName.trim() !== a.name) return { ok: false, steps: [], problems: [`name: type the account's name exactly: ${a.name}`] };
  if (who.accountId === siteAccountId) return { ok: false, steps: [], problems: ["form: Fernway's own account can't be deleted here"] };

  // Everyone whose only account this is goes with it; their leads through Fernway's own forms go too.
  const people = await db.select({ id: users.id, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.accountId, who.accountId),
      sql`not exists (select 1 from memberships o where o.user_id = ${users.id} and o.account_id <> ${who.accountId})`));
  const emails = people.map((p) => p.email.toLowerCase());
  const theirs = emails.length === 0 ? [] : await db.select().from(shipments)
    .where(and(eq(shipments.accountId, siteAccountId), sql`lower(${shipments.contact}->>'email') in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`));
  const steps: DeleteStep[] = [];

  // 1. GHL: the contacts, opportunities, notes and meetings Fernway made for them, unless someone else's lead uses them.
  const inGhl = theirs.filter((s) => s.ghlContactId || s.ghlOpportunityId || s.ghlAppointmentId);
  if (inGhl.length > 0) {
    const conn = await deps.connectionFor(siteAccountId).catch(() => null);
    const ids = theirs.map((s) => s.id);
    let left = conn ? 0 : inGhl.length;
    if (conn) {
      for (const s of inGhl) {
        const stillUsed = async (col: typeof shipments.ghlContactId | typeof shipments.ghlOpportunityId, id: string) =>
          (await db.select({ id: shipments.id }).from(shipments).where(and(
            eq(shipments.accountId, siteAccountId), eq(col, id), sql`${shipments.id} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
          )).limit(1)).length > 0;
        if (!(await removeFromGhl(deps, conn, { id: s.id, contactId: s.ghlContactId, opportunityId: s.ghlOpportunityId, noteId: s.ghlNoteId, appointmentId: s.ghlAppointmentId }, stillUsed))) left += 1;
      }
    }
    if (left > 0) {
      steps.push({ what: "ghl", done: false, detail: "GHL could not be reached" });
      return { ok: false, steps, problems: ["ghl: GHL could not be reached, so nothing was deleted; try again in a few minutes"] };
    }
    steps.push({ what: "ghl", done: true, detail: `${new Set(inGhl.map((s) => s.ghlContactId).filter(Boolean)).size} contact${inGhl.length === 1 ? "" : "s"} and ${inGhl.length} lead${inGhl.length === 1 ? "" : "s"} removed` });
  } else {
    steps.push({ what: "ghl", done: true, detail: "GHL held nothing of yours" });
  }

  // 2. Stripe: the customer is deleted, which cancels any plan at once and removes the card.
  if (a.stripeCustomerId) {
    if (!deps.stripe) {
      steps.push({ what: "stripe", done: false, detail: "Stripe could not be reached" });
      return { ok: false, steps, problems: ["stripe: Stripe could not be reached; try again in a few minutes"] };
    }
    try {
      await deps.stripe.customers.del(a.stripeCustomerId);
    } catch (e) {
      const gone = (e as { statusCode?: number }).statusCode === 404;
      if (!gone) {
        steps.push({ what: "stripe", done: false, detail: "Stripe could not be reached" });
        return { ok: false, steps, problems: ["stripe: Stripe could not be reached; GHL is already done; try again in a few minutes"] };
      }
    }
    steps.push({ what: "stripe", done: true, detail: a.plan ? "plan cancelled, card removed" : "card removed" });
  } else {
    steps.push({ what: "stripe", done: true, detail: "no card was ever given" });
  }

  // 3. Fernway: the account and everything in it, their leads through the site, then the people.
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ customerShipmentId: null }).where(eq(accounts.id, who.accountId));
    if (theirs.length) await tx.delete(shipments).where(inArray(shipments.id, theirs.map((s) => s.id)));
    await tx.delete(shipments).where(eq(shipments.accountId, who.accountId));
    await tx.delete(routes).where(eq(routes.accountId, who.accountId));
    await tx.delete(ghlConnections).where(eq(ghlConnections.accountId, who.accountId));
    await tx.delete(accounts).where(eq(accounts.id, who.accountId));
    if (people.length) await tx.delete(users).where(inArray(users.id, people.map((p) => p.id)));
  });
  steps.push({ what: "fernway", done: true, detail: `account AC ${String(who.accountId).padStart(6, "0")} and ${people.length === 1 ? "your sign-in" : `${people.length} people`} removed` });
  return { ok: true, steps };
}

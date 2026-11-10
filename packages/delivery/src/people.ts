// People, their accounts and their sign-ins. Passwords are kept as scrypt hashes; a session or an email link is a random
// secret handed to the person once, and only its SHA-256 is stored, so a copy of the database opens nothing. Every
// check that fails says the same thing whatever the reason (wrong email or wrong password), so no answer reveals who
// has an account.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.js";
import { accounts, emailLinks, memberships, sessions, users, type Role } from "./schema.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 2 ** 15, R = 8, P = 1, LEN = 64;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

export const SESSION_DAYS = 30;
export const CONFIRM_HOURS = 48;
export const RESET_MINUTES = 60;
export const TRIAL_DAYS = 14;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(got, want);
}

const email = z.string().trim().toLowerCase().max(200).pipe(z.email("a real email address"));
const password = z.string().min(10, "10 characters or more").max(200);
export const signUpInput = z.object({
  email,
  name: z.string().trim().min(1, "your name").max(80),
  company: z.string().trim().min(1, "your company").max(120),
  password,
  timeZone: z.string().trim().min(1).max(64).optional(),
}).strict();

type Problems = { ok: false; problems: string[] };
const problemsOf = (e: z.ZodError): Problems => ({ ok: false, problems: e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`) });

async function newLink(db: Db, userId: number, purpose: "confirm" | "reset") {
  const token = secret();
  const ms = purpose === "confirm" ? CONFIRM_HOURS * 3_600_000 : RESET_MINUTES * 60_000;
  await db.insert(emailLinks).values({ userId, purpose, tokenHash: sha(token), expiresAt: new Date(Date.now() + ms) });
  return token;
}

/** A new person with their own account (the business, named after their company), as its owner, on a 14-day trial. */
export async function signUp(db: Db, input: unknown): Promise<{ ok: true; userId: number; accountId: number; confirmToken: string } | Problems> {
  const parsed = signUpInput.safeParse(input);
  if (!parsed.success) return problemsOf(parsed.error);
  const v = parsed.data;
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email));
  if (taken) return { ok: false, problems: ["email: already has an account; sign in, or reset its password"] };
  const passwordHash = await hashPassword(v.password);
  const made = await db.transaction(async (tx) => {
    const [a] = await tx.insert(accounts).values({ name: v.company, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) }).returning({ id: accounts.id });
    const [u] = await tx.insert(users).values({ email: v.email, name: v.name, passwordHash, timeZone: v.timeZone ?? "UTC" }).returning({ id: users.id });
    await tx.insert(memberships).values({ userId: u!.id, accountId: a!.id, role: "owner" });
    return { userId: u!.id, accountId: a!.id };
  });
  return { ok: true, ...made, confirmToken: await newLink(db, made.userId, "confirm") };
}

/** Opens a session for the right email and password; null for anything else, the same null whatever was wrong. With
 *  two-step sign-in on, no session yet: the caller asks for the app's code, then opens one with `openSession`. */
export async function signIn(db: Db, emailIn: string, passwordIn: string, device = ""): Promise<{ token: string; userId: number } | { twoStep: true; userId: number } | null> {
  const e = email.safeParse(emailIn);
  const [u] = e.success ? await db.select().from(users).where(eq(users.email, e.data)) : [];
  // Without such a person, a hash is still checked, so a wrong email takes as long as a wrong password.
  const ok = await passwordMatches(passwordIn, u?.passwordHash ?? DUMMY);
  if (!u || !ok) return null;
  if (u.totpEnabledAt) return { twoStep: true, userId: u.id };
  return { token: await openSession(db, u.id, device), userId: u.id };
}

/** A new session for a person who has proved who they are; its secret is returned once, only its hash kept. */
export async function openSession(db: Db, userId: number, device = ""): Promise<string> {
  const token = secret();
  await db.insert(sessions).values({ userId, tokenHash: sha(token), device: device.slice(0, 120), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) });
  return token;
}
const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export type Person = { userId: number; sessionId: number; email: string; name: string; emailConfirmed: boolean; timeZone: string;
  accountId: number; accountName: string; role: Role; since: string; trialEndsAt: string | null };

/** The person behind a session token, or null (unknown, ended or expired). Notes when it was last used. */
export async function personFor(db: Db, token: string | null | undefined): Promise<Person | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ s: sessions, u: users, m: memberships, a: accounts })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(sessions.tokenHash, sha(token)), isNull(sessions.endedAt), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!row) return null;
  await db.update(sessions).set({ lastSeenAt: sql`now()` })
    .where(and(eq(sessions.id, row.s.id), sql`${sessions.lastSeenAt} < now() - interval '1 minute'`));
  return {
    userId: row.u.id, sessionId: row.s.id, email: row.u.email, name: row.u.name, emailConfirmed: row.u.emailConfirmedAt !== null,
    timeZone: row.u.timeZone, accountId: row.a.id, accountName: row.a.name, role: row.m.role, since: row.u.createdAt.toISOString(),
    trialEndsAt: row.a.trialEndsAt ? row.a.trialEndsAt.toISOString() : null,
  };
}

/** Ends this session. With `others`, ends every other session of the same person instead (sign out everywhere else). */
export async function signOut(db: Db, token: string, others = false): Promise<number> {
  const [s] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, sha(token)), isNull(sessions.endedAt)));
  if (!s) return 0;
  const ended = await db.update(sessions).set({ endedAt: sql`now()`, endedWhy: others ? "signed_out_elsewhere" : "signed_out" })
    .where(others ? and(eq(sessions.userId, s.userId), ne(sessions.id, s.id), isNull(sessions.endedAt)) : eq(sessions.id, s.id))
    .returning({ id: sessions.id });
  return ended.length;
}

async function spendLink(db: Db, token: string, purpose: "confirm" | "reset") {
  const [l] = await db.update(emailLinks).set({ usedAt: sql`now()` })
    .where(and(eq(emailLinks.tokenHash, sha(token)), eq(emailLinks.purpose, purpose), isNull(emailLinks.usedAt), gt(emailLinks.expiresAt, sql`now()`)))
    .returning({ userId: emailLinks.userId });
  return l?.userId ?? null;
}

/** Confirms the address the link was sent to. Each link works once, within 48 hours. */
export async function confirmEmail(db: Db, token: string): Promise<boolean> {
  const userId = await spendLink(db, token, "confirm");
  if (userId === null) return false;
  await db.update(users).set({ emailConfirmedAt: sql`coalesce(${users.emailConfirmedAt}, now())` }).where(eq(users.id, userId));
  return true;
}

/** A fresh confirm link for a signed-in person whose email isn't confirmed yet. */
export const resendConfirm = (db: Db, userId: number) => newLink(db, userId, "confirm");

/** A reset link for this email if it has an account; null otherwise. The caller answers the same either way. */
export async function requestReset(db: Db, emailIn: string): Promise<{ token: string; userId: number } | null> {
  const e = email.safeParse(emailIn);
  if (!e.success) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, e.data));
  return u ? { token: await newLink(db, u.id, "reset"), userId: u.id } : null;
}

/** Sets a new password from a reset link: the link works once within an hour, and every session of the person ends. */
export async function resetPassword(db: Db, token: string, newPassword: string): Promise<{ ok: true } | Problems> {
  const p = password.safeParse(newPassword);
  if (!p.success) return problemsOf(p.error);
  const userId = await spendLink(db, token, "reset");
  if (userId === null) return { ok: false, problems: ["link: this reset link has been used or is over an hour old; ask for a new one"] };
  const passwordHash = await hashPassword(p.data);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, passwordChangedAt: sql`now()`, emailConfirmedAt: sql`coalesce(${users.emailConfirmedAt}, now())` }).where(eq(users.id, userId));
    await tx.update(sessions).set({ endedAt: sql`now()`, endedWhy: "password_changed" }).where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)));
  });
  return { ok: true };
}

export const profileInput = z.object({
  name: z.string().trim().min(1, "your name").max(80),
  company: z.string().trim().min(1, "your company").max(120).optional(),
  timeZone: z.string().trim().min(1).max(64).refine((z) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } }, "a real time zone"),
}).strict();

/** Saves the person's name and time zone, and the account's name when they own it. */
export async function updateProfile(db: Db, who: { userId: number; accountId: number; role: Role }, input: unknown): Promise<{ ok: true } | Problems> {
  const p = profileInput.safeParse(input);
  if (!p.success) return problemsOf(p.error);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: p.data.name, timeZone: p.data.timeZone }).where(eq(users.id, who.userId));
    if (p.data.company !== undefined && who.role === "owner") await tx.update(accounts).set({ name: p.data.company }).where(eq(accounts.id, who.accountId));
  });
  return { ok: true };
}

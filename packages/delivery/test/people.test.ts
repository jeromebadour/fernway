import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmEmail, forgetOldSignIns, personFor, requestReset, resetPassword, resendConfirm, signIn, signOut, signUp, updateProfile } from "../src/people.js";
import { accounts, emailLinks, memberships, sessions, users } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let n = 0;
const person = (over: Record<string, unknown> = {}) => ({ email: `Lena${++n}@Northpine.Dental`, name: "Lena Hartmann", company: "Northpine Dental", password: "northpine-2026!", ...over });

beforeAll(async () => {
  database = await freshDatabase("people");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
});
afterAll(async () => {
  await app.pool.end();
  await owner.pool.end();
  await database.drop();
});

describe("signing up", () => {
  it("makes the person, their own account on a 14-day trial, and makes them its owner; the password is only hashed", async () => {
    const r = await signUp(app.db, person());
    if (!r.ok) throw new Error(r.problems.join());
    const [u] = await app.db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.email).toBe(`lena${n}@northpine.dental`);
    expect(u!.passwordHash).toMatch(/^scrypt\$/);
    expect(u!.passwordHash).not.toContain("northpine-2026!");
    expect(u!.emailConfirmedAt).toBeNull();
    const [a] = await app.db.select().from(accounts).where(eq(accounts.id, r.accountId));
    expect(a!.name).toBe("Northpine Dental");
    const days = (a!.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    const [m] = await app.db.select().from(memberships).where(eq(memberships.userId, r.userId));
    expect(m).toMatchObject({ accountId: r.accountId, role: "owner" });
    const [l] = await app.db.select().from(emailLinks).where(eq(emailLinks.userId, r.userId));
    expect(l!.tokenHash).not.toBe(r.confirmToken);
  });

  it("refuses a taken email (any case), a short password and a missing name, with reasons; makes nothing", async () => {
    const first = person();
    await signUp(app.db, first);
    const again = await signUp(app.db, { ...first, email: first.email.toUpperCase() });
    expect(again).toMatchObject({ ok: false });
    expect((again as { problems: string[] }).problems[0]).toMatch(/^email: already has an account/);
    const weak = await signUp(app.db, person({ password: "short", name: "" }));
    expect(weak.ok).toBe(false);
    expect((weak as { problems: string[] }).problems.join()).toMatch(/password: 10 characters or more.*name: your name|name: your name.*password/);
  });
});

describe("signing in", () => {
  it("opens a session for the right password only; a wrong email and a wrong password get the same answer", async () => {
    const p = person();
    await signUp(app.db, p);
    expect(await signIn(app.db, p.email, "wrong-password-1")).toBeNull();
    expect(await signIn(app.db, "nobody@northpine.dental", p.password)).toBeNull();
    expect(await signIn(app.db, "not an email", p.password)).toBeNull();
    const s = await signIn(app.db, `  ${p.email.toUpperCase()} `, p.password, "Firefox on Windows");
    expect(s).not.toBeNull();
    const who = await personFor(app.db, s!.token);
    expect(who).toMatchObject({ name: "Lena Hartmann", accountName: "Northpine Dental", role: "owner", emailConfirmed: false });
    const [row] = await app.db.select().from(sessions).where(eq(sessions.id, who!.sessionId));
    expect(row!.tokenHash).not.toBe(s!.token);
    expect(row!.device).toBe("Firefox on Windows");
  });

  it("forgets an ended or expired session, and a made-up token", async () => {
    const p = person();
    await signUp(app.db, p);
    const s = await signIn(app.db, p.email, p.password);
    expect(await signOut(app.db, s!.token)).toBe(1);
    expect(await personFor(app.db, s!.token)).toBeNull();
    const t = await signIn(app.db, p.email, p.password);
    await owner.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, t!.userId));
    expect(await personFor(app.db, t!.token)).toBeNull();
    expect(await personFor(app.db, "made-up")).toBeNull();
    expect(await personFor(app.db, null)).toBeNull();
  });

  it("signs out every other device, keeping this one", async () => {
    const p = person();
    await signUp(app.db, p);
    const here = await signIn(app.db, p.email, p.password);
    const there = await signIn(app.db, p.email, p.password);
    const third = await signIn(app.db, p.email, p.password);
    expect(await signOut(app.db, here!.token, true)).toBe(2);
    expect(await personFor(app.db, here!.token)).not.toBeNull();
    expect(await personFor(app.db, there!.token)).toBeNull();
    expect(await personFor(app.db, third!.token)).toBeNull();
    const [ended] = await app.db.select().from(sessions).where(eq(sessions.userId, here!.userId));
    expect(["signed_out_elsewhere", null]).toContain(ended!.endedWhy);
  });
});

describe("email links", () => {
  it("confirms the email once; a used, expired or made-up link does nothing", async () => {
    const r = await signUp(app.db, person());
    if (!r.ok) throw new Error();
    expect(await confirmEmail(app.db, r.confirmToken)).toBe(true);
    expect(await confirmEmail(app.db, r.confirmToken)).toBe(false);
    expect(await confirmEmail(app.db, "made-up")).toBe(false);
    const [u] = await app.db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.emailConfirmedAt).not.toBeNull();
    const again = await resendConfirm(app.db, r.userId);
    await owner.db.update(emailLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailLinks.userId, r.userId));
    expect(await confirmEmail(app.db, again)).toBe(false);
  });

  it("resets a password once: every session ends, the old password stops, the new one works; unknown emails get nothing", async () => {
    const p = person();
    await signUp(app.db, p);
    const s = await signIn(app.db, p.email, p.password);
    expect(await requestReset(app.db, "nobody@northpine.dental")).toBeNull();
    const link = await requestReset(app.db, p.email);
    expect(await resetPassword(app.db, link!.token, "short")).toMatchObject({ ok: false });
    expect(await resetPassword(app.db, link!.token, "a-new-password-2026")).toEqual({ ok: true });
    expect(await personFor(app.db, s!.token)).toBeNull();
    expect(await signIn(app.db, p.email, p.password)).toBeNull();
    expect(await signIn(app.db, p.email, "a-new-password-2026")).not.toBeNull();
    expect(await resetPassword(app.db, link!.token, "another-password-1")).toMatchObject({ ok: false });
    const [u] = await app.db.select().from(users).where(eq(users.email, p.email.toLowerCase()));
    expect(u!.emailConfirmedAt).not.toBeNull();
  });
});

describe("the profile", () => {
  it("saves the name and time zone; the company only for its owner; refuses an unknown zone", async () => {
    const p = person();
    await signUp(app.db, p);
    const s = await signIn(app.db, p.email, p.password);
    const who = (await personFor(app.db, s!.token))!;
    expect(await updateProfile(app.db, who, { name: "Lena H.", company: "Northpine Dental Group", timeZone: "Europe/Berlin" })).toEqual({ ok: true });
    expect(await personFor(app.db, s!.token)).toMatchObject({ name: "Lena H.", accountName: "Northpine Dental Group", timeZone: "Europe/Berlin" });
    expect(await updateProfile(app.db, { ...who, role: "member" }, { name: "Lena H.", company: "Renamed", timeZone: "UTC" })).toEqual({ ok: true });
    expect((await personFor(app.db, s!.token))!.accountName).toBe("Northpine Dental Group");
    const bad = await updateProfile(app.db, who, { name: "", timeZone: "Mars/Olympus" });
    expect((bad as { problems: string[] }).problems.join()).toMatch(/name: your name.*timeZone: a real time zone/);
  });
});

describe("old sign-ins", () => {
  it("go 30 days after they ended or ran out; live ones and recent ones stay; spent links go after a day", async () => {
    const p = person();
    const r = await signUp(app.db, p);
    if (!r.ok) throw new Error();
    const live = await signIn(app.db, p.email, p.password);
    const old = await signIn(app.db, p.email, p.password);
    const recent = await signIn(app.db, p.email, p.password);
    const id = async (t: { token: string }) => (await personFor(app.db, t.token))!.sessionId;
    const [oldId, recentId, liveId] = [await id(old as { token: string }), await id(recent as { token: string }), await id(live as { token: string })];
    await owner.db.update(sessions).set({ endedAt: new Date(Date.now() - 31 * 86_400_000), endedWhy: "signed_out" }).where(eq(sessions.id, oldId));
    await owner.db.update(sessions).set({ endedAt: new Date(Date.now() - 2 * 86_400_000), endedWhy: "signed_out" }).where(eq(sessions.id, recentId));
    await owner.db.update(emailLinks).set({ usedAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(emailLinks.userId, r.userId));
    const gone = await forgetOldSignIns(app.db);
    expect(gone.sessions).toBeGreaterThanOrEqual(1);
    expect(gone.links).toBeGreaterThanOrEqual(1);
    const left = (await app.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, r.userId))).map((x) => x.id);
    expect(left).toEqual(expect.arrayContaining([recentId, liveId]));
    expect(left).not.toContain(oldId);
    expect(await app.db.select().from(emailLinks).where(eq(emailLinks.userId, r.userId))).toHaveLength(0);
  });
});

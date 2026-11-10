// The rest of the account area against a real database and the fake GHL: two-step sign-in, password, devices, API keys,
// preferences, the record, and deleting an account from GHL, Stripe and Fernway.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  base32, beginTwoStep, changePassword, confirmTwoStep, deleteAccount, fromBase32, ghlSide, listDevices, listKeys, makeKey, MAX_KEYS,
  newRecoveryCodes, prefsOf, recordView, recoveryLeft, revokeKey, savePrefs, secondStep, signOutDevice, stepAt, totpCode, turnOffTwoStep,
} from "../src/account.js";
import { accountForKey } from "../src/apikeys.js";
import { keyFrom } from "../src/crypto.js";
import { deliverTry, ingestLead } from "../src/engine.js";
import { personFor, signIn, signUp } from "../src/people.js";
import { accounts, memberships, sessions, shipments, users } from "../src/schema.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const KEY = keyFrom("a".repeat(64));
const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let site: number;
let n = 0;

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("account");
  app = createDb(database.appUrl, 3);
  site = await seedAccount(app.db);
});
// The fake GHL numbers its contacts afresh each test, so the site's leads from earlier tests go too (real ids never repeat).
beforeEach(async () => {
  ghl.reset();
  await app.db.delete(shipments).where(eq(shipments.accountId, site));
});
afterAll(async () => {
  ghl.server.close();
  await app.pool.end();
  await database.drop();
});

async function person(name = "Lena Hartmann") {
  const email = `lena${++n}@northpine.dental`;
  const r = await signUp(app.db, { email, name, company: `Northpine Dental ${n}`, password: "northpine-2026!" });
  if (!r.ok) throw new Error(r.problems.join());
  const s = await signIn(app.db, email, "northpine-2026!", "Firefox on Windows");
  if (!s || !("token" in s)) throw new Error("no session");
  const p = (await personFor(app.db, s.token))!;
  return { ...p, email, token: s.token, company: `Northpine Dental ${n}` };
}
const secretOf = async (userId: number) => {
  const [u] = await app.db.select().from(users).where(eq(users.id, userId));
  const { open } = await import("../src/crypto.js");
  return fromBase32(open(KEY, (u!.totpSealed ?? u!.totpPendingSealed)!));
};
const codeFor = (secret: Buffer, shiftSteps = 0) => totpCode(secret, stepAt(Date.now()) + shiftSteps);

describe("the code itself", () => {
  it("matches RFC 6238's own test vector, and base32 goes both ways", () => {
    const secret = Buffer.from("12345678901234567890");
    expect(totpCode(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(fromBase32(base32(secret)).equals(secret)).toBe(true);
    expect(base32(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
});

describe("two-step sign-in", () => {
  it("turns on only with a code from the app; 10 recovery codes come back once; other devices sign out, this one stays", async () => {
    const p = await person();
    const other = await signIn(app.db, p.email, "northpine-2026!", "Safari on iPhone");
    const { secret, uri } = await beginTwoStep(app.db, KEY, p.userId);
    expect(uri).toBe(`otpauth://totp/Fernway%3A${encodeURIComponent(p.email)}?secret=${secret}&issuer=Fernway&algorithm=SHA1&digits=6&period=30`);
    const s = fromBase32(secret);
    expect(await confirmTwoStep(app.db, KEY, p.userId, p.sessionId, "000000")).toMatchObject({ ok: false });
    const r = await confirmTwoStep(app.db, KEY, p.userId, p.sessionId, codeFor(s));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.recovery).toHaveLength(10);
    expect(r.recovery[0]).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(await personFor(app.db, p.token)).not.toBeNull();
    expect(await personFor(app.db, (other as { token: string }).token)).toBeNull();
    const [u] = await app.db.select().from(users).where(eq(users.id, p.userId));
    expect(u!.totpSealed).toMatch(/^v1\./);
    expect(u!.totpSealed).not.toContain(secret);
    expect(u!.totpPendingSealed).toBeNull();
  });

  it("then the password alone opens no session; the app's code does, once per 30-second step", async () => {
    const p = await person();
    const { secret } = await beginTwoStep(app.db, KEY, p.userId);
    const s = fromBase32(secret);
    await confirmTwoStep(app.db, KEY, p.userId, p.sessionId, codeFor(s));
    expect(await signIn(app.db, p.email, "northpine-2026!")).toEqual({ twoStep: true, userId: p.userId });
    expect(await signIn(app.db, p.email, "wrong-password-1")).toBeNull();
    // The step used to turn it on is spent; the next step's code works once.
    expect(await secondStep(app.db, KEY, p.userId, codeFor(s))).toBeNull();
    expect(await secondStep(app.db, KEY, p.userId, codeFor(s, 1))).toBe("code");
    expect(await secondStep(app.db, KEY, p.userId, codeFor(s, 1))).toBeNull();
    expect(await secondStep(app.db, KEY, p.userId, codeFor(s, 3))).toBeNull();
    expect(await secondStep(app.db, KEY, p.userId, "12345")).toBeNull();
  });

  it("a recovery code works once, with or without its dash, and new ones replace the old", async () => {
    const p = await person();
    const { secret } = await beginTwoStep(app.db, KEY, p.userId);
    const r = await confirmTwoStep(app.db, KEY, p.userId, p.sessionId, codeFor(fromBase32(secret)));
    if (!r.ok) throw new Error();
    expect(await secondStep(app.db, KEY, p.userId, r.recovery[0]!.toUpperCase().replace("-", ""))).toBe("recovery");
    expect(await secondStep(app.db, KEY, p.userId, r.recovery[0]!)).toBeNull();
    expect(await recoveryLeft(app.db, p.userId)).toBe(9);
    expect(await newRecoveryCodes(app.db, p.userId, "wrong-password-1")).toMatchObject({ ok: false });
    const again = await newRecoveryCodes(app.db, p.userId, "northpine-2026!");
    if (!again.ok) throw new Error();
    expect(await secondStep(app.db, KEY, p.userId, r.recovery[1]!)).toBeNull();
    expect(await secondStep(app.db, KEY, p.userId, again.recovery[1]!)).toBe("recovery");
    // Someone else's recovery code opens nothing here.
    const q = await person();
    expect(await secondStep(app.db, KEY, q.userId, again.recovery[2]!)).toBeNull();
  });

  it("turning it off needs the password, and the password alone signs in again", async () => {
    const p = await person();
    const { secret } = await beginTwoStep(app.db, KEY, p.userId);
    await confirmTwoStep(app.db, KEY, p.userId, p.sessionId, codeFor(fromBase32(secret)));
    expect(await turnOffTwoStep(app.db, p.userId, p.sessionId, "nope-nope-nope")).toMatchObject({ ok: false });
    expect(await turnOffTwoStep(app.db, p.userId, p.sessionId, "northpine-2026!")).toEqual({ ok: true });
    expect(await signIn(app.db, p.email, "northpine-2026!")).toMatchObject({ token: expect.any(String) });
    expect(await secretOf(p.userId).catch(() => null)).toBeNull();
  });
});

describe("the password", () => {
  it("changes only with the current one, not to the same one; other devices sign out, this one stays", async () => {
    const p = await person();
    const other = (await signIn(app.db, p.email, "northpine-2026!")) as { token: string };
    expect(await changePassword(app.db, p.userId, p.sessionId, "wrong-password-1", "a-new-password-26")).toEqual({ ok: false, problems: ["current: that isn't your current password"] });
    expect(await changePassword(app.db, p.userId, p.sessionId, "northpine-2026!", "northpine-2026!")).toMatchObject({ ok: false, problems: ["next: that is the password you have now"] });
    expect(await changePassword(app.db, p.userId, p.sessionId, "northpine-2026!", "short")).toMatchObject({ ok: false });
    expect(await changePassword(app.db, p.userId, p.sessionId, "northpine-2026!", "a-new-password-26")).toEqual({ ok: true, signedOut: 1 });
    expect(await personFor(app.db, p.token)).not.toBeNull();
    expect(await personFor(app.db, other.token)).toBeNull();
    expect(await signIn(app.db, p.email, "northpine-2026!")).toBeNull();
    expect(await signIn(app.db, p.email, "a-new-password-26")).not.toBeNull();
  });
});

describe("devices", () => {
  it("lists the live ones first with this one marked, then the ended ones with why; signs out one other, never this one", async () => {
    const p = await person();
    const phone = (await signIn(app.db, p.email, "northpine-2026!", "Safari on iPhone")) as { token: string };
    const phoneId = (await personFor(app.db, phone.token))!.sessionId;
    let list = await listDevices(app.db, p.userId, p.sessionId);
    expect(list.map((d) => [d.device, d.here, d.endedAt])).toEqual(expect.arrayContaining([["Firefox on Windows", true, null], ["Safari on iPhone", false, null]]));
    expect(await signOutDevice(app.db, p.userId, p.sessionId, p.sessionId)).toBe(false);
    const q = await person();
    expect(await signOutDevice(app.db, q.userId, q.sessionId, phoneId)).toBe(false);
    expect(await signOutDevice(app.db, p.userId, p.sessionId, phoneId)).toBe(true);
    expect(await personFor(app.db, phone.token)).toBeNull();
    list = await listDevices(app.db, p.userId, p.sessionId);
    expect(list.at(-1)).toMatchObject({ device: "Safari on iPhone", endedWhy: "signed_out_from_device" });
    expect(list[0]).toMatchObject({ here: true, endedAt: null });
  });
});

describe("API keys in the app", () => {
  it("makes a working key shown once, names who made it, revokes only the account's own, and stops at the limit", async () => {
    const p = await person("Maya Lindqvist");
    expect(await makeKey(app.db, p.accountId, p.userId, "  ")).toMatchObject({ ok: false });
    const k = await makeKey(app.db, p.accountId, p.userId, "Northpine website");
    if (!k.ok) throw new Error();
    expect(k.key).toMatch(/^fw_[a-z0-9]{8}_[a-z0-9]{32}$/);
    expect(await accountForKey(app.db, k.key)).toBe(p.accountId);
    const [row] = await listKeys(app.db, p.accountId);
    expect(row).toMatchObject({ prefix: k.prefix, label: "Northpine website", madeBy: "Maya Lindqvist", revokedAt: null });
    expect(JSON.stringify(row)).not.toContain(k.key.slice(12));
    const q = await person();
    expect(await revokeKey(app.db, q.accountId, k.prefix)).toBe(false);
    expect(await revokeKey(app.db, p.accountId, k.prefix)).toBe(true);
    expect(await accountForKey(app.db, k.key)).toBeNull();
    for (let i = 0; i < MAX_KEYS; i++) await makeKey(app.db, q.accountId, q.userId, `key ${i}`);
    expect(await makeKey(app.db, q.accountId, q.userId, "one too many")).toMatchObject({ ok: false, problems: [expect.stringMatching(/20 live keys/)] });
  });
});

describe("preferences", () => {
  it("start as day-month, 24h, held and returned emails on, weekly off; save only real choices", async () => {
    const p = await person();
    expect(await prefsOf(app.db, p.userId)).toEqual({ dateStyle: "day-month", clock: "24h", emailHeld: true, emailReturned: true, emailWeekly: false });
    expect(await savePrefs(app.db, p.userId, { dateStyle: "dd/mm", clock: "24h", emailHeld: true, emailReturned: true, emailWeekly: false })).toMatchObject({ ok: false });
    expect(await savePrefs(app.db, p.userId, { dateStyle: "iso", clock: "12h", emailHeld: false, emailReturned: true, emailWeekly: true })).toEqual({ ok: true });
    expect(await prefsOf(app.db, p.userId)).toEqual({ dateStyle: "iso", clock: "12h", emailHeld: false, emailReturned: true, emailWeekly: true });
  });
});

async function siteLead(email: string) {
  const { deps } = testDeps(app.db, fakeConnection());
  const r = await ingestLead(deps, site, { idempotencyKey: `rec-${email}-${++n}`, source: "form", route: "trial", contact: { email, firstName: "Lena" } });
  if (!r.ok) throw new Error(r.problems.join());
  await deliverTry(deps, r.waybill.id, 1);
  return r.waybill.id;
}

describe("your record", () => {
  it("Fernway's side holds the person, the account and their leads through the site; GHL's side is read live", async () => {
    const p = await person();
    await siteLead(p.email);
    const v = (await recordView(app.db, p.userId, p.accountId, site))!;
    expect(v.person).toMatchObject({ name: "Lena Hartmann", email: p.email, emailConfirmedAt: null, twoStepSince: null });
    expect(v.account).toMatchObject({ id: p.accountId, role: "owner", plan: null });
    expect(v.counts).toEqual({ devicesSignedIn: 1, apiKeysLive: 0, invoices: 0 });
    expect(v.leads).toHaveLength(1);
    expect(v.leads[0]).toMatchObject({ waybill: expect.stringMatching(/^FW \d{2} \d{5}$/), route: "Trial", state: "signed" });
    expect(JSON.stringify(v)).not.toMatch(/passwordHash|_hash|sealed|token/i);
    const { deps } = testDeps(app.db, fakeConnection());
    const g = await ghlSide(deps, site, v.leads.map((l) => l.contactId!));
    expect(g).toMatchObject({ reached: true, contacts: [{ email: p.email, tags: ["trial"] }] });
    expect(await ghlSide(testDeps(app.db, null).deps, site, ["c_1"])).toEqual({ reached: false });
  });
});

describe("deleting the account", () => {
  const stripeGone: string[] = [];
  const fakeStripe = { customers: { del: async (id: string) => { stripeGone.push(id); return { id, deleted: true }; } } } as unknown as Stripe;
  const deps = (conn = fakeConnection(), stripe: Stripe | null = fakeStripe) => ({ ...testDeps(app.db, conn).deps, stripe });

  it("needs the owner and the account's exact name", async () => {
    const p = await person();
    expect(await deleteAccount(deps(), { ...p, role: "admin" }, site, p.company)).toMatchObject({ ok: false, steps: [] });
    expect(await deleteAccount(deps(), p, site, "northpine dental")).toMatchObject({ ok: false, problems: [expect.stringMatching(/^name: /)] });
    expect(await personFor(app.db, p.token)).not.toBeNull();
  });

  it("when GHL can't be reached, nothing is deleted anywhere, and it says so", async () => {
    const p = await person();
    await siteLead(p.email);
    await app.db.update(accounts).set({ stripeCustomerId: "cus_Keep01" }).where(eq(accounts.id, p.accountId));
    ghl.deleteAnswers.push(503, 503);
    const r = await deleteAccount(deps(), p, site, p.company);
    expect(r).toMatchObject({ ok: false, steps: [{ what: "ghl", done: false }], problems: [expect.stringMatching(/nothing was deleted/)] });
    expect(stripeGone).not.toContain("cus_Keep01");
    expect(await personFor(app.db, p.token)).not.toBeNull();
    const none = await deleteAccount(deps(null as never), p, site, p.company);
    expect(none).toMatchObject({ ok: false, steps: [{ what: "ghl", done: false }] });
  });

  it("removes them from GHL, then Stripe, then Fernway: the account, its people, their sessions and their leads", async () => {
    const p = await person();
    const lead = await siteLead(p.email);
    const keep = await siteLead("someone.else@b.example");
    await app.db.update(accounts).set({ stripeCustomerId: "cus_Gone01", plan: "growth" }).where(eq(accounts.id, p.accountId));
    const r = await deleteAccount(deps(), p, site, p.company);
    expect(r).toEqual({ ok: true, steps: [
      { what: "ghl", done: true, detail: expect.stringMatching(/removed/) },
      { what: "stripe", done: true, detail: "plan cancelled, card removed" },
      { what: "fernway", done: true, detail: `account AC ${String(p.accountId).padStart(6, "0")} and your sign-in removed` },
    ] });
    expect(ghl.deleted).toEqual(expect.arrayContaining([expect.stringMatching(/^opportunities\//), expect.stringMatching(/^contacts\//)]));
    expect(stripeGone).toContain("cus_Gone01");
    expect(await app.db.select().from(accounts).where(eq(accounts.id, p.accountId))).toHaveLength(0);
    expect(await app.db.select().from(users).where(eq(users.id, p.userId))).toHaveLength(0);
    expect(await app.db.select().from(sessions).where(eq(sessions.userId, p.userId))).toHaveLength(0);
    expect(await app.db.select().from(memberships).where(eq(memberships.userId, p.userId))).toHaveLength(0);
    expect(await app.db.select().from(shipments).where(eq(shipments.id, lead))).toHaveLength(0);
    expect(await app.db.select().from(shipments).where(eq(shipments.id, keep))).toHaveLength(1);
    expect(await personFor(app.db, p.token)).toBeNull();
  });

  it("an account with nothing in GHL or Stripe says so at each step", async () => {
    const p = await person();
    const r = await deleteAccount(deps(), p, site, p.company);
    expect(r).toMatchObject({ ok: true, steps: [
      { what: "ghl", detail: "GHL held nothing of yours" }, { what: "stripe", detail: "no card was ever given" }, { what: "fernway", done: true },
    ] });
  });
});

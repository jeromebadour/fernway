// The console's managing side against a real database: who may change what, every change audited, an invite good once.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditView } from "../src/console.js";
import {
  acceptInvite, cancelInvite, connectionView, disconnectGhl, invite, inviteFor, removeMember, routesView, saveRoute, setRole, teamView,
  type Manager,
} from "../src/manage.js";
import { forgetOldSignIns, personFor, signIn, signUp } from "../src/people.js";
import { ghlConnections, invites, routes, users } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: Manager, other: Manager;

beforeAll(async () => {
  database = await freshDatabase("manage");
  app = createDb(database.appUrl, 2);
  const a = await signUp(app.db, { email: "maya@harborphysio.com", name: "Maya Lindqvist", company: "Harbor Physio", password: "northpine-2026!" });
  const b = await signUp(app.db, { email: "tom@cedarlanevets.com", name: "Tom Whitfield", company: "Cedar Lane Vets", password: "northpine-2026!" });
  if (!a.ok || !b.ok) throw new Error("sign-up");
  owner = { accountId: a.accountId, userId: a.userId, name: "Maya Lindqvist", role: "owner" };
  other = { accountId: b.accountId, userId: b.userId, name: "Tom Whitfield", role: "owner" };
});
afterAll(async () => {
  await app.pool.end();
  await database.drop();
});

describe("routes", () => {
  it("makes a route once per key, keeps its key, and audits what changed", async () => {
    const made = await saveRoute(app.db, owner, { key: "Booking", label: "Booking requests", tags: ["booking", "Booking", "web"], pipelineId: "p1", stageId: "s1" });
    expect(made.ok).toBe(true);
    const again = await saveRoute(app.db, owner, { key: "booking", label: "Twice" });
    expect(again).toEqual({ ok: false, problems: ["key: this account already has a route called booking"] });
    // Another account may use the same key.
    expect((await saveRoute(app.db, other, { key: "booking", label: "Booking requests" })).ok).toBe(true);

    const id = made.ok ? made.id : 0;
    expect((await saveRoute(app.db, owner, { key: "contact", label: "Renamed" }, id)).ok).toBe(false);
    expect((await saveRoute(app.db, owner, { label: "Bookings", tags: ["booking", "web"], pipelineId: null, stageId: null }, id)).ok).toBe(true);
    const [r] = await app.db.select().from(routes).where(eq(routes.id, id));
    expect(r).toMatchObject({ key: "booking", label: "Bookings", tags: ["booking", "web"], pipelineId: null, stageId: null });

    const log = await auditView(app.db, owner.accountId);
    expect(log.rows.map((x) => [x.action, x.detail])).toEqual([
      ["route.changed", "name Bookings; no stage"],
      ["route.made", "Booking requests; tags booking, web; stage s1"],
    ]);
    const view = await routesView(app.db, owner.accountId);
    expect(view.map((v) => v.key)).toEqual(["booking"]);
  });

  it("refuses a stage without its pipeline, and a member's change", async () => {
    expect(await saveRoute(app.db, owner, { key: "half", label: "Half", stageId: "s1" })).toEqual({ ok: false, problems: ["stageId: a pipeline and its stage go together"] });
    expect((await saveRoute(app.db, { ...owner, role: "member" }, { key: "x", label: "X" })).ok).toBe(false);
    // A route of another account is not found.
    const [theirs] = await app.db.select().from(routes).where(eq(routes.accountId, other.accountId));
    expect(await saveRoute(app.db, owner, { label: "Mine now" }, theirs!.id)).toEqual({ ok: false, problems: ["form: that route is not in this account"] });
  });
});

describe("the GHL connection", () => {
  it("shows the connection and forgets it on disconnect", async () => {
    expect((await connectionView(app.db, owner.accountId)).connected).toBe(false);
    await app.db.insert(ghlConnections).values({ accountId: owner.accountId, locationId: "loc_1", scopes: "a b", accessTokenEnc: "x", refreshTokenEnc: "y", expiresAt: new Date(Date.now() + 3_600_000) });
    const v = await connectionView(app.db, owner.accountId);
    expect(v).toMatchObject({ connected: true, status: "connected", locationId: "loc_1", scopes: ["a", "b"], calls: { ok: 0, medianMs: null } });
    expect((await disconnectGhl(app.db, { ...owner, role: "member" })).ok).toBe(false);
    expect(await disconnectGhl(app.db, owner)).toEqual({ ok: true });
    expect((await connectionView(app.db, owner.accountId)).connected).toBe(false);
    expect((await auditView(app.db, owner.accountId)).rows[0]).toMatchObject({ action: "ghl.disconnected", targetId: "loc_1" });
  });
});

describe("the team", () => {
  it("invites by email, joins once, and the joiner signs in", async () => {
    const admin = { ...owner, role: "admin" as const };
    expect(await invite(app.db, admin, { email: "lea@harborphysio.com", role: "admin" })).toEqual({ ok: false, problems: ["role: only the owner invites an admin"] });
    expect((await invite(app.db, owner, { email: "tom@cedarlanevets.com", role: "member" })).ok).toBe(false);

    const i = await invite(app.db, owner, { email: "Lea@HarborPhysio.com", role: "member" });
    if (!i.ok) throw new Error(i.problems.join());
    expect((await invite(app.db, owner, { email: "lea@harborphysio.com", role: "member" })).ok).toBe(false);
    expect(await inviteFor(app.db, i.token)).toMatchObject({ email: "lea@harborphysio.com", role: "member", accountName: "Harbor Physio", by: "Maya Lindqvist" });

    const joined = await acceptInvite(app.db, i.token, { name: "Lea Moreau", password: "harbor-tide-77" });
    expect(joined).toMatchObject({ ok: true, accountId: owner.accountId });
    expect((await acceptInvite(app.db, i.token, { name: "Again", password: "harbor-tide-77" })).ok).toBe(false);
    expect(await inviteFor(app.db, i.token)).toBeNull();

    const s = await signIn(app.db, "lea@harborphysio.com", "harbor-tide-77");
    const p = s && "token" in s ? await personFor(app.db, s.token) : null;
    expect(p).toMatchObject({ accountId: owner.accountId, role: "member", emailConfirmed: true });

    const t = await teamView(app.db, owner.accountId);
    expect(t.members.map((m) => [m.name, m.role])).toEqual([["Maya Lindqvist", "owner"], ["Lea Moreau", "member"]]);
    expect(t.invites).toEqual([]);
  });

  it("lets only the owner change roles, and removes a person with their sign-in", async () => {
    const [lea] = await app.db.select().from(users).where(eq(users.email, "lea@harborphysio.com"));
    expect((await setRole(app.db, { ...owner, role: "admin" }, lea!.id, "admin")).ok).toBe(false);
    expect(await setRole(app.db, owner, owner.userId, "member")).toEqual({ ok: false, problems: ["form: the owner stays the owner"] });
    expect(await setRole(app.db, owner, lea!.id, "admin")).toEqual({ ok: true });
    // An admin can't remove another admin, nor the owner; nobody from another account can remove anyone here.
    expect((await removeMember(app.db, { ...owner, userId: 999_999, role: "admin" }, lea!.id)).ok).toBe(false);
    expect((await removeMember(app.db, other, lea!.id)).ok).toBe(false);
    expect(await removeMember(app.db, owner, lea!.id)).toEqual({ ok: true });
    expect(await app.db.select().from(users).where(eq(users.id, lea!.id))).toEqual([]);
    expect(await signIn(app.db, "lea@harborphysio.com", "harbor-tide-77")).toBeNull();
    const actions = (await auditView(app.db, owner.accountId)).rows.slice(0, 4).map((r) => r.action);
    expect(actions).toEqual(["member.removed", "member.role", "member.joined", "member.invited"]);
  });

  it("cancels an open invite, after which its link opens nothing", async () => {
    const i = await invite(app.db, owner, { email: "sam@harborphysio.com", role: "member" });
    if (!i.ok) throw new Error(i.problems.join());
    expect((await cancelInvite(app.db, other, i.id)).ok).toBe(false);
    expect(await cancelInvite(app.db, owner, i.id)).toEqual({ ok: true });
    expect(await inviteFor(app.db, i.token)).toBeNull();
    expect((await acceptInvite(app.db, i.token, { name: "Sam", password: "harbor-tide-77" })).ok).toBe(false);
    // A closed invite is deleted a day after it closed; the open one to nobody else stays.
    await app.db.update(invites).set({ cancelledAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(invites.id, i.id));
    expect((await forgetOldSignIns(app.db)).invites).toBeGreaterThanOrEqual(1);
    expect(await app.db.select().from(invites).where(eq(invites.id, i.id))).toEqual([]);
    // The audit log by group: the team's lines only.
    const team = await auditView(app.db, owner.accountId, 1, "team");
    expect(team.total).toBe(6);
    expect(team.rows.every((r) => /^(member|invite)\./.test(r.action))).toBe(true);
  });
});

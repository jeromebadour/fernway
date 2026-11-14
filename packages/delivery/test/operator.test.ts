// The operator console against a real database: staff only with two-step on, watchers read right, one incident per
// watcher (raised, then cleared), every action by role and written to the operator audit log.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accountDetail, accountsView, acknowledge, addStaff, extendTrial, incidentsView, operatorAuditView, overviewView, queueView, recordIncidents,
  removeStaff, setStaffRole, staffList, staffOf, watch, type BoxReading, type Staff,
} from "../src/operator.js";
import { signUp } from "../src/people.js";
import { accounts, opsRuns, routes, shipments, staff, users } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let jerome: Staff;
let mayaId: number, harbor: number;

const box = (o: Partial<BoxReading> = {}): BoxReading => ({
  at: new Date().toISOString(), load1: 0.4, cpus: 4, memUsed: 3e9, memTotal: 8e9, diskUsed: 40e9, diskTotal: 100e9, redisBytes: 2e6,
  webCommit: "abc1234", workerCommit: "abc1234", workerBeatAt: new Date().toISOString(), jobs: null, ...o,
});

beforeAll(async () => {
  database = await freshDatabase("operator");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
  const j = await signUp(app.db, { email: "jerome@jeromebadour.com", name: "Jerome Badour", company: "Fernway", password: "northpine-2026!" });
  const m = await signUp(app.db, { email: "maya@harborphysio.com", name: "Maya Lindqvist", company: "Harbor Physio", password: "northpine-2026!" });
  if (!j.ok || !m.ok) throw new Error("sign-up");
  mayaId = m.userId; harbor = m.accountId;
  await app.db.insert(staff).values({ userId: j.userId, role: "owner" });
  jerome = { userId: j.userId, name: "Jerome Badour", role: "owner" };
});
afterAll(async () => {
  await app.pool.end(); await owner.pool.end();
  await database.drop();
});

describe("staff", () => {
  it("opens the console only with two-step sign-in on", async () => {
    expect(await staffOf(app.db, jerome.userId)).toBeNull();
    await app.db.update(users).set({ totpSealed: "v1.x.y.z", totpEnabledAt: new Date() }).where(eq(users.id, jerome.userId));
    expect(await staffOf(app.db, jerome.userId)).toEqual(jerome);
    expect(await staffOf(app.db, mayaId)).toBeNull();
  });

  it("lets only the owner add, change and remove staff, each on the record", async () => {
    const support: Staff = { userId: mayaId, name: "Maya", role: "support" };
    expect((await addStaff(app.db, support, "x@y.com", "viewer")).ok).toBe(false);
    expect(await addStaff(app.db, jerome, "nobody@nowhere.com", "viewer")).toEqual({ ok: false, problems: ["email: no Fernway account has this email; they sign up first"] });
    expect((await addStaff(app.db, jerome, "MAYA@harborphysio.com", "owner")).ok).toBe(false);
    expect(await addStaff(app.db, jerome, "MAYA@harborphysio.com", "viewer")).toEqual({ ok: true });
    expect((await addStaff(app.db, jerome, "maya@harborphysio.com", "viewer")).ok).toBe(false);
    expect(await setStaffRole(app.db, jerome, mayaId, "support")).toEqual({ ok: true });
    expect((await setStaffRole(app.db, jerome, jerome.userId, "viewer")).ok).toBe(false);
    const list = await staffList(app.db);
    expect(list.map((s) => [s.name, s.role, s.twoStep])).toEqual([["Jerome Badour", "owner", true], ["Maya Lindqvist", "support", false]]);
    expect(await removeStaff(app.db, jerome, mayaId)).toEqual({ ok: true });
    const log = await operatorAuditView(app.db);
    expect(log.rows.map((r) => [r.action, r.target, r.detail])).toEqual([
      ["staff.removed", "Maya Lindqvist", ""], ["staff.role", "Maya Lindqvist", "now support"], ["staff.added", "Maya Lindqvist", "as viewer"],
    ]);
    // Written once: the app can't change or remove a line.
    await expect(app.pool.query("delete from operator_audit")).rejects.toThrow(/permission denied/);
  });
});

describe("watchers and incidents", () => {
  it("reads the service as it is", async () => {
    let w = await watch(app.db, box());
    const state = (k: string) => w.find((x) => x.key === k)?.state;
    expect(state("worker")).toBe("ok");
    expect(state("backup")).toBe("down"); // never ran
    expect(state("restore_test")).toBe("warn");
    expect(state("queue")).toBe("ok");
    await owner.db.insert(opsRuns).values([{ kind: "backup", ok: true, detail: "dump 33 KB" }, { kind: "restore_test", ok: true, detail: "RESTORE OK" }]);
    w = await watch(app.db, box({ workerBeatAt: new Date(Date.now() - 120_000).toISOString(), diskUsed: 85e9 }));
    expect(state("backup")).toBe("ok");
    expect(state("worker")).toBe("down");
    expect(state("disk")).toBe("warn");
    expect(w.find((x) => x.key === "disk")?.reading).toBe("85% used");
    expect(w.find((x) => x.key === "claude")).toMatchObject({ state: "ok", reading: "$0.00 of $8.00 this month" });
    await owner.db.execute(sql`insert into claude_spend (month, calls, spent_usd) values (date_trunc('month', now() at time zone 'utc')::date, 40, 6.5)`);
    expect((await watch(app.db, null)).find((x) => x.key === "claude")).toMatchObject({ state: "warn", reading: "$6.50 of $8.00 this month" });
    expect((await watch(app.db, null, Date.now(), 6)).find((x) => x.key === "claude")?.state).toBe("down");
    await owner.db.execute(sql`delete from claude_spend`);
    // Without a reading from a process, the box's watchers are left out, not guessed.
    expect((await watch(app.db, null)).some((x) => x.key === "worker")).toBe(false);
  });

  it("opens one incident per watcher, raises it, then clears it", async () => {
    const disk = (state: "ok" | "warn" | "down", reading: string) => [{ key: "disk", label: "Disk", state, reading, limit: "under 80%" }];
    expect(await recordIncidents(app.db, disk("warn", "85% used"))).toEqual({ opened: 1, closed: 0 });
    expect(await recordIncidents(app.db, disk("warn", "86% used"))).toEqual({ opened: 0, closed: 0 });
    await recordIncidents(app.db, disk("down", "94% used"));
    let v = await incidentsView(app.db);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ watcher: "disk", level: "down", first: "85% used", worst: "94% used", closedAt: null });

    expect((await acknowledge(app.db, { ...jerome, role: "viewer" }, v.rows[0]!.id, "")).ok).toBe(false);
    expect(await acknowledge(app.db, jerome, v.rows[0]!.id, "Old backups filling /srv; pruning")).toEqual({ ok: true });
    expect((await acknowledge(app.db, jerome, v.rows[0]!.id, "")).ok).toBe(false);
    expect(await acknowledge(app.db, jerome, v.rows[0]!.id, "Pruned to 14 days")).toEqual({ ok: true });

    expect(await recordIncidents(app.db, disk("ok", "61% used"))).toEqual({ opened: 0, closed: 1 });
    v = await incidentsView(app.db);
    expect(v.rows[0]).toMatchObject({ ackBy: "Jerome Badour", note: "Pruned to 14 days" });
    expect(v.rows[0]!.closedAt).not.toBeNull();
    // Wrong again later: a new incident, not the old one reopened.
    await recordIncidents(app.db, disk("warn", "82% used"));
    expect((await incidentsView(app.db)).total).toBe(2);
  });
});

describe("accounts, queue and the overview", () => {
  it("finds accounts by name, owner email or number, and gives a trial more days", async () => {
    expect((await accountsView(app.db, { q: "harbor" })).rows.map((r) => r.name)).toEqual(["Harbor Physio"]);
    expect((await accountsView(app.db, { q: `AC ${String(harbor).padStart(6, "0")}` })).rows.map((r) => r.id)).toEqual([harbor]);
    expect((await accountsView(app.db, { q: "100%_" })).total).toBe(0);

    const before = (await accountDetail(app.db, harbor))!.trialEndsAt!;
    const r = await extendTrial(app.db, jerome, harbor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Date.parse(r.endsAt) - Date.parse(before)).toBeGreaterThan(6.9 * 86_400_000);
    await app.db.update(accounts).set({ plan: "growth" }).where(eq(accounts.id, harbor));
    expect((await extendTrial(app.db, jerome, harbor)).ok).toBe(false);
    expect((await extendTrial(app.db, { ...jerome, role: "viewer" }, harbor)).ok).toBe(false);
    expect((await operatorAuditView(app.db)).rows[0]).toMatchObject({ action: "account.trial_extended", account: "Harbor Physio" });
  });

  it("counts the queue, overdue tries included", async () => {
    const [rt] = await app.db.insert(routes).values({ accountId: harbor, key: "booking", label: "Booking" }).returning();
    const lead = (i: number, state: "waiting" | "in_transit", next: number) => ({
      accountId: harbor, routeId: rt!.id, waybillYear: 26, waybillSeq: 90000 + i, idempotencyKey: `op-${i}-xxxxxxxx`, source: "form" as const,
      contact: { email: `t${i}@x.com` }, state, tries: 1, nextTryAt: new Date(Date.now() + next),
    });
    await app.db.insert(shipments).values([lead(1, "waiting", 60_000), lead(2, "waiting", -10 * 60_000), lead(3, "in_transit", -1000)]);
    const q = await queueView(app.db);
    expect(q).toMatchObject({ waiting: 2, inTransit: 1, due: 2, overdue: 1 });
    expect(q.byAccount[0]).toMatchObject({ name: "Harbor Physio", moving: 1, waiting: 2 });
    expect(q.perHour).toHaveLength(24);
    const w = await watch(app.db, null);
    expect(w.find((x) => x.key === "queue")).toMatchObject({ state: "warn" });
    const o = await overviewView(app.db);
    expect(o).toMatchObject({ accounts: 2, people: 2, leads24: 3, openIncidents: 1 });
    expect(o.runs.backup?.ok).toBe(true);
  });
});

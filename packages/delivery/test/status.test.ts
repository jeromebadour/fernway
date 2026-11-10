import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { opsRuns, scans } from "../src/schema.js";
import { statusView } from "../src/status.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let site: number;
let demo: number;
let n = 0;

const send = async (accountId: number, route = "trial") => {
  const { deps } = testDeps(app.db, fakeConnection());
  const r = await ingestLead(deps, accountId, { idempotencyKey: `status-${++n}-xxxx`, source: "form", route, contact: { email: `s${n}@example.com` } });
  if (!r.ok) throw new Error(r.problems.join());
  return { deps, id: r.waybill.id };
};

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("status");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
  site = await seedAccount(owner.db);
  demo = await seedAccount(owner.db);
});
afterAll(async () => {
  ghl.server.close();
  await app.pool.end();
  await owner.pool.end();
  await database.drop();
});
beforeEach(() => ghl.reset());

describe("the status page", () => {
  it("shows nothing invented on an empty system", async () => {
    const v = await statusView(app.db, demo);
    expect(v.queue).toEqual({ moving: 0, oldestAt: null, signed24h: 0, held24h: 0, returned24h: 0 });
    expect(v.ghl).toBeNull();
    expect(v.recent).toEqual([]);
    expect(v.runs).toEqual({ deploy: null, backup: null, offsite: null, restore_test: null });
  });

  it("counts the queue and GHL's answer times from the real scans, leaving the demo account out", async () => {
    const a = await send(site);
    ghl.fail("contact", { status: 200, delayMs: 120 });
    expect(await deliverTry(a.deps, a.id, 1)).toBe("signed");
    const b = await send(site);
    ghl.fail("contact", { status: 422, body: { message: "phone must be valid" } });
    expect(await deliverTry(b.deps, b.id, 1)).toBe("held");
    await send(site); // picked up, not tried yet
    const d = await send(demo);
    ghl.fail("contact", { status: 200, delayMs: 50 });
    expect(await deliverTry(d.deps, d.id, 1)).toBe("signed");

    const v = await statusView(app.db, demo);
    expect(v.queue.moving).toBe(1);
    expect(v.queue.oldestAt).not.toBeNull();
    expect(v.queue.signed24h).toBe(1);
    expect(v.queue.held24h).toBe(1);
    // Lead a: contact (slow) and opportunity; lead b: the refused contact. The demo lead's calls are not counted.
    expect(v.ghl!.calls).toBe(3);
    expect(v.ghl!.timed).toBe(3);
    expect(v.ghl!.answered2xx).toBe(2);
    expect(v.recent).toHaveLength(3);
    expect(v.recent.some((r) => r.ms >= 120)).toBe(true);
    expect(v.recent.map((r) => r.status).sort()).toEqual([200, 200, 422].sort());
    expect(v.ghl!.p95Ms!).toBeGreaterThanOrEqual(v.ghl!.medianMs!);

    // A call recorded before answer times existed: it counts as a call and an answer, but not in the times.
    await owner.db.insert(scans).values({ shipmentId: a.id, kind: "handed", try: 1, step: "note", answerStatus: 201, answerExcerpt: "{}" });
    const w = await statusView(app.db, demo);
    expect(w.ghl).toMatchObject({ calls: 4, timed: 3, answered2xx: 3 });
    expect(w.recent).toHaveLength(3);
  });

  it("shows the latest run of each kind, a failed one too; the app can read runs but never write one", async () => {
    await owner.db.insert(opsRuns).values([
      { kind: "backup", ok: true, detail: "fernway-1.dump, 100 bytes", at: new Date(Date.now() - 3_600_000) },
      { kind: "backup", ok: false, detail: "failed (exit 1)" },
      { kind: "deploy", ok: true, detail: "abc1234" },
    ]);
    const v = await statusView(app.db, demo);
    expect(v.runs.backup).toMatchObject({ ok: false, detail: "failed (exit 1)" });
    expect(v.runs.deploy).toMatchObject({ ok: true, detail: "abc1234" });
    expect(v.runs.restore_test).toBeNull();
    const refused = await app.db.insert(opsRuns).values({ kind: "backup", ok: true, detail: "forged" }).then(() => null, (e: Error) => e);
    expect(String((refused?.cause as Error | undefined)?.message)).toMatch(/permission denied/);
  });
});

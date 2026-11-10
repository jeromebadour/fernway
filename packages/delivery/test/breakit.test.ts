import { RETRY_WAITS_MS } from "@fernway/core";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BREAK_IT_SPEED, breakItKey, breakItTry, failureOf, type Failure } from "../src/breakit.js";
import { ingestLead, resend } from "../src/engine.js";
import { scans, shipments } from "../src/schema.js";
import { createDb, freshDatabase, seedAccount, testDeps } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let accountId: number;
let n = 0;

beforeAll(async () => {
  database = await freshDatabase("breakit");
  app = createDb(database.appUrl, 2);
  const owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
  await owner.pool.end();
});
afterAll(async () => {
  await app.pool.end();
  await database.drop();
});

/** Sends a Break it lead and runs its tries the way the queue would, until it stops. */
async function run(failure: Failure) {
  const { deps, scheduled } = testDeps(app.db, null);
  const r = await ingestLead(deps, accountId, {
    idempotencyKey: breakItKey(failure, `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`),
    source: "demo", route: "trial", contact: { firstName: "Visitor", email: `visitor${n}@breakit.example` },
  });
  if (!r.ok) throw new Error(r.problems.join());
  const outcomes: string[] = [];
  for (let i = 0; i < scheduled.length && i < 12; i++) outcomes.push(await breakItTry(deps, r.waybill.id, scheduled[i]!.tryNumber));
  const rows = await app.db.select().from(scans).where(eq(scans.shipmentId, r.waybill.id)).orderBy(asc(scans.id));
  return { id: r.waybill.id, outcomes, scheduled, kinds: rows.map((s) => s.kind), deps };
}

describe("Break it", () => {
  it("reads the failure from the lead's key, and nothing else", () => {
    expect(failureOf(breakItKey("busy", "x"))).toBe("busy");
    expect(failureOf("site-trial-abc")).toBeNull();
    expect(failureOf("breakit-explode-abc")).toBeNull();
  });

  it("too many requests: waits 30 s sped up 10 times, then delivers", async () => {
    const r = await run("busy");
    expect(r.outcomes).toEqual(["waiting", "signed"]);
    expect(r.scheduled[1]!.delayMs).toBe(RETRY_WAITS_MS[0]! / BREAK_IT_SPEED);
    expect(r.kinds).toEqual(["picked_up", "checked", "retry_scheduled", "handed", "signed"]);
  });

  it("server error twice: two sped-up waits, then delivers", async () => {
    const r = await run("down");
    expect(r.outcomes).toEqual(["waiting", "waiting", "signed"]);
    expect(r.scheduled.slice(1).map((s) => s.delayMs)).toEqual([3_000, 12_000]);
  });

  it("no answer, and an expired token: each retried once, then delivered", async () => {
    expect((await run("timeout")).outcomes).toEqual(["waiting", "signed"]);
    expect((await run("token")).outcomes).toEqual(["waiting", "signed"]);
  });

  it("bad data: held with GHL's reason, delivered once the visitor resends it", async () => {
    const r = await run("refused");
    expect(r.outcomes).toEqual(["held"]);
    const [held] = await app.db.select().from(shipments).where(eq(shipments.id, r.id));
    expect(held!.holdReason).toContain("valid number with its country code");
    const { deps, scheduled } = testDeps(app.db, null);
    expect(await resend(deps, r.id, "resent from Break it")).toBe(true);
    expect(await breakItTry(deps, r.id, scheduled[0]!.tryNumber)).toBe("signed");
  });

  it("never reaches a real GHL: a Break it lead has no connection of its own and still signs", async () => {
    const r = await run("twice");
    expect(r.outcomes).toEqual(["signed"]);
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, r.id));
    expect(s!.ghlContactId).toBe(`breakit_c_${r.id}`);
  });
});

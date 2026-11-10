// End to end through the real queue: Redis, BullMQ and a worker, with the 24 h schedule sped up so a lead GHL
// refuses twice is still delivered in under a second, by the worker alone.
import { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { deliverTry, ingestLead, resend, type Deps } from "../src/engine.js";
import { createGhlClient } from "../src/ghl.js";
import { createDeliveryWorker, createQueue } from "../src/queue.js";
import { shipments } from "../src/schema.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, GHL_BASE, seedAccount } from "./support.js";

const REDIS = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let handle: ReturnType<typeof createDb>;
const connection = new Redis(REDIS, { maxRetriesPerRequest: null });
const prefix = `fernway-test-${process.pid}`;

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("queue");
  handle = createDb(database.appUrl, 4);
});
afterAll(async () => {
  ghl.server.close();
  const keys = await connection.keys(`${prefix}:*`);
  if (keys.length) await connection.del(...keys);
  await connection.quit();
  await handle.pool.end();
  await database.drop();
});

it("retries through the queue on its own until GHL takes the lead", async () => {
  const owner = createDb(database.url, 1);
  const accountId = await seedAccount(owner.db);
  await owner.pool.end();

  const { queue, schedule } = createQueue(connection, prefix);
  const deps: Deps = {
    db: handle.db,
    ghl: createGhlClient({ baseUrl: GHL_BASE, timeoutMs: 500 }),
    connectionFor: async () => fakeConnection(),
    schedule,
    timeScale: 0.0005, // 30 s becomes 15 ms
  };
  const worker = createDeliveryWorker(connection, (job) => deliverTry(deps, job.shipmentId, job.try), { prefix });

  ghl.fail("contact", { status: 429 }, { status: 503 });
  const r = await ingestLead(deps, accountId, {
    idempotencyKey: "queue-test-0001",
    source: "api",
    route: "trial",
    contact: { email: "kestrel@roofing.example", companyName: "Kestrel Roofing" },
  });
  if (!r.ok) throw new Error(r.problems.join("; "));

  let state = "";
  for (let i = 0; i < 100 && state !== "signed"; i++) {
    await new Promise((res) => setTimeout(res, 50));
    const [s] = await handle.db.select().from(shipments).where(eq(shipments.id, r.waybill.id));
    state = s!.state;
  }
  await worker.close();
  await queue.close();

  const [s] = await handle.db.select().from(shipments).where(eq(shipments.id, r.waybill.id));
  expect(state).toBe("signed");
  expect(s!.tries).toBe(3);
  expect(ghl.contacts.size).toBe(1);
});

it("runs a resend through the real queue, though its first try's job already ran", async () => {
  const owner = createDb(database.url, 1);
  const accountId = await seedAccount(owner.db);
  await owner.pool.end();

  const { queue, schedule } = createQueue(connection, prefix);
  const deps: Deps = {
    db: handle.db,
    ghl: createGhlClient({ baseUrl: GHL_BASE, timeoutMs: 500 }),
    connectionFor: async () => fakeConnection(),
    schedule,
  };
  const worker = createDeliveryWorker(connection, (job) => deliverTry(deps, job.shipmentId, job.try), { prefix });
  const stateOf = async (id: number) => (await handle.db.select().from(shipments).where(eq(shipments.id, id)))[0]!.state;
  const until = async (id: number, want: string) => {
    for (let i = 0; i < 100 && (await stateOf(id)) !== want; i++) await new Promise((res) => setTimeout(res, 50));
    return stateOf(id);
  };

  // GHL refuses the data: held at try 1, whose job is now finished and kept by the queue.
  ghl.fail("contact", { status: 422, body: { message: "phone is invalid" } });
  const r = await ingestLead(deps, accountId, {
    idempotencyKey: "queue-test-resend-0001", source: "api", route: "trial", contact: { email: "wren@roofing.example" },
  });
  if (!r.ok) throw new Error(r.problems.join("; "));
  expect(await until(r.waybill.id, "held")).toBe("held");

  // The owner resends it: try 1 again, under the same job id. It must run, not be ignored as a duplicate.
  expect(await resend(deps, r.waybill.id)).toBe(true);
  expect(await until(r.waybill.id, "signed")).toBe("signed");

  // A try still waiting is never queued twice.
  await schedule(r.waybill.id, 7, 60_000);
  await schedule(r.waybill.id, 7, 60_000);
  expect((await queue.getJobs(["delayed"])).filter((j) => j.id === `s${r.waybill.id}-t7`)).toHaveLength(1);

  await worker.close();
  await queue.close();
});

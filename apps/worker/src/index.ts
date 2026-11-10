// The delivery worker: runs every try the queue hands it (the engine in @fernway/delivery), puts overdue shipments
// back on the queue every minute (the safety net), and writes a heartbeat to Redis every 10 s for the health check.
// Every hour it also removes the public site's leads older than 30 days, from GHL first (retention.ts).
// Leads of the Break it demo account run against the stand-in GHL (breakit.ts), never a real one, and go after a day.
import { MAX_TRIES } from "@fernway/core";
import {
  breakItTry,
  connectionFor,
  createDb,
  createDeliveryWorker,
  createGhlClient,
  createQueue,
  deliverTry,
  keyFrom,
  oauthConfigFromEnv,
  purgeExpired,
  shipments,
  sweep,
  type Deps,
} from "@fernway/delivery";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";

const HEARTBEAT_KEY = "fernway:worker:heartbeat";
const BEAT_MS = 10_000;
const SWEEP_MS = 60_000;
const PURGE_MS = 60 * 60_000;

const need = (name: string) => {
  const v = process.env[name];
  if (!v) {
    console.error(`worker: ${name} is not set`);
    process.exit(1);
  }
  return v;
};

const commit = process.env.APP_COMMIT ?? "dev";
const siteAccount = Number(need("FERNWAY_SITE_ACCOUNT"));
const demoAccount = Number(need("FERNWAY_DEMO_ACCOUNT"));
const redis = new Redis(need("REDIS_URL"), { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error(`worker: redis error: ${err.message}`));
const { pool, db } = createDb(need("DATABASE_URL"));
const { queue, schedule } = createQueue(redis);

const oauth = oauthConfigFromEnv(process.env, keyFrom(need("FERNWAY_TOKEN_KEY")));
const deps: Deps = {
  db,
  ghl: createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }),
  // The account's GHL sub-account (OAuth); an account that never connected holds its leads with that reason.
  connectionFor: (accountId) => connectionFor(db, oauth, accountId),
  schedule,
};

// A Break it lead (the demo account) never meets a real GHL: its tries go to the stand-in.
async function runTry(shipmentId: number, tryNumber: number) {
  const [s] = await db.select({ accountId: shipments.accountId }).from(shipments).where(eq(shipments.id, shipmentId));
  if (s?.accountId === demoAccount) return breakItTry(deps, shipmentId, tryNumber);
  return deliverTry(deps, shipmentId, tryNumber);
}
const worker = createDeliveryWorker(redis, (job) => runTry(job.shipmentId, job.try));
worker.on("failed", (job, err) => console.error(`worker: try ${job?.data.try} of shipment ${job?.data.shipmentId} crashed: ${err.message}`));

async function beat() {
  await redis.set(HEARTBEAT_KEY, JSON.stringify({ at: new Date().toISOString(), commit }), "PX", BEAT_MS * 3);
}

await beat();
console.log(`worker ${commit}: up, delivering (${MAX_TRIES} tries over 24 h), heartbeat every ${BEAT_MS / 1000} s`);
const beating = setInterval(() => beat().catch((e) => console.error(`worker: heartbeat failed: ${e.message}`)), BEAT_MS);
const sweeping = setInterval(() => {
  sweep(deps)
    .then((n) => n && console.log(`worker: put ${n} overdue shipment(s) back on the queue`))
    .catch((e) => console.error(`worker: sweep failed: ${e.message}`));
}, SWEEP_MS);
const purge = () =>
  purgeExpired({ ...deps, connectionFor: async () => ({ locationId: "breakit", accessToken: async () => "", refresh: async () => {} }), ghl: { ...deps.ghl, remove: async () => ({ gone: true, status: 200 }) } }, demoAccount, 1)
    .then((r) => r.removed && console.log(`worker: Break it leads past a day: ${r.removed} removed`))
    .catch((e) => console.error(`worker: Break it retention failed: ${e.message}`))
    .then(() => purgeExpired(deps, siteAccount))
    .then((r) => (r.removed || r.waiting) && console.log(`worker: site leads past 30 days: ${r.removed} removed, ${r.waiting} kept until GHL can be reached`))
    .catch((e) => console.error(`worker: retention failed: ${e.message}`));
void purge();
const purging = setInterval(purge, PURGE_MS);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    clearInterval(beating);
    clearInterval(sweeping);
    clearInterval(purging);
    await worker.close().catch(() => {});
    await queue.close().catch(() => {});
    await redis.del(HEARTBEAT_KEY).catch(() => {});
    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
    console.log(`worker: stopped (${signal})`);
    process.exit(0);
  });
}

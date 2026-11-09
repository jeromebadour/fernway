// The delivery worker: runs every try the queue hands it (the engine in @fernway/delivery), puts overdue shipments
// back on the queue every minute (the safety net), and writes a heartbeat to Redis every 10 s for the health check.
import { MAX_TRIES } from "@fernway/core";
import {
  connectionFor,
  createDb,
  createDeliveryWorker,
  createGhlClient,
  createQueue,
  deliverTry,
  keyFrom,
  oauthConfigFromEnv,
  sweep,
  type Deps,
} from "@fernway/delivery";
import { Redis } from "ioredis";

const HEARTBEAT_KEY = "fernway:worker:heartbeat";
const BEAT_MS = 10_000;
const SWEEP_MS = 60_000;

const need = (name: string) => {
  const v = process.env[name];
  if (!v) {
    console.error(`worker: ${name} is not set`);
    process.exit(1);
  }
  return v;
};

const commit = process.env.APP_COMMIT ?? "dev";
const redis = new Redis(need("REDIS_URL"), { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error(`worker: redis error: ${err.message}`));
const { pool, db } = createDb(need("DATABASE_URL"));
const { queue, schedule } = createQueue(redis);

const oauth = oauthConfigFromEnv(process.env, keyFrom(need("FERNWAY_TOKEN_KEY")));
const deps: Deps = {
  db,
  ghl: createGhlClient(),
  // The account's GHL sub-account (OAuth); an account that never connected holds its leads with that reason.
  connectionFor: (accountId) => connectionFor(db, oauth, accountId),
  schedule,
};

const worker = createDeliveryWorker(redis, (job) => deliverTry(deps, job.shipmentId, job.try));
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

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    clearInterval(beating);
    clearInterval(sweeping);
    await worker.close().catch(() => {});
    await queue.close().catch(() => {});
    await redis.del(HEARTBEAT_KEY).catch(() => {});
    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
    console.log(`worker: stopped (${signal})`);
    process.exit(0);
  });
}

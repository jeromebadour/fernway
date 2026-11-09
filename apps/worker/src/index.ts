// The delivery worker. In this first version it only proves it is alive: every 10 s it writes a heartbeat to Redis,
// which the web app's health check reads. The delivery engine (shipments, scans, retries) arrives in plan step 2.
import { Redis } from "ioredis";
import { MAX_TRIES } from "@fernway/core";

const HEARTBEAT_KEY = "fernway:worker:heartbeat";
const EVERY_MS = 10_000;

const url = process.env.REDIS_URL;
if (!url) {
  console.error("worker: REDIS_URL is not set");
  process.exit(1);
}

const redis = new Redis(url, { maxRetriesPerRequest: null });
const commit = process.env.APP_COMMIT ?? "dev";

async function beat() {
  const value = JSON.stringify({ at: new Date().toISOString(), commit });
  await redis.set(HEARTBEAT_KEY, value, "PX", EVERY_MS * 3);
}

redis.on("error", (err) => console.error(`worker: redis error: ${err.message}`));

await beat();
console.log(`worker ${commit}: up, heartbeat every ${EVERY_MS / 1000} s, delivery promise ${MAX_TRIES} tries`);
const timer = setInterval(() => beat().catch((err) => console.error(`worker: heartbeat failed: ${err.message}`)), EVERY_MS);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await redis.del(HEARTBEAT_KEY).catch(() => {});
    await redis.quit().catch(() => {});
    console.log(`worker: stopped (${signal})`);
    process.exit(0);
  });
}

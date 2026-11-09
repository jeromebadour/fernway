import "server-only";
import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { fernwayRedis?: Redis };

export function redis(): Redis {
  if (!globalForRedis.fernwayRedis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    globalForRedis.fernwayRedis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 2_000, lazyConnect: false });
  }
  return globalForRedis.fernwayRedis;
}

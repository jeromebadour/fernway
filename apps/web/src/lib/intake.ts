import "server-only";
import { connectionFor, createGhlClient, createQueue, type Deps } from "@fernway/delivery";
import { Redis } from "ioredis";
import { delivery } from "./connect";
import { redis } from "./redis";

// The public site's own forms deliver into Fernway's own account (the GHL sandbox), set by FERNWAY_SITE_ACCOUNT.
// The web app only picks leads up and puts their first try on the queue; the worker delivers them.
const g = globalThis as unknown as { fernwayIntake?: { deps: Deps; accountId: number } };

export function intake() {
  if (!g.fernwayIntake) {
    const accountId = Number(process.env.FERNWAY_SITE_ACCOUNT);
    if (!Number.isInteger(accountId) || accountId < 1) throw new Error("FERNWAY_SITE_ACCOUNT is not set");
    const { db, cfg } = delivery();
    // BullMQ wants its own connection.
    const { schedule } = createQueue(new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }));
    g.fernwayIntake = {
      accountId,
      deps: { db, ghl: createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }), connectionFor: (id) => connectionFor(db, cfg, id), schedule },
    };
  }
  return g.fernwayIntake;
}

// Demo volume only (the GHL sandbox is not a live CRM): a few sends per visitor an hour, a cap for the whole site a day.
export const PER_VISITOR_HOUR = 5;
export const SITE_DAY = 200;

/** The Break it demo's own account (its leads only ever meet the stand-in GHL). */
export function demoAccount(): number {
  const id = Number(process.env.FERNWAY_DEMO_ACCOUNT);
  if (!Number.isInteger(id) || id < 1) throw new Error("FERNWAY_DEMO_ACCOUNT is not set");
  return id;
}

/** Break it runs: 10 an hour per visitor, plenty to try every failure. */
export async function breakItAllowed(ip: string): Promise<boolean> {
  const key = `fernway:breakit:ip:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const res = (await redis().multi().incr(key).expire(key, 3_700).exec()) ?? [];
  return Number(res[0]?.[1]) <= 10;
}

/** Looking a waybill up by number and email: enough tries for typos, too few to guess other people's leads. */
export async function lookupAllowed(ip: string): Promise<boolean> {
  const key = `fernway:track-find:ip:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const res = (await redis().multi().incr(key).expire(key, 3_700).exec()) ?? [];
  return Number(res[0]?.[1]) <= 10;
}

/** Counts one send; true if it is within both limits. */
export async function withinLimits(ip: string): Promise<{ ok: true } | { ok: false; reason: "visitor" | "site" }> {
  const r = redis();
  const hour = `fernway:site-forms:ip:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const day = `fernway:site-forms:day:${new Date().toISOString().slice(0, 10)}`;
  const res = (await r.multi().incr(hour).expire(hour, 3_700).incr(day).expire(day, 90_000).exec()) ?? [];
  const mine = Number(res[0]?.[1]);
  const all = Number(res[2]?.[1]);
  if (mine > PER_VISITOR_HOUR) return { ok: false, reason: "visitor" };
  if (all > SITE_DAY) return { ok: false, reason: "site" };
  return { ok: true };
}

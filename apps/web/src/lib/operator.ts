import "server-only";
import { createQueue, machine, secondStep, staffOf, type BoxReading, type Staff } from "@fernway/delivery";
import { notFound } from "next/navigation";
import { Redis } from "ioredis";
import { answer, gate } from "./account-api";
import { accountsOn } from "./accounts-on";
import { delivery } from "./connect";
import { redis } from "./redis";
import { currentPerson } from "./session";

// The operator console is Fernway's own: staff with two-step sign-in on. For anyone else it doesn't exist (a plain 404,
// never "no access"): signed out, a customer, staff without two-step.
export async function requireStaff(): Promise<Staff> {
  if (!accountsOn()) notFound();
  const p = await currentPerson();
  const s = p ? await staffOf(delivery().db, p.userId) : null;
  if (!s) notFound();
  return s;
}

/** For an operator action: staff, from this site, and a fresh code from the authenticator app (a recovery code is not
 *  enough for an action). Answers 404 to anyone who isn't staff, like the pages. */
export async function staffAction(request: Request): Promise<{ body: Record<string, unknown>; s: Staff } | { refused: Response }> {
  const g = await gate(request);
  if ("refused" in g) return g;
  const p = await currentPerson();
  const { db, cfg } = delivery();
  const s = p ? await staffOf(db, p.userId) : null;
  if (!s) return { refused: new Response(null, { status: 404 }) };
  if (s.role === "viewer") return { refused: answer(403, { ok: false, problems: ["form: viewers only look"] }) };
  const code = String(g.body.code ?? "");
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { refused: answer(422, { ok: false, problems: ["code: the 6 digits from your authenticator app"] }) };
  if ((await secondStep(db, cfg.key, s.userId, code.replace(/\s/g, ""))) !== "code") {
    return { refused: answer(422, { ok: false, problems: ["code: that code isn't right, or was already used; wait for the next one"] }) };
  }
  return { body: g.body, s };
}

const g = globalThis as unknown as { fernwayOpsQueue?: ReturnType<typeof createQueue>["queue"] };
const within = <T,>(ms: number, p: Promise<T>) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error("slow")), ms))]);

/** What only this process can read now: the machine, Redis, the worker's last beat and the queue's own job counts. */
export async function boxReading(): Promise<BoxReading> {
  const m = await machine("/");
  let redisBytes: number | null = null, workerBeatAt: string | null = null, workerCommit: string | null = null;
  let jobs: BoxReading["jobs"] = null;
  try {
    const info = await within(1_500, redis().info("memory"));
    redisBytes = Number(info.match(/^used_memory:(\d+)/m)?.[1] ?? NaN) || null;
    const beat = await within(1_500, redis().get("fernway:worker:heartbeat"));
    if (beat) { const b = JSON.parse(beat) as { at: string; commit: string }; workerBeatAt = b.at; workerCommit = b.commit; }
    g.fernwayOpsQueue ??= createQueue(new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })).queue;
    const c = await within(1_500, g.fernwayOpsQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed"));
    jobs = { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, completed: c.completed ?? 0 };
  } catch { /* Redis is down: its watchers say so */ }
  return { at: new Date().toISOString(), ...m, redisBytes, webCommit: process.env.APP_COMMIT ?? "dev", workerCommit, workerBeatAt, jobs };
}

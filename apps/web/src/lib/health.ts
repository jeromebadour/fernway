import "server-only";
import { db } from "./db";
import { redis } from "./redis";

export type Health = {
  ok: boolean;
  commit: string;
  database: { ok: boolean; error?: string };
  queue: { ok: boolean; error?: string };
  worker: { ok: boolean; lastBeat?: string; commit?: string; error?: string };
};

const within = <T,>(ms: number, p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms))]);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every part the app needs, checked for real: the database answers, Redis answers, the worker beat recently. */
export async function checkHealth(): Promise<Health> {
  const commit = process.env.APP_COMMIT ?? "dev";

  const database = await within(2_000, db().query("select 1"))
    .then(() => ({ ok: true }))
    .catch((err) => ({ ok: false, error: message(err) }));

  let queue: Health["queue"];
  let worker: Health["worker"];
  try {
    const beat = await within(2_000, redis().get("fernway:worker:heartbeat"));
    queue = { ok: true };
    if (beat) {
      const parsed = JSON.parse(beat) as { at: string; commit: string };
      worker = { ok: true, lastBeat: parsed.at, commit: parsed.commit };
    } else {
      worker = { ok: false, error: "no heartbeat in the last 30 s" };
    }
  } catch (err) {
    queue = { ok: false, error: message(err) };
    worker = { ok: false, error: "queue unreachable" };
  }

  return { ok: database.ok && queue.ok && worker.ok, commit, database, queue, worker };
}

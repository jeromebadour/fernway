import "server-only";
import { accountForKey, apiProblem } from "@fernway/delivery";
import { delivery } from "./connect";
import { demoAccount } from "./intake";
import { redis } from "./redis";

// The v1 API's door: a live key names the account, and each key gets a per-minute limit. The docs' public key reaches
// only the Break it demo account (its leads meet the stand-in GHL and are gone after a day), and it is also limited
// per visitor, because anyone can copy it.
export const PER_KEY_MINUTE = 60;
export const DEMO_SENDS_HOUR = 20;
export const DEMO_READS_HOUR = 200;

export const appUrl = () => (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");

export const answer = (status: number, json: object, extra: Record<string, string> = {}) =>
  Response.json(json, { status, headers: { "Cache-Control": "no-store", ...extra } });

export const problem = (status: number, ...problems: string[]) => answer(status, apiProblem.parse({ ok: false, problems }));

async function count(key: string, ttl: number) {
  const res = (await redis().multi().incr(key).expire(key, ttl).exec()) ?? [];
  return Number(res[0]?.[1]);
}

/** The account behind the request's key, or the answer that turns it away. */
export async function caller(request: Request, kind: "send" | "read"): Promise<{ accountId: number } | { refused: Response }> {
  const auth = request.headers.get("authorization") ?? "";
  const raw = auth.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!raw) return { refused: problem(401, 'authorization: send your key as "Authorization: Bearer fw_..."') };
  const accountId = await accountForKey(delivery().db, raw);
  if (accountId === null) return { refused: problem(401, "authorization: that key isn't a live Fernway key") };

  const busy = (why: string, wait: number) => ({ refused: answer(429, apiProblem.parse({ ok: false, problems: [`limit: ${why}`] }), { "Retry-After": String(wait) }) });
  if (accountId === demoAccount()) {
    // Everyone shares the public key, so its limits are per visitor rather than per key.
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const max = kind === "send" ? DEMO_SENDS_HOUR : DEMO_READS_HOUR;
    if ((await count(`fernway:api:demo:${kind}:ip:${ip}:${Math.floor(Date.now() / 3_600_000)}`, 3_700)) > max) {
      return busy(`the public demo key takes ${max} ${kind === "send" ? "leads" : "lookups"} an hour from one visitor`, 3_600);
    }
  } else if ((await count(`fernway:api:key:${raw.split("_")[1]}:${Math.floor(Date.now() / 60_000)}`, 70)) > PER_KEY_MINUTE) {
    return busy(`${PER_KEY_MINUTE} requests a minute per key; wait a moment`, 60);
  }
  return { accountId };
}

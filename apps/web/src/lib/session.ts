import "server-only";
import { personFor, type Person } from "@fernway/delivery";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { delivery } from "./connect";
import { redis } from "./redis";

// The sign-in cookie: the session's secret, HttpOnly, Secure, SameSite=Lax, 30 days. Only the account API sets it; no
// public page does (Privacy, and CI checks it).
export const SESSION_COOKIE = "fw_session";
export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${30 * 86_400}; HttpOnly; Secure; SameSite=Lax`;
export const endCookie = () => `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function currentPerson(): Promise<Person | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return personFor(delivery().db, token);
}

/** The signed-in person, or off to sign in (and back here after). */
export async function requirePerson(back = "/account"): Promise<Person> {
  const p = await currentPerson();
  if (!p) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  return p;
}

/** A form that changes something must come from this site (with SameSite=Lax, a second wall against forged posts). */
// Compared with the site's own address and with the Host the request really came to (Nginx passes it on the box);
// never with request.url, which inside the container is the server's own port, not the one the visitor used.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const app = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  return host === app || host === request.headers.get("host");
}

/** Counts one try; true while within `max` an hour for that key (a visitor, an email). */
export async function within(key: string, max: number): Promise<boolean> {
  const k = `fernway:auth:${key}:${Math.floor(Date.now() / 3_600_000)}`;
  const res = (await redis().multi().incr(k).expire(k, 3_700).exec()) ?? [];
  return Number(res[0]?.[1]) <= max;
}

/** "Firefox on Windows", from the browser's own description, for the Devices page. */
export function deviceOf(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

/** Only a path on this site, never somewhere else (an open redirect). */
export const safeNext = (next: string | null | undefined) => (next && /^\/[A-Za-z0-9/_?=&.-]*$/.test(next) && !next.startsWith("//") ? next : "/account");

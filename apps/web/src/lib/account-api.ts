import "server-only";
import { accountsOn } from "./accounts-on";
import type { Person } from "@fernway/delivery";
import { currentPerson, sameOrigin } from "./session";

// Shared by every account API route: switched on, from this site, a JSON body; else the answer that turns it away.
export const answer = (status: number, json: object, cookie?: string) => {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return Response.json(json, { status, headers });
};

export async function gate(request: Request): Promise<{ body: Record<string, unknown> } | { refused: Response }> {
  if (!accountsOn()) return { refused: new Response(null, { status: 404 }) };
  if (!sameOrigin(request)) return { refused: answer(403, { ok: false, problems: ["form: this form must be sent from fernway.jeromebadour.com"] }) };
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { refused: answer(400, { ok: false, problems: ["form: the form could not be read; reload the page"] }) };
  return { body: body as Record<string, unknown> };
}

export const ip = (request: Request) => request.headers.get("x-real-ip") ?? "unknown";
export const appUrl = () => (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");

/** For routes that change the signed-in person's own things: switched on, from this site, signed in. */
export async function signedIn(request: Request): Promise<{ body: Record<string, unknown>; p: Person } | { refused: Response }> {
  const g = await gate(request);
  if ("refused" in g) return g;
  const p = await currentPerson();
  if (!p) return { refused: answer(401, { ok: false, problems: ["form: you were signed out; sign in again"] }) };
  return { body: g.body, p };
}

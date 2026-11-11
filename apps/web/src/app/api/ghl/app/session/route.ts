import { ghlAppSession } from "@fernway/delivery";
import { ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { ghlSsoKey, json } from "@/lib/ghl-app";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Fernway's page inside GHL hands over what GHL gave it (the signed-in GHL user, encrypted with the app's shared
// secret). A connected sub-account gets a 2-hour ticket for its own leads; anything else, a reason and nothing more.
export async function POST(request: Request) {
  const secret = ghlSsoKey();
  if (!secret) return json(503, { ok: false, why: "not-set-up" });
  if (!(await within(`ghl-app:${ip(request)}`, 120))) return json(429, { ok: false, why: "busy" });
  const body = await request.json().catch(() => null) as { payload?: unknown } | null;
  const r = await ghlAppSession(delivery().db, delivery().cfg.key, body?.payload, secret);
  if (!r.ok) return json(r.why === "payload" ? 401 : 404, r);
  return json(200, { ok: true, ticket: r.ticket, account: { id: r.who.accountId, name: r.accountName }, user: r.who.name });
}

import { resendHeld, resendLead } from "@fernway/delivery";
import { appWho, json } from "@/lib/ghl-app";
import { intake } from "@/lib/intake";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Resend from inside GHL: one held or returned lead ({ id }), or every lead held for one reason ({ reason }). Written
// to the account's audit log as the GHL user, marked "in GHL". 60 an hour per account, shared with the console.
export async function POST(request: Request) {
  const who = appWho(request);
  if (!who) return json(401, { ok: false });
  if (!(await within(`resend:${who.accountId}`, 60))) return json(429, { ok: false, problems: ["form: too many resends this hour; wait, then try again"] });
  const body = await request.json().catch(() => ({})) as { id?: unknown; reason?: unknown };
  const { deps } = intake();
  const me = { accountId: who.accountId, userId: null, name: `${who.name} · in GHL` };
  if (typeof body.reason === "string" && body.reason) {
    const n = await resendHeld(deps, me, body.reason);
    return n ? json(200, { ok: true, resent: n }) : json(404, { ok: false, problems: ["form: no lead is held for that reason now"] });
  }
  const ok = await resendLead(deps, me, Number(body.id));
  return ok ? json(200, { ok: true, resent: 1 }) : json(409, { ok: false, problems: ["form: that lead is no longer held or returned"] });
}

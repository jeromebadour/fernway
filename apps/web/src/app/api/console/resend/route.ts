import { resendHeld, resendLead } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { intake } from "@/lib/intake";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Resend one held or returned lead ({ id }), or every lead held for the same reason ({ reason }). Written to the audit
// log with who did it. 60 an hour per account.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (!(await within(`resend:${s.p.accountId}`, 60))) return answer(429, { ok: false, problems: ["form: too many resends this hour; wait, then try again"] });
  const { deps } = intake();
  const me = { accountId: s.p.accountId, userId: s.p.userId, name: s.p.name };
  if (typeof s.body.reason === "string" && s.body.reason) {
    const n = await resendHeld(deps, me, s.body.reason);
    return n ? answer(200, { ok: true, resent: n }) : answer(404, { ok: false, problems: ["form: no lead is held for that reason now"] });
  }
  const ok = await resendLead(deps, me, Number(s.body.id));
  return ok ? answer(200, { ok: true, resent: 1 }) : answer(409, { ok: false, problems: ["form: that lead is no longer held or returned"] });
}
